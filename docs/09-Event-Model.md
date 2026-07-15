# Event Model

Events describe the initial v0.1 application lifecycle and the state changes components can react to.

* ConversationStarted occurs when a new conversation session begins and carries the conversation id, initial selected model, and timestamp.
* MessageSubmitted occurs when the user submits input and carries the conversation id, message id, role, content, and timestamp.
* GenerationStarted occurs when the Conversation Engine begins requesting an assistant response and carries the conversation id, assistant message id, provider id, model id, and timestamp.
* ResponseChunkReceived occurs when a streamed response fragment arrives and carries the conversation id, assistant message id, chunk content, and sequence information.
* MessageUpdated occurs when a message changes after creation and carries the conversation id, message id, updated content or status, and timestamp.
* GenerationCompleted occurs when an assistant response finishes successfully and carries the conversation id, assistant message id, final status, and timestamp.
* GenerationCancelled occurs when an active response is stopped before completion and carries the conversation id, assistant message id, cancellation source, and timestamp.
* GenerationFailed occurs when generation cannot complete and carries the conversation id, assistant message id when available, normalized error information, and timestamp.
* ProviderStatusChanged occurs when a provider's availability or health changes and carries the provider id, new status, optional status details, and timestamp.
* ModelSelectionChanged occurs when the active model changes and carries the conversation id when applicable, provider id, model id, and timestamp.
* ConversationCleared occurs when the current conversation is reset or cleared and carries the previous conversation id and timestamp.

## Event Rule

Events describe state changes. Components react only to events relevant to them, and provider-specific details must be normalized before entering the application event stream.

## Current Streaming Implementation

The v0.1 implementation currently emits normalized Tauri conversation stream events for the active assistant response:

* `started` indicates that provider generation has begun.
* `chunk` carries a provider-normalized text fragment.
* `completed` indicates the stream finished successfully.
* `cancelled` indicates the user stopped generation and the partial assistant message should remain visible.
* `failed` carries a friendly error payload with technical details kept out of the normal UI.

The React UI listens for those events, updates the active assistant message incrementally, and keeps Ollama-specific streaming payloads isolated inside the Ollama provider.
