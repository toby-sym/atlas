import os
import yaml
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from backend.agent import run_agent_loop

# Import tool modules from /backend/tools to ensure they are registered with the agent.
import backend.tools.filesystem

# Defining the FastAPI application instance for the Nook API.
app = FastAPI(title="Nook API", version="0.1.0")

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
    messages: List[Dict[str, Any]] = Field(
        ...,
        description="Conversation history in OpenAI format",
        example=[{"role": "user", "content": "Read the contents of demo.txt"}]
    )
    model: Optional[str] = Field(None, description="Override default LLM model name")
    max_steps: Optional[int] = Field(5, description="Maximum internal tool execution loops")

# Pydantic model for the response from the chat endpoint, encapsulating the assistant's message.
class ChatResponse(BaseModel):
    message: Dict[str, Any]

# API endpoint to check the health of the Nook API, returning a simple status message.
@app.get("/health")
async def health():
    return {"status": "ok"}

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
            max_steps=request.max_steps
        )
        return ChatResponse(message=assistant_message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent execution error: {str(e)}")