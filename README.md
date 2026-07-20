# Project Aether

Project Aether is a local-first, extensible AI platform designed to power Nova and integrate with Alex Markham's software ecosystem.

Nova is the AI personality users interact with. Aether is the platform underneath: the conversation engine, model providers, memory, tools, plugins, settings, and storage that make Nova possible.

Status: v0.2.0-0 in active development after the v0.1.0 release validated on macOS/Orion and Windows/Envy.

## Development

Install dependencies:

```sh
npm install
```

Run the web development shell:

```sh
npm run dev
```

Run the Tauri desktop app:

```sh
npm run tauri -- dev
```

Validate the app:

```sh
npm test
npm run build
cd src-tauri && cargo test
cd src-tauri && cargo fmt --check
npm run tauri -- build
```

The current implementation uses the frozen v0.1 streaming request path plus the first v0.2 persistence foundation:

```text
UI -> Conversation Engine -> Model Provider -> Ollama provider
```

For v0.1, Aether discovers installed Ollama models and lets the active model be selected from the compact model/status control.

Nova's initial identity is defined in [prompts/nova-system-prompt.md](prompts/nova-system-prompt.md). The Conversation Engine prepends that prompt to new requests before sending them through the Model Provider.

Streaming responses are delivered from Rust to the React UI as normalized conversation stream events: started, chunk, completed, cancelled, and failed. The UI updates the active assistant message incrementally and lets the Send button become Stop during generation.

The v0.1 app includes Markdown rendering, code blocks with copy actions, user-initiated text/code attachments, persisted settings, friendly provider errors, and the frozen Nova conversation shell.

The current v0.2 alpha work adds SQLite-backed conversation storage, multiple saved conversations, a conversation sidebar, new chat, conversation switching, rename/delete flows, Markdown export, upgraded GFM rendering, and basic local conversation search.

## Documentation

* [Project Status](docs/00-Project-Status.md)
* [Roadmap](ROADMAP.md)
* [Mission and Principles](docs/01-Mission-and-Principles.md)
* [Nova Personality](docs/02-Nova-Personality.md)
* [v0.1 — First Conversation](docs/03-v0.1-First-Conversation.md)
* [v0.2 — Conversation History](docs/13-v0.2-Conversation-History.md)
* [High-Level Architecture](docs/04-High-Level-Architecture.md)
* [Subsystem Responsibilities](docs/05-Subsystem-Responsibilities.md)
* [Technology Stack](docs/06-Technology-Stack.md)
* [Initial Interface Contracts](docs/07-Initial-Interface-Contracts.md)
* [Conceptual Data Model](docs/08-Conceptual-Data-Model.md)
* [Event Model](docs/09-Event-Model.md)
* [UX Philosophy](docs/10-UX-Philosophy.md)
* [UI Design](docs/11-UI-Design.md)
* [Settings Design — v0.1](docs/12-Settings-Design-v0.1.md)
* [Future Device Platform Vision](docs/15-Future-Device-Platform-Vision.md)
* [Architecture Freeze Review v0.1](docs/Architecture-Freeze-Review-v0.1.md)
* [Release Notes v0.1.0](docs/Release-Notes-v0.1.0.md)

The original living design document has been split into focused documentation files. Existing links can still start from [Project Aether - 'Nova' AI.md](Project%20Aether%20-%20'Nova'%20AI.md).
