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
