import { CSSProperties, ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Clipboard,
  Download,
  ExternalLink,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Square,
  Trash2,
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
  firstRun: boolean;
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

type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeModel?: string | null;
  messageCount: number;
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

type SystemCheckField =
  | "operatingSystem"
  | "operatingSystemVersion"
  | "cpuName"
  | "totalMemory"
  | "availableMemory"
  | "gpuInformation"
  | "dataDiskAvailable";

type SystemCheckResult = {
  operatingSystem?: string | null;
  operatingSystemVersion?: string | null;
  architecture: string;
  cpuName?: string | null;
  logicalCpuCount: number;
  totalMemoryBytes?: number | null;
  availableMemoryBytes?: number | null;
  gpuNames: string[];
  dataDiskAvailableBytes?: number | null;
  unavailableFields: SystemCheckField[];
};

type OllamaStatusField = "installation" | "version" | "models";

type OllamaStatus = {
  installationDetected: boolean;
  serviceReachable: boolean;
  version?: string | null;
  modelsInstalled: boolean;
  modelCount: number;
  modelNames: string[];
  canStart: boolean;
  unavailableFields: OllamaStatusField[];
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
  developerMode: false,
  firstRun: true
};

const onboardingSteps = [
  {
    id: "splash",
    eyebrow: "Project Aether",
    title: "Hello, I'm Nova.",
    body: "I'll guide you through a short welcome so Aether feels familiar before we begin.",
    status: "Welcome experience"
  },
  {
    id: "welcome",
    eyebrow: "Aether",
    title: "This is your local workspace.",
    body: "Aether is designed to keep our conversations focused, private, and easy to return to.",
    status: "Orientation"
  },
  {
    id: "system-check",
    eyebrow: "System Check",
    title: "I'll check the basics.",
    body: "I can take a local look at this device so setup has useful context without sending anything away.",
    status: "Local check"
  },
  {
    id: "ollama",
    eyebrow: "Ollama",
    title: "I'll check for Ollama.",
    body: "Aether uses Ollama to connect with local models. I'll only check what is available here, and you can set it up later.",
    status: "Local runtime"
  },
  {
    id: "model-selection",
    eyebrow: "Model Selection",
    title: "We'll choose a model here later.",
    body: "When this step becomes active, I'll help you pick from installed local models. Today, your current model setting stays untouched.",
    status: "Placeholder"
  },
  {
    id: "personalization",
    eyebrow: "Personalization",
    title: "A few preferences will go here.",
    body: "Future options can tune the first-run experience. I'll keep them simple and explain what each one changes.",
    status: "Placeholder"
  },
  {
    id: "features",
    eyebrow: "Features",
    title: "I'll show what Aether can do.",
    body: "This step will later introduce conversation history, Markdown, export, and search without turning setup into a lecture.",
    status: "Placeholder"
  },
  {
    id: "finish",
    eyebrow: "Finish",
    title: "You're ready.",
    body: "Finish the welcome flow and we'll open the normal conversation view.",
    status: "Complete"
  }
] as const;

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

type OnboardingFlowProps = {
  onFinish: () => void;
  developerMode: boolean;
};

function OnboardingFlow({ onFinish, developerMode }: OnboardingFlowProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [ollamaReachable, setOllamaReachable] = useState<boolean | null>(null);
  const step = onboardingSteps[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === onboardingSteps.length - 1;
  const isOllamaStep = step.id === "ollama";
  const nextLabel = isLastStep ? "Finish" : isOllamaStep && !ollamaReachable ? "Set Up Later" : "Next";

  return (
    <section className="welcome-flow" aria-label="Aether welcome experience">
      <div className="welcome-shell">
        <div className="welcome-progress" aria-label="Welcome progress">
          {onboardingSteps.map((progressStep, index) => (
            <span
              key={progressStep.id}
              className="welcome-progress__dot"
              aria-current={index === stepIndex ? "step" : undefined}
              data-complete={index < stepIndex ? "true" : undefined}
            />
          ))}
        </div>

        <div
          className={`welcome-card ${step.id === "system-check" || step.id === "ollama" ? "welcome-card--interactive" : ""}`}
          key={step.id}
        >
          <p className="welcome-card__eyebrow">{step.eyebrow}</p>
          <h1>{step.title}</h1>
          <p>{step.body}</p>
          {step.id === "system-check" ? <SystemCheckPanel developerMode={developerMode} /> : null}
          {step.id === "ollama" ? (
            <OllamaSetupPanel developerMode={developerMode} onReachableChange={setOllamaReachable} />
          ) : null}
          <span className="welcome-card__status">{step.status}</span>
        </div>

        <div className="welcome-footer">
          <button
            className="welcome-nav-button"
            type="button"
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            disabled={isFirstStep}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back</span>
          </button>

          <span className="welcome-step-count">
            Step {stepIndex + 1} of {onboardingSteps.length}
          </span>

          <button
            className="welcome-nav-button welcome-nav-button--primary"
            type="button"
            onClick={() => {
              if (isLastStep) {
                onFinish();
                return;
              }
              setStepIndex((current) => Math.min(onboardingSteps.length - 1, current + 1));
            }}
          >
            <span>{nextLabel}</span>
            {isLastStep ? null : <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </section>
  );
}

type OllamaSetupPanelProps = {
  developerMode: boolean;
  onReachableChange: (reachable: boolean | null) => void;
};

function OllamaSetupPanel({ developerMode, onReachableChange }: OllamaSetupPanelProps) {
  const [state, setState] = useState<
    "checking" | "ready" | "noModels" | "installedStopped" | "notInstalled" | "partial" | "failed"
  >("checking");
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState("checking");
    setError(null);
    setNotice(null);
    onReachableChange(null);

    invoke<OllamaStatus>("check_ollama_status")
      .then((ollamaStatus) => {
        if (cancelled) {
          return;
        }
        setStatus(ollamaStatus);
        onReachableChange(ollamaStatus.serviceReachable);
        setState(getOllamaPanelState(ollamaStatus));
      })
      .catch((caughtError) => {
        if (cancelled) {
          return;
        }
        setStatus(null);
        onReachableChange(false);
        setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
        setState("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, onReachableChange]);

  const refresh = () => setAttempt((current) => current + 1);

  const startOllama = () => {
    setStarting(true);
    setNotice(null);
    invoke("start_ollama")
      .then(() => {
        setNotice("I asked Ollama to start. I'll check the connection again now.");
        window.setTimeout(refresh, 700);
      })
      .catch((caughtError) => {
        setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
        setNotice("I could not start Ollama safely from here. Please start it normally, then try Refresh.");
      })
      .finally(() => setStarting(false));
  };

  if (state === "checking") {
    return (
      <div className="ollama-panel" aria-live="polite">
        <div className="system-check-loading" aria-hidden="true" />
        <p>I'm checking for Ollama on this device.</p>
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div className="ollama-panel" role="alert">
        <p>I could not complete the Ollama check. You can try again, or set it up later and keep going.</p>
        {developerMode && error ? <code>{error}</code> : null}
        <div className="welcome-action-row">
          <button className="welcome-inline-button" type="button" onClick={refresh}>
            <RefreshCw size={15} aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  if (state === "notInstalled") {
    return (
      <div className="ollama-panel" aria-live="polite">
        <p>Ollama lets Aether talk to local models on this device. I do not see it installed yet.</p>
        <div className="welcome-action-row">
          <button className="welcome-inline-button" type="button" onClick={openOllamaDownloadPage}>
            <ExternalLink size={15} aria-hidden="true" />
            <span>Open Ollama Download Page</span>
          </button>
          <button className="welcome-inline-button" type="button" onClick={refresh}>
            <RefreshCw size={15} aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  if (state === "installedStopped") {
    return (
      <div className="ollama-panel" aria-live="polite">
        <p>Ollama appears to be installed, but Aether cannot reach the local service right now.</p>
        {notice ? <p className="ollama-panel__note">{notice}</p> : null}
        {developerMode && error ? <code>{error}</code> : null}
        <div className="welcome-action-row">
          {status.canStart ? (
            <button className="welcome-inline-button" type="button" onClick={startOllama} disabled={starting}>
              <Play size={15} aria-hidden="true" />
              <span>{starting ? "Starting..." : "Start Ollama"}</span>
            </button>
          ) : null}
          <button className="welcome-inline-button" type="button" onClick={refresh}>
            <RefreshCw size={15} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
        {!status.canStart ? (
          <p className="ollama-panel__note">Start Ollama from your normal app launcher, then refresh this check.</p>
        ) : null}
      </div>
    );
  }

  const isPartial = state === "partial";
  const isNoModels = state === "noModels";

  return (
    <div className="ollama-panel" aria-live="polite">
      <p>
        {isPartial
          ? "Aether can reach Ollama locally, though one detail was unavailable."
          : isNoModels
            ? "Aether can reach Ollama locally. No local models are installed yet."
            : "Aether can connect to Ollama locally."}
      </p>
      <dl className="system-check-grid">
        <SystemCheckItem label="Version" value={status.version} />
        <SystemCheckItem label="Installed models" value={formatModelCount(status.modelCount)} />
      </dl>
      {status.modelNames.length ? (
        <div className="ollama-model-list" aria-label="Installed Ollama models">
          {status.modelNames.map((modelName) => (
            <span key={modelName}>{modelName}</span>
          ))}
        </div>
      ) : null}
      {isPartial ? (
        <p className="ollama-panel__note">Unavailable details: {formatOllamaUnavailableFields(status.unavailableFields)}.</p>
      ) : null}
      <div className="welcome-action-row">
        <button className="welcome-inline-button" type="button" onClick={refresh}>
          <RefreshCw size={15} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
}

type SystemCheckPanelProps = {
  developerMode: boolean;
};

function SystemCheckPanel({ developerMode }: SystemCheckPanelProps) {
  const [state, setState] = useState<"checking" | "complete" | "partial" | "failed">("checking");
  const [result, setResult] = useState<SystemCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("checking");
    setError(null);

    invoke<SystemCheckResult>("run_system_check")
      .then((systemCheck) => {
        if (cancelled) {
          return;
        }
        setResult(systemCheck);
        setState(systemCheck.unavailableFields.length ? "partial" : "complete");
      })
      .catch((caughtError) => {
        if (cancelled) {
          return;
        }
        setResult(null);
        setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
        setState("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state === "checking") {
    return (
      <div className="system-check-panel" aria-live="polite">
        <div className="system-check-loading" aria-hidden="true" />
        <p>I'm taking a quick look at this device.</p>
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div className="system-check-panel" role="alert">
        <p>I could not complete the system check. You can try again, and we can keep setup moving if it still fails.</p>
        {developerMode && error ? <code>{error}</code> : null}
        <button className="welcome-inline-button" type="button" onClick={() => setAttempt((current) => current + 1)}>
          Retry
        </button>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  const isPartial = state === "partial";

  return (
    <div className="system-check-panel" aria-live="polite">
      <p>
        {isPartial
          ? "I found the essentials, but one or more details could not be detected."
          : "Everything I found stays on this device."}
      </p>
      <dl className="system-check-grid">
        <SystemCheckItem
          label="Operating system"
          value={joinSystemValue(result.operatingSystem, result.operatingSystemVersion)}
        />
        <SystemCheckItem label="Architecture" value={result.architecture} />
        <SystemCheckItem label="CPU" value={result.cpuName} />
        <SystemCheckItem label="Threads" value={formatCount(result.logicalCpuCount)} />
        <SystemCheckItem label="Memory" value={formatMemoryPair(result.availableMemoryBytes, result.totalMemoryBytes)} />
        <SystemCheckItem label="GPU" value={result.gpuNames.length ? result.gpuNames.join(", ") : null} />
        <SystemCheckItem label="Aether data space" value={formatBytes(result.dataDiskAvailableBytes)} />
      </dl>
      {isPartial ? (
        <p className="system-check-note">Unavailable details: {formatUnavailableFields(result.unavailableFields)}.</p>
      ) : null}
      <button className="welcome-inline-button" type="button" onClick={() => setAttempt((current) => current + 1)}>
        Retry
      </button>
    </div>
  );
}

function SystemCheckItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="system-check-item">
      <dt>{label}</dt>
      <dd>{value || "Not detected"}</dd>
    </div>
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
  const activeConversationTitleRef = useRef<string | null>(null);
  const historySearchQueryRef = useRef("");
  const historyRefreshSequenceRef = useRef(0);
  const conversationSaveTimeoutRef = useRef<number | null>(null);
  const activeConversationSaveRef = useRef<Promise<unknown> | null>(null);
  const skipNextConversationSaveRef = useRef(false);
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsReady, setSettingsReady] = useState(false);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [providerStatus, setProviderStatus] = useState<"ready" | "connecting" | "offline">("connecting");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [attachment, setAttachment] = useState<AttachmentContext | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([]);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [renameConversationId, setRenameConversationId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<ProviderErrorPayload | null>(null);

  useEffect(() => {
    if (settingsReady && !settings.firstRun) {
      window.requestAnimationFrame(() => {
        if (document.activeElement === document.body) {
          composerRef.current?.focus();
        }
      });
    }
  }, [settingsReady, settings.firstRun]);

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
        setSettingsReady(true);
      });

    void refreshModels();

    loadInitialConversation();
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

    if (skipNextConversationSaveRef.current) {
      skipNextConversationSaveRef.current = false;
      clearPendingConversationSave();
      return;
    }

    clearPendingConversationSave();
    conversationSaveTimeoutRef.current = window.setTimeout(() => {
      const storedConversation = buildStoredConversation(
        conversation,
        selectedModel,
        activeConversationIdRef.current,
        activeConversationCreatedAtRef.current,
        activeConversationTitleRef.current
      );
      activeConversationIdRef.current = storedConversation.id;
      activeConversationCreatedAtRef.current = storedConversation.createdAt;
      activeConversationTitleRef.current = storedConversation.title;
      setActiveConversationId(storedConversation.id);
      const savePromise = invoke("save_conversation", { conversation: storedConversation });
      activeConversationSaveRef.current = savePromise;
      void savePromise.catch((caughtError) => {
        setError(normalizeStorageError(caughtError));
      }).finally(() => {
        if (activeConversationSaveRef.current === savePromise) {
          activeConversationSaveRef.current = null;
        }
        void refreshConversationSummaries();
      });
    }, 300);

    return clearPendingConversationSave;
  }, [conversation, selectedModel]);

  async function loadInitialConversation() {
    setHistoryLoading(true);
    try {
      const summaries = await invoke<ConversationSummary[]>("list_conversations");
      setConversationSummaries(summaries);
      const firstConversationId = summaries[0]?.id;
      if (firstConversationId) {
        await loadConversationById(firstConversationId);
      } else {
        activeConversationIdRef.current = null;
        activeConversationCreatedAtRef.current = null;
        activeConversationTitleRef.current = null;
        setActiveConversationId(null);
        setConversation([]);
      }
    } catch (caughtError) {
      setError(normalizeStorageError(caughtError));
    } finally {
      conversationLoadedRef.current = true;
      setHistoryLoading(false);
    }
  }

  async function refreshConversationSummaries(query = historySearchQueryRef.current) {
    const refreshSequence = historyRefreshSequenceRef.current + 1;
    historyRefreshSequenceRef.current = refreshSequence;
    try {
      const trimmedQuery = query.trim();
      const summaries = trimmedQuery
        ? await invoke<ConversationSummary[]>("search_conversations", { query: trimmedQuery })
        : await invoke<ConversationSummary[]>("list_conversations");
      if (historyRefreshSequenceRef.current === refreshSequence && historySearchQueryRef.current === query) {
        setConversationSummaries(summaries);
      }
    } catch (caughtError) {
      setError(normalizeStorageError(caughtError));
    }
  }

  function handleHistorySearchChange(event: ChangeEvent<HTMLInputElement>) {
    const query = event.target.value;
    historySearchQueryRef.current = query;
    setHistorySearchQuery(query);
    void refreshConversationSummaries(query);
  }

  async function loadConversationById(id: string) {
    if (isGenerating) {
      return;
    }

    setHistoryLoading(true);
    try {
      clearPendingConversationSave();
      await activeConversationSaveRef.current;
      const storedConversation = await invoke<StoredConversation | null>("load_conversation", { id });
      if (!storedConversation) {
        await refreshConversationSummaries();
        return;
      }
      activeConversationIdRef.current = storedConversation.id;
      activeConversationCreatedAtRef.current = storedConversation.createdAt;
      activeConversationTitleRef.current = storedConversation.title;
      setActiveConversationId(storedConversation.id);
      skipNextConversationSaveRef.current = true;
      setConversation(storedConversation.messages.map(mapStoredMessageToConversationMessage));
      if (storedConversation.activeModel) {
        setSettings((current) => ({ ...current, selectedModel: storedConversation.activeModel ?? current.selectedModel }));
      }
      setError(null);
      shouldStickToBottomRef.current = true;
    } catch (caughtError) {
      setError(normalizeStorageError(caughtError));
    } finally {
      setHistoryLoading(false);
      window.requestAnimationFrame(() => composerRef.current?.focus());
    }
  }

  async function handleNewConversation() {
    if (isGenerating) {
      return;
    }

    clearPendingConversationSave();
    await activeConversationSaveRef.current;
    activeConversationIdRef.current = null;
    activeConversationCreatedAtRef.current = null;
    activeConversationTitleRef.current = null;
    setActiveConversationId(null);
    setRenameConversationId(null);
    setRenameDraft("");
    setConversation([]);
    setAttachment(null);
    setAttachmentError(null);
    setError(null);
    setConversationMenuOpen(false);
    setClearConfirmationOpen(false);
    shouldStickToBottomRef.current = true;
    await refreshConversationSummaries();
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function handleDeleteConversation(id: string) {
    if (isGenerating) {
      return;
    }

    const summary = conversationSummaries.find((conversation) => conversation.id === id);
    const shouldDelete = window.confirm(`Delete "${summary?.title ?? "this conversation"}"?`);
    if (!shouldDelete) {
      return;
    }

    setHistoryLoading(true);
    try {
      clearPendingConversationSave();
      await activeConversationSaveRef.current;
      await invoke("delete_conversation", { id });
      const remaining = conversationSummaries.filter((conversation) => conversation.id !== id);
      setConversationSummaries(remaining);

      if (activeConversationIdRef.current === id) {
        activeConversationIdRef.current = null;
        activeConversationCreatedAtRef.current = null;
        activeConversationTitleRef.current = null;
        setActiveConversationId(null);
        setConversation([]);
      }

      setError(null);
    } catch (caughtError) {
      setError(normalizeStorageError(caughtError));
    } finally {
      setHistoryLoading(false);
      window.requestAnimationFrame(() => composerRef.current?.focus());
    }
  }

  function startRenamingConversation(summary: ConversationSummary) {
    setRenameConversationId(summary.id);
    setRenameDraft(summary.title);
  }

  async function handleRenameConversation(id: string) {
    const title = renameDraft.trim();
    if (!title) {
      return;
    }

    setHistoryLoading(true);
    try {
      const updatedAt = new Date().toISOString();
      await invoke("rename_conversation", { id, title, updatedAt });
      setConversationSummaries((current) =>
        current.map((summary) =>
          summary.id === id
            ? {
                ...summary,
                title,
                updatedAt
              }
            : summary
        )
      );
      if (activeConversationIdRef.current === id) {
        activeConversationTitleRef.current = title;
      }
      setRenameConversationId(null);
      setRenameDraft("");
      setError(null);
      await refreshConversationSummaries();
    } catch (caughtError) {
      setError(normalizeStorageError(caughtError));
    } finally {
      setHistoryLoading(false);
      window.requestAnimationFrame(() => composerRef.current?.focus());
    }
  }

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
    const conversationIdToDelete = activeConversationIdRef.current;
    setConversation([]);
    setConversationMenuOpen(false);
    setClearConfirmationOpen(false);
    activeConversationIdRef.current = null;
    activeConversationCreatedAtRef.current = null;
    activeConversationTitleRef.current = null;
    setActiveConversationId(null);
    setError(null);
    try {
      await activeConversationSaveRef.current;
      if (conversationIdToDelete) {
        await invoke("delete_conversation", { id: conversationIdToDelete });
      }
      await refreshConversationSummaries();
    } catch (caughtError) {
      setError(normalizeStorageError(caughtError));
    }
    setAttachment(null);
    setAttachmentError(null);
    shouldStickToBottomRef.current = true;
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const handleExportConversation = () => {
    if (!conversation.length) {
      return;
    }

    const title = activeConversationTitleRef.current ?? buildConversationTitle(conversation);
    const exportedMarkdown = buildConversationExportMarkdown(conversation, title, selectedModel);
    const blob = new Blob([exportedMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${slugifyFileName(title)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setConversationMenuOpen(false);
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

  function completeWelcomeFlow() {
    setSettings((current) => ({ ...current, firstRun: false }));
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function runWelcomeAgain() {
    setSettings((current) => ({ ...current, firstRun: true }));
    setSettingsOpen(false);
  }

  return (
    <main
      className={`aether-shell${settings.firstRun ? " aether-shell--onboarding" : ""}`}
      data-theme={settings.theme}
      data-composer-style={settings.composerStyle}
      aria-label="Aether"
      style={{ "--message-font-size": `${settings.fontSize}px` } as CSSProperties}
    >
      {!settingsReady ? (
        <section className="boot-screen" aria-label="Loading Aether">
          <span>Nova</span>
        </section>
      ) : settings.firstRun ? (
        <OnboardingFlow onFinish={completeWelcomeFlow} developerMode={settings.developerMode} />
      ) : (
      <>
      <aside className="history-sidebar" aria-label="Conversation history">
        <div className="history-sidebar__header">
          <div>
            <span className="history-sidebar__eyebrow">Aether</span>
            <h2>Conversations</h2>
          </div>
          <button
            className="history-new-button"
            type="button"
            onClick={handleNewConversation}
            disabled={isGenerating}
            aria-label="New conversation"
          >
            <Plus size={16} aria-hidden="true" />
            <span>New</span>
          </button>
        </div>

        <label className="history-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={historySearchQuery}
            onChange={handleHistorySearchChange}
            placeholder="Search conversations"
            aria-label="Search conversations"
          />
        </label>

        <div className="history-list" aria-busy={historyLoading}>
          {conversationSummaries.length ? (
            conversationSummaries.map((summary) => (
              <div className="history-item-wrap" key={summary.id}>
                {renameConversationId === summary.id ? (
                  <form
                    className="history-rename-form"
                    aria-label={`Rename conversation ${summary.title}`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleRenameConversation(summary.id);
                    }}
                  >
                    <input
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      aria-label="Conversation title"
                      autoFocus
                    />
                    <div className="history-rename-actions">
                      <button type="button" onClick={() => setRenameConversationId(null)}>
                        Cancel
                      </button>
                      <button type="submit" disabled={!renameDraft.trim()}>
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button
                      className="history-item"
                      type="button"
                      aria-label={`Open conversation ${summary.title}`}
                      aria-current={summary.id === activeConversationId ? "true" : undefined}
                      onClick={() => loadConversationById(summary.id)}
                      disabled={isGenerating || historyLoading}
                    >
                      <MessageSquare size={15} aria-hidden="true" />
                      <span className="history-item__text">
                        <span>{summary.title}</span>
                        <small>{formatConversationSummary(summary)}</small>
                      </span>
                    </button>
                    <div className="history-item-actions">
                      <button
                        className="history-icon-button"
                        type="button"
                        aria-label={`Rename conversation ${summary.title}`}
                        onClick={() => startRenamingConversation(summary)}
                        disabled={isGenerating || historyLoading}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        className="history-icon-button"
                        type="button"
                        aria-label={`Delete conversation ${summary.title}`}
                        onClick={() => handleDeleteConversation(summary.id)}
                        disabled={isGenerating || historyLoading}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          ) : (
            <p className="history-empty">
              {historySearchQuery.trim() ? "No conversations found." : "Saved conversations will appear here."}
            </p>
          )}
        </div>
      </aside>

      <div className="chat-shell">
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
                  <>
                    <button
                      className="conversation-menu__item"
                      type="button"
                      role="menuitem"
                      disabled={!conversation.length}
                      onClick={handleExportConversation}
                    >
                      <Download size={15} aria-hidden="true" />
                      <span>Export as Markdown</span>
                    </button>
                    <button
                      className="conversation-menu__item conversation-menu__item--danger"
                      type="button"
                      role="menuitem"
                      disabled={!conversation.length || isGenerating}
                      onClick={() => setClearConfirmationOpen(true)}
                    >
                      Clear current conversation
                    </button>
                  </>
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
            autoFocus
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
                <p>General preferences.</p>
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

            <button className="settings-secondary-action" type="button" onClick={runWelcomeAgain}>
              Run Welcome Again...
            </button>

            {selectedModelMissing ? (
              <p className="settings-warning">
                The saved model is not currently installed. Choose an available Ollama model from the header.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
      </div>
      </>
      )}
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

function joinSystemValue(primary?: string | null, secondary?: string | null) {
  return [primary, secondary].filter(Boolean).join(" ") || null;
}

function formatCount(value: number) {
  return Number.isFinite(value) && value > 0 ? value.toLocaleString() : null;
}

function formatMemoryPair(available?: number | null, total?: number | null) {
  if (available && total) {
    return `${formatBytes(available)} available of ${formatBytes(total)}`;
  }
  return formatBytes(total ?? available);
}

function formatBytes(value?: number | null) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex <= 1 || size >= 10 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function formatUnavailableFields(fields: SystemCheckField[]) {
  const labels: Record<SystemCheckField, string> = {
    operatingSystem: "operating system",
    operatingSystemVersion: "operating system version",
    cpuName: "CPU name",
    totalMemory: "total memory",
    availableMemory: "available memory",
    gpuInformation: "GPU information",
    dataDiskAvailable: "Aether data disk space"
  };

  return fields.map((field) => labels[field]).join(", ");
}

function getOllamaPanelState(
  status: OllamaStatus
): "ready" | "noModels" | "installedStopped" | "notInstalled" | "partial" {
  if (!status.serviceReachable) {
    return status.installationDetected ? "installedStopped" : "notInstalled";
  }
  if (status.unavailableFields.length) {
    return "partial";
  }
  if (!status.modelsInstalled) {
    return "noModels";
  }
  return "ready";
}

function formatModelCount(count: number) {
  if (!Number.isFinite(count) || count <= 0) {
    return "0 models";
  }
  return count === 1 ? "1 model" : `${count.toLocaleString()} models`;
}

function formatOllamaUnavailableFields(fields: OllamaStatusField[]) {
  const labels: Record<OllamaStatusField, string> = {
    installation: "installation detection",
    version: "version",
    models: "model details"
  };

  return fields.map((field) => labels[field]).join(", ");
}

function openOllamaDownloadPage() {
  window.open("https://ollama.com/download", "_blank", "noopener,noreferrer");
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
  activeConversationCreatedAt: string | null,
  activeConversationTitle: string | null
): StoredConversation {
  const id = activeConversationId || crypto.randomUUID();
  const createdAt = activeConversationCreatedAt || conversation[0]?.createdAt || new Date().toISOString();
  const updatedAt = new Date().toISOString();

  return {
    id,
    title: activeConversationTitle || buildConversationTitle(conversation),
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

export function buildConversationExportMarkdown(
  conversation: ConversationMessage[],
  title: string,
  selectedModel: string
) {
  const lines = [
    `# ${title.trim() || "Aether conversation"}`,
    "",
    `Exported: ${new Date().toISOString()}`,
    `Model: ${selectedModel}`,
    ""
  ];

  conversation.forEach((message, index) => {
    if (index > 0) {
      lines.push("---", "");
    }

    const speaker = message.role === "user" ? "You" : "Nova";
    lines.push(`## ${speaker} - ${message.createdAt}`);

    if (message.status && message.status !== "complete") {
      lines.push("", `Status: ${message.status}`);
    }

    if (message.attachmentName) {
      lines.push("", `Attachment: ${message.attachmentName}`);
    }

    lines.push("", message.content.trimEnd(), "");
  });

  return `${lines.join("\n").trimEnd()}\n`;
}

function slugifyFileName(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug || "aether-conversation";
}

function formatConversationSummary(summary: ConversationSummary) {
  const messageLabel = summary.messageCount === 1 ? "1 message" : `${summary.messageCount} messages`;
  const date = new Date(summary.updatedAt);
  if (Number.isNaN(date.getTime())) {
    return messageLabel;
  }

  return `${messageLabel} · ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  })}`;
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
    firstRun: settings.firstRun ?? false,
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
    return "Aether accepts one UTF-8 text or code file.";
  }

  if (file.size > maxAttachmentBytes) {
    return "Aether accepts one text/code file up to 1 MB.";
  }

  return null;
}

function estimateContextCount(message: string, attachment: AttachmentContext | null) {
  const characters = message.length + (attachment?.content.length ?? 0);
  return Math.max(0, Math.ceil(characters / 4));
}
