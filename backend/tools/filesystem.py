"""Safe workspace file access and local document text extraction."""

import os
from pathlib import Path

from backend.agent import register_tool

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_EXTRACTED_CHARS = 30_000
TEXT_SUFFIXES = {
    ".txt",
    ".md",
    ".csv",
    ".tsv",
    ".json",
    ".yaml",
    ".yml",
    ".xml",
    ".html",
    ".htm",
    ".css",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".rs",
    ".go",
    ".java",
    ".c",
    ".h",
    ".cpp",
    ".hpp",
    ".sh",
    ".ps1",
    ".toml",
    ".ini",
    ".log",
    ".sql",
    ".env",
    ".diff",
    ".patch",
}
SUPPORTED_SUFFIXES = TEXT_SUFFIXES | {".pdf", ".docx"}
SAFE_ROOT = os.path.abspath(os.getenv("ATLAS_WORKSPACE", "./workspace"))


def set_workspace_path(path: str) -> None:
    # This is initialized once by the API from loaded desktop configuration.
    # pylint: disable=global-statement
    global SAFE_ROOT
    SAFE_ROOT = os.path.abspath(path)


def _resolve_path(relative_path: str) -> str:
    os.makedirs(SAFE_ROOT, exist_ok=True)
    root = os.path.realpath(SAFE_ROOT)
    target = os.path.realpath(os.path.join(root, relative_path))
    if os.path.commonpath([root, target]) != root:
        raise ValueError("Access outside safe workspace directory is prohibited.")
    return target


def extract_file(path: str) -> str:  # pylint: disable=import-outside-toplevel
    """Read a supported workspace document as text, with bounded extraction."""
    resolved = _resolve_path(path)
    if os.path.getsize(resolved) > MAX_FILE_BYTES:
        raise ValueError("Files must be 10 MB or smaller.")
    suffix = Path(resolved).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise ValueError(
            "This file type is not supported. Use text, code, PDF, or DOCX."
        )

    if suffix in TEXT_SUFFIXES:
        content = Path(resolved).read_text(encoding="utf-8-sig")
    elif suffix == ".pdf":
        from pypdf import PdfReader  # pylint: disable=import-outside-toplevel

        reader = PdfReader(resolved, strict=True)
        content = "\n\n".join(
            page.extract_text() or "" for page in reader.pages
        ).strip()
        if not content:
            raise ValueError(
                "This PDF has no extractable text. Scanned PDFs are not supported."
            )
    else:
        from docx import Document  # pylint: disable=import-outside-toplevel

        document = Document(resolved)
        paragraphs = [
            paragraph.text for paragraph in document.paragraphs if paragraph.text
        ]
        for table in document.tables:
            paragraphs.extend(
                " | ".join(cell.text for cell in row.cells) for row in table.rows
            )
        content = "\n".join(paragraphs).strip()
        if not content:
            raise ValueError("This DOCX document contains no extractable text.")

    if len(content) > MAX_EXTRACTED_CHARS:
        return (
            content[:MAX_EXTRACTED_CHARS]
            + "\n\n[Document excerpt truncated at 30,000 characters.]"
        )
    return content


@register_tool(
    name="read_file",
    description="Read text, code, PDF, or DOCX content from the local workspace.",
    parameters={
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Relative file path inside workspace",
            }
        },
        "required": ["path"],
    },
)
def read_file(path: str) -> str:
    try:
        return extract_file(path)
    except Exception as exc:  # pylint: disable=broad-exception-caught
        return f"Error reading file: {exc}"
