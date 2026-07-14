# Technology Stack

This is the initial v0.1 stack decision and can be revised before implementation begins.

* Desktop framework: Tauri.
* UI: React, TypeScript, and Vite.
* Backend/core: Rust.
* First local model provider: Ollama.
* v0.1 storage: human-readable configuration files and structured local logs.
* Persistent storage: SQLite begins with conversation history in v0.2 or when the need becomes clear.

The UI must not call Ollama directly. Requests flow through Tauri commands/events, the Rust backend, the Conversation Engine, and the Model Provider interface before reaching Ollama.

Tauri is preferred over PySide6 for Aether because the project is intended to become a long-lived, cross-platform, polished chat application with a modern reusable interface and a strong native backend.
