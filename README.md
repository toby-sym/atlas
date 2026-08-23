# Atlas

A local-first AI agent with a React frontend and a FastAPI backend, powered by a local Ollama model. Available as a native Windows desktop app, or run it as a regular web app.

## Features

- Chat interface backed by a tool-using agent loop
- Web search & page scraping
- Persistent memory (SQLite)
- Runs entirely on your machine against a local Ollama model

## Installation

1. Install [Ollama](https://ollama.com) and pull the model set in `config.yaml` (as of right now: `qwen3:4b`).
2. Download the latest installer (`.exe` or `.msi`) from the [Releases](../../releases) page.
3. Run the installer and launch Atlas.

## Configuration

Backend settings (model, Ollama URL, enabled tools) live in `config.yaml`.

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
