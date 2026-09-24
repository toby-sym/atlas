import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TextDecoder } from "util";
import App from "./App";

global.TextDecoder = TextDecoder;

const readyStatus = {
  backend: "ready",
  model: { state: "ready", name: "qwen3:4b" },
  features: { web_research: true, memory: true, files: true },
};

beforeEach(() => {
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => url.endsWith("/status")
      ? readyStatus
      : url.endsWith("/conversations")
        ? { conversations: [] }
        : url.endsWith("/chat/stream")
          ? { message: { role: "assistant", content: "Done." } }
          : { saved: true },
  }));
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function connectedApp() {
  render(<App />);
  await screen.findByText("Backend connected");
  await screen.findByText("Model ready: qwen3:4b");
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.endsWith("/conversations"))).toBe(true));
}

test("suggestions populate and focus the dock without sending a request", async () => {
  await connectedApp();
  fireEvent.click(screen.getByRole("button", { name: /follow your curiosity/i }));
  expect(screen.getByRole("textbox", { name: "Message Atlas" }).value).toContain("Research the latest");
  expect(screen.getByRole("textbox", { name: "Message Atlas" })).toHaveFocus();
  expect(fetch.mock.calls.filter(([url]) => url.endsWith("/chat/stream"))).toHaveLength(0);
});

test("sends original text, typed preferences, and selected attachment", async () => {
  await connectedApp();
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ message: { role: "assistant", content: "Here is your **plan**." } }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Web research" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Message Atlas" }), { target: { value: "Plan my project" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByText("plan", { selector: "strong" });
  const request = JSON.parse(fetch.mock.calls.find(([url]) => url.endsWith("/chat/stream"))[1].body);
  expect(request).toEqual({
    messages: [{ role: "user", content: "Plan my project" }],
    context: { research: true, memory: false },
    attachments: [],
  });
});

test("new session aborts a pending request and ignores its late response", async () => {
  await connectedApp();
  let resolveRequest;
  fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
  fireEvent.change(screen.getByRole("textbox", { name: "Message Atlas" }), { target: { value: "A pending question" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  const chatCall = fetch.mock.calls.find(([url]) => url.endsWith("/chat/stream"));
  expect(chatCall[1].signal.aborted).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "New session" }));
  expect(chatCall[1].signal.aborted).toBe(true);
  await act(async () => resolveRequest({ ok: true, json: async () => ({ message: { role: "assistant", content: "Stale response" } }) }));
  expect(screen.queryByText("Stale response")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Big ideas/i })).toBeInTheDocument();
});

test("shows a model missing state while leaving chat usable", async () => {
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ ...readyStatus, model: { state: "missing", name: "qwen3:4b" } }),
  });
  render(<App />);
  await screen.findByText("Backend connected");
  expect(screen.getByText("Run ollama pull qwen3:4b")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Message Atlas" })).toBeEnabled();
});

test("retries status after an unavailable backend", async () => {
  jest.useFakeTimers();
  fetch.mockRejectedValueOnce(new Error("offline"));
  fetch.mockResolvedValueOnce({ ok: true, json: async () => readyStatus });
  render(<App />);
  await act(async () => {});
  expect(screen.getByText("Backend unavailable")).toBeInTheDocument();
  await act(async () => {
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
  });
  expect(screen.getByText("Model ready: qwen3:4b")).toBeInTheDocument();
});

test("shows upload errors without disabling the dock", async () => {
  await connectedApp();
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ detail: "Supported files are text, PDF, and DOCX." }) });
  fireEvent.change(screen.getByLabelText("Choose a file"), {
    target: { files: [new File(["data"], "image.png", { type: "image/png" })] },
  });
  expect(await screen.findByRole("status")).toHaveTextContent("Supported files are text, PDF, and DOCX.");
  expect(screen.getByRole("textbox", { name: "Message Atlas" })).toBeEnabled();
});

test("successful upload selects the file and sends it as an attachment", async () => {
  await connectedApp();
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ path: "notes.txt" }) });
  fireEvent.change(screen.getByLabelText("Choose a file"), {
    target: { files: [new File(["ideas"], "notes.txt", { type: "text/plain" })] },
  });
  await waitFor(() => expect(screen.getByText("Added notes.txt to your workspace.")).toBeInTheDocument());
  expect(screen.getByText("Attached: notes.txt")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.endsWith("/chat/stream"))).toBe(true));
  const request = JSON.parse(fetch.mock.calls.find(([url]) => url.endsWith("/chat/stream"))[1].body);
  expect(request.attachments).toEqual(["notes.txt"]);
  expect(request.messages.at(-1).content).toContain("Summarize the attached file");
  await waitFor(() => expect(screen.queryByText("Attached: notes.txt")).not.toBeInTheDocument());
});

test("preview remains simulated and never calls the chat API", async () => {
  jest.useFakeTimers();
  render(<App />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: /Watch an idea come to life/i }));
  expect(screen.getByText("SIMULATED ACTIVITY")).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1700));
  fireEvent.click(screen.getByRole("button", { name: /Preparing a starting point/i }));
  expect(screen.getByText("Preview only: no files written.")).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1800));
  act(() => jest.advanceTimersByTime(2500));
  expect(screen.getByText("A calmer workspace starts with a little structure.", { exact: false })).toBeInTheDocument();
  expect(fetch.mock.calls.filter(([url]) => url.endsWith("/chat/stream"))).toHaveLength(0);
});

test("shows the active beta build version in the header", async () => {
  await connectedApp();
  expect(screen.getByText(process.env.REACT_APP_BUILD_VERSION || "0.4.1-dev")).toBeInTheDocument();
});

test("shows live CPU, memory, GPU, and VRAM readings from backend status", async () => {
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      ...readyStatus,
      telemetry: {
        available: true,
        cpu_percent: 24.5,
        memory_used_gb: 8.2,
        memory_total_gb: 16,
        memory_percent: 51.2,
        backend_rss_mb: 120.1,
        gpu_available: true,
        gpu_name: "Intel Arc Pro B60",
        gpu_percent: 72.3,
        gpu_memory_used_gb: 4.6,
        gpu_memory_total_gb: 8,
        gpu_memory_percent: 57.5,
      },
    }),
  });
  render(<App />);
  await screen.findByText("Backend connected");
  fireEvent.click(screen.getByRole("button", { name: "Open system status" }));
  expect(await screen.findByText("24.5%")).toBeInTheDocument();
  expect(screen.getByText("8.2 / 16 GB")).toBeInTheDocument();
  expect(screen.getByText("120.1 MB")).toBeInTheDocument();
  expect(screen.getByText("GPU utilization: Intel Arc Pro B60")).toBeInTheDocument();
  expect(screen.getByText("72.3%")).toBeInTheDocument();
  expect(screen.getByText("4.6 / 8 GB")).toBeInTheDocument();
});

test("streams a partial answer before the final response arrives", async () => {
  let finishStream;
  const reader = {
    read: jest.fn()
      .mockResolvedValueOnce({ done: false, value: Uint8Array.from(Buffer.from('data: {"type":"token","text":"Hello"}\n\n')) })
      .mockImplementationOnce(() => new Promise((resolve) => { finishStream = resolve; }))
      .mockResolvedValue({ done: true }),
    releaseLock: jest.fn(),
  };
  fetch.mockImplementation(async (url) => ({
    ok: true,
    body: url.endsWith("/chat/stream") ? { getReader: () => reader } : undefined,
    json: async () => url.endsWith("/status") ? readyStatus : { conversations: [] },
  }));
  await connectedApp();
  fireEvent.change(screen.getByRole("textbox", { name: "Message Atlas" }), { target: { value: "Hello" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect((await screen.findByText("COMPOSING")).closest("article")).toHaveTextContent("Hello");
  await act(async () => finishStream({
    done: false,
    value: Uint8Array.from(Buffer.from('data: {"type":"token","text":" Atlas"}\n\ndata: {"type":"done","message":{"role":"assistant","content":"Hello Atlas"}}\n\n')),
  }));
  expect(await screen.findByText("Hello Atlas")).toBeInTheDocument();
});

test("opens and deletes a saved conversation", async () => {
  const id = "6e090202-8a40-4ec3-a184-3d783f268bc9";
  fetch.mockImplementation(async (url, options = {}) => ({
    ok: true,
    json: async () => {
      if (url.endsWith("/status")) return readyStatus;
      if (url.endsWith("/conversations")) return { conversations: [{ id, title: "Old chat" }] };
      if (url.endsWith(`/${id}`) && options.method !== "DELETE" && options.method !== "PUT")
        return { messages: [{ role: "user", content: "Earlier question" }, { role: "assistant", content: "Earlier answer" }] };
      return { saved: true };
    },
  }));
  await connectedApp();
  fireEvent.click(await screen.findByRole("button", { name: "Old chat" }));
  expect(await screen.findByText("Earlier answer")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New session" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete Old chat" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Old chat" })).not.toBeInTheDocument());
  expect(fetch.mock.calls.some(([url, options]) => url.endsWith(`/${id}`) && options?.method === "DELETE")).toBe(true);
});
