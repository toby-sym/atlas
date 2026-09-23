"""Configuration shared by the API and its tools."""

import os
from pathlib import Path
from typing import Any

import yaml


def load_config() -> dict[str, Any]:
    config_path = os.getenv("CONFIG_PATH", "config.yaml")
    path = Path(config_path)
    if not path.is_file():
        return {}
    with path.open("r", encoding="utf-8") as config_file:
        return yaml.safe_load(config_file) or {}


CONFIG = load_config()
OLLAMA_URL = os.getenv(
    "ATLAS_OLLAMA_URL",
    CONFIG.get("ollama_url", "http://localhost:11434/v1/chat/completions"),
)
DEFAULT_MODEL = os.getenv("ATLAS_MODEL", CONFIG.get("model", "qwen3:4b"))
TOOLS_CONFIG = CONFIG.get("tools", {})
WEB_ENABLED = bool(TOOLS_CONFIG.get("web_search", {}).get("enabled", True))
MEMORY_ENABLED = bool(CONFIG.get("memory", {}).get("enabled", True))
FILESYSTEM_ENABLED = bool(TOOLS_CONFIG.get("filesystem", {}).get("enabled", True))
WORKSPACE_PATH = os.getenv(
    "ATLAS_WORKSPACE",
    CONFIG.get("tools", {}).get("filesystem", {}).get("path", "./workspace"),
)
MEMORY_PATH = os.getenv(
    "ATLAS_MEMORY_DB",
    CONFIG.get("memory", {}).get("path", "backend/data/memory.db"),
)
