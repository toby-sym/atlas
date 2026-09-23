import os
from typing import Any

import yaml
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Import tool modules from /backend/tools to ensure they are registered with the agent.
from backend.agent import run_agent_loop
from backend.tools.filesystem import _resolve_path

# Defining the FastAPI application instance for the Atlas API.
app = FastAPI(title="Atlas API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "tauri://localhost",
        "http://tauri.localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Function to load config settings from a YAML file, defaulting to "config.yaml" if not specified in the environment.
def load_config() -> dict:
    config_path = os.getenv("CONFIG_PATH", "config.yaml")
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


# Loading configuration settings for the application, including the Ollama API URL and default model name.
CONFIG = load_config()
OLLAMA_URL = CONFIG.get("ollama_url", "http://localhost:11434/v1/chat/completions")
DEFAULT_MODEL = CONFIG.get("model", "qwen3:4b")


# Pydantic models for request and response validation in the FastAPI endpoints.
class ChatRequest(BaseModel):
    messages: list[dict[str, Any]] = Field(
        ...,
        description="Conversation history in OpenAI format",
        example=[{"role": "user", "content": "Read the contents of demo.txt"}],
    )
    model: str | None = Field(None, description="Override default LLM model name")
    max_steps: int | None = Field(
        5, description="Maximum internal tool execution loops"
    )


# Pydantic model for the response from the chat endpoint, encapsulating the assistant's message.
class ChatResponse(BaseModel):
    message: dict[str, Any]


# API endpoint to check the health of the Atlas API, returning a simple status message.
@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/files")
async def upload_file(file: UploadFile = File(...)):
    """Save one user-selected file into Atlas's local workspace."""
    filename = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    if filename in ("", ".", ".."):
        raise HTTPException(
            status_code=400, detail="Please choose a file with a valid name."
        )

    try:
        target = _resolve_path(filename)
        with open(target, "xb") as destination:
            while chunk := await file.read(1024 * 1024):
                destination.write(chunk)
        return {"filename": filename, "path": filename}
    except FileExistsError as exc:
        raise HTTPException(
            status_code=409,
            detail=f"A file named '{filename}' is already in the workspace.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        # Remove a partial upload if writing failed after creating the file.
        try:
            if "target" in locals() and os.path.exists(target):
                os.remove(target)
        except OSError:
            pass
        raise HTTPException(
            status_code=500, detail="Could not save the file to the workspace."
        ) from exc
    finally:
        await file.close()


# API endpoint to handle chat requests, processing messages through the agent loop and returning the assistant's response.
@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages array cannot be empty.")

    selected_model = request.model or DEFAULT_MODEL

    try:
        assistant_message = await run_agent_loop(
            messages=request.messages,
            ollama_url=OLLAMA_URL,
            model=selected_model,
            max_steps=request.max_steps,
        )
        return ChatResponse(message=assistant_message)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Agent execution error: {e!s}"
        ) from e
