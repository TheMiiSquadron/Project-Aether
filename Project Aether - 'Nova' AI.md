# Project Aether

Status: Planning  
Version: Draft 0.1  
Last Updated: 2026-07-14

## Nova AI Roadmap

## Mission Statement

Aether is a local-first, extensible AI platform designed to power Nova and seamlessly integrate with Alex Markham's software ecosystem.

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
* Copy response
* Stop generation
* Clear conversation
* Basic settings
* Graceful offline/error states

### Deliberately Deferred

* Permanent conversation history
* Long-term memory
* Tools/file access
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

## High-Level Architecture

```text
Aether
│
├── UI
│
├── Conversation Engine
│
├── Model Provider
│
├── Memory
│
├── Tools
│
├── Plugins
│
├── Settings
│
└── Storage
```

* UI — Presents the chat experience, settings, and future user-facing views.
* Conversation Engine — Manages active conversations, context, prompt flow, and response streaming.
* Model Provider — Connects Aether to local or remote AI models through a consistent interface.
* Memory — Stores durable knowledge Nova can use across conversations and sessions.
* Tools — Defines the actions Nova can request, such as file, Git, terminal, or app capabilities.
* Plugins — Allows external packages and integrations to extend Aether without changing the core.
* Settings — Holds user preferences, provider choices, and configurable behavior.
* Storage — Persists conversations, memories, settings, logs, and other application data.

## Subsystem Responsibilities

### UI

**Owns**

* Rendering application state.
* Displaying messages and streaming output.
* Collecting user input.
* Exposing controls such as send, stop, clear, and model selection.
* Presenting errors and status.

**Does Not Own**

* Building prompts.
* Calling Ollama directly.
* Managing persistence.
* Deciding what belongs in memory.
* Executing tools.

### Conversation Engine

**Owns**

* Current-session conversation state.
* Message ordering.
* Prompt assembly.
* Context-window preparation.
* Streaming lifecycle.
* Stop/cancel coordination.

**Does Not Own**

* Provider-specific API code.
* UI rendering.
* Direct data persistence.
* Long-term memory decisions.
* Tool execution.

### Model Provider

**Owns**

* Provider status checks.
* Listing available models.
* Sending prompts.
* Streaming responses.
* Cancelling generation where supported.
* Normalizing provider errors and results behind a generic interface.

Ollama is the first provider implementation for v0.1.

**Does Not Own**

* Conversation history.
* UI rendering.
* Application settings.
* Memory behavior.
* Unrelated tool actions.

### Storage

**Owns**

* Saving and loading application data through a stable abstraction.
* v0.1 settings and logs.
* Future support for conversations and memories.

Other subsystems should not depend directly on JSON, SQLite, or specific file paths.

**Does Not Own**

* Conversation behavior.
* Provider logic.
* UI behavior.
* Memory policy.

### v0.1 Request Flow

```text
User
  ↓
UI
  ↓
Conversation Engine
  ↓
Model Provider
  ↓
Ollama
```

Streamed responses return through the same layers in reverse.

## Technology Stack

This is the initial v0.1 stack decision and can be revised before implementation begins.

* Desktop framework: Tauri.
* UI: React, TypeScript, and Vite.
* Backend/core: Rust.
* First local model provider: Ollama.
* v0.1 storage: human-readable configuration files and structured local logs.
* Persistent storage: SQLite begins with conversation history in v0.2 or when the need becomes clear.

The UI must not call Ollama directly. Requests flow through Tauri commands/events, the Rust backend, the Conversation Engine, and the Model Provider interface before reaching Ollama.

Tauri is preferred over PySide6 for Aether because the project is intended to become a long-lived, cross-platform, polished chat application with a modern reusable interface and a strong native backend.

## Core Principles

• Local-first  
• Model-agnostic  
• Extensible through plugins  
• Privacy by default  
• Human-in-control  
• Conversation-first interface  
• Stable, incremental releases

## Project Structure

* Aether is the platform: the engine, systems, integrations, and shared foundation.
* Nova is the AI personality: the conversational identity the user interacts with.
* Aether should remain reusable across apps, while Nova can evolve as the user-facing experience.

## Nova Personality

### Configurable Blend

Nova adapts to the context of the conversation while maintaining a consistent identity.

### Modes

* Professional — Clear, concise, technical.  
* Collaborative — Brainstorms ideas and explores possibilities.  
* Creative — Helps with writing, design, and world-building.  
* Casual — Relaxed, conversational, and friendly.

Nova transitions naturally between these modes instead of requiring manual switching, while always remaining honest, respectful, and grounded.

Personality should never override accuracy.
