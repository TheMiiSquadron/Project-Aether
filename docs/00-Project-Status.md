# Project Status

**Status:** Living Document  
**Current Phase:** Implementation  
**Current Status:** Completing the remaining v0.1 polish sequence for a polished local chat application  
**Current Target:** v0.1  
**Last Completed Milestone:** Add streaming responses  
**Next Milestone:** Markdown Rendering

Project Aether is being developed design-first. The v0.1 experience, architecture, responsibilities, data model, event model, settings, and UI direction were validated before code was scaffolded.

The v0.1 architecture is frozen for implementation. Future ideas that are not required to implement the frozen v0.1 scope should move to later roadmap planning rather than expanding the first release.

The initial scaffold includes the Tauri, React, TypeScript, Vite, and Rust project structure plus Nova's empty-state shell. The current Ollama milestone adds a streaming request path through the frozen architecture:

```text
UI -> Conversation Engine -> Model Provider -> Ollama provider
```

The composer can send one message at a time, display the user message, show a generating state, stream assistant chunks into the active Nova message, stop an active generation, and render completed, cancelled, or failed responses with normalized application states.

Nova's initial identity layer lives in `prompts/nova-system-prompt.md`. The Conversation Engine prepends that concise system prompt before the first user message so the selected local model understands that the assistant's name is Nova and that it is part of Project Aether.

For this milestone, Aether uses a single static model value, `llama3.2:latest`, because that model is installed on Orion. The remaining v0.1 work is now organized as a polish sequence: Markdown Rendering, Code Experience, Model Discovery, Error Polish, Text Attachments, Settings Persistence, and Small UX Polish.

The next implementation milestone is Markdown Rendering. Memory, tools, conversation history, Portal integration, agents, automation, and other future roadmap features remain intentionally deferred beyond v0.1.
