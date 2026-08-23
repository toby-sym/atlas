import logging
import os
from pathlib import Path
import sqlite3
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

DB_PATH = Path(os.getenv("ATLAS_MEMORY_DB", "backend/data/memory.db"))


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
