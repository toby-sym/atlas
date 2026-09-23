"""HTTP API for the Atlas desktop and web clients."""

import asyncio
import hmac
import json
import os
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID, uuid4

import httpx
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, StrictStr

from backend import conversations as conversation_store
from backend.agent import AgentServiceError, run_agent_loop, stream_agent_loop
from backend.settings import (
    CONVERSATIONS_PATH,
    DEFAULT_MODEL,
    FILESYSTEM_ENABLED,
    MEMORY_PATH,
    MEMORY_ENABLED,
    OLLAMA_URL,
    WEB_ENABLED,
    WORKSPACE_PATH,
)
from backend.telemetry import snapshot as telemetry_snapshot
from backend.tools.filesystem import (
    MAX_EXTRACTED_CHARS,
    MAX_FILE_BYTES,
    SUPPORTED_SUFFIXES,
    _resolve_path,
    extract_file,
)
from backend.tools.memory import set_memory_path
from backend.tools.filesystem import set_workspace_path

set_workspace_path(WORKSPACE_PATH)
set_memory_path(MEMORY_PATH)
conversation_store.set_conversations_path(CONVERSATIONS_PATH)

app = FastAPI(title="Atlas API", version="0.4.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Atlas-Token"],
)


@app.middleware("http")
async def require_desktop_token(request: Request, call_next):
    expected = os.getenv("ATLAS_API_TOKEN")
    if (
        expected
        and request.method != "OPTIONS"
    ):
        supplied = request.headers.get("X-Atlas-Token", "")
        if not hmac.compare_digest(expected, supplied):
            return JSONResponse(
                status_code=401, content={"detail": "Unauthorized Atlas client."}
            )
    return await call_next(request)


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: StrictStr


class ContextPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    research: bool = False
    memory: bool = False


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=100)
    model: StrictStr | None = None
    max_steps: int = Field(default=5, ge=1, le=10)
    context: ContextPreferences = Field(default_factory=ContextPreferences)
    attachments: list[StrictStr] = Field(default_factory=list, max_length=1)


class ChatResponse(BaseModel):
    message: dict[str, Any]


class ConversationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: StrictStr = Field(..., min_length=1, max_length=120)
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=1000)


def _conversation_id(value: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation ID.") from exc


def _ollama_tags_url() -> str:
    parsed = urlsplit(OLLAMA_URL)
    return urlunsplit((parsed.scheme, parsed.netloc, "/api/tags", "", ""))


async def _model_status() -> dict[str, str]:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(_ollama_tags_url())
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError):
        return {"state": "unavailable", "name": DEFAULT_MODEL}

    if not isinstance(payload, dict) or not isinstance(payload.get("models", []), list):
        return {"state": "unavailable", "name": DEFAULT_MODEL}
    models = payload.get("models", [])
    names = {
        model.get("name") or model.get("model")
        for model in models
        if isinstance(model, dict)
        and isinstance(model.get("name") or model.get("model"), str)
    }
    if DEFAULT_MODEL in names:
        return {"state": "ready", "name": DEFAULT_MODEL}
    return {"state": "missing", "name": DEFAULT_MODEL}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    return {
        "backend": "ready",
        "model": await _model_status(),
        "features": {
            "web_research": WEB_ENABLED,
            "memory": MEMORY_ENABLED,
            "files": FILESYSTEM_ENABLED,
            "ocr": FILESYSTEM_ENABLED,
            "saved_conversations": True,
        },
        "telemetry": telemetry_snapshot(),
    }


@app.get("/conversations")
async def list_saved_conversations():
    return {
        "conversations": await asyncio.to_thread(conversation_store.list_conversations)
    }


@app.get("/conversations/{conversation_id}")
async def get_saved_conversation(conversation_id: str):
    stored = await asyncio.to_thread(
        conversation_store.get_conversation, _conversation_id(conversation_id)
    )
    if stored is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return stored


@app.put("/conversations/{conversation_id}")
async def put_saved_conversation(conversation_id: str, payload: ConversationPayload):
    await asyncio.to_thread(
        conversation_store.save_conversation,
        _conversation_id(conversation_id),
        payload.title,
        [message.model_dump() for message in payload.messages],
    )
    return {"saved": True}


@app.delete("/conversations/{conversation_id}")
async def delete_saved_conversation(conversation_id: str):
    deleted = await asyncio.to_thread(
        conversation_store.delete_conversation, _conversation_id(conversation_id)
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"deleted": True}


# Upload validation has several distinct client errors with tailored responses.
# pylint: disable=too-many-branches
@app.post("/files")
async def upload_file(file: UploadFile = File(...)):
    if not FILESYSTEM_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Workspace file tools are disabled in the current configuration.",
        )
    filename = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    suffix = Path(filename).suffix.lower()
    if filename in ("", ".", ".."):
        raise HTTPException(
            status_code=400, detail="Please choose a file with a valid name."
        )
    if suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(
            status_code=415,
            detail="Supported files are text and code files, PDF, DOCX, PNG, and JPEG.",
        )

    stored_name = f"{Path(filename).stem}-{uuid4().hex[:12]}{suffix}"
    target = None
    try:
        target = _resolve_path(stored_name)
        with open(target, "xb") as destination:
            size = 0
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise HTTPException(
                        status_code=413, detail="Files must be 10 MB or smaller."
                    )
                destination.write(chunk)
        # Validate/extract before reporting success so corrupt documents fail at upload time.
        try:
            await asyncio.to_thread(extract_file, stored_name)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"filename": filename, "path": stored_name}
    except FileExistsError as exc:
        raise HTTPException(
            status_code=409,
            detail=f"A file named '{filename}' is already in the workspace.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        if target and os.path.exists(target):
            os.remove(target)
        raise
    except OSError as exc:
        if target and os.path.exists(target):
            os.remove(target)
        raise HTTPException(
            status_code=500, detail="Could not save the file to the workspace."
        ) from exc
    finally:
        await file.close()


async def _chat_inputs(request: ChatRequest) -> tuple[list[dict[str, str]], str]:
    messages = [message.model_dump() for message in request.messages]
    if not any(
        message["role"] == "user" and message["content"].strip() for message in messages
    ):
        raise HTTPException(
            status_code=400, detail="Messages must include a non-empty user message."
        )

    attachment_context = ""
    if request.attachments:
        if not FILESYSTEM_ENABLED:
            raise HTTPException(
                status_code=503,
                detail="Workspace file tools are disabled in the current configuration.",
            )
        filename = request.attachments[0]
        if (
            Path(filename).name != filename
            or "/" in filename
            or "\\" in filename
            or filename in {".", ".."}
        ):
            raise HTTPException(
                status_code=400, detail="Attachment must be a workspace filename."
            )
        try:
            attachment_context = await asyncio.to_thread(extract_file, filename)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if len(attachment_context) > MAX_EXTRACTED_CHARS:
            attachment_context = (
                attachment_context[:MAX_EXTRACTED_CHARS]
                + "\n\n[Document excerpt truncated at 30,000 characters.]"
            )

    return messages, attachment_context


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    messages, attachment_context = await _chat_inputs(request)
    try:
        assistant_message = await run_agent_loop(
            messages=messages,
            ollama_url=OLLAMA_URL,
            model=request.model or DEFAULT_MODEL,
            max_steps=request.max_steps,
            research=request.context.research and WEB_ENABLED,
            recall=request.context.memory and MEMORY_ENABLED,
            attachment_context=attachment_context,
            web_enabled=WEB_ENABLED,
            memory_enabled=MEMORY_ENABLED,
            filesystem_enabled=FILESYSTEM_ENABLED,
        )
        return ChatResponse(message=assistant_message)
    except AgentServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    messages, attachment_context = await _chat_inputs(request)

    async def events():
        try:
            async for event in stream_agent_loop(
                messages=messages,
                ollama_url=OLLAMA_URL,
                model=request.model or DEFAULT_MODEL,
                max_steps=request.max_steps,
                research=request.context.research and WEB_ENABLED,
                recall=request.context.memory and MEMORY_ENABLED,
                attachment_context=attachment_context,
                web_enabled=WEB_ENABLED,
                memory_enabled=MEMORY_ENABLED,
                filesystem_enabled=FILESYSTEM_ENABLED,
            ):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except AgentServiceError as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
