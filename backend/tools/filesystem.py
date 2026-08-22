def read_file(path: str):
    """Read content from a file"""
    try:
        with open(path, "r") as f:
            return f.read()
    except FileNotFoundError:
        return {"error": f"File {path} not found"}


def write_file(path: str, content: str):
    """Write content to a file"""
    try:
        with open(path, "w") as f:
            f.write(content)
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}