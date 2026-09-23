# Desktop build

Atlas is packaged as a Tauri application. The React production build is embedded in the installer and the FastAPI server is bundled as a PyInstaller sidecar. The sidecar binds to a per-launch loopback port and is stopped when the desktop app exits. Tauri passes a private request token through its command bridge. Browser development continues to use `http://localhost:8000`.

## Local prerequisites

- Node.js 20+
- Python 3.12+
- Rust stable with the target for the machine being built
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

Pushing a tag such as `v0.4.0` starts `.github/workflows/build.yml`. It builds
Windows (NSIS and MSI), macOS (Apple Silicon and Intel DMG), and Linux (DEB and
AppImage) installers. You can also select **Actions → Build Pipeline → Run
workflow** and choose a build type:

| Build type | Version | Destination |
| --- | --- | --- |
| `dev` | `0.0.0-<run number>` | Workflow artifacts only |
| `release` | Required release tag, e.g. `v0.4.0` | Normal GitHub Release |
| `beta` | `v0.4.0-beta.1`, then `v0.4.0-beta.2` | GitHub prerelease; never marked Latest |

For a beta, select a **branch** and leave the tag input empty to use the base
version in the repository-root `Version.properties`:

```properties
version=0.4.0
beta=1
```

`beta` is the **last reserved number**, so `1` produces `0.4.0-beta.2` next.
Alternatively, enter a base version such as `v0.4.0` in the tag input. The
workflow writes that base back to the properties file and starts its counter
at 1, or after any existing beta tags for that version. You can also change
`version` and reset `beta=0` in a normal commit to begin a new version series.
Existing tags prevent numbers from being reused if a branch has an older counter.

One preparation job reserves the number for all platforms. It checks out the
latest commit of the selected branch, commits only `Version.properties`, and
pushes that commit and its annotated beta tag atomically. Platform jobs build
that exact commit. Reservations are queued using GitHub Actions
[concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
The workflow needs permission to write repository contents and to push the
selected branch and tags; branch protection must allow the workflow bot's
counter commit. It does not bypass protection or force-push.

A failed/cancelled build keeps its reserved number. **Re-run jobs** on that same
workflow run reuses its original beta tag; a new manual run reserves the next
number. A rejected branch/tag push fails preparation without partially publishing
the reservation. Stable and dev builds do not change the beta counter. Manually
pushing a `vX.Y.Z-beta.N` tag also produces a prerelease without incrementing it.

The full beta version appears in the release name, installer filenames, native
window title, and app header. The build passes `REACT_APP_BUILD_VERSION` and
`REACT_APP_BUILD_CHANNEL` to the frontend. WiX uses the numeric base version
internally because [MSI version fields require numbers](https://v2.tauri.app/reference/config/#wixconfig);
beta and stable builds share the same app identity, rather than installing side
by side. Switching channels may require uninstalling the existing MSI first.

The release workflow runs frontend, backend, and version tests plus a frozen
backend smoke test against a fake Ollama endpoint on each platform. It publishes
the release only after Windows, macOS, and Linux package jobs all succeed.

Run the version unit and local-Git integration tests with:

```bash
node --test scripts/version.test.cjs
```
