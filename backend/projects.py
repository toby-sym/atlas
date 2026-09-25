"""Local SQLite storage for Atlas projects."""

import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any
from uuid import uuid4

from backend.settings import CONVERSATIONS_PATH

GENERAL_PROJECT_ID = "general"
DB_PATH = Path(CONVERSATIONS_PATH)


def set_projects_path(path: str) -> None:
    global DB_PATH  # pylint: disable=global-statement
    DB_PATH = Path(path)


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=3)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        "INSERT OR IGNORE INTO projects (id, name) VALUES (?, ?)",
        (GENERAL_PROJECT_ID, "General"),
    )
    return connection


def list_projects() -> list[dict[str, Any]]:
    with closing(_connect()) as connection:
        rows = connection.execute(
            "SELECT id, name, created_at, updated_at FROM projects "
            "ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, name COLLATE NOCASE",
            (GENERAL_PROJECT_ID,),
        ).fetchall()
    return [dict(row) for row in rows]


def project_exists(project_id: str) -> bool:
    with closing(_connect()) as connection:
        row = connection.execute(
            "SELECT 1 FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
    return row is not None


def create_project(name: str) -> dict[str, Any]:
    project_id = str(uuid4())
    with closing(_connect()) as connection:
        with connection:
            connection.execute(
                "INSERT INTO projects (id, name) VALUES (?, ?)",
                (project_id, name),
            )
            row = connection.execute(
                "SELECT id, name, created_at, updated_at FROM projects WHERE id = ?",
                (project_id,),
            ).fetchone()
    return dict(row)


def rename_project(project_id: str, name: str) -> dict[str, Any] | None:
    if project_id == GENERAL_PROJECT_ID:
        return None
    with closing(_connect()) as connection:
        with connection:
            cursor = connection.execute(
                "UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP "
                "WHERE id = ?",
                (name, project_id),
            )
            if cursor.rowcount == 0:
                return None
            row = connection.execute(
                "SELECT id, name, created_at, updated_at FROM projects WHERE id = ?",
                (project_id,),
            ).fetchone()
    return dict(row)


def delete_project(project_id: str) -> bool:
    if project_id == GENERAL_PROJECT_ID:
        return False
    with closing(_connect()) as connection:
        with connection:
            tables = {
                row["name"]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
            if "conversations" in tables:
                columns = {
                    row["name"]
                    for row in connection.execute("PRAGMA table_info(conversations)")
                }
                if "project_id" in columns:
                    connection.execute(
                        "UPDATE conversations SET project_id = ? WHERE project_id = ?",
                        (GENERAL_PROJECT_ID, project_id),
                    )
            cursor = connection.execute(
                "DELETE FROM projects WHERE id = ?", (project_id,)
            )
            return cursor.rowcount > 0
