import { FormEvent, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ChevronDown, Paperclip, Send, Settings, Square } from "lucide-react";

const placeholderModel = {
  name: "llama3.2:latest",
  status: "Ready"
};

const appearancePresets = [
  { id: "crimson", label: "Crimson" },
  { id: "obsidian", label: "Obsidian" },
  { id: "observatory", label: "Observatory" }
] as const;

type AppearancePreset = (typeof appearancePresets)[number]["id"];

type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "complete" | "generating" | "cancelled" | "error";
};

type StartStreamResponse = {
  streamId: string;
};

type ProviderErrorPayload = {
  kind: string;
  message: string;
  action: string;
  diagnostics?: string | null;
};

type ConversationStreamEvent =
  | { type: "started"; model: string }
  | { type: "chunk"; content: string }
  | { type: "completed"; model: string }
  | { type: "cancelled" }
  | { type: "failed"; error: ProviderErrorPayload };

type ConversationStreamPayload = {
  streamId: string;
  event: ConversationStreamEvent;
};

type ComposerActionButtonProps = {
  isGenerating?: boolean;
  disabled?: boolean;
  onStop?: () => void;
};

function ComposerActionButton({
  isGenerating = false,
  disabled = false,
  onStop
}: ComposerActionButtonProps) {
  const label = isGenerating ? "Stop" : "Send";
  const Icon = isGenerating ? Square : Send;

  return (
    <button
      className="send-button"
      type={isGenerating ? "button" : "submit"}
      aria-label={label}
      disabled={disabled}
      onClick={isGenerating ? onStop : undefined}
    >
      <span>{label}</span>
      <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}

export function App() {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const conversationRegionRef = useRef<HTMLElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const activeStreamIdRef = useRef<string | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const [message, setMessage] = useState("");
  const [appearancePreset, setAppearancePreset] = useState<AppearancePreset>("crimson");
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<ProviderErrorPayload | null>(null);

  useEffect(() => {
    composerRef.current?.focus();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | undefined;

    listen<ConversationStreamPayload>("conversation-stream", (event) => {
      if (isMounted) {
        handleStreamEvent(event.payload);
      }
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (shouldStickToBottomRef.current && threadEndRef.current?.scrollIntoView) {
      threadEndRef.current.scrollIntoView({ block: "end" });
    }
  }, [conversation]);

  const finishGeneration = () => {
    activeStreamIdRef.current = null;
    activeAssistantMessageIdRef.current = null;
    setIsGenerating(false);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const updateActiveAssistantMessage = (
    update: (message: ConversationMessage) => ConversationMessage
  ) => {
    const activeAssistantMessageId = activeAssistantMessageIdRef.current;
    if (!activeAssistantMessageId) {
      return;
    }

    setConversation((current) =>
      current.map((conversationMessage) =>
        conversationMessage.id === activeAssistantMessageId
          ? update(conversationMessage)
          : conversationMessage
      )
    );
  };

  const markActiveAssistantCancelled = () => {
    updateActiveAssistantMessage((conversationMessage) => ({
      ...conversationMessage,
      content: conversationMessage.content || "Generation stopped.",
      status: "cancelled"
    }));
    finishGeneration();
  };

  const handleStreamEvent = (payload: ConversationStreamPayload) => {
    if (payload.streamId !== activeStreamIdRef.current) {
      return;
    }

    switch (payload.event.type) {
      case "started":
        updateActiveAssistantMessage((conversationMessage) => ({
          ...conversationMessage,
          content: "",
          status: "generating"
        }));
        break;

      case "chunk": {
        const { content } = payload.event;
        updateActiveAssistantMessage((conversationMessage) => ({
          ...conversationMessage,
          content: `${conversationMessage.content}${content}`,
          status: "generating"
        }));
        break;
      }

      case "completed":
        updateActiveAssistantMessage((conversationMessage) => ({
          ...conversationMessage,
          status: "complete"
        }));
        finishGeneration();
        break;

      case "cancelled":
        markActiveAssistantCancelled();
        break;

      case "failed": {
        const { error } = payload.event;
        setError(error);
        updateActiveAssistantMessage((conversationMessage) => ({
          ...conversationMessage,
          content: `${error.message} ${error.action}`,
          status: "error"
        }));
        finishGeneration();
        break;
      }
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();

    if (!trimmedMessage || isGenerating) {
      return;
    }

    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedMessage,
      status: "complete"
    };
    const pendingAssistantMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      status: "generating"
    };
    const streamId = crypto.randomUUID();

    activeAssistantMessageIdRef.current = pendingAssistantMessage.id;
    activeStreamIdRef.current = streamId;
    setConversation((current) => [...current, userMessage, pendingAssistantMessage]);
    setMessage("");
    setError(null);
    setIsGenerating(true);
    shouldStickToBottomRef.current = true;

    try {
      const result = await invoke<StartStreamResponse>("start_streaming_message", {
        request: {
          message: trimmedMessage,
          model: placeholderModel.name,
          streamId
        }
      });

      activeStreamIdRef.current = result.streamId;
    } catch (caughtError) {
      const providerError = normalizeProviderError(caughtError);
      setError(providerError);
      setConversation((current) =>
        current.map((conversationMessage) =>
          conversationMessage.id === pendingAssistantMessage.id
            ? {
                ...conversationMessage,
                content: `${providerError.message} ${providerError.action}`,
                status: "error"
              }
            : conversationMessage
        )
      );
      setIsGenerating(false);
      activeAssistantMessageIdRef.current = null;
      activeStreamIdRef.current = null;
      window.requestAnimationFrame(() => composerRef.current?.focus());
    }
  };

  const handleStopGeneration = async () => {
    const streamId = activeStreamIdRef.current;
    if (!streamId) {
      return;
    }

    try {
      await invoke("cancel_streaming_message", {
        request: { streamId }
      });
      markActiveAssistantCancelled();
    } catch (caughtError) {
      const providerError = normalizeProviderError(caughtError);
      setError(providerError);
    }
  };

  const handleConversationScroll = () => {
    const region = conversationRegionRef.current;
    if (!region) {
      return;
    }

    const distanceFromBottom = region.scrollHeight - region.scrollTop - region.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
  };

  return (
    <main className="aether-shell" data-theme={appearancePreset} aria-label="Aether">
      <header className="app-header">
        <div className="identity" aria-label="Application identity">
          <span className="assistant-name">Nova</span>
        </div>

        <div className="header-actions" aria-label="Application controls">
          <label className="theme-switcher" aria-label="Experimental theme selector">
            <span>Theme</span>
            <select
              aria-label="Experimental theme"
              value={appearancePreset}
              onChange={(event) => setAppearancePreset(event.target.value as AppearancePreset)}
            >
              {appearancePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <button className="model-status" type="button" aria-label={`Model ${placeholderModel.name}, ${placeholderModel.status}`}>
            <span className="status-dot" aria-hidden="true" />
            <span className="model-name">{placeholderModel.name}</span>
            <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button className="icon-button" type="button" aria-label="Settings">
            <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section
        className="conversation-region"
        aria-label="Conversation"
        aria-busy={isGenerating}
        ref={conversationRegionRef}
        onScroll={handleConversationScroll}
      >
        {conversation.length === 0 ? (
          <div className="empty-state">
            <p className="nova-label">Nova</p>
            <h1>Hello, Alex.</h1>
            <p className="agenda">What's on the agenda today?</p>
          </div>
        ) : (
          <div className="conversation-thread" aria-live="polite">
            {conversation.map((conversationMessage) => (
              <article
                className={`message-row message-row--${conversationMessage.role}`}
                key={conversationMessage.id}
              >
                <div className="message-author">
                  {conversationMessage.role === "user" ? "You" : "Nova"}
                </div>
                <div className={`message-card message-card--${conversationMessage.status ?? "complete"}`}>
                  {conversationMessage.content ||
                    (conversationMessage.status === "generating" ? "Nova is thinking..." : "")}
                </div>
              </article>
            ))}

            {error ? (
              <div className="conversation-error" role="alert">
                <strong>{error.message}</strong>
                <span>{error.action}</span>
              </div>
            ) : null}
            <div ref={threadEndRef} aria-hidden="true" />
          </div>
        )}
      </section>

      <form className="composer" aria-label="Message composer" onSubmit={handleSubmit}>
        <button className="composer-button" type="button" aria-label="Attach text or code file">
          <Paperclip size={19} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <textarea
          ref={composerRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          placeholder="Message Nova..."
          aria-label="Message Nova"
          disabled={isGenerating}
        />

        <ComposerActionButton
          isGenerating={isGenerating}
          disabled={isGenerating ? false : !message.trim()}
          onStop={handleStopGeneration}
        />
      </form>
    </main>
  );
}

function normalizeProviderError(error: unknown): ProviderErrorPayload {
  if (typeof error === "object" && error !== null && "message" in error && "action" in error) {
    return error as ProviderErrorPayload;
  }

  return {
    kind: "requestFailed",
    message: "Nova could not complete the request.",
    action: "Try again. If the problem continues, check Ollama and the selected model.",
    diagnostics: error instanceof Error ? error.message : String(error)
  };
}
