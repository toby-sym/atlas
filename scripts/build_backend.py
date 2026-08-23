import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src-tauri" / "binaries" / "atlas-backend-x86_64-pc-windows-msvc.exe"


def main() -> None:
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
            f"{ROOT / 'config.yaml'};.",
            str(ROOT / "backend" / "launcher.py"),
        ],
        cwd=ROOT,
        check=True,
    )

    source = ROOT / "dist" / "atlas-backend.exe"
    if not source.is_file():
        raise FileNotFoundError(f"PyInstaller did not create {source}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, OUTPUT)
    print(f"Created {OUTPUT}")


if __name__ == "__main__":
    main()
