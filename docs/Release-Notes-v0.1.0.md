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
* Final UI polish for Markdown typography, code-block presentation, unified composer controls, and minimum-height responsive layout.

## Final Polish Commits

The v0.1 release candidate includes the following post-implementation polish commits:

* `b2fbce2` — Polish Markdown typography
* `e57dee6` — Prefer code blocks for generated files
* `dd8e186` — Polish code block presentation
* `1f56f8b` — Unify composer controls
* `f57b0b7` — Refine composer bottom spacing
* `9cc812c` — Improve minimum-height responsive layout

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
* [ ] Windows build and core functionality validated on Envy
* [x] Release notes prepared
* [ ] Git tag created for v0.1.0

## Windows Validation Target

Envy is the v0.1 Windows validation machine. The release checklist should be marked complete after Envy confirms:

* `npm test`
* `npm run build`
* `cargo test` from `src-tauri`
* `cargo fmt --check` from `src-tauri`
* `npm run tauri -- build`
* Aether launches on Windows
* Ollama model discovery finds the installed baseline models
* Model switching works
* Streaming and Stop work
* Markdown, code blocks, Copy Code, text attachments, settings persistence, theme persistence, clear conversation, generated-file code-block behavior, long responses, and scrolling behave as expected

NOVA validation is deferred to future high-performance testing for larger models, GPU behavior, and sustained long-session use.
