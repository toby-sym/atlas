"""Local SQLite storage for saved chat conversations."""

# The SQLite setup intentionally mirrors projects.py for the shared database.
# pylint: disable=duplicate-code

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any

from backend import projects as project_store
from backend.settings import CONVERSATIONS_PATH

DB_PATH = Path(CONVERSATIONS_PATH)


def set_conversations_path(path: str) -> None:
    global DB_PATH  # pylint: disable=global-statement
    DB_PATH = Path(path)
    project_store.set_projects_path(path)


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=3)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            messages TEXT NOT NULL,
            project_id TEXT NOT NULL DEFAULT 'general',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(conversations)")
    }
    if "project_id" not in columns:
        connection.execute(
            "ALTER TABLE conversations ADD COLUMN project_id TEXT NOT NULL DEFAULT 'general'"
        )
    connection.commit()
    return connection


def list_conversations(project_id: str = "general") -> list[dict[str, str]]:
    with closing(_connect()) as connection:
        rows = connection.execute(
            "SELECT id, title, created_at, updated_at FROM conversations "
            "WHERE project_id = ? ORDER BY updated_at DESC, created_at DESC",
            (project_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def search_conversations(
    query: str, project_id: str = "general"
) -> list[dict[str, str]]:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    with closing(_connect()) as connection:
        rows = connection.execute(
            "SELECT id, title, created_at, updated_at FROM conversations "
            "WHERE (title LIKE ? COLLATE NOCASE ESCAPE '\\' "
            "OR messages LIKE ? COLLATE NOCASE ESCAPE '\\') "
            "AND project_id = ? "
            "ORDER BY updated_at DESC, created_at DESC",
            (pattern, pattern, project_id),
        ).fetchall()
    return [dict(row) for row in rows]


def get_conversation(conversation_id: str) -> dict[str, Any] | None:
    with closing(_connect()) as connection:
        row = connection.execute(
            "SELECT id, title, messages, project_id, created_at, updated_at "
            "FROM conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
    if row is None:
        return None
    result = dict(row)
    result["messages"] = json.loads(result["messages"])
    return result


def save_conversation(
    conversation_id: str,
    title: str,
    messages: list[dict[str, str]],
    project_id: str = "general",
) -> None:
    with closing(_connect()) as connection:
        with connection:
            connection.execute(
                """
            INSERT INTO conversations (id, title, messages, project_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                messages = excluded.messages,
                project_id = excluded.project_id,
                updated_at = CURRENT_TIMESTAMP
            """,
                (
                    conversation_id,
                    title,
                    json.dumps(messages, ensure_ascii=False),
                    project_id,
                ),
            )


def rename_conversation(conversation_id: str, title: str) -> bool:
    with closing(_connect()) as connection:
        with connection:
            cursor = connection.execute(
                "UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP "
                "WHERE id = ?",
                (title, conversation_id),
            )
            return cursor.rowcount > 0


def delete_conversation(conversation_id: str) -> bool:
    with closing(_connect()) as connection:
        with connection:
            cursor = connection.execute(
                "DELETE FROM conversations WHERE id = ?", (conversation_id,)
            )
            return cursor.rowcount > 0
