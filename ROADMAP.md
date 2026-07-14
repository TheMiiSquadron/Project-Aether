# Roadmap

Status: Planning  
Version: Draft 0.1  
Last Updated: 2026-07-14

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
