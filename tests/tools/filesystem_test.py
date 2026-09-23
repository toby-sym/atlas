from pathlib import Path
from backend.tools.filesystem import _resolve_path, read_file


def test_resolve_path():
    """Test path resolution functionality"""
    try:
        path = str(_resolve_path("test.txt"))
        assert "workspace" in path
        assert "test.txt" in path
    except ValueError as e:
        assert "Access outside safe workspace directory" in str(e)


def test_read_file():
    """Test file reading functionality"""
    relative_path = "tests/test_file.txt"
    test_file = Path(_resolve_path(relative_path))
    test_file.parent.mkdir(parents=True, exist_ok=True)
    test_file.write_text("This is a test file", encoding="utf-8")

    try:
        content = read_file(relative_path)
        assert content is not None
        assert "This is a test file" in content
    finally:
        if test_file.exists():
            test_file.unlink()
