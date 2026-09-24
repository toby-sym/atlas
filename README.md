# Atlas

A local-first AI agent with a React frontend and a FastAPI backend, powered by a local Ollama model. Available as a desktop app for Windows, macOS, and Linux, or as a regular web app.

## Features

- Streaming chat backed by a tool-using agent loop
- Web search and page scraping, with a research context control
- Persistent memory and saved conversations (SQLite)
- Local CPU, memory, and NVIDIA GPU telemetry
- Document reading for text, code, PDF, DOCX, PNG, and JPEG, including local OCR
- Model inference runs on your machine through Ollama

## Installation

1. Install [Ollama](https://ollama.com) and run `ollama pull qwen3:4b` (or pull the model set in `config.yaml`).
2. Download the installer for your platform from the [Releases](../../releases) page: `.exe` or `.msi` for Windows, `.dmg` for macOS, or `.deb` or `.AppImage` for Linux.
3. Run the installer and launch Atlas.

## Configuration

Backend settings (model, Ollama URL, enabled tools) live in `config.yaml`.
The workspace accepts UTF-8 text and code files, PDFs, `.docx`, PNG, and JPEG
files up to 10 MB. Atlas reads scanned PDF pages and images with local OCR;
legacy `.doc` files are not supported. Document excerpts are limited to 30,000
characters, and OCR is limited to 10 image pages per PDF. PDF, Word, and OCR
extraction run locally. Web research uses DuckDuckGo; browser voice recognition
may use the speech provider selected by your browser. Saved conversations and
memories stay on this machine. CPU and memory readings are available in the
Telemetry panel. NVIDIA GPU utilization and VRAM readings are shown when the
NVIDIA driver tools are available on the machine.

## License

TBD

---

## Development

Run the frontend and backend separately for local development:

```bash
# Backend
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000

# Frontend
npm --prefix frontend start
```

The app will be available at `http://localhost:3000`.

To build the desktop app yourself instead of using a released installer, see [DESKTOP.md](./DESKTOP.md).
