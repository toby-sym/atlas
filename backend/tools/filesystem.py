"""Safe workspace file access and local document text extraction."""

import os
from functools import lru_cache
from pathlib import Path

import numpy as np
import pypdfium2 as pdfium
from PIL import Image
from rapidocr import RapidOCR

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
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg"}
SUPPORTED_SUFFIXES = TEXT_SUFFIXES | IMAGE_SUFFIXES | {".pdf", ".docx"}
MAX_OCR_PAGES = 10
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


@lru_cache(maxsize=1)
def _ocr_engine() -> RapidOCR:
    return RapidOCR()


def _ocr_image(image: Image.Image) -> str:
    result = _ocr_engine()(np.asarray(image.convert("RGB")))
    return "\n".join(result.txts or ())


def _ocr_pdf_page(document: pdfium.PdfDocument, index: int) -> str:
    page = document[index]
    try:
        width, height = page.get_size()
        scale = min(2.0, 2000 / max(width, height))
        bitmap = page.render(scale=scale)
        try:
            return _ocr_image(bitmap.to_pil())
        finally:
            bitmap.close()
    finally:
        page.close()


def extract_file(path: str) -> str:  # pylint: disable=import-outside-toplevel,too-many-branches
    """Read a supported workspace document as text, with bounded extraction."""
    resolved = _resolve_path(path)
    if os.path.getsize(resolved) > MAX_FILE_BYTES:
        raise ValueError("Files must be 10 MB or smaller.")
    suffix = Path(resolved).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise ValueError(
            "This file type is not supported. Use text, code, PDF, DOCX, PNG, or JPEG."
        )

    if suffix in TEXT_SUFFIXES:
        content = Path(resolved).read_text(encoding="utf-8-sig")
    elif suffix in IMAGE_SUFFIXES:
        with Image.open(resolved) as image:
            content = _ocr_image(image).strip()
        if not content:
            raise ValueError("This image has no text that OCR could recognize.")
    elif suffix == ".pdf":
        from pypdf import PdfReader  # pylint: disable=import-outside-toplevel

        reader = PdfReader(resolved, strict=True)
        page_texts = [page.extract_text() or "" for page in reader.pages]
        ocr_limited = False
        if any(not text.strip() for text in page_texts):
            document = pdfium.PdfDocument(resolved)
            try:
                ocr_count = 0
                for index, text in enumerate(page_texts):
                    if not text.strip() and ocr_count < MAX_OCR_PAGES:
                        page_texts[index] = _ocr_pdf_page(document, index)
                        ocr_count += 1
                ocr_limited = (
                    any(not text.strip() for text in page_texts)
                    and ocr_count >= MAX_OCR_PAGES
                )
            finally:
                document.close()
        content = "\n\n".join(page_texts).strip()
        if not content:
            raise ValueError(
                "This PDF has no text that extraction or OCR could recognize."
            )
        if ocr_limited:
            content += "\n\n[OCR stopped after 10 image pages.]"
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
    description="Read text, code, PDF, DOCX, or OCR image content from the local workspace.",
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
