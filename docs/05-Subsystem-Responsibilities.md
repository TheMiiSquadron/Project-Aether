# Subsystem Responsibilities

## UI

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

## Conversation Engine

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

## Model Provider

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

## Storage

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

## v0.1 Request Flow

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
