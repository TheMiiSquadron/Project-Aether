# Project Status

**Status:** Living Document
**Current Phase:** v0.2 Implementation
**Current Status:** v0.2.0-0 in active development after the v0.1.0 release
**Current Target:** v0.2.0
**Last Completed Milestone:** Current conversation Markdown export
**Next Milestone:** Basic local conversation search

Project Aether is being developed design-first. The v0.1 experience, architecture, responsibilities, data model, event model, settings, and UI direction were validated before code was scaffolded.

The v0.1 architecture is frozen for implementation. Future ideas that are not required to implement the frozen v0.1 scope should move to later roadmap planning rather than expanding the first release.

The app includes the Tauri, React, TypeScript, Vite, and Rust project structure plus Nova's empty-state shell. The current v0.1 implementation uses a streaming request path through the frozen architecture:

```text
UI -> Conversation Engine -> Model Provider -> Ollama provider
```

The composer can send one message at a time, display the user message, show a generating state, stream assistant chunks into the active Nova message, stop an active generation, and render completed, cancelled, or failed responses with normalized application states.

Nova's initial identity layer lives in `prompts/nova-system-prompt.md`. The Conversation Engine prepends that concise system prompt before the first user message so the selected local model understands that the assistant's name is Nova and that it is part of Project Aether.

Aether now discovers installed Ollama models, allows selecting the active model, renders Markdown and code blocks, supports one user-selected UTF-8 text/code attachment up to 1 MB, persists implemented v0.1 settings, shows friendly provider errors, and keeps diagnostics limited to Developer Mode.

Memory, tools, Portal integration, agents, automation, and other future roadmap features remain intentionally deferred beyond v0.2. Conversation history and persistence are now the active v0.2 implementation focus.

Release notes are prepared in [Release Notes v0.1.0](Release-Notes-v0.1.0.md). The v0.1.0 release checklist is complete after macOS/Orion validation, Windows/Envy validation, and final release tagging.

Since v0.1.0, Aether has added the first v0.2 implementation pieces: a SQLite-backed conversation storage layer, schema versioning, structured saved conversation/message types, active conversation load/save commands, automatic active conversation persistence in the UI, a conversation sidebar, new chat, conversation switching, rename/delete flows, upgraded GFM rendering, and current conversation Markdown export.

NOVA remains the intended high-performance runtime for larger-model, GPU, and long-session validation after the v0.1 release. It is not required to validate the v0.1 Windows app build.

The v0.2 scope is documented in [v0.2 — Conversation History](13-v0.2-Conversation-History.md). Its purpose is to make conversations persistent, organized, searchable, and recoverable before Aether moves into long-term memory or tools.
