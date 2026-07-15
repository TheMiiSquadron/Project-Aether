# Roadmap

Status: Planning  
Version: Draft 0.1  
Last Updated: 2026-07-15

## Version Roadmap

* v0.1 — Chat interface \+ local model  
* v0.2 — Conversation history  
* v0.3 — Memory  
* v0.4 — Tool system  
* v0.5 — Coding assistant  
* v0.6 — Portal integration  
* v0.7 — Multi-device awareness  
* v0.8 — Agents  
* v0.9 — Automation  
* v1.0 — A mature personal AI platform


## v0.2 — Conversation History and Persistence

### Goal

Aether v0.2 makes conversations persistent, organized, searchable, and recoverable.

The core promise is trust: if Alex has an important conversation with Nova, Aether should preserve it clearly and make it easy to return to later.

### Included

* Saved conversations persisted locally.
* Conversation sidebar with new chat, recent conversations, rename, and delete with confirmation.
* Conversation titles, starting with simple automatic titles based on the first user message.
* Basic local search across conversation titles and message text.
* Storage foundation for persistent conversation data, likely SQLite behind the existing Storage boundary.
* Migration and backup-minded storage decisions that avoid trapping data in an opaque format.
* Export current conversation as Markdown.

### Deliberately Deferred

* Long-term memory.
* Tool calling.
* General file access.
* Coding actions.
* Portal integration.
* Multi-device sync.
* Agents.
* Automation.

### Definition of Done

1. Conversations survive app restart.
2. No messages are lost when Aether closes normally.
3. Failed, cancelled, and partial generations are saved with clear states.
4. Deleting a conversation requires confirmation.
5. Renaming and switching conversations do not silently interrupt active generation.
6. Storage errors are shown clearly and do not corrupt existing conversations.
7. Aether remains responsive with a reasonable number of saved conversations.
8. The current conversation can be exported as Markdown.

### Implementation Notes

v0.2 should extend the existing architecture rather than bypass it. The UI should ask the Conversation Engine and Storage layer for conversation state; it should not read or write database files directly.

SQLite is the preferred storage direction for v0.2, but it should remain behind the Storage boundary so future migrations, exports, and backups remain manageable.

See [v0.2 — Conversation History](docs/13-v0.2-Conversation-History.md) for the focused planning document.

## v0.1 — First Conversation

### Goal

Nova can hold a reliable, streaming conversation using a local AI model.

### Included

* Desktop chat interface
* Ollama connection
* Local model detection
* Model selection
* Streaming responses
* Markdown rendering
* Code blocks
* User-initiated text/code attachment context
* Copy response
* Stop generation
* Clear conversation
* Basic settings
* Graceful offline/error states

### Deliberately Deferred

* Permanent conversation history
* Long-term memory
* Tools/general file access
* Coding actions
* Portal integration
* Agents
* Voice
* Automation

### Definition of Done

1. Alex can launch Aether on Nova.
2. Aether shows whether Ollama is available.
3. Alex can select an installed model.
4. Alex can send Nova a message.
5. Nova's response streams into the interface.
6. Alex can stop a response while it is generating.
7. Alex can hold a multi-message conversation during the current session.
8. Alex can close the app without crashes or corrupted settings.
9. Aether explains connection or model errors with a clear message.

### Remaining v0.1 Milestones

These milestones complete `v0.1 — First Conversation` as a polished local chat application. They should be implemented in order and should not expand v0.1 into conversation history, memory, general tools, Portal integration, agents, automation, or other future roadmap features.

**Implementation status:** complete and validated on macOS/Orion and Windows/Envy. NOVA validation is deferred to later high-performance testing.

#### 1. Markdown Rendering

* Headers
* Lists
* Tables
* Links
* Block quotes
* Inline code
* Fenced code blocks

#### 2. Code Experience

* Syntax highlighting
* Copy Code button
* Readable monospace presentation
* Long-line handling and horizontal scrolling where appropriate

#### 3. Model Discovery

* Detect installed Ollama models
* Populate the existing model selector
* Allow selecting the active model
* Preserve the provider abstraction

#### 4. Error Polish

* Friendly, actionable states for Ollama unavailable, model missing, timeout, and provider failure
* Technical details limited to Developer Mode/logs

#### 5. Text Attachments

* Implement the already frozen v0.1 attachment scope only
* One UTF-8 text/code file up to 1 MB
* Supported extensions as already documented
* User-provided context only, not general file tools

#### 6. Settings Persistence

* Persist the implemented v0.1 settings only, including theme, selected model, font size, composer style, and optional character/context counter where supported
* Use the documented Tauri config/data location and human-readable format

#### 7. Small UX Polish

* Scrolling behavior
* Keyboard/focus handling
* Loading/generation transitions
* Minor spacing and interaction refinements
* No new feature scope

### v0.1 Release Candidate

Before tagging `v0.1.0`, confirm:

* [x] All frozen v0.1 features implemented
* [x] Tests passing
* [x] No known major bugs
* [x] Documentation current
* [x] Reproducible macOS build
* [x] Windows build and core functionality validated on Envy
* [x] Release notes prepared
* [x] Git tag created for v0.1.0
