import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, buildConversationExportMarkdown } from "./App";
import { markdownShowcase } from "./MarkdownShowcase";
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

function readBlobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });
}

async function renderApp() {
  const result = render(<App />);

  await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("load_settings"));
  await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_models"));

  return result;
}

describe("App shell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invokeMock.mockReset();
    invokeMock.mockImplementation((command, args) => {
      if (command === "load_settings") {
        return Promise.resolve({
          theme: "crimson",
          selectedModel: "llama3.2:latest",
          fontSize: 16,
          composerStyle: "subtle",
          showContextCounter: false,
          developerMode: false
        });
      }

      if (command === "save_settings") {
        return Promise.resolve(args);
      }

      if (command === "list_models") {
        return Promise.resolve([
          { name: "llama3.2:latest", provider: "Ollama" },
          { name: "qwen3:8b", provider: "Ollama" }
        ]);
      }

      if (command === "load_active_conversation") {
        return Promise.resolve(null);
      }

      if (command === "list_conversations") {
        return Promise.resolve([]);
      }

      if (command === "load_conversation") {
        return Promise.resolve(null);
      }

      if (command === "save_active_conversation") {
        return Promise.resolve(undefined);
      }

      if (command === "save_conversation") {
        return Promise.resolve(undefined);
      }

      if (command === "clear_active_conversation") {
        return Promise.resolve(undefined);
      }

      if (command === "delete_conversation") {
        return Promise.resolve(undefined);
      }

      if (command === "rename_conversation") {
        return Promise.resolve(undefined);
      }

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
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });


  it("loads the saved active conversation on startup", async () => {
    invokeMock.mockImplementation((command, args) => {
      if (command === "load_settings") {
        return Promise.resolve({
          theme: "crimson",
          selectedModel: "llama3.2:latest",
          fontSize: 16,
          composerStyle: "subtle",
          showContextCounter: false,
          developerMode: false
        });
      }
      if (command === "list_models") {
        return Promise.resolve([{ name: "llama3.2:latest", provider: "Ollama" }]);
      }
      if (command === "list_conversations") {
        return Promise.resolve([
          {
            id: "saved-chat",
            title: "Saved chat",
            createdAt: "2026-07-15T02:00:00Z",
            updatedAt: "2026-07-15T02:05:00Z",
            activeModel: "llama3.2:latest",
            messageCount: 2
          }
        ]);
      }
      if (command === "load_conversation") {
        return Promise.resolve({
          id: "saved-chat",
          title: "Saved chat",
          createdAt: "2026-07-15T02:00:00Z",
          updatedAt: "2026-07-15T02:05:00Z",
          activeModel: "llama3.2:latest",
          metadataJson: "{}",
          messages: [
            {
              id: "message-1",
              conversationId: "saved-chat",
              role: "user",
              content: "Remember this?",
              createdAt: "2026-07-15T02:00:00Z",
              status: "complete",
              position: 0,
              metadataJson: "{}"
            },
            {
              id: "message-2",
              conversationId: "saved-chat",
              role: "assistant",
              content: "Yes, this loaded from storage.",
              createdAt: "2026-07-15T02:01:00Z",
              status: "complete",
              position: 1,
              metadataJson: "{}"
            }
          ]
        });
      }
      if (command === "save_settings" || command === "save_conversation") {
        return Promise.resolve(args);
      }
      if (command === "rename_conversation") {
        return Promise.resolve(undefined);
      }
      return Promise.resolve({});
    });

    await renderApp();

    expect(await screen.findByText("Remember this?")).toBeInTheDocument();
    expect(screen.getByText("Yes, this loaded from storage.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hello, Alex." })).not.toBeInTheDocument();
  });

  it("lists saved conversations and switches between them", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((command, args) => {
      if (command === "load_settings") {
        return Promise.resolve({
          theme: "crimson",
          selectedModel: "llama3.2:latest",
          fontSize: 16,
          composerStyle: "subtle",
          showContextCounter: false,
          developerMode: false
        });
      }
      if (command === "list_models") {
        return Promise.resolve([{ name: "llama3.2:latest", provider: "Ollama" }]);
      }
      if (command === "list_conversations") {
        return Promise.resolve([
          {
            id: "conversation-1",
            title: "Portal roadmap",
            createdAt: "2026-07-15T02:00:00Z",
            updatedAt: "2026-07-15T02:05:00Z",
            activeModel: "llama3.2:latest",
            messageCount: 2
          },
          {
            id: "conversation-2",
            title: "Aether ideas",
            createdAt: "2026-07-15T01:00:00Z",
            updatedAt: "2026-07-15T01:05:00Z",
            activeModel: "llama3.2:latest",
            messageCount: 2
          }
        ]);
      }
      if (command === "load_conversation") {
        const { id } = args as { id: string };
        return Promise.resolve({
          id,
          title: id === "conversation-1" ? "Portal roadmap" : "Aether ideas",
          createdAt: "2026-07-15T02:00:00Z",
          updatedAt: "2026-07-15T02:05:00Z",
          activeModel: "llama3.2:latest",
          metadataJson: "{}",
          messages: [
            {
              id: `${id}-message-1`,
              conversationId: id,
              role: "user",
              content: id === "conversation-1" ? "Open Portal notes" : "Open Aether notes",
              createdAt: "2026-07-15T02:00:00Z",
              status: "complete",
              position: 0,
              metadataJson: "{}"
            },
            {
              id: `${id}-message-2`,
              conversationId: id,
              role: "assistant",
              content: id === "conversation-1" ? "Portal is loaded." : "Aether is loaded.",
              createdAt: "2026-07-15T02:01:00Z",
              status: "complete",
              position: 1,
              metadataJson: "{}"
            }
          ]
        });
      }
      if (command === "save_settings" || command === "save_conversation") {
        return Promise.resolve(args);
      }
      return Promise.resolve({});
    });

    await renderApp();

    expect(await screen.findByText("Portal roadmap")).toBeInTheDocument();
    expect(screen.getByText("Aether ideas")).toBeInTheDocument();
    expect(await screen.findByText("Portal is loaded.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open conversation Aether ideas" }));

    expect(await screen.findByText("Aether is loaded.")).toBeInTheDocument();
    expect(screen.queryByText("Portal is loaded.")).not.toBeInTheDocument();
  });

  it("renames a saved conversation from the sidebar", async () => {
    const user = userEvent.setup();
    let storedTitle = "Original title";
    invokeMock.mockImplementation((command, args) => {
      if (command === "load_settings") {
        return Promise.resolve({
          theme: "crimson",
          selectedModel: "llama3.2:latest",
          fontSize: 16,
          composerStyle: "subtle",
          showContextCounter: false,
          developerMode: false
        });
      }
      if (command === "list_models") {
        return Promise.resolve([{ name: "llama3.2:latest", provider: "Ollama" }]);
      }
      if (command === "list_conversations") {
        return Promise.resolve([
          {
            id: "conversation-1",
            title: storedTitle,
            createdAt: "2026-07-15T02:00:00Z",
            updatedAt: "2026-07-15T02:05:00Z",
            activeModel: "llama3.2:latest",
            messageCount: 2
          }
        ]);
      }
      if (command === "load_conversation") {
        return Promise.resolve({
          id: "conversation-1",
          title: storedTitle,
          createdAt: "2026-07-15T02:00:00Z",
          updatedAt: "2026-07-15T02:05:00Z",
          activeModel: "llama3.2:latest",
          metadataJson: "{}",
          messages: [
            {
              id: "message-1",
              conversationId: "conversation-1",
              role: "user",
              content: "Original message",
              createdAt: "2026-07-15T02:00:00Z",
              status: "complete",
              position: 0,
              metadataJson: "{}"
            }
          ]
        });
      }
      if (command === "rename_conversation") {
        const payload = args as { title: string };
        storedTitle = payload.title;
        return Promise.resolve(undefined);
      }
      if (command === "save_settings" || command === "save_conversation") {
        return Promise.resolve(args);
      }
      return Promise.resolve({});
    });

    await renderApp();

    await user.click(await screen.findByRole("button", { name: "Rename conversation Original title" }));
    const titleInput = screen.getByLabelText("Conversation title");
    await user.clear(titleInput);
    await user.type(titleInput, "Renamed title");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(invokeMock).toHaveBeenCalledWith("rename_conversation", {
      id: "conversation-1",
      title: "Renamed title",
      updatedAt: expect.any(String)
    });
    expect(await screen.findByText("Renamed title")).toBeInTheDocument();
  });

  it("saves the active conversation after Nova responds", async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.type(screen.getByLabelText("Message Nova"), "Persist this{enter}");
    const streamId = latestStreamId();
    emitStream({ streamId, event: { type: "chunk", content: "Saved response." } });
    emitStream({ streamId, event: { type: "completed", model: "llama3.2:latest" } });

    await waitFor(() => {
      const saveCall = invokeMock.mock.calls.find(([command]) => command === "save_conversation");
      expect(saveCall).toBeTruthy();
      const payload = saveCall?.[1] as { conversation: { title: string; messages: Array<{ content: string; status: string }> } };
      expect(payload.conversation.title).toBe("Persist this");
      expect(payload.conversation.messages.map((message) => message.content)).toEqual([
        "Persist this",
        "Saved response."
      ]);
      expect(payload.conversation.messages[1].status).toBe("complete");
    });
  });


  it("opens the conversation actions menu from the header", async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole("button", { name: "Conversation actions" }));

    expect(screen.getByRole("menu", { name: "Conversation actions" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Export as Markdown" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Clear current conversation" })).toBeDisabled();
  });

  it("exports the current conversation as Markdown", async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.fn((_: Blob) => "blob:aether-export");
    const revokeObjectUrl = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl
    });

    await renderApp();

    await user.type(screen.getByLabelText("Message Nova"), "Export this{enter}");
    const streamId = latestStreamId();
    emitStream({ streamId, event: { type: "chunk", content: "Exported response." } });
    emitStream({ streamId, event: { type: "completed", model: "llama3.2:latest" } });

    await screen.findByText("Exported response.");
    await user.click(screen.getByRole("button", { name: "Conversation actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Export as Markdown" }));

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const blob = createObjectUrl.mock.calls[0][0];
    const exportedText = await readBlobText(blob);
    expect(exportedText).toContain("# Export this");
    expect(exportedText).toContain("## You - ");
    expect(exportedText).toContain("Exported response.");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("builds a readable Markdown export document", () => {
    const exported = buildConversationExportMarkdown(
      [
        {
          id: "message-1",
          role: "user",
          content: "Please review this.",
          status: "complete",
          attachmentName: "notes.md",
          createdAt: "2026-07-20T05:00:00.000Z"
        },
        {
          id: "message-2",
          role: "assistant",
          content: "Reviewed.",
          status: "cancelled",
          createdAt: "2026-07-20T05:01:00.000Z"
        }
      ],
      "Review notes",
      "llama3.2:latest"
    );

    expect(exported).toContain("# Review notes");
    expect(exported).toContain("Model: llama3.2:latest");
    expect(exported).toContain("Attachment: notes.md");
    expect(exported).toContain("Status: cancelled");
    expect(exported).toContain("---");
  });

  it("renders Nova's empty state", async () => {
    await renderApp();

    expect(screen.getAllByText("Nova")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Hello, Alex." })).toBeInTheDocument();
    expect(screen.getByText("What's on the agenda today?")).toBeInTheDocument();
  });

  it("focuses the composer on launch", async () => {
    await renderApp();

    expect(screen.getByLabelText("Message Nova")).toHaveFocus();
  });

  it("submits one message and renders Nova's response", async () => {
    const user = userEvent.setup();
    await renderApp();

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

  it("uses the selected discovered model when sending", async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole("button", { name: "Model llama3.2:latest, Ready" }));
    await user.click(screen.getByRole("menuitemradio", { name: /qwen3:8b/i }));
    await user.type(screen.getByLabelText("Message Nova"), "Use Qwen{enter}");

    const streamId = latestStreamId();

    expect(invokeMock).toHaveBeenCalledWith("start_streaming_message", {
      request: {
        message: "Use Qwen",
        model: "qwen3:8b",
        streamId
      }
    });
  });

  it("guards duplicate sends while Nova is generating", async () => {
    const user = userEvent.setup();
    await renderApp();

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
    await renderApp();

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
    await renderApp();

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

  it("persists visual theme preferences from settings", async () => {
    const user = userEvent.setup();
    await renderApp();

    const shell = screen.getByLabelText("Aether");

    expect(shell).toHaveAttribute("data-theme", "crimson");

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.selectOptions(screen.getByLabelText("Theme"), "observatory");

    expect(shell).toHaveAttribute("data-theme", "observatory");
  });

  it("renders representative Markdown with code copy support", async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.type(screen.getByLabelText("Message Nova"), "Show markdown");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const streamId = latestStreamId();

    emitStream({
      streamId,
      event: {
        type: "chunk",
        content: markdownShowcase
      }
    });
    emitStream({
      streamId,
      event: { type: "completed", model: "llama3.2:latest" }
    });

    expect(await screen.findByRole("heading", { name: "Heading 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Heading 6" })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("italic")).toBeInTheDocument();
    expect(screen.getByText("bold italic")).toBeInTheDocument();
    expect(screen.getByText("strikethrough")).toBeInTheDocument();
    expect(screen.getAllByText("inline code")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "https://example.com/aether" })).toHaveAttribute(
      "href",
      "https://example.com/aether"
    );
    expect(screen.getByRole("link", { name: "Named link" })).toHaveAttribute("href", "https://example.com/named");
    expect(screen.getByRole("img", { name: "Aether placeholder image" })).toHaveAttribute(
      "src",
      "https://example.com/aether.png"
    );
    expect(screen.getByText("A blockquote should carry the theme accent.")).toBeInTheDocument();
    expect(screen.getByText("Unordered item")).toBeInTheDocument();
    expect(screen.getByText("Nested ordered item")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Completed task/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Open task/i })).not.toBeChecked();
    expect(screen.getByRole("cell", { name: "Native-looking checkboxes." })).toBeInTheDocument();
    expect(await screen.findByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("json")).toBeInTheDocument();
    expect(screen.getByText("rust")).toBeInTheDocument();
    expect(screen.getByText("python")).toBeInTheDocument();
    expect(screen.getByText("bash")).toBeInTheDocument();
    expect(screen.getByText("text")).toBeInTheDocument();
    const copyButtons = screen.getAllByRole("button", { name: "Copy code" });
    expect(copyButtons).toHaveLength(6);

  });

  it("renders an unfinished streaming code fence without waiting for completion", async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.type(screen.getByLabelText("Message Nova"), "Stream code");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const streamId = latestStreamId();

    emitStream({
      streamId,
      event: {
        type: "chunk",
        content: "```ts\nconst value = 42;"
      }
    });

    expect(await screen.findByText("typescript")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    expect(screen.getByText(/const/)).toBeInTheDocument();
  });

  it("adds one UTF-8 text attachment to the submitted message context", async () => {
    const user = userEvent.setup();
    await renderApp();
    const attachmentContent = "# Notes\n\nUse this context.";
    const attachment = new File([attachmentContent], "notes.md", { type: "text/markdown" });
    Object.defineProperty(attachment, "text", {
      configurable: true,
      value: () => Promise.resolve(attachmentContent)
    });

    await user.upload(screen.getByLabelText("Attach text or code file", { selector: "input" }), attachment);
    expect(await screen.findByText("notes.md")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Message Nova"), "Summarize this{enter}");
    const request = invokeMock.mock.calls.find(([command]) => command === "start_streaming_message")?.[1] as {
      request: { message: string; model: string; streamId: string };
    };

    expect(request.request.message).toContain("Summarize this");
    expect(request.request.message).toContain("Attached text file: notes.md");
    expect(request.request.message).toContain("# Notes");
    expect(request.request.message).toContain("Use this context.");
  });

  it("clears the current conversation with confirmation", async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.type(screen.getByLabelText("Message Nova"), "Clear this later");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const streamId = latestStreamId();

    emitStream({
      streamId,
      event: { type: "chunk", content: "Ready to clear." }
    });
    emitStream({
      streamId,
      event: { type: "completed", model: "llama3.2:latest" }
    });

    expect(await screen.findByText("Ready to clear.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Conversation actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Clear current conversation" }));
    expect(screen.getByText("Clear this conversation?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear conversation" }));

    expect(screen.queryByText("Ready to clear.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hello, Alex." })).toBeInTheDocument();
  });
});
