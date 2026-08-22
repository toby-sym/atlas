# Desktop build

Atlas is packaged as a Windows Tauri application. The React production build is embedded in the installer and the FastAPI server is bundled as a PyInstaller sidecar. The sidecar listens on `127.0.0.1:8000` and is stopped when the desktop app exits.

## Local prerequisites

- Node.js 20+
- Python 3.12+
- Rust stable with the Windows MSVC target
- Microsoft WebView2 (normally already installed on Windows 10/11)

Install backend packaging dependencies and the frontend dependencies:

```powershell
npm ci
python -m pip install -r backend/requirements.txt pyinstaller
```

Build the Windows installer:

```powershell
npm run desktop:build
```

Run the desktop app during development:

```powershell
npm run desktop:dev
```

`--reload` is intentionally not used in the packaged app. Tauri owns one production backend process and shuts it down with the window. The regular `npm --prefix frontend start` and direct Uvicorn workflow remain available for development.

## Releases

Pushing a tag such as `v0.1.0` starts `.github/workflows/release.yml` on `windows-latest`. The workflow installs Python, Node, and Rust, builds the backend sidecar, builds NSIS and MSI installers, and uploads both to the GitHub Release for that tag. It can also be started manually from the Actions tab.
