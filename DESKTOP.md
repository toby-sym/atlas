# Desktop build

Atlas is packaged as a Tauri application. The React production build is embedded in the installer and the FastAPI server is bundled as a PyInstaller sidecar. The sidecar binds to a per-launch loopback port and is stopped when the desktop app exits. Tauri passes a private request token through its command bridge. Browser development continues to use `http://localhost:8000`.

## Local prerequisites

- Node.js 20+
- Python 3.12+
- Rust stable with the target for the machine being built
- Microsoft WebView2 (normally already installed on Windows 10/11)

The desktop installer bundles Atlas but does not bundle GPU vendor tools.
GPU telemetry is optional and requires the appropriate command-line tool to be
installed and available on `PATH` when Atlas starts. See the
[GPU telemetry setup notes](./README.md#optional-gpu-telemetry-tools) for
vendor-specific installation links and platform support.

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

Pushing a tag such as `v0.4.3` starts `.github/workflows/build.yml`. It builds
Windows (NSIS and MSI), macOS (Apple Silicon and Intel DMG), and Linux (DEB and
AppImage) installers. You can also select **Actions → Build Pipeline → Run
workflow** and choose a build type:

| Build type | Version | Destination |
| --- | --- | --- |
| `dev` | `0.0.0-<run number>` | Workflow artifacts only |
| `release` | Required release tag, e.g. `v0.4.3` | Normal GitHub Release |
| `beta` | Next available number, currently `v0.4.3-beta.1` | GitHub prerelease; never marked Latest |

For a beta, select a **branch** and leave the tag input empty to use the base
version in the repository-root `Version.properties`:

```properties
version=0.4.3
beta=0
```

`beta` is the **last reserved number**, so `0` produces `0.4.3-beta.1` next.
Alternatively, enter a base version such as `v0.4.3` in the tag input. The
workflow writes that base back to the properties file and starts its counter
at 1, or after any existing beta tags for that version. You can also change
`version` and reset `beta=0` in a normal commit to begin a new version series.
Existing tags prevent numbers from being reused if a branch has an older counter.

This change prepares the `0.4.3` series on `main` with `beta=0`, so its next
beta is `v0.4.3-beta.1`. For a future series, run **Actions → Bump Atlas
Version** on `main` and enter the new base version (the default is `0.4.3`).
The action updates the app version metadata and commits it to `main` with
`beta=0`. The next beta build from `main` is then `vX.Y.Z-beta.1`, unless that
version already has beta tags, in which case the beta workflow continues after
the highest existing number. Use a beta build to smoke-test the development
version from the generated GitHub prerelease. The action needs `contents: write`,
and repository branch protection must allow the workflow bot to commit to `main`.

When ready to publish, open a pull request from `main` into the manually
maintained `release` branch and merge it. On `release`, run **Actions → Build
Pipeline**, choose `release`, and enter the stable tag such as `v0.4.3`. The
workflow builds that branch state and publishes the stable GitHub Release.
This keeps version preparation and beta testing on `main`, while stable builds
come from the reviewed `release` branch.

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
backend smoke test against a fake Ollama endpoint on each platform. The smoke
test covers startup, authentication, document upload, OCR, streaming chat, and
saved conversations. It publishes the release only after Windows, macOS, and
Linux package jobs all succeed.

Run the version unit and local-Git integration tests with:

```bash
node --test scripts/version.test.cjs
```
