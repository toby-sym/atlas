"""Small, cross-platform system readings for the desktop status panel."""

import psutil


def snapshot() -> dict[str, float | int | bool]:
    """Return bounded CPU and memory readings without retaining user data."""
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
        }
    except (psutil.Error, OSError):
        return {"available": False}
