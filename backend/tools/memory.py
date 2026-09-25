"""Local SQLite storage for project and shared memories."""

import logging
import os
from dataclasses import dataclass
from pathlib import Path
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)
GENERAL_PROJECT_ID = "general"
SHARED_MEMORY_ID = "shared"
DB_PATH = Path(os.getenv("ATLAS_MEMORY_DB", "backend/data/memory.db"))


@dataclass(frozen=True)
class MemoryUpdateOptions:
    """Scope fields for updating a memory visible in one project."""

    project_id: str = GENERAL_PROJECT_ID
    visible_project_id: str | None = None


def set_memory_path(path: str) -> None:
    # This is initialized once by the API from loaded desktop configuration.
    # pylint: disable=global-statement
    global DB_PATH
    DB_PATH = Path(path)


def _get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=3)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            category TEXT NOT NULL,
            project_id TEXT NOT NULL DEFAULT 'general',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, key)
        )
        """
    )
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(memories)")}
    if "project_id" not in columns:
        conn.execute(
            "ALTER TABLE memories ADD COLUMN project_id TEXT NOT NULL DEFAULT 'general'"
        )

    has_global_key_unique = False
    for index in conn.execute("PRAGMA index_list(memories)").fetchall():
        if not index["unique"]:
            continue
        index_name = index["name"].replace('"', '""')
        indexed_columns = [
            row["name"]
            for row in conn.execute(f'PRAGMA index_info("{index_name}")').fetchall()
        ]
        if indexed_columns == ["key"]:
            has_global_key_unique = True
            break

    if has_global_key_unique:
        conn.execute("DROP TABLE IF EXISTS memories_project_migration")
        conn.execute(
            """
            CREATE TABLE memories_project_migration (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                category TEXT NOT NULL,
                project_id TEXT NOT NULL DEFAULT 'general',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(project_id, key)
            )
            """
        )
        conn.execute(
            """
            INSERT INTO memories_project_migration
                (id, key, value, category, project_id, updated_at)
            SELECT id, key, value, category, project_id, updated_at FROM memories
            """
        )
        conn.execute("DROP TABLE memories")
        conn.execute("ALTER TABLE memories_project_migration RENAME TO memories")
    conn.commit()
    return conn


def save_memory(
    key: str,
    value: str,
    category: str = "general",
    project_id: str = GENERAL_PROJECT_ID,
) -> str:
    try:
        with _get_db() as conn:
            conn.execute(
                """
                INSERT INTO memories (key, value, category, project_id)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(project_id, key) DO UPDATE SET
                    value = excluded.value,
                    category = excluded.category,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (key, value, category, project_id),
            )
        return f"Successfully saved memory for '{key}'."
    except sqlite3.Error as exc:
        logger.error("Failed to save memory for '%s': %s", key, exc)
        return f"Error saving memory: {exc}"


def list_memories(project_id: str = GENERAL_PROJECT_ID) -> list[dict[str, Any]]:
    """Return current-project memories and explicitly shared personal memories."""
    with _get_db() as conn:
        rows = conn.execute(
            "SELECT id, key, value, category, project_id, updated_at FROM memories "
            "WHERE project_id IN (?, ?) ORDER BY updated_at DESC, id DESC",
            (project_id, SHARED_MEMORY_ID),
        ).fetchall()
    return [dict(row) for row in rows]


def create_memory(
    key: str,
    value: str,
    category: str,
    project_id: str = GENERAL_PROJECT_ID,
) -> dict[str, Any]:
    """Create a memory without replacing an existing key in the same scope."""
    with _get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO memories (key, value, category, project_id) VALUES (?, ?, ?, ?)",
            (key, value, category, project_id),
        )
        row = conn.execute(
            "SELECT id, key, value, category, project_id, updated_at "
            "FROM memories WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    return dict(row)


def update_memory(
    memory_id: int,
    key: str,
    value: str,
    category: str,
    options: MemoryUpdateOptions | None = None,
) -> dict[str, Any] | None:
    """Update a memory visible in this project, optionally changing its scope."""
    options = options or MemoryUpdateOptions()
    visible_project_id = options.visible_project_id or options.project_id
    with _get_db() as conn:
        cursor = conn.execute(
            "UPDATE memories SET key = ?, value = ?, category = ?, project_id = ?, "
            "updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id IN (?, ?)",
            (
                key,
                value,
                category,
                options.project_id,
                memory_id,
                visible_project_id,
                SHARED_MEMORY_ID,
            ),
        )
        if cursor.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT id, key, value, category, project_id, updated_at "
            "FROM memories WHERE id = ?",
            (memory_id,),
        ).fetchone()
    return dict(row)


def delete_memory(memory_id: int, project_id: str = GENERAL_PROJECT_ID) -> bool:
    """Delete a memory visible in the current project or shared scope."""
    with _get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM memories WHERE id = ? AND project_id IN (?, ?)",
            (memory_id, project_id, SHARED_MEMORY_ID),
        )
        return cursor.rowcount > 0


def move_project_memories_to_general(project_id: str, project_name: str) -> None:
    """Keep project memories by moving them to General when a project is removed."""
    if project_id == GENERAL_PROJECT_ID:
        return
    if not DB_PATH.exists():
        return
    with _get_db() as conn:
        rows = conn.execute(
            "SELECT id, key FROM memories WHERE project_id = ? ORDER BY id",
            (project_id,),
        ).fetchall()
        for row in rows:
            key = row["key"]
            suffix_number = 1
            while conn.execute(
                "SELECT 1 FROM memories WHERE project_id = ? AND key = ?",
                (GENERAL_PROJECT_ID, key),
            ).fetchone():
                suffix_number += 1
                suffix = f" (from {project_name} {suffix_number})"
                key = f"{row['key'][: max(1, 200 - len(suffix))]}{suffix}"
            conn.execute(
                "UPDATE memories SET key = ?, project_id = ?, "
                "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (key, GENERAL_PROJECT_ID, row["id"]),
            )


def recall_memory(
    query: str = "", project_id: str = GENERAL_PROJECT_ID
) -> list[dict[str, Any]]:
    """Recall matching memories from the current project and shared scope."""
    try:
        with _get_db() as conn:
            if query:
                rows = conn.execute(
                    "SELECT key, value, category, project_id FROM memories "
                    "WHERE project_id IN (?, ?) AND (key LIKE ? OR value LIKE ?) "
                    "ORDER BY updated_at DESC LIMIT 20",
                    (project_id, SHARED_MEMORY_ID, f"%{query}%", f"%{query}%"),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT key, value, category, project_id FROM memories "
                    "WHERE project_id IN (?, ?) ORDER BY updated_at DESC LIMIT 20",
                    (project_id, SHARED_MEMORY_ID),
                ).fetchall()
            return [dict(row) for row in rows]
    except sqlite3.Error as exc:
        logger.error("Failed to recall memory for query '%s': %s", query, exc)
        return []
