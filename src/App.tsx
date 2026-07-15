import { CSSProperties, ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ChevronDown,
  Clipboard,
  FileText,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Send,
  Settings,
  Square,
  X
} from "lucide-react";
import { MarkdownMessage } from "./MarkdownMessage";

const defaultModel = {
  name: "llama3.2:latest",
  status: "Ready"
};

const appearancePresets = [
  { id: "crimson", label: "Crimson" },
  { id: "obsidian", label: "Obsidian" },
  { id: "observatory", label: "Observatory" }
] as const;

const composerStyles = [
  { id: "rounded", label: "Rounded" },
  { id: "subtle", label: "Subtle" },
  { id: "square", label: "Square" }
] as const;

const supportedAttachmentExtensions = new Set([
  ".txt",
  ".md",
  ".py",
  ".rs",
  ".ts",
  ".tsx",
  ".js",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".log"
]);

const maxAttachmentBytes = 1024 * 1024;

type AppearancePreset = (typeof appearancePresets)[number]["id"];
type ComposerStyle = (typeof composerStyles)[number]["id"];

type AppSettings = {
  theme: AppearancePreset;
  selectedModel: string;
  fontSize: number;
  composerStyle: ComposerStyle;
  showContextCounter: boolean;
  developerMode: boolean;
};

type AvailableModel = {
  name: string;
  provider: string;
};

type AttachmentContext = {
  name: string;
  size: number;
  content: string;
};

type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "complete" | "generating" | "cancelled" | "error";
  attachmentName?: string;
  createdAt: string;
};

type StoredConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeModel?: string | null;
  metadataJson: string;
  messages: StoredMessage[];
};

type StoredMessage = {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
  status: "complete" | "streaming" | "cancelled" | "failed" | "partial";
  position: number;
  metadataJson: string;
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

const defaultSettings: AppSettings = {
  theme: "crimson",
  selectedModel: defaultModel.name,
  fontSize: 16,
  composerStyle: "subtle",
  showContextCounter: false,
  developerMode: false
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationRegionRef = useRef<HTMLElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const activeStreamIdRef = useRef<string | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const settingsLoadedRef = useRef(false);
  const conversationLoadedRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const activeConversationCreatedAtRef = useRef<string | null>(null);
  const conversationSaveTimeoutRef = useRef<number | null>(null);
  const activeConversationSaveRef = useRef<Promise<unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [providerStatus, setProviderStatus] = useState<"ready" | "connecting" | "offline">("connecting");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [attachment, setAttachment] = useState<AttachmentContext | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<ProviderErrorPayload | null>(null);

  useEffect(() => {
    composerRef.current?.focus();
  }, []);

  useEffect(() => {
    invoke<AppSettings>("load_settings")
      .then((loadedSettings) => {
        setSettings(normalizeSettings(loadedSettings));
      })
      .catch(() => {
        setSettings(defaultSettings);
      })
      .finally(() => {
        settingsLoadedRef.current = true;
      });

    void refreshModels();

    invoke<StoredConversation | null>("load_active_conversation")
      .then((storedConversation) => {
        if (storedConversation) {
          activeConversationIdRef.current = storedConversation.id;
          activeConversationCreatedAtRef.current = storedConversation.createdAt;
          setConversation(storedConversation.messages.map(mapStoredMessageToConversationMessage));
        }
      })
      .catch((caughtError) => {
        setError(normalizeStorageError(caughtError));
      })
      .finally(() => {
        conversationLoadedRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!settingsLoadedRef.current) {
      return;
    }

    const saveHandle = window.setTimeout(() => {
      void invoke("save_settings", { settings });
    }, 250);

    return () => window.clearTimeout(saveHandle);
  }, [settings]);

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

  const selectedModel = settings.selectedModel || availableModels[0]?.name || defaultModel.name;
  const selectedModelMissing =
    availableModels.length > 0 && !availableModels.some((model) => model.name === selectedModel);
  const contextCount = estimateContextCount(message, attachment);

  useEffect(() => {
    if (shouldStickToBottomRef.current && threadEndRef.current?.scrollIntoView) {
      threadEndRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [conversation]);

  useEffect(() => {
    if (!conversationLoadedRef.current || conversation.length === 0) {
      clearPendingConversationSave();
      return;
    }

    clearPendingConversationSave();
    conversationSaveTimeoutRef.current = window.setTimeout(() => {
      const storedConversation = buildStoredConversation(
        conversation,
        selectedModel,
        activeConversationIdRef.current,
        activeConversationCreatedAtRef.current
      );
      activeConversationIdRef.current = storedConversation.id;
      activeConversationCreatedAtRef.current = storedConversation.createdAt;
      const savePromise = invoke("save_active_conversation", { conversation: storedConversation });
      activeConversationSaveRef.current = savePromise;
      void savePromise.catch((caughtError) => {
        setError(normalizeStorageError(caughtError));
      }).finally(() => {
        if (activeConversationSaveRef.current === savePromise) {
          activeConversationSaveRef.current = null;
        }
      });
    }, 300);

    return clearPendingConversationSave;
  }, [conversation, selectedModel]);

  async function refreshModels() {
    setProviderStatus("connecting");
    try {
      const response = await invoke<AvailableModel[]>("list_models");
      const models = Array.isArray(response) ? response : [];
      setAvailableModels(models);
      setProviderStatus("ready");
      setSettings((current) => {
        if (current.selectedModel && models.some((model) => model.name === current.selectedModel)) {
          return current;
        }

        return {
          ...current,
          selectedModel: models[0]?.name ?? current.selectedModel
        };
      });
    } catch (caughtError) {
      setProviderStatus("offline");
      setError(normalizeProviderError(caughtError));
    }
  }

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

    if ((!trimmedMessage && !attachment) || isGenerating) {
      return;
    }

    const messageForProvider = buildMessageForProvider(trimmedMessage, attachment);
    const userDisplayContent = trimmedMessage || `Please review ${attachment?.name}.`;
    const now = new Date().toISOString();
    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userDisplayContent,
      status: "complete",
      attachmentName: attachment?.name,
      createdAt: now
    };
    const pendingAssistantMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      status: "generating",
      createdAt: now
    };
    const streamId = crypto.randomUUID();

    activeAssistantMessageIdRef.current = pendingAssistantMessage.id;
    activeStreamIdRef.current = streamId;
    setConversation((current) => [...current, userMessage, pendingAssistantMessage]);
    setMessage("");
    setAttachment(null);
    setAttachmentError(null);
    setError(null);
    setIsGenerating(true);
    shouldStickToBottomRef.current = true;

    try {
      const result = await invoke<StartStreamResponse>("start_streaming_message", {
        request: {
          message: messageForProvider,
          model: selectedModel,
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

  function clearPendingConversationSave() {
    if (conversationSaveTimeoutRef.current !== null) {
      window.clearTimeout(conversationSaveTimeoutRef.current);
      conversationSaveTimeoutRef.current = null;
    }
  }

  const handleClearConversation = async () => {
    if (!conversation.length || isGenerating) {
      return;
    }

    clearPendingConversationSave();
    setConversation([]);
    setConversationMenuOpen(false);
    setClearConfirmationOpen(false);
    activeConversationIdRef.current = null;
    activeConversationCreatedAtRef.current = null;
    setError(null);
    try {
      await activeConversationSaveRef.current;
      await invoke("clear_active_conversation");
    } catch (caughtError) {
      setError(normalizeStorageError(caughtError));
    }
    setAttachment(null);
    setAttachmentError(null);
    shouldStickToBottomRef.current = true;
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const handleAttachmentChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const validationError = validateAttachment(file);
    if (validationError) {
      setAttachment(null);
      setAttachmentError(validationError);
      return;
    }

    try {
      const content = await file.text();
      setAttachment({ name: file.name, size: file.size, content });
      setAttachmentError(null);
      window.requestAnimationFrame(() => composerRef.current?.focus());
    } catch {
      setAttachment(null);
      setAttachmentError("Aether could not read that file. Try another UTF-8 text or code file.");
    }
  };

  const copyResponse = async (content: string) => {
    await navigator.clipboard.writeText(content);
  };

  return (
    <main
      className="aether-shell"
      data-theme={settings.theme}
      data-composer-style={settings.composerStyle}
      aria-label="Aether"
      style={{ "--message-font-size": `${settings.fontSize}px` } as CSSProperties}
    >
      <header className="app-header">
        <div className="identity" aria-label="Application identity">
          <span className="assistant-name">Nova</span>
        </div>

        <div className="header-actions" aria-label="Application controls">
          <div className="model-menu-wrap">
            <button
              className="model-status"
              type="button"
              aria-label={`Model ${selectedModel}, ${statusLabel(providerStatus)}`}
              aria-expanded={modelMenuOpen}
              onClick={() => setModelMenuOpen((open) => !open)}
            >
              <span className={`status-dot status-dot--${providerStatus}`} aria-hidden="true" />
              <span className="model-name">{selectedModel}</span>
              <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>

            {modelMenuOpen ? (
              <div className="model-popover" role="menu">
                <div className="model-popover__header">
                  <span>Ollama Models</span>
                  <button type="button" onClick={refreshModels} aria-label="Refresh installed models">
                    <RefreshCw size={15} aria-hidden="true" />
                  </button>
                </div>
                {availableModels.length ? (
                  availableModels.map((model) => (
                    <button
                      className="model-option"
                      type="button"
                      role="menuitemradio"
                      aria-checked={model.name === selectedModel}
                      key={model.name}
                      onClick={() => {
                        setSettings((current) => ({ ...current, selectedModel: model.name }));
                        setModelMenuOpen(false);
                      }}
                    >
                      <span>{model.name}</span>
                      <small>{model.provider}</small>
                    </button>
                  ))
                ) : (
                  <p className="model-empty">No local models found. Install one with Ollama, then refresh.</p>
                )}
              </div>
            ) : null}
          </div>

          <button className="icon-button" type="button" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <div className="conversation-menu-wrap">
            <button
              className="icon-button"
              type="button"
              aria-label="Conversation actions"
              aria-expanded={conversationMenuOpen}
              onClick={() => {
                setConversationMenuOpen((open) => !open);
                setClearConfirmationOpen(false);
              }}
            >
              <MoreHorizontal size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {conversationMenuOpen ? (
              <div className="conversation-menu" role="menu" aria-label="Conversation actions">
                {clearConfirmationOpen ? (
                  <div className="conversation-menu__confirm" role="group" aria-label="Confirm clear conversation">
                    <p>Clear this conversation?</p>
                    <div className="conversation-menu__confirm-actions">
                      <button type="button" onClick={() => setClearConfirmationOpen(false)}>
                        Cancel
                      </button>
                      <button type="button" className="danger" onClick={handleClearConversation}>
                        Clear conversation
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="conversation-menu__item conversation-menu__item--danger"
                    type="button"
                    role="menuitem"
                    disabled={!conversation.length || isGenerating}
                    onClick={() => setClearConfirmationOpen(true)}
                  >
                    Clear current conversation
                  </button>
                )}
              </div>
            ) : null}
          </div>
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
                  {conversationMessage.attachmentName ? (
                    <div className="attachment-chip">
                      <FileText size={15} aria-hidden="true" />
                      <span>{conversationMessage.attachmentName}</span>
                    </div>
                  ) : null}
                  {conversationMessage.content ? (
                    <MarkdownMessage content={conversationMessage.content} />
                  ) : conversationMessage.status === "generating" ? (
                    <span className="thinking-text">Nova is thinking...</span>
                  ) : null}
                  {conversationMessage.role === "assistant" &&
                  conversationMessage.status === "complete" &&
                  conversationMessage.content ? (
                    <button
                      className="message-copy"
                      type="button"
                      aria-label="Copy response"
                      onClick={() => copyResponse(conversationMessage.content)}
                    >
                      <Clipboard size={14} aria-hidden="true" />
                      <span>Copy</span>
                    </button>
                  ) : null}
                </div>
              </article>
            ))}

            {error ? (
              <div className="conversation-error" role="alert">
                <strong>{error.message}</strong>
                <span>{error.action}</span>
                {settings.developerMode && error.diagnostics ? <code>{error.diagnostics}</code> : null}
              </div>
            ) : null}
            <div ref={threadEndRef} aria-hidden="true" />
          </div>
        )}
      </section>

      <form className="composer" aria-label="Message composer" onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          className="file-input"
          type="file"
          accept={Array.from(supportedAttachmentExtensions).join(",")}
          onChange={handleAttachmentChange}
          aria-label="Attach text or code file"
        />
        <button
          className="composer-button"
          type="button"
          aria-label="Attach text or code file"
          onClick={() => fileInputRef.current?.click()}
          disabled={isGenerating}
        >
          <Paperclip size={19} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <div className="composer-input-stack">
          {attachment ? (
            <div className="composer-attachment">
              <FileText size={15} aria-hidden="true" />
              <span>{attachment.name}</span>
              <button type="button" aria-label="Remove attachment" onClick={() => setAttachment(null)}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {attachmentError ? <div className="attachment-error">{attachmentError}</div> : null}
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
          {settings.showContextCounter ? (
            <div className="context-counter" aria-label="Approximate context count">
              ~{contextCount.toLocaleString()} tokens
            </div>
          ) : null}
        </div>

        <ComposerActionButton
          isGenerating={isGenerating}
          disabled={isGenerating ? false : !message.trim() && !attachment}
          onStop={handleStopGeneration}
        />
      </form>

      {settingsOpen ? (
        <div className="settings-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section
            className="settings-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Aether settings"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>Settings</h2>
                <p>v0.1 preferences only.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <label>
              <span>Theme</span>
              <select
                value={settings.theme}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, theme: event.target.value as AppearancePreset }))
                }
              >
                {appearancePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Font size</span>
              <input
                type="range"
                min="14"
                max="20"
                value={settings.fontSize}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, fontSize: Number(event.target.value) }))
                }
              />
            </label>

            <label>
              <span>Composer style</span>
              <select
                value={settings.composerStyle}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, composerStyle: event.target.value as ComposerStyle }))
                }
              >
                {composerStyles.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.showContextCounter}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    showContextCounter: event.target.checked
                  }))
                }
              />
              <span>Show approximate context counter</span>
            </label>

            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.developerMode}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, developerMode: event.target.checked }))
                }
              />
              <span>Show developer diagnostics in errors</span>
            </label>

            {selectedModelMissing ? (
              <p className="settings-warning">
                The saved model is not currently installed. Choose an available Ollama model from the header.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function normalizeStorageError(error: unknown): ProviderErrorPayload {
  return {
    kind: "requestFailed",
    message: "Aether could not update the saved conversation.",
    action: "You can keep chatting, but this conversation may not be saved until the problem is fixed.",
    diagnostics: error instanceof Error ? error.message : String(error)
  };
}

function mapStoredMessageToConversationMessage(message: StoredMessage): ConversationMessage {
  return {
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    status: mapStoredStatusToConversationStatus(message.status),
    attachmentName: readAttachmentName(message.metadataJson),
    createdAt: message.createdAt
  };
}

function mapStoredStatusToConversationStatus(status: StoredMessage["status"]): ConversationMessage["status"] {
  if (status === "cancelled") {
    return "cancelled";
  }
  if (status === "failed") {
    return "error";
  }
  return "complete";
}

function mapConversationStatusToStoredStatus(status: ConversationMessage["status"]): StoredMessage["status"] {
  if (status === "cancelled") {
    return "cancelled";
  }
  if (status === "error") {
    return "failed";
  }
  if (status === "generating") {
    return "partial";
  }
  return "complete";
}

function buildStoredConversation(
  conversation: ConversationMessage[],
  selectedModel: string,
  activeConversationId: string | null,
  activeConversationCreatedAt: string | null
): StoredConversation {
  const id = activeConversationId || "active-conversation";
  const createdAt = activeConversationCreatedAt || conversation[0]?.createdAt || new Date().toISOString();
  const updatedAt = new Date().toISOString();

  return {
    id,
    title: buildConversationTitle(conversation),
    createdAt,
    updatedAt,
    activeModel: selectedModel,
    metadataJson: "{}",
    messages: conversation.map((message, index) => ({
      id: message.id,
      conversationId: id,
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
      createdAt: message.createdAt,
      status: mapConversationStatusToStoredStatus(message.status),
      position: index,
      metadataJson: message.attachmentName
        ? JSON.stringify({ attachmentName: message.attachmentName })
        : "{}"
    }))
  };
}

function buildConversationTitle(conversation: ConversationMessage[]) {
  const firstUserMessage = conversation.find((message) => message.role === "user")?.content.trim();
  if (!firstUserMessage) {
    return "New conversation";
  }

  return firstUserMessage.length > 64 ? `${firstUserMessage.slice(0, 61)}...` : firstUserMessage;
}

function readAttachmentName(metadataJson: string) {
  try {
    const metadata = JSON.parse(metadataJson) as { attachmentName?: unknown };
    return typeof metadata.attachmentName === "string" ? metadata.attachmentName : undefined;
  } catch {
    return undefined;
  }
}

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  const theme: AppearancePreset = appearancePresets.some((preset) => preset.id === settings.theme)
    ? (settings.theme as AppearancePreset)
    : defaultSettings.theme;
  const composerStyle: ComposerStyle = composerStyles.some((style) => style.id === settings.composerStyle)
    ? (settings.composerStyle as ComposerStyle)
    : defaultSettings.composerStyle;

  return {
    ...defaultSettings,
    ...settings,
    theme,
    composerStyle,
    fontSize: Math.min(Math.max(settings.fontSize ?? defaultSettings.fontSize, 14), 20)
  };
}

function statusLabel(status: "ready" | "connecting" | "offline") {
  if (status === "ready") {
    return "Ready";
  }
  if (status === "connecting") {
    return "Connecting";
  }
  return "Offline";
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

function buildMessageForProvider(message: string, attachment: AttachmentContext | null) {
  if (!attachment) {
    return message;
  }

  return `${message || "Please review the attached file."}

Attached text file: ${attachment.name}

\`\`\`
${attachment.content}
\`\`\``;
}

function validateAttachment(file: File) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  if (!supportedAttachmentExtensions.has(extension)) {
    return "Aether v0.1 only accepts UTF-8 text and code files.";
  }

  if (file.size > maxAttachmentBytes) {
    return "Aether v0.1 accepts one text/code file up to 1 MB.";
  }

  return null;
}

function estimateContextCount(message: string, attachment: AttachmentContext | null) {
  const characters = message.length + (attachment?.content.length ?? 0);
  return Math.max(0, Math.ceil(characters / 4));
}
