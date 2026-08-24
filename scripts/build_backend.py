import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def get_target_triple() -> str:
    """Ask rustc for this machine's host target triple, so the sidecar
    filename matches what Tauri looks for on this platform."""
    result = subprocess.run(
        ["rustc", "-Vv"], capture_output=True, text=True, check=True
    )
    for line in result.stdout.splitlines():
        if line.startswith("host:"):
            return line.split(":", 1)[1].strip()
    raise RuntimeError("Could not determine host target triple from rustc")


def main() -> None:
    target_triple = get_target_triple()
    exe_suffix = ".exe" if sys.platform == "win32" else ""
    data_sep = ";" if sys.platform == "win32" else ":"
    output = (
        ROOT / "src-tauri" / "binaries" / f"atlas-backend-{target_triple}{exe_suffix}"
    )

    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--clean",
            "--noconfirm",
            "--onefile",
            "--name",
            "atlas-backend",
            "--paths",
            str(ROOT),
            "--add-data",
            f"{ROOT / 'config.yaml'}{data_sep}.",
            str(ROOT / "backend" / "launcher.py"),
        ],
        cwd=ROOT,
        check=True,
    )

    source = ROOT / "dist" / f"atlas-backend{exe_suffix}"
    if not source.is_file():
        raise FileNotFoundError(f"PyInstaller did not create {source}")
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, output)
    print(f"Created {output}")


if __name__ == "__main__":
    main()
