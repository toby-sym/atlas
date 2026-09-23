"""Smoke-test a frozen Atlas backend against a local fake Ollama endpoint."""

import argparse
from io import BytesIO
import json
import os
import signal
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import httpx
from docx import Document


class FakeOllamaServer(ThreadingHTTPServer):
    """Fake Ollama server retaining the last chat request for assertions."""

    last_messages: list[dict]


class FakeOllamaHandler(BaseHTTPRequestHandler):  # pylint: disable=invalid-name
    def do_GET(self):  # pylint: disable=invalid-name
        payload = {"models": [{"name": "qwen3:4b"}]}
        self._send(200, payload)

    def do_POST(self):  # pylint: disable=invalid-name
        length = int(self.headers.get("Content-Length", "0"))
        request = json.loads(self.rfile.read(length))
        self.server.last_messages = request.get("messages", [])
        self._send(
            200,
            {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "Smoke test completed.",
                        }
                    }
                ]
            },
        )

    def _send(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def _exercise_backend(process, port: int, token: str, ollama: FakeOllamaServer) -> None:
    with httpx.Client(
        base_url=f"http://127.0.0.1:{port}",
        headers={"X-Atlas-Token": token},
        timeout=2.0,
    ) as client:
        deadline = time.time() + 20
        while time.time() < deadline:
            try:
                response = client.get("/health")
                if response.status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            if process.poll() is not None:
                raise RuntimeError(f"Backend exited with code {process.returncode}")
            time.sleep(0.2)
        else:
            raise TimeoutError("Backend did not become ready")

        status = client.get("/status")
        assert status.json()["model"]["state"] == "ready", status.text
        document = Document()
        document.add_paragraph("Beta attachment smoke marker")
        buffer = BytesIO()
        document.save(buffer)
        uploaded = client.post(
            "/files", files={"file": ("smoke.docx", buffer.getvalue())}
        )
        assert uploaded.status_code == 200, uploaded.text

        result = client.post(
            "/chat",
            json={
                "messages": [
                    {"role": "user", "content": "Summarize the attached file."}
                ],
                "attachments": ["smoke.docx"],
                "context": {"research": False, "memory": False},
            },
        )
        assert result.status_code == 200, result.text
        assert result.json()["message"]["content"] == "Smoke test completed."
        assert "Beta attachment smoke marker" in json.dumps(ollama.last_messages)
        assert client.get("/status").status_code == 200


def _stop_backend(process) -> None:
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        os.killpg(process.pid, signal.SIGTERM)  # pylint: disable=no-member
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name != "nt":
            os.killpg(process.pid, signal.SIGKILL)  # pylint: disable=no-member
        process.wait(timeout=5)
    if process.poll() is None:
        raise RuntimeError("Backend process did not stop cleanly")


def _run_backend(backend: Path, ollama: FakeOllamaServer) -> None:
    api_port = free_port()
    token = "atlas-smoke-token"
    with tempfile.TemporaryDirectory(prefix="atlas-backend-smoke-") as temp_dir:
        temp_path = Path(temp_dir)
        env = os.environ.copy()
        env.update(
            {
                "ATLAS_API_TOKEN": token,
                "ATLAS_OLLAMA_URL": f"http://127.0.0.1:{ollama.server_address[1]}/v1/chat/completions",
                "ATLAS_WORKSPACE": str(temp_path / "workspace"),
                "ATLAS_MEMORY_DB": str(temp_path / "memory.db"),
            }
        )
        with subprocess.Popen(
            [str(backend), "--host", "127.0.0.1", "--port", str(api_port)],
            cwd=backend.parent,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
            start_new_session=os.name != "nt",
        ) as process:
            try:
                _exercise_backend(process, api_port, token, ollama)
            finally:
                _stop_backend(process)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("backend", type=Path)
    backend = parser.parse_args().backend.resolve()
    if not backend.is_file():
        raise SystemExit(f"Backend executable not found: {backend}")

    with FakeOllamaServer(("127.0.0.1", 0), FakeOllamaHandler) as ollama:
        server_thread = threading.Thread(target=ollama.serve_forever, daemon=True)
        server_thread.start()
        try:
            _run_backend(backend, ollama)
        finally:
            ollama.shutdown()
            server_thread.join(timeout=5)
    print(
        "Frozen backend status, authentication, DOCX upload, attachment reading, and chat passed."
    )


if __name__ == "__main__":
    main()
