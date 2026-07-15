# Project Status

**Status:** Living Document  
**Current Phase:** Implementation  
**Current Status:** First non-streaming Ollama conversation path implemented  
**Current Target:** v0.1  
**Last Completed Milestone:** Connect Nova to Ollama for a single non-streaming request/response  
**Next Milestone:** Review the first real local conversation in the native app before adding streaming or model discovery

Project Aether is being developed design-first. The v0.1 experience, architecture, responsibilities, data model, event model, settings, and UI direction were validated before code was scaffolded.

The v0.1 architecture is frozen for implementation. Future ideas that are not required to implement the frozen v0.1 scope should move to later roadmap planning rather than expanding the first release.

The initial scaffold includes the Tauri, React, TypeScript, Vite, and Rust project structure plus Nova's empty-state shell. The first Ollama milestone adds a minimal non-streaming request path through the frozen architecture:

```text
UI -> Conversation Engine -> Model Provider -> Ollama provider
```

The composer can send one message at a time, display the user message, show a generating state, and render the completed assistant response or a friendly actionable error.

For this milestone, Aether uses a single static model value, `llama3.2:latest`, because that model is installed on Orion. Model discovery, model switching, streaming, attachments, settings persistence, logging, Markdown rendering, memory, tools, and conversation history remain intentionally deferred until later v0.1 implementation milestones.
