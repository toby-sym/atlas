"""Tests for the optional vendor GPU telemetry probes."""

import json
from types import SimpleNamespace

import pytest

from backend import telemetry


VENDOR_OUTPUTS = [
    (
        "nvidia-smi",
        "RTX A, 20, 1024, 4096\nRTX B, 60, 3072, 8192\n",
        "NVIDIA",
    ),
    (
        "amd-smi",
        json.dumps(
            [
                {
                    "gpu": 0,
                    "gpu_name": "Radeon A",
                    "gfx_util": {"value": 20, "unit": "%"},
                    "vram_used": {"value": 1024, "unit": "MB"},
                    "vram_total": {"value": 4096, "unit": "MB"},
                },
                {
                    "gpu": 1,
                    "gpu_name": "Radeon B",
                    "gfx_util": {"value": 60, "unit": "%"},
                    "vram_used": {"value": 3072, "unit": "MB"},
                    "vram_total": {"value": 8192, "unit": "MB"},
                },
            ]
        ),
        "AMD",
    ),
    (
        "xpu-smi",
        "utilization.gpu,memory.used,memory.total,name\n"
        '20,1024,4096,"Intel Arc A"\n'
        '60,3072,8192,"Intel Arc B"\n',
        "Intel",
    ),
]


@pytest.mark.parametrize(("tool", "output", "vendor"), VENDOR_OUTPUTS)
def test_vendor_probes_normalize_multiple_gpus(monkeypatch, tool, output, vendor):
    monkeypatch.setattr(
        telemetry.shutil,
        "which",
        lambda name: f"/tools/{name}" if name == tool else None,
    )
    monkeypatch.setattr(
        telemetry.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(stdout=output),
    )

    result = telemetry._gpu_snapshot()

    assert result == {
        "gpu_available": True,
        "gpu_name": f"{vendor} (2 GPUs)",
        "gpu_percent": 40.0,
        "gpu_memory_used_gb": 4.0,
        "gpu_memory_total_gb": 12.0,
        "gpu_memory_percent": 33.3,
    }


@pytest.mark.parametrize(
    ("tool", "output"),
    [
        ("nvidia-smi", "malformed output\n"),
        ("amd-smi", "{not valid JSON"),
        ("xpu-smi", "unrecognized,headers\nnot,a,gpu,row\n"),
    ],
)
def test_malformed_vendor_output_is_unavailable(monkeypatch, tool, output):
    monkeypatch.setattr(
        telemetry.shutil,
        "which",
        lambda name: f"/tools/{name}" if name == tool else None,
    )
    monkeypatch.setattr(
        telemetry.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(stdout=output),
    )

    assert telemetry._gpu_snapshot() == {"gpu_available": False}


def test_gpu_probe_is_unavailable_when_no_vendor_tool_is_installed(monkeypatch):
    monkeypatch.setattr(telemetry.shutil, "which", lambda _name: None)
    monkeypatch.setattr(
        telemetry.subprocess,
        "run",
        lambda *_args, **_kwargs: pytest.fail("No command should be started"),
    )

    assert telemetry._gpu_snapshot() == {"gpu_available": False}


@pytest.mark.parametrize(
    ("tool", "output"),
    [
        ("nvidia-smi", "RTX A, N/A, 128, 1024\n"),
        (
            "amd-smi",
            json.dumps(
                [
                    {
                        "gpu": 0,
                        "gfx_util": "N/A",
                        "vram_used": {"value": 128, "unit": "MB"},
                        "vram_total": {"value": 1024, "unit": "MB"},
                    }
                ]
            ),
        ),
        (
            "xpu-smi",
            "utilization.gpu,memory.used,memory.total,name\n"
            'N/A,128,1024,"Intel Arc"\n',
        ),
    ],
)
def test_vendor_probe_preserves_available_partial_memory_readings(
    monkeypatch, tool, output
):
    monkeypatch.setattr(
        telemetry.shutil,
        "which",
        lambda name: f"/tools/{name}" if name == tool else None,
    )
    monkeypatch.setattr(
        telemetry.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(stdout=output),
    )

    result = telemetry._gpu_snapshot()

    assert result["gpu_available"] is True
    assert result["gpu_percent"] is None
    assert result["gpu_memory_used_gb"] == 0.1
    assert result["gpu_memory_total_gb"] == 1.0
    assert result["gpu_memory_percent"] == 12.5
