# Atlas

A local-first AI agent with a React frontend and a FastAPI backend, powered by a local Ollama model. Ships as a Windows desktop app via Tauri, or run it as a regular web app.

## Features

- Chat interface backed by a tool-using agent loop
- Web search & page scraping
- Persistent memory (SQLite)
- Runs entirely on your machine against a local Ollama model
- Packaged as a native Windows desktop app

## Getting started

Requires [Ollama](https://ollama.com) running locally with your chosen model pulled (see `config.yaml`).

```bash
# Backend
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000

# Frontend
npm --prefix frontend start
```

The app will be available at `http://localhost:3000`.

## Desktop app

Atlas can also be built as a native Windows app with Tauri, bundling the backend alongside the UI. See [DESKTOP.md](./DESKTOP.md) for build instructions.

## Configuration

Backend settings (model, Ollama URL, enabled tools) live in `config.yaml`.

## License

TBD
