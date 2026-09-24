"""Small, cross-platform system readings for the desktop status panel."""

import csv
import io
import shutil
import subprocess

import psutil


def _gpu_snapshot() -> dict[str, str | float | bool]:
    """Read NVIDIA GPU usage and VRAM when the NVIDIA driver CLI is available."""
    command = shutil.which("nvidia-smi")
    if not command:
        return {"gpu_available": False}

    try:
        result = subprocess.run(
            [
                command,
                "--query-gpu=name,utilization.gpu,memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=2,
        )
        rows = list(csv.reader(io.StringIO(result.stdout)))
        devices = [row for row in rows if len(row) == 4]
        parsed = [
            (row[0].strip(), float(row[1]), float(row[2]), float(row[3]))
            for row in devices
        ]
        if not parsed:
            return {"gpu_available": False}

        memory_used = sum(device[2] for device in parsed)
        memory_total = sum(device[3] for device in parsed)
        return {
            "gpu_available": True,
            "gpu_name": parsed[0][0] if len(parsed) == 1 else f"{len(parsed)} GPUs",
            "gpu_percent": round(sum(device[1] for device in parsed) / len(parsed), 1),
            "gpu_memory_used_gb": round(memory_used / 1024, 1),
            "gpu_memory_total_gb": round(memory_total / 1024, 1),
            "gpu_memory_percent": round(memory_used / memory_total * 100, 1)
            if memory_total
            else 0.0,
        }
    except (OSError, subprocess.SubprocessError, ValueError, csv.Error):
        return {"gpu_available": False}


def snapshot() -> dict[str, str | float | int | bool]:
    """Return bounded CPU, memory, and available GPU readings."""
    try:
        memory = psutil.virtual_memory()
        process = psutil.Process()
        return {
            "available": True,
            "cpu_percent": round(psutil.cpu_percent(interval=0.05), 1),
            "memory_percent": round(memory.percent, 1),
            "memory_used_gb": round((memory.total - memory.available) / (1024**3), 1),
            "memory_total_gb": round(memory.total / (1024**3), 1),
            "backend_rss_mb": round(process.memory_info().rss / (1024**2), 1),
            **_gpu_snapshot(),
        }
    except (psutil.Error, OSError):
        return {"available": False}
