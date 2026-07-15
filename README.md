# Project Aether

Project Aether is a local-first, extensible AI platform designed to power Nova and integrate with Alex Markham's software ecosystem.

Nova is the AI personality users interact with. Aether is the platform underneath: the conversation engine, model providers, memory, tools, plugins, settings, and storage that make Nova possible.

Status: streaming Ollama conversation path implemented with Nova identity prompt

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

Validate the scaffold:

```sh
npm test
npm run build
cd src-tauri && cargo test
```

The current implementation uses the frozen v0.1 streaming request path:

```text
UI -> Conversation Engine -> Model Provider -> Ollama provider
```

For the first local conversation milestone, the selected static model is `llama3.2:latest`.

Nova's initial identity is defined in [prompts/nova-system-prompt.md](prompts/nova-system-prompt.md). The Conversation Engine prepends that prompt to new requests before sending them through the Model Provider.

Streaming responses are delivered from Rust to the React UI as normalized conversation stream events: started, chunk, completed, cancelled, and failed. The UI updates the active assistant message incrementally and lets the Send button become Stop during generation.

## Documentation

* [Project Status](docs/00-Project-Status.md)
* [Roadmap](ROADMAP.md)
* [Mission and Principles](docs/01-Mission-and-Principles.md)
* [Nova Personality](docs/02-Nova-Personality.md)
* [v0.1 — First Conversation](docs/03-v0.1-First-Conversation.md)
* [High-Level Architecture](docs/04-High-Level-Architecture.md)
* [Subsystem Responsibilities](docs/05-Subsystem-Responsibilities.md)
* [Technology Stack](docs/06-Technology-Stack.md)
* [Initial Interface Contracts](docs/07-Initial-Interface-Contracts.md)
* [Conceptual Data Model](docs/08-Conceptual-Data-Model.md)
* [Event Model](docs/09-Event-Model.md)
* [UX Philosophy](docs/10-UX-Philosophy.md)
* [UI Design](docs/11-UI-Design.md)
* [Settings Design — v0.1](docs/12-Settings-Design-v0.1.md)
* [Architecture Freeze Review v0.1](docs/Architecture-Freeze-Review-v0.1.md)

The original living design document has been split into focused documentation files. Existing links can still start from [Project Aether - 'Nova' AI.md](Project%20Aether%20-%20'Nova'%20AI.md).
