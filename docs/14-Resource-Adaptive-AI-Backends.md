# Resource-Adaptive AI Backends

**Status:** Planning  
**Target:** Future architecture

## Mission

Aether should run well on both powerful local workstations and minimal PCs.

The user-facing experience should still feel like Aether and Nova even when the selected AI backend changes.

## Hardware-Aware First Run

On first run, Aether should detect enough local hardware context to recommend a practical operating mode.

Detection should consider:

* RAM.
* CPU class.
* GPU availability and VRAM where available.
* Free storage.
* Operating system.
* Existing local AI runtimes, such as Ollama.

The first-run flow should explain the recommendation plainly and allow the user to override it.

## Backend Modes

Aether should support multiple backend modes behind the same Model Provider boundary.

* Cloud mode — uses a remote provider and avoids local model downloads. This should be the default recommendation for very limited PCs.
* Hybrid mode — uses lightweight local capabilities when practical and falls back to cloud providers for larger or slower tasks.
* Local mode — uses locally installed models and runtimes such as Ollama.
* Advanced mode — lets power users configure provider order, model choices, and fallback behavior explicitly.

The UI, Conversation Engine, and Nova identity layer should not depend on which mode is active.

## Interchangeable AI Providers

Ollama is the first provider implementation, not the platform contract.

Future providers may include:

* Ollama local.
* Cloud AI providers.
* LM Studio or compatible local runtimes.
* Local network providers.
* Future provider plugins.

Provider-specific details should remain behind the Model Provider interface. Conversation history, settings, memory, tools, and UI behavior should remain portable across providers where practical.

## Progressive Feature Tiers

Aether should enable features progressively based on available resources and backend capability.

* Minimal — chat, settings, conversation history, notes, and simple integrations.
* Standard — voice, lightweight local models, basic tools, and automation setup.
* Local Pro — larger local models, coding assistance, vision-capable workflows, and heavier context handling.
* Workstation — multiple models, local indexing, background agents, and advanced automation.

These tiers are planning labels, not product editions. They should guide defaults and feature availability without fragmenting the app identity.

## Model Download Recommendations

Aether should not download large models just because local AI is supported.

Download recommendations should account for:

* Total RAM and expected memory headroom.
* GPU and VRAM availability.
* CPU-only performance expectations.
* Free storage and model size.
* User preference for privacy, speed, cost, and offline use.

On low-resource machines, Aether should recommend cloud mode or small models, skip large downloads by default, and make the tradeoffs clear before any download starts.

## Graceful Fallback

Aether should degrade gracefully when the selected backend is unavailable, too slow, missing a model, or unsuitable for the current task.

Fallback behavior should include:

* Clear status and error messages.
* Suggestions that match the machine's detected limits.
* Optional provider switching when another configured backend can complete the request.
* No silent loss of conversations, settings, or user work.
* No automatic large downloads without confirmation.

## Separation Principle

Aether's personality and UI must remain independent of the chosen AI backend.

Nova is the conversational identity. Aether is the platform around that identity. The active model provider supplies intelligence through a replaceable backend, but it should not own Nova's identity, the chat interface, conversation storage, or future memory and tool systems.

This keeps Aether resilient as local hardware, model runtimes, and cloud providers change.
