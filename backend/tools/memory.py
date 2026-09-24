import logging
import os
from pathlib import Path
import sqlite3
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

DB_PATH = Path(os.getenv("ATLAS_MEMORY_DB", "backend/data/memory.db"))


def set_memory_path(path: str) -> None:
    # This is initialized once by the API from loaded desktop configuration.
    # pylint: disable=global-statement
    global DB_PATH
    DB_PATH = Path(path)


# Connects to SQLite DB and ensures the memories table exists.
def _get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            value TEXT,
            category TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    return conn


# Saves a key-value pair in the persistent memory database, optionally categorizing it. If the key already exists, it updates the value and timestamp.
def save_memory(key: str, value: str, category: str = "general") -> str:
    try:
        with _get_db() as conn:
            conn.execute(
                """
                INSERT INTO memories (key, value, category)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
                """,
                (key, value, category),
            )
        return f"Successfully saved memory for '{key}'."
    except sqlite3.Error as e:
        logger.error("Failed to save memory for '%s': %s", key, e)
        return f"Error saving memory: {e}"


def list_memories() -> List[Dict[str, Any]]:
    """Return every saved memory for the local library."""
    with _get_db() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, key, value, category, updated_at FROM memories "
            "ORDER BY updated_at DESC, id DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def create_memory(key: str, value: str, category: str) -> Dict[str, Any]:
    """Create a memory without replacing an existing key."""
    with _get_db() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "INSERT INTO memories (key, value, category) VALUES (?, ?, ?)",
            (key, value, category),
        )
        row = conn.execute(
            "SELECT id, key, value, category, updated_at FROM memories WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    return dict(row)


def update_memory(
    memory_id: int, key: str, value: str, category: str
) -> Dict[str, Any] | None:
    """Update one saved memory, returning None when it no longer exists."""
    with _get_db() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "UPDATE memories SET key = ?, value = ?, category = ?, "
            "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (key, value, category, memory_id),
        )
        if cursor.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT id, key, value, category, updated_at FROM memories WHERE id = ?",
            (memory_id,),
        ).fetchone()
    return dict(row)


def delete_memory(memory_id: int) -> bool:
    """Delete one saved memory and report whether it existed."""
    with _get_db() as conn:
        cursor = conn.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
        return cursor.rowcount > 0


# Recall memories from DB
def recall_memory(query: str = "") -> List[Dict[str, Any]]:
    # Retrieves memories either matching query or most recent 20 entries.
    try:
        with _get_db() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            if query:
                cursor.execute(
                    "SELECT key, value, category FROM memories WHERE key LIKE ? OR value LIKE ?",
                    (f"%{query}%", f"%{query}%"),
                )
            else:
                cursor.execute(
                    "SELECT key, value, category FROM memories ORDER BY updated_at DESC LIMIT 20"
                )
            return [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        logger.error("Failed to recall memory for query '%s': %s", query, e)
        return []
