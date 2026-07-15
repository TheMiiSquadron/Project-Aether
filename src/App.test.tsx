import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn()
}));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

type ConversationStreamPayload = {
  streamId: string;
  event:
    | { type: "started"; model: string }
    | { type: "chunk"; content: string }
    | { type: "completed"; model: string }
    | { type: "cancelled" }
    | {
        type: "failed";
        error: {
          kind: string;
          message: string;
          action: string;
          diagnostics?: string | null;
        };
      };
};

let streamListener: ((event: { payload: ConversationStreamPayload }) => void) | undefined;

function emitStream(payload: ConversationStreamPayload) {
  act(() => {
    streamListener?.({ payload });
  });
}

function latestStreamId() {
  const request = invokeMock.mock.calls.find(([command]) => command === "start_streaming_message")?.[1] as {
    request: { streamId: string };
  };

  return request.request.streamId;
}

describe("App shell", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((command, args) => {
      if (command === "start_streaming_message") {
        const request = args as { request: { streamId: string } };
        return Promise.resolve({ streamId: request.request.streamId });
      }

      if (command === "cancel_streaming_message") {
        const request = args as { request: { streamId: string } };
        return Promise.resolve({ streamId: request.request.streamId, cancelled: true });
      }

      return Promise.resolve({});
    });
    streamListener = undefined;
    listenMock.mockReset();
    listenMock.mockImplementation((_eventName, handler) => {
      streamListener = handler as (event: { payload: ConversationStreamPayload }) => void;
      return Promise.resolve(() => undefined);
    });
  });

  it("renders Nova's empty state", () => {
    render(<App />);

    expect(screen.getAllByText("Nova")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Hello, Alex." })).toBeInTheDocument();
    expect(screen.getByText("What's on the agenda today?")).toBeInTheDocument();
  });

  it("focuses the composer on launch", () => {
    render(<App />);

    expect(screen.getByLabelText("Message Nova")).toHaveFocus();
  });

  it("submits one message and renders Nova's response", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Message Nova"), "Hello Nova{enter}");
    const streamId = latestStreamId();

    expect(invokeMock).toHaveBeenCalledWith("start_streaming_message", {
      request: {
        message: "Hello Nova",
        model: "llama3.2:latest",
        streamId
      }
    });

    emitStream({
      streamId,
      event: { type: "started", model: "llama3.2:latest" }
    });
    emitStream({
      streamId,
      event: { type: "chunk", content: "Hello, Alex. " }
    });
    emitStream({
      streamId,
      event: { type: "chunk", content: "Ready when you are." }
    });
    emitStream({
      streamId,
      event: { type: "completed", model: "llama3.2:latest" }
    });

    expect(await screen.findByText("Hello, Alex. Ready when you are.")).toBeInTheDocument();
    expect(screen.getByText("Hello Nova")).toBeInTheDocument();
    expect(screen.getByLabelText("Message Nova")).toHaveValue("");
  });

  it("guards duplicate sends while Nova is generating", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Message Nova"), "Slow request");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const streamId = latestStreamId();

    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
    expect(screen.getByLabelText("Message Nova")).toBeDisabled();

    fireEvent.submit(screen.getByLabelText("Message composer"));

    expect(invokeMock.mock.calls.filter(([command]) => command === "start_streaming_message")).toHaveLength(1);

    emitStream({
      streamId,
      event: { type: "chunk", content: "Done." }
    });
    emitStream({
      streamId,
      event: { type: "completed", model: "llama3.2:latest" }
    });
    expect(await screen.findByText("Done.")).toBeInTheDocument();
  });

  it("shows friendly provider errors", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Message Nova"), "Are you there?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const streamId = latestStreamId();

    emitStream({
      streamId,
      event: {
        type: "failed",
        error: {
          kind: "ollamaUnavailable",
          message: "Nova could not connect to Ollama.",
          action: "Make sure Ollama is running, then try again."
        }
      }
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nova could not connect to Ollama."
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Make sure Ollama is running, then try again."
    );
  });

  it("cancels an active stream and leaves the partial response", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Message Nova"), "Please continue slowly");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const streamId = latestStreamId();
    emitStream({
      streamId,
      event: { type: "chunk", content: "Partial answer" }
    });

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(invokeMock).toHaveBeenCalledWith("cancel_streaming_message", {
      request: { streamId }
    });
    expect(await screen.findByText("Partial answer")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeDisabled());
    expect(screen.getByLabelText("Message Nova")).toBeEnabled();
  });

  it("offers temporary visual theme presets", async () => {
    const user = userEvent.setup();
    render(<App />);

    const shell = screen.getByLabelText("Aether");
    const themeSelector = screen.getByLabelText("Experimental theme");

    expect(shell).toHaveAttribute("data-theme", "crimson");

    await user.selectOptions(themeSelector, "observatory");

    expect(shell).toHaveAttribute("data-theme", "observatory");
  });
});
