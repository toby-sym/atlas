"""HTTP API for the Atlas desktop and web clients."""

import asyncio
from datetime import datetime
import hmac
import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID, uuid4

import httpx
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator

from backend import conversations as conversation_store
from backend import projects as project_store
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
from backend.tools import memory as memory_store
from backend.telemetry import snapshot as telemetry_snapshot
from backend.tools.filesystem import (
    MAX_EXTRACTED_CHARS,
    MAX_FILE_BYTES,
    SUPPORTED_SUFFIXES,
    _resolve_project_path,
    extract_file,
    move_project_files_to_general,
    set_workspace_path,
)
from backend.tools.memory import set_memory_path

set_workspace_path(WORKSPACE_PATH)
set_memory_path(MEMORY_PATH)
conversation_store.set_conversations_path(CONVERSATIONS_PATH)
project_store.set_projects_path(CONVERSATIONS_PATH)

app = FastAPI(title="Atlas API", version="0.4.3")
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
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-Atlas-Token"],
)


@app.middleware("http")
async def require_desktop_token(request: Request, call_next):
    expected = os.getenv("ATLAS_API_TOKEN")
    if expected and request.method != "OPTIONS":
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
    project_id: StrictStr = project_store.GENERAL_PROJECT_ID
    conversation_id: StrictStr | None = None
    max_steps: int = Field(default=5, ge=1, le=10)
    context: ContextPreferences = Field(default_factory=ContextPreferences)
    attachments: list[StrictStr] = Field(default_factory=list, max_length=1)

    @field_validator("conversation_id")
    @classmethod
    def normalize_conversation_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            return str(UUID(value))
        except ValueError as exc:
            raise ValueError("Invalid conversation ID.") from exc


class ChatResponse(BaseModel):
    message: dict[str, Any]


class ConversationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: StrictStr = Field(..., min_length=1, max_length=120)
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=1000)
    project_id: StrictStr = project_store.GENERAL_PROJECT_ID


class ProjectPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: StrictStr = Field(..., min_length=1, max_length=80)
    instructions: StrictStr | None = Field(default=None, max_length=4000)

    @field_validator("name")
    @classmethod
    def strip_project_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Project names cannot be blank.")
        return value

    @field_validator("instructions")
    @classmethod
    def strip_project_instructions(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class ConversationTitlePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: StrictStr = Field(..., min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Conversation title cannot be blank.")
        return value


class MemoryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: StrictStr = Field(..., min_length=1, max_length=200)
    value: StrictStr = Field(..., min_length=1, max_length=10000)
    category: StrictStr = Field(default="general", min_length=1, max_length=64)
    scope: Literal["project", "shared"] = "project"

    @field_validator("key", "category")
    @classmethod
    def strip_required_fields(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @field_validator("value")
    @classmethod
    def require_memory_value(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Memory details cannot be blank.")
        return value


def _conversation_id(value: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation ID.") from exc


async def _require_project(project_id: str) -> None:
    if not await asyncio.to_thread(project_store.project_exists, project_id):
        raise HTTPException(status_code=404, detail="Project not found.")


def _ollama_tags_url() -> str:
    parsed = urlsplit(OLLAMA_URL)
    return urlunsplit((parsed.scheme, parsed.netloc, "/api/tags", "", ""))


async def _model_status() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(_ollama_tags_url())
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError):
        return {"state": "unavailable", "name": DEFAULT_MODEL, "available": []}

    if not isinstance(payload, dict) or not isinstance(payload.get("models", []), list):
        return {"state": "unavailable", "name": DEFAULT_MODEL, "available": []}
    models = payload.get("models", [])
    names = sorted(
        {
            model.get("name") or model.get("model")
            for model in models
            if isinstance(model, dict)
            and isinstance(model.get("name") or model.get("model"), str)
        }
    )
    if DEFAULT_MODEL in names:
        return {"state": "ready", "name": DEFAULT_MODEL, "available": names}
    return {"state": "missing", "name": DEFAULT_MODEL, "available": names}


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


@app.get("/projects")
async def list_projects():
    try:
        projects = await asyncio.to_thread(project_store.list_projects)
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Could not load projects.") from exc
    return {"projects": projects}


@app.post("/projects", status_code=201)
async def create_project(payload: ProjectPayload):
    try:
        project = await asyncio.to_thread(
            project_store.create_project, payload.name, payload.instructions or ""
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="A project with this name already exists."
        ) from exc
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500, detail="Could not create this project."
        ) from exc
    return {"project": project}


@app.patch("/projects/{project_id}")
async def rename_project(project_id: str, payload: ProjectPayload):
    try:
        project = await asyncio.to_thread(
            project_store.rename_project,
            project_id,
            payload.name,
            payload.instructions,
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="A project with this name already exists."
        ) from exc
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500, detail="Could not rename this project."
        ) from exc
    if project is None:
        raise HTTPException(
            status_code=400 if project_id == project_store.GENERAL_PROJECT_ID else 404,
            detail=(
                "The General project cannot be renamed."
                if project_id == project_store.GENERAL_PROJECT_ID
                else "Project not found."
            ),
        )
    return {"project": project}


@app.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    if project_id == project_store.GENERAL_PROJECT_ID:
        raise HTTPException(
            status_code=400, detail="The General project cannot be deleted."
        )
    await _require_project(project_id)
    project = await asyncio.to_thread(project_store.get_project, project_id)
    try:
        await asyncio.to_thread(move_project_files_to_general, project_id)
        if project:
            await asyncio.to_thread(
                memory_store.move_project_memories_to_general,
                project_id,
                project["name"],
            )
    except (OSError, ValueError, sqlite3.Error) as exc:
        raise HTTPException(
            status_code=409,
            detail="Could not preserve this project's data in General. Resolve the storage issue and retry.",
        ) from exc
    try:
        deleted = await asyncio.to_thread(project_store.delete_project, project_id)
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500, detail="Could not delete this project."
        ) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found.")
    return {"deleted": True, "files_moved_to_general": True}


@app.get("/conversations")
async def list_saved_conversations(
    search: str = Query(default="", max_length=200),
    project_id: str = Query(default=project_store.GENERAL_PROJECT_ID, max_length=64),
):
    await _require_project(project_id)
    search = search.strip()
    if search:
        conversations = await asyncio.to_thread(
            conversation_store.search_conversations, search, project_id
        )
    else:
        conversations = await asyncio.to_thread(
            conversation_store.list_conversations, project_id
        )
    return {"conversations": conversations}


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
    await _require_project(payload.project_id)
    await asyncio.to_thread(
        conversation_store.save_conversation,
        _conversation_id(conversation_id),
        payload.title,
        [message.model_dump() for message in payload.messages],
        payload.project_id,
    )
    return {"saved": True}


@app.patch("/conversations/{conversation_id}")
async def rename_saved_conversation(
    conversation_id: str, payload: ConversationTitlePayload
):
    renamed = await asyncio.to_thread(
        conversation_store.rename_conversation,
        _conversation_id(conversation_id),
        payload.title,
    )
    if not renamed:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"renamed": True, "title": payload.title}


@app.delete("/conversations/{conversation_id}")
async def delete_saved_conversation(conversation_id: str):
    normalized_id = _conversation_id(conversation_id)
    deleted = await asyncio.to_thread(
        conversation_store.delete_conversation, normalized_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    await asyncio.to_thread(memory_store.clear_conversation_source, normalized_id)
    return {"deleted": True}


def _require_memory_feature() -> None:
    if not MEMORY_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Memory is disabled in the current configuration.",
        )


@app.get("/memories")
async def list_saved_memories(
    project_id: str = Query(default=project_store.GENERAL_PROJECT_ID, max_length=64),
):
    _require_memory_feature()
    await _require_project(project_id)
    try:
        memories = await asyncio.to_thread(memory_store.list_memories, project_id)
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500, detail="Could not load saved memories."
        ) from exc
    return {"memories": memories}


@app.post("/memories", status_code=201)
async def create_saved_memory(
    payload: MemoryPayload,
    project_id: str = Query(default=project_store.GENERAL_PROJECT_ID, max_length=64),
):
    _require_memory_feature()
    await _require_project(project_id)
    memory_project_id = (
        memory_store.SHARED_MEMORY_ID if payload.scope == "shared" else project_id
    )
    try:
        memory = await asyncio.to_thread(
            memory_store.create_memory,
            payload.key,
            payload.value,
            payload.category,
            memory_project_id,
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="A memory with this name already exists."
        ) from exc
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500, detail="Could not save this memory."
        ) from exc
    return {"memory": memory}


@app.put("/memories/{memory_id}")
async def update_saved_memory(
    memory_id: int,
    payload: MemoryPayload,
    project_id: str = Query(default=project_store.GENERAL_PROJECT_ID, max_length=64),
):
    _require_memory_feature()
    await _require_project(project_id)
    memory_project_id = (
        memory_store.SHARED_MEMORY_ID if payload.scope == "shared" else project_id
    )
    try:
        memory = await asyncio.to_thread(
            memory_store.update_memory,
            memory_id,
            payload.key,
            payload.value,
            payload.category,
            memory_store.MemoryUpdateOptions(
                project_id=memory_project_id, visible_project_id=project_id
            ),
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="A memory with this name already exists."
        ) from exc
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500, detail="Could not update this memory."
        ) from exc
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found.")
    return {"memory": memory}


@app.delete("/memories/{memory_id}")
async def delete_saved_memory(
    memory_id: int,
    project_id: str = Query(default=project_store.GENERAL_PROJECT_ID, max_length=64),
):
    _require_memory_feature()
    await _require_project(project_id)
    try:
        deleted = await asyncio.to_thread(
            memory_store.delete_memory, memory_id, project_id
        )
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500, detail="Could not delete this memory."
        ) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory not found.")
    return {"deleted": True}


# Upload validation has several distinct client errors with tailored responses.
# pylint: disable=too-many-branches
@app.post("/files")
async def upload_file(
    file: UploadFile = File(...),
    project_id: str = Query(default=project_store.GENERAL_PROJECT_ID, max_length=64),
):
    if not FILESYSTEM_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Workspace file tools are disabled in the current configuration.",
        )
    await _require_project(project_id)
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
        target = _resolve_project_path(stored_name, project_id)
        with open(target, "xb") as destination:
            size = 0
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise HTTPException(
                        status_code=413, detail="Files must be 10 MB or smaller."
                    )
                destination.write(chunk)
        # Validate before reporting success so corrupt documents fail at upload time.
        try:
            await asyncio.to_thread(extract_file, stored_name, project_id)
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


@app.get("/files")
async def list_workspace_files(
    project_id: str = Query(default=project_store.GENERAL_PROJECT_ID, max_length=64),
):
    if not FILESYSTEM_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Workspace file tools are disabled in the current configuration.",
        )
    await _require_project(project_id)
    try:
        root = Path(_resolve_project_path(".", project_id))
        files = []
        for entry in root.iterdir():
            if not entry.is_file() or entry.is_symlink():
                continue
            if entry.suffix.lower() not in SUPPORTED_SUFFIXES:
                continue
            try:
                resolved = Path(_resolve_project_path(entry.name, project_id))
                stat = resolved.stat()
            except (OSError, ValueError):
                continue
            files.append(
                {
                    "path": entry.name,
                    "filename": entry.name,
                    "size_bytes": stat.st_size,
                    "readable": stat.st_size <= MAX_FILE_BYTES,
                    "modified_at": datetime.fromtimestamp(stat.st_mtime)
                    .astimezone()
                    .isoformat(timespec="minutes"),
                }
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail="Could not list workspace files."
        ) from exc
    return {"files": sorted(files, key=lambda item: item["modified_at"], reverse=True)}


@app.delete("/files/{filename}")
async def delete_workspace_file(
    filename: str,
    project_id: str = Query(default=project_store.GENERAL_PROJECT_ID, max_length=64),
):
    if not FILESYSTEM_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Workspace file tools are disabled in the current configuration.",
        )
    await _require_project(project_id)
    if (
        Path(filename).name != filename
        or filename in {".", ".."}
        or "/" in filename
        or "\\" in filename
    ):
        raise HTTPException(status_code=400, detail="Invalid workspace filename.")
    try:
        root = Path(_resolve_project_path(".", project_id))
        source = root / filename
        if source.is_symlink():
            raise HTTPException(
                status_code=400, detail="Workspace links cannot be deleted here."
            )
        target = Path(_resolve_project_path(filename, project_id))
        if target.suffix.lower() not in SUPPORTED_SUFFIXES:
            raise HTTPException(
                status_code=400, detail="This file type is not supported."
            )
        if not target.is_file():
            raise HTTPException(status_code=404, detail="Workspace file not found.")
        target.unlink()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail="Could not delete workspace file."
        ) from exc
    return {"deleted": True}


async def _chat_inputs(request: ChatRequest) -> tuple[list[dict[str, str]], str]:
    await _require_project(request.project_id)
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
                detail=(
                    "Workspace file tools are disabled in the current configuration."
                ),
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
            attachment_context = await asyncio.to_thread(
                extract_file, filename, request.project_id
            )
        except Exception as exc:  # pylint: disable=broad-exception-caught
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if len(attachment_context) > MAX_EXTRACTED_CHARS:
            attachment_context = (
                attachment_context[:MAX_EXTRACTED_CHARS]
                + "\n\n[Document excerpt truncated at 30,000 characters.]"
            )

    return messages, attachment_context


async def _project_instructions(project_id: str) -> str:
    project = await asyncio.to_thread(project_store.get_project, project_id)
    return project.get("instructions", "") if project else ""


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    messages, attachment_context = await _chat_inputs(request)
    project_instructions = await _project_instructions(request.project_id)
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
            project_id=request.project_id,
            project_instructions=project_instructions,
            conversation_id=request.conversation_id,
        )
        return ChatResponse(message=assistant_message)
    except AgentServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    messages, attachment_context = await _chat_inputs(request)
    project_instructions = await _project_instructions(request.project_id)

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
                project_id=request.project_id,
                project_instructions=project_instructions,
                conversation_id=request.conversation_id,
            ):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except AgentServiceError as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
