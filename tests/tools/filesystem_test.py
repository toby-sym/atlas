import pytest
from backend.tools.filesystem import _resolve_path, read_file

def test_resolve_path():
    """Test path resolution functionality"""
    try:
        path = _resolve_path("test.txt")
        assert path.startswith("workspace")
        assert "test.txt" in path
    except ValueError as e:
        assert "Access outside safe workspace directory" in str(e)

def test_read_file():
    """Test file reading functionality"""
    content = read_file("tests/test_file.txt")
    assert content is not None
    assert "This is a test file" in content