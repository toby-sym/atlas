import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "./App";

beforeEach(() => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("suggestions populate and focus the dock without sending a request", async () => {
  render(<App />);
  await screen.findByText("System connected");
  fireEvent.click(
    screen.getByRole("button", { name: /follow your curiosity/i }),
  );
  expect(screen.getByRole("textbox", { name: "Message Atlas" }).value).toContain(
    "Research the latest",
  );
  expect(screen.getByRole("textbox", { name: "Message Atlas" })).toHaveFocus();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("sends selected context to the backend and renders the response", async () => {
  render(<App />);
  await screen.findByText("System connected");
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      message: { role: "assistant", content: "Here is your **plan**." },
    }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Web research" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Message Atlas" }), {
    target: { value: "Plan my project" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByText("plan", { selector: "strong" });
  const request = JSON.parse(fetch.mock.calls[1][1].body);
  expect(request.messages).toEqual([
    {
      role: "user",
      content: "Plan my project\n\nUse web search and cite sources.",
    },
  ]);
  expect(screen.getByRole("textbox", { name: "Message Atlas" })).toBeEnabled();
});

test("new session aborts a pending request and ignores its late response", async () => {
  render(<App />);
  await screen.findByText("System connected");
  let resolveRequest;
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Message Atlas" }), {
    target: { value: "A pending question" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  const signal = fetch.mock.calls[1][1].signal;
  fireEvent.click(screen.getByRole("button", { name: "New session" }));
  expect(signal.aborted).toBe(true);
  await act(async () =>
    resolveRequest({
      ok: true,
      json: async () => ({
        message: { role: "assistant", content: "Stale response" },
      }),
    }),
  );
  expect(screen.queryByText("Stale response")).not.toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: /Big ideas/i }),
  ).toBeInTheDocument();
});

test("shows an actionable backend error and restores the dock", async () => {
  render(<App />);
  await screen.findByText("System connected");
  fetch.mockRejectedValueOnce(new Error("Failed to fetch"));
  fireEvent.change(screen.getByRole("textbox", { name: "Message Atlas" }), {
    target: { value: "Hello" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Start the local backend on port 8000",
  );
  expect(screen.getByRole("textbox", { name: "Message Atlas" })).toBeEnabled();
});

test("preview transitions through execution and composition without calling chat", async () => {
  jest.useFakeTimers();
  render(<App />);
  await act(async () => {});
  fireEvent.click(
    screen.getByRole("button", { name: /Watch an idea come to life/i }),
  );
  expect(screen.getByText("SIMULATED ACTIVITY")).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1700));
  fireEvent.click(
    screen.getByRole("button", { name: /Preparing a starting point/i }),
  );
  expect(
    screen.getByText("Preview only: no files written."),
  ).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1800));
  act(() => jest.advanceTimersByTime(2500));
  expect(
    screen.getByText("A calmer workspace starts with a little structure.", {
      exact: false,
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Diff" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Diff" }));
  expect(
    screen.getByText("New snippet · compared with an empty file"),
  ).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("successful upload appears in the session workspace", async () => {
  render(<App />);
  await screen.findByText("System connected");
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ path: "notes.txt" }),
  });
  fireEvent.change(screen.getByLabelText("Choose a file"), {
    target: {
      files: [new File(["ideas"], "notes.txt", { type: "text/plain" })],
    },
  });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Added notes.txt"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Files & context" }));
  expect(screen.getByRole("button", { name: "notes.txt" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "notes.txt" }));
  expect(screen.getByRole("textbox", { name: "Message Atlas" })).toHaveValue(
    "Read the file notes.txt and summarize its contents.",
  );
});
