# High-Level Architecture

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
