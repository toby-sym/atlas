from pathlib import Path
import pytest

from backend import projects
from backend.tools.filesystem import read_file
from backend.tools import filesystem


def test_resolve_path(monkeypatch, tmp_path):
    """Test path resolution functionality"""
    monkeypatch.setattr(filesystem, "SAFE_ROOT", str(tmp_path / "workspace"))
    try:
        path = str(filesystem._resolve_path("test.txt"))
        assert "workspace" in path
        assert "test.txt" in path
    except ValueError as e:
        assert "Access outside safe workspace directory" in str(e)


def test_read_file(monkeypatch, tmp_path):
    """Test file reading functionality"""
    monkeypatch.setattr(filesystem, "SAFE_ROOT", str(tmp_path / "workspace"))
    relative_path = "tests/test_file.txt"
    test_file = Path(filesystem._resolve_path(relative_path))
    test_file.parent.mkdir(parents=True, exist_ok=True)
    test_file.write_text("This is a test file", encoding="utf-8")

    try:
        content = read_file(relative_path)
        assert content is not None
        assert "This is a test file" in content
    finally:
        if test_file.exists():
            test_file.unlink()


def test_project_paths_are_separate_and_cannot_escape(monkeypatch, tmp_path):
    monkeypatch.setattr(projects, "DB_PATH", tmp_path / "projects.db")
    monkeypatch.setattr(filesystem, "SAFE_ROOT", str(tmp_path / "workspace"))
    project = projects.create_project("Garden")

    project_file = Path(filesystem._resolve_project_path("notes.txt", project["id"]))
    general_file = Path(filesystem._resolve_project_path("notes.txt", "general"))
    assert project_file != general_file
    assert project_file.parent.name == project["id"]
    assert project_file.parent.parent.name == ".atlas-projects"

    with pytest.raises(ValueError, match="outside this project"):
        filesystem._resolve_project_path("../notes.txt", project["id"])
