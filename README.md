# Atlas

A local-first AI agent with a React frontend and a FastAPI backend, powered by a local Ollama model. Available as a desktop app for Windows, macOS, and Linux, or as a regular web app.

## Features

- Streaming chat backed by a tool-using agent loop
- Web search and page scraping, with a research context control
- Searchable local memory library and saved conversations, with conversation search and rename (SQLite)
- Local CPU, memory, and GPU telemetry for NVIDIA, AMD, and Intel GPUs
- Document reading for text, code, PDF, DOCX, PNG, and JPEG, including local OCR
- Choose any locally installed Ollama model; your selection stays on this machine
- Model inference runs on your machine through Ollama

## Installation

1. Install [Ollama](https://ollama.com) and run `ollama pull qwen3:4b` (or pull the model set in `config.yaml`).
2. Download the installer for your platform from the [Releases](../../releases) page: `.exe` or `.msi` for Windows, `.dmg` for macOS, or `.deb` or `.AppImage` for Linux.
3. Run the installer and launch Atlas.

### Optional GPU telemetry tools

Atlas does not install GPU management tools. GPU readings appear when the
matching vendor command is installed and available on `PATH` when Atlas starts.
You can check availability by running the command shown for your GPU:

- **NVIDIA:** `nvidia-smi` is provided with NVIDIA's driver tools. Verify it
  works in a terminal with `nvidia-smi` before launching Atlas. See the
  [NVIDIA SMI documentation](https://docs.nvidia.com/deploy/nvidia-smi/).
- **AMD:** AMD SMI's `amd-smi` CLI is available for supported AMD GPUs on
  supported Linux systems. It is included with most ROCm Core SDK installations
  or can be installed as the standalone `amdrocm-amdsmi` package. Follow the
  [AMD SMI installation guide](https://rocm.docs.amd.com/projects/amdsmi/en/latest/install/install.html);
  if installed standalone, add its `bin` directory to `PATH`. Check it with
  `amd-smi monitor --json --gfx --vram-usage`.
- **Intel:** Install Intel XPU Manager for your system from the
  [XPU Manager releases](https://github.com/intel/xpumanager/releases). Its
  `xpu-smi` CLI provides the GPU readings. Check it with
  `xpu-smi --query-gpu=utilization.gpu,memory.used,memory.total,name --format=csv,nounits`.
  Check the [XPU-SMI overview](https://intel.github.io/xpumanager/2.0/xpu-smi/overview.html)
  for currently supported devices and operating systems. Current 2.x support
  lists Intel Arc Pro GPUs on Ubuntu 24.04/26.04 and Windows Server 2022/2025
  (with limited features on Windows Server).

If the vendor command is missing or cannot read a metric, Atlas continues to
show CPU and system memory telemetry and marks the unavailable GPU reading as
unavailable. Available GPU metrics can depend on the GPU model, driver, and
permissions.

## Configuration

Backend settings (model, Ollama URL, enabled tools) live in `config.yaml`.
The workspace accepts UTF-8 text and code files, PDFs, `.docx`, PNG, and JPEG
files up to 10 MB. Atlas reads scanned PDF pages and images with local OCR;
legacy `.doc` files are not supported. Document excerpts are limited to 30,000
characters, and OCR is limited to 10 image pages per PDF. PDF, Word, and OCR
extraction run locally. Web research uses DuckDuckGo; browser voice recognition
may use the speech provider selected by your browser. Saved conversations and
memories stay on this machine. CPU and memory readings are available in the
Telemetry panel. GPU utilization and VRAM readings are shown when the relevant
vendor tool is available: `nvidia-smi`, AMD SMI (`amd-smi`), or Intel XPU-SMI
(`xpu-smi`).

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
