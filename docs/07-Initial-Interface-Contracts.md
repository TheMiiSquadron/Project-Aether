# Initial Interface Contracts

These contracts describe what each v0.1 component must be able to do without defining how it must be implemented.

## Conversation Engine

**Capabilities**

* Start a new in-memory conversation session.
* Add and order user, assistant, and system messages.
* Build the request context for the active model.
* Begin a streamed assistant response.
* Append streamed response chunks.
* Cancel the active generation.
* Clear or reset the current session.
* Expose current conversation state to the UI.

The Conversation Engine must not contain Ollama-specific code or persistence details.

## Model Provider

**Capabilities**

* Report provider availability and health.
* List installed or available models.
* Validate a selected model.
* Accept a normalized generation request.
* Stream normalized response events and chunks.
* Cancel generation when supported.
* Return normalized errors and status information.

Ollama is the first Model Provider implementation, not the interface itself.

## Storage

**Capabilities**

* Load and save v0.1 settings.
* Manage provider and model preferences.
* Write structured local logs.
* Expose stable load and save operations independent of file format.
* Reserve future support for conversations and memories.

Callers must not depend directly on JSON, SQLite, or hard-coded paths.

## UI

**Capabilities**

* Render conversation state and streamed output.
* Collect user input.
* Expose send, stop, clear, and model-selection actions.
* Display provider and model status and understandable errors.
* Dispatch user actions to the application layer.

The UI does not assemble prompts, call Ollama directly, or own persistence.

## Contract Rule

Components communicate through explicit interfaces and events. Implementation details must remain behind their owning subsystem.
