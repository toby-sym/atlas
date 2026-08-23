import argparse
import os
import sys
import uvicorn
from backend.main import app


def bundled_path(filename: str) -> str:
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    return os.path.join(base_path, filename)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    os.environ.setdefault("CONFIG_PATH", bundled_path("config.yaml"))
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
