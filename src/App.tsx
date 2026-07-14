import { FormEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, Paperclip, Send, Settings, Square } from "lucide-react";

const placeholderModel = {
  name: "qwen3:8b",
  status: "Ready"
};

const appearancePresets = [
  { id: "crimson", label: "Crimson" },
  { id: "obsidian", label: "Obsidian" },
  { id: "observatory", label: "Observatory" }
] as const;

type AppearancePreset = (typeof appearancePresets)[number]["id"];

type ComposerActionButtonProps = {
  isGenerating?: boolean;
};

function ComposerActionButton({ isGenerating = false }: ComposerActionButtonProps) {
  const label = isGenerating ? "Stop" : "Send";
  const Icon = isGenerating ? Square : Send;

  return (
    <button className="send-button" type="submit" aria-label={label}>
      <span>{label}</span>
      <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}

export function App() {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  const [appearancePreset, setAppearancePreset] = useState<AppearancePreset>("crimson");

  useEffect(() => {
    composerRef.current?.focus();
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

      <section className="conversation-region" aria-label="Conversation">
        <div className="empty-state">
          <p className="nova-label">Nova</p>
          <h1>Hello, Alex.</h1>
          <p className="agenda">What's on the agenda today?</p>
        </div>
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
            }
          }}
          rows={1}
          placeholder="Message Nova..."
          aria-label="Message Nova"
        />

        <ComposerActionButton />
      </form>
    </main>
  );
}
