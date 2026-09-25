import sqlite3

import pytest

from backend.tools import memory


@pytest.fixture(autouse=True)
def isolated_memory_database(tmp_path):
    memory.set_memory_path(str(tmp_path / "memory.db"))


def test_save_memory():
    """Test memory saving functionality"""
    result = memory.save_memory("user_preference", "dark_mode", "ui")
    assert "Successfully saved memory" in result


def test_recall_memory():
    """Test memory retrieval functionality"""
    result = memory.save_memory("user_preference", "dark_mode", "ui")
    retrieved = memory.recall_memory("dark")
    assert len(retrieved) >= 1
    assert "dark_mode" in retrieved[0]["value"]
    assert "Successfully saved memory" in result


def test_memory_search():
    """Test memory search functionality"""
    result = memory.save_memory("user_preference", "dark_mode", "ui")
    results = memory.recall_memory("preference")
    assert len(results) >= 1
    assert "dark_mode" in results[0]["value"]
    assert "Successfully saved memory" in result


def test_memory_is_project_scoped_with_explicit_shared_items():
    memory.save_memory("working style", "Garden only", project_id="garden")
    memory.save_memory("working style", "Studio only", project_id="studio")
    memory.save_memory("writing style", "Plain language", project_id="shared")

    garden = memory.recall_memory(project_id="garden")
    studio = memory.recall_memory(project_id="studio")
    assert {item["value"] for item in garden} == {"Garden only", "Plain language"}
    assert {item["value"] for item in studio} == {"Studio only", "Plain language"}


def test_legacy_memory_database_migrates_to_project_scopes(tmp_path):
    database = tmp_path / "legacy-memory.db"
    with sqlite3.connect(database) as connection:
        connection.execute(
            "CREATE TABLE memories ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, "
            "value TEXT NOT NULL, category TEXT NOT NULL, "
            "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )
        connection.execute(
            "INSERT INTO memories (key, value, category) VALUES (?, ?, ?)",
            ("favorite editor", "VS Code", "tools"),
        )
    memory.set_memory_path(str(database))

    assert memory.recall_memory("editor")[0]["value"] == "VS Code"
    result = memory.save_memory(
        "favorite editor", "Neovim", "tools", project_id="studio"
    )
    assert "Successfully saved" in result
    assert [item["value"] for item in memory.recall_memory("editor", "studio")] == [
        "Neovim"
    ]
