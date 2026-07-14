import { FormEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, Paperclip, Send, Settings } from "lucide-react";

const placeholderModel = {
  name: "qwen3:8b",
  status: "Ready"
};

export function App() {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    composerRef.current?.focus();
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <main className="aether-shell" aria-label="Aether">
      <header className="app-header">
        <div className="identity" aria-label="Application identity">
          <span className="app-name">Aether</span>
          <span className="assistant-name">Nova</span>
        </div>

        <div className="header-actions" aria-label="Application controls">
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

        <button className="send-button" type="submit">
          <span>Send</span>
          <Send size={16} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </form>
    </main>
  );
}
