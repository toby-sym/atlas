import { invoke } from "@tauri-apps/api/core";

export async function resolveBackend() {
  if (window.__TAURI_INTERNALS__) {
    const connection = await invoke("get_backend_connection");
    return { baseUrl: connection.base_url, token: connection.token };
  }
  return {
    baseUrl: process.env.REACT_APP_API_URL || "http://localhost:8000",
    token: "",
  };
}

export function backendHeaders(token, headers = {}) {
  return token ? { ...headers, "X-Atlas-Token": token } : headers;
}

export async function readChatEvents(response, onEvent) {
  if (!response.body?.getReader) {
    const data = await response.json();
    if (!data.message || typeof data.message.content !== "string")
      throw new Error("Atlas returned an invalid chat response.");
    onEvent({ type: "done", message: data.message });
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of frame.split("\n")) {
          if (line.startsWith("data:")) onEvent(JSON.parse(line.slice(5).trim()));
        }
      }
    }
    if (buffer.trim()) throw new Error("Atlas returned an incomplete response stream.");
  } finally {
    reader.releaseLock();
  }
}
