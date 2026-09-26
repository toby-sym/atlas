import { fireEvent, render, screen } from "@testing-library/react";
import { backendHeaders, resolveBackend } from "../backendClient";
import MemoryLibrary from "./MemoryLibrary";

jest.mock("../backendClient", () => ({
  backendHeaders: jest.fn(() => ({})),
  resolveBackend: jest.fn(),
}));

const originalFetch = global.fetch;
const conversationId = "660a15e9-8cb2-46d0-b75e-36b6eaa08601";

beforeEach(() => {
  resolveBackend.mockResolvedValue({ baseUrl: "http://atlas.test", token: "" });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      memories: [
        {
          id: 1,
          key: "preferred format",
          value: "Plain text",
          category: "writing",
          project_id: "garden-id",
          source: "chat",
          source_conversation_id: conversationId,
          updated_at: "2026-09-25T12:00:00Z",
        },
      ],
    }),
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

test("opens the conversation that created a saved memory", async () => {
  const onOpenConversation = jest.fn();
  render(
    <MemoryLibrary
      enabled
      connection="online"
      projectId="garden-id"
      projectName="Garden"
      onOpenConversation={onOpenConversation}
    />,
  );

  fireEvent.click(await screen.findByRole("button", { name: "Open conversation" }));

  expect(screen.getByText("Saved from a conversation")).toBeInTheDocument();
  expect(onOpenConversation).toHaveBeenCalledWith(conversationId);
  expect(backendHeaders).toHaveBeenCalled();
});
