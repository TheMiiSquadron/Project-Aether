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
