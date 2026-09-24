"""Small, cross-platform system readings for the desktop status panel."""

import csv
import io
import json
import re
import shutil
import subprocess

import psutil


def _number(value) -> float | None:
    """Convert a plain value or a unit-decorated vendor value to a number."""
    if isinstance(value, dict):
        value = value.get("value")
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"-?\d+(?:\.\d+)?", str(value))
    return float(match.group()) if match else None


def _dict_rows(value):
    """Walk nested vendor JSON and yield each mapping that may describe a GPU."""
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _dict_rows(child)
    elif isinstance(value, list):
        for child in value:
            yield from _dict_rows(child)


def _gpu_result(devices, vendor: str) -> dict[str, str | float | bool | None]:
    """Normalize per-device readings; memory amounts from vendor CLIs are MiB."""
    valid = [
        device for device in devices if device[1] is not None or device[3] is not None
    ]
    if not valid:
        return {"gpu_available": False}

    memory_devices = [device for device in valid if device[3] is not None]
    utilization_devices = [device for device in valid if device[1] is not None]
    used = sum(device[2] or 0 for device in memory_devices)
    total = sum(device[3] or 0 for device in memory_devices)
    names = [device[0] for device in valid if device[0]]
    return {
        "gpu_available": True,
        "gpu_name": names[0] if len(names) == 1 else f"{vendor} ({len(valid)} GPUs)",
        "gpu_percent": round(
            sum(device[1] for device in utilization_devices) / len(utilization_devices),
            1,
        )
        if utilization_devices
        else None,
        "gpu_memory_used_gb": round(used / 1024, 1) if memory_devices else None,
        "gpu_memory_total_gb": round(total / 1024, 1) if memory_devices else None,
        "gpu_memory_percent": round(used / total * 100, 1) if total else None,
    }


def _run_gpu_command(command: str, *args: str) -> str | None:
    try:
        result = subprocess.run(
            [command, *args],
            capture_output=True,
            text=True,
            check=True,
            timeout=2,
        )
        return result.stdout
    except (OSError, subprocess.SubprocessError):
        return None


def _nvidia_snapshot() -> dict[str, str | float | bool | None]:
    command = shutil.which("nvidia-smi")
    if not command:
        return {"gpu_available": False}
    output = _run_gpu_command(
        command,
        "--query-gpu=name,utilization.gpu,memory.used,memory.total",
        "--format=csv,noheader,nounits",
    )
    if output is None:
        return {"gpu_available": False}
    try:
        devices = []
        for row in csv.reader(io.StringIO(output)):
            if len(row) != 4:
                continue
            utilization, used, total = (_number(value) for value in row[1:])
            if utilization is not None or total is not None:
                devices.append((row[0].strip(), utilization, used, total))
        return _gpu_result(devices, "NVIDIA")
    except (ValueError, csv.Error):
        return {"gpu_available": False}


def _amd_snapshot() -> dict[str, str | float | bool | None]:
    command = shutil.which("amd-smi")
    if not command:
        return {"gpu_available": False}
    output = _run_gpu_command(command, "monitor", "--json", "--gfx", "--vram-usage")
    if output is None:
        return {"gpu_available": False}
    try:
        data = json.loads(output)
        devices = []
        for row in _dict_rows(data):
            fields = {
                re.sub(r"[^a-z]", "", key.lower()): value for key, value in row.items()
            }
            utilization = _number(fields.get("gfxutil"))
            used = _number(fields.get("vramused", fields.get("gttused")))
            total = _number(fields.get("vramtotal", fields.get("gtttotal")))
            name = fields.get("name") or fields.get("gpuname")
            if utilization is not None or total is not None:
                devices.append((str(name or ""), utilization, used, total))
        return _gpu_result(devices, "AMD")
    except (ValueError, TypeError):
        return {"gpu_available": False}


def _intel_snapshot() -> dict[str, str | float | bool | None]:
    command = shutil.which("xpu-smi")
    if not command:
        return {"gpu_available": False}
    output = _run_gpu_command(
        command,
        "--query-gpu=utilization.gpu,memory.used,memory.total,name",
        "--format=csv,nounits",
    )
    if output is None:
        return {"gpu_available": False}
    try:
        rows = list(csv.DictReader(io.StringIO(output)))
        devices = []
        for row in rows:
            fields = {
                re.sub(r"[^a-z]", "", key.lower()): value
                for key, value in row.items()
                if key
            }
            utilization = _number(fields.get("utilizationgpu"))
            used = _number(fields.get("memoryused"))
            total = _number(fields.get("memorytotal"))
            if utilization is not None or total is not None:
                devices.append(
                    (str(fields.get("name") or ""), utilization, used, total)
                )
        return _gpu_result(devices, "Intel")
    except (ValueError, csv.Error):
        return {"gpu_available": False}


def _gpu_snapshot() -> dict[str, str | float | bool | None]:
    """Read available GPU metrics using the matching vendor management CLI."""
    for probe in (_nvidia_snapshot, _amd_snapshot, _intel_snapshot):
        result = probe()
        if result.get("gpu_available"):
            return result
    return {"gpu_available": False}


def snapshot() -> dict[str, str | float | int | bool | None]:
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
