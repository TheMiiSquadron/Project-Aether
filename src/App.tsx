import { FormEvent, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  status?: "complete" | "generating" | "error";
};

type SubmitMessageResponse = {
  model: string;
  response: string;
};

type ProviderErrorPayload = {
  kind: string;
  message: string;
  action: string;
  diagnostics?: string | null;
};

type ComposerActionButtonProps = {
  isGenerating?: boolean;
  disabled?: boolean;
};

function ComposerActionButton({ isGenerating = false, disabled = false }: ComposerActionButtonProps) {
  const label = isGenerating ? "Stop" : "Send";
  const Icon = isGenerating ? Square : Send;

  return (
    <button className="send-button" type="submit" aria-label={label} disabled={disabled}>
      <span>{label}</span>
      <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}

export function App() {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  const [appearancePreset, setAppearancePreset] = useState<AppearancePreset>("crimson");
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<ProviderErrorPayload | null>(null);

  useEffect(() => {
    composerRef.current?.focus();
  }, []);

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
      content: "Nova is thinking...",
      status: "generating"
    };

    setConversation((current) => [...current, userMessage, pendingAssistantMessage]);
    setMessage("");
    setError(null);
    setIsGenerating(true);

    try {
      const result = await invoke<SubmitMessageResponse>("submit_message", {
        request: {
          message: trimmedMessage,
          model: placeholderModel.name
        }
      });

      setConversation((current) =>
        current.map((conversationMessage) =>
          conversationMessage.id === pendingAssistantMessage.id
            ? {
                ...conversationMessage,
                content: result.response,
                status: "complete"
              }
            : conversationMessage
        )
      );
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
    } finally {
      setIsGenerating(false);
      window.requestAnimationFrame(() => composerRef.current?.focus());
    }
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

      <section className="conversation-region" aria-label="Conversation" aria-busy={isGenerating}>
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
                  {conversationMessage.content}
                </div>
              </article>
            ))}

            {error ? (
              <div className="conversation-error" role="alert">
                <strong>{error.message}</strong>
                <span>{error.action}</span>
              </div>
            ) : null}
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

        <ComposerActionButton isGenerating={isGenerating} disabled={!message.trim() || isGenerating} />
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
