import os
from backend.agent import register_tool

# Defining a safe root directory for file operations to prevent access outside the intended workspace.
SAFE_ROOT = os.path.abspath("./workspace")

# Function to resolve a relative file path to an absolute path within the SAFE_ROOT directory, ensuring security.
def _resolve_path(relative_path: str) -> str:
    os.makedirs(SAFE_ROOT, exist_ok=True)
    target = os.path.abspath(os.path.join(SAFE_ROOT, relative_path))
    if not target.startswith(SAFE_ROOT):
        raise ValueError("Access outside safe workspace directory is prohibited.")
    return target

# Registering the read_file tool with the agent, allowing it to read files from the local workspace directory.
@register_tool(
    name="read_file",
    description="Read the contents of a file within the local workspace directory.",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Relative file path inside workspace"}
        },
        "required": ["path"]
    }
)
# Function to read the contents of a file given its relative path
def read_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"