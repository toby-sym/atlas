"""Local SQLite storage for saved chat conversations."""

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any

from backend.settings import CONVERSATIONS_PATH

DB_PATH = Path(CONVERSATIONS_PATH)


def set_conversations_path(path: str) -> None:
    global DB_PATH  # pylint: disable=global-statement
    DB_PATH = Path(path)


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
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    return connection


def list_conversations() -> list[dict[str, str]]:
    with closing(_connect()) as connection:
        rows = connection.execute(
            "SELECT id, title, created_at, updated_at FROM conversations "
            "ORDER BY updated_at DESC, created_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def get_conversation(conversation_id: str) -> dict[str, Any] | None:
    with closing(_connect()) as connection:
        row = connection.execute(
            "SELECT id, title, messages, created_at, updated_at "
            "FROM conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
    if row is None:
        return None
    result = dict(row)
    result["messages"] = json.loads(result["messages"])
    return result


def save_conversation(
    conversation_id: str, title: str, messages: list[dict[str, str]]
) -> None:
    with closing(_connect()) as connection:
        with connection:
            connection.execute(
                """
            INSERT INTO conversations (id, title, messages)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                messages = excluded.messages,
                updated_at = CURRENT_TIMESTAMP
            """,
                (conversation_id, title, json.dumps(messages, ensure_ascii=False)),
            )


def delete_conversation(conversation_id: str) -> bool:
    with closing(_connect()) as connection:
        with connection:
            cursor = connection.execute(
                "DELETE FROM conversations WHERE id = ?", (conversation_id,)
            )
            return cursor.rowcount > 0
