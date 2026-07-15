# Release Notes v0.1.0

**Status:** Release candidate notes  
**Target:** v0.1.0 — First Conversation

## Summary

Project Aether v0.1.0 establishes Nova as a polished local chat application powered by Ollama. This release focuses on one complete experience: launch Aether, choose a local model, talk to Nova, and receive streamed responses in a calm desktop interface.

## Highlights

* Native Tauri desktop application with React, TypeScript, Vite, and Rust.
* Nova empty state with the fixed greeting: `Hello, Alex.` and `What's on the agenda today?`
* Ollama-backed conversation path through the frozen architecture:

```text
UI -> Conversation Engine -> Model Provider -> Ollama provider
```

* Nova identity prompt injected by the Conversation Engine.
* Streaming responses with Stop/cancel behavior.
* Markdown rendering for headers, lists, tables, links, block quotes, inline code, and fenced code blocks.
* Code blocks with readable monospace styling, lightweight syntax highlighting, horizontal scrolling, and Copy Code action.
* Installed Ollama model discovery and active model selection.
* Friendly provider errors with technical diagnostics limited to Developer Mode.
* One user-provided UTF-8 text/code attachment up to 1 MB.
* Persisted v0.1 settings for theme, selected model, font size, composer style, context counter, and Developer Mode.
* Crimson, Obsidian, and Observatory visual themes.

## Intentionally Deferred

The following remain outside v0.1:

* Permanent conversation history
* Long-term memory
* General file tools or autonomous file access
* Coding actions
* Portal integration
* Multi-device awareness
* Agents
* Voice
* Automation
* Full model management
* Multimedia attachments

## Release Candidate Checklist

* [x] All frozen v0.1 features implemented
* [x] Tests passing
* [x] No known major bugs
* [x] Documentation current
* [x] Reproducible macOS build
* [ ] Windows build validated when NOVA is available
* [x] Release notes prepared
* [ ] Git tag created for v0.1.0
