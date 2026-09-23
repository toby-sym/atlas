import { TextDecoder } from "util";
import { readChatEvents } from "./backendClient";

global.TextDecoder = TextDecoder;

test("decodes SSE events split across network chunks", async () => {
  const chunks = [
    'data: {"type":"token","text":"Hel',
    'lo"}\n\ndata: {"type":"done","message":{"role":"assistant","content":"Hello"}}\n\n',
  ];
  const reader = {
    read: jest.fn(async () => chunks.length
      ? { done: false, value: Uint8Array.from(Buffer.from(chunks.shift())) }
      : { done: true }),
    releaseLock: jest.fn(),
  };
  const events = [];
  await readChatEvents({ body: { getReader: () => reader } }, (event) => events.push(event));
  expect(events.map((event) => event.type)).toEqual(["token", "done"]);
  expect(events[0].text).toBe("Hello");
  expect(reader.releaseLock).toHaveBeenCalled();
});

test("decodes CRLF boundaries split across network chunks", async () => {
  const chunks = [
    'data: {"type":"token","text":"Hello"}\r',
    '\n\r',
    '\n',
  ];
  const reader = {
    read: jest.fn(async () => chunks.length
      ? { done: false, value: Uint8Array.from(Buffer.from(chunks.shift())) }
      : { done: true }),
    releaseLock: jest.fn(),
  };
  const events = [];
  await readChatEvents({ body: { getReader: () => reader } }, (event) => events.push(event));
  expect(events).toEqual([{ type: "token", text: "Hello" }]);
});
