# Architecture Freeze Review v0.1

**Status:** Review Complete  
**Date:** 2026-07-14  
**Scope:** Documentation-only review before scaffolding the initial Tauri application.

## Executive Summary

Project Aether is close to ready for v0.1 scaffolding. The documentation provides a clear mission, focused v0.1 scope, strong subsystem boundaries, a defined technology stack, conceptual data and event models, UX principles, UI direction, and initial settings design.

The primary issue to resolve before implementation is the boundary between v0.1 text attachments and the roadmap's deferred `Tools/file access` item. This is the only finding that could reasonably cause two engineers to build materially different v0.1 behavior.

## Strengths

* The Aether/Nova separation is clear: Aether is the platform, Nova is the user-facing AI personality.
* The v0.1 goal is appropriately small: one local-model conversation experience, not the full long-term platform.
* UI, Conversation Engine, Model Provider, Storage, Settings, Memory, Tools, and Plugins have understandable boundaries.
* The UI is intentionally conversation-first, with no sidebar, no dashboard clutter, and no placeholder controls for future systems.
* The Model Provider layer keeps Ollama as the first implementation without hard-coding Ollama into the UI.
* The event model gives implementation a shared lifecycle for sending, streaming, cancelling, failing, and clearing messages.
* The settings design follows the rule that every v0.1 setting must correspond to real behavior.

## Ambiguities

1. **Text attachments vs. deferred file access.** `ROADMAP.md` and `docs/03-v0.1-First-Conversation.md` defer `Tools/file access`, while `docs/11-UI-Design.md` includes text-based attachments in v0.1. The project should clarify whether attaching text files is part of the chat input surface or deferred as file access.
2. **Attachment handling details.** If text attachments remain in v0.1, the docs do not yet define file size limits, encoding handling, max attachment count, whether content is inserted into the composer or attached as metadata, and how unsupported files are explained.
3. **Clear conversation placement.** Clear conversation is in v0.1 scope, but the UI only says it should be a secondary action. The exact location and confirmation behavior should be clarified before implementation.
4. **Copy response placement.** Copy response is in v0.1 scope, but the UI does not define where the control appears or whether it is shown persistently, on hover, or in a message action menu.
5. **Markdown streaming behavior.** The UI allows Markdown/code blocks to render as content arrives or after completion. This is acceptable as implementation flexibility, but it should be treated as an explicit implementation choice during scaffolding.
6. **Launch behavior setting.** Settings include launch behavior, but the available options and default are not defined.
7. **Model-management guidance.** The UI and settings mention `Manage Models...` or model-management guidance, but do not define whether this opens instructions, a local modal, an external Ollama page, or a future management screen.
8. **Greeting personalization.** Settings include greeting personalization, but the supported behavior is not defined beyond the current `Hello, Alex.` empty state.

## Missing Decisions

1. **Initial Tauri scaffold shape.** The docs define Tauri, React, TypeScript, Vite, Rust, and Ollama, but do not specify whether to use the current stable Tauri template defaults or a custom workspace layout.
2. **Minimum window behavior.** The docs do not define minimum window size, default window size, resizability, or titlebar style.
3. **Settings storage file.** Storage is intentionally abstracted, but scaffolding still needs a first concrete settings location and file format for v0.1.
4. **Log storage location.** Structured logs are in v0.1 settings, but log location, rotation, and default enabled state are not defined.
5. **Provider timeout and retry behavior.** First-launch states describe available, no models, and unavailable, but the timeout threshold and retry behavior are not specified.
6. **Error message tone and detail levels.** Developer settings can show diagnostic details, but normal-user error detail level is not yet defined.
7. **Accessibility baseline.** Accessibility is a principle, but implementation-specific baseline decisions such as focus order, reduced motion handling, and keyboard navigation targets are not yet documented.

## Contradictions

One contradiction or near-contradiction was found:

* The roadmap defers `Tools/file access`, while UI Design includes text-based attachments in v0.1. This may be resolvable by defining text attachments as message input rather than general file access, but the distinction should be made explicit before scaffolding.

No other direct contradictions were found.

## Scope Review

The v0.1 scope remains mostly disciplined. Permanent conversation history, long-term memory, tools, coding actions, Portal integration, agents, voice, automation, plugins, and advanced privacy settings are consistently deferred.

The main scope risk is text attachments. They may be valuable for coding workflows, but they introduce filesystem access, file validation, content sizing, unsupported-file handling, and privacy expectations. If retained in v0.1, they should be tightly specified as limited text-import into the current prompt rather than a general tool or file-access system.

The `Recent Files...` attachment menu item also risks implying a persistent recent-file system. Unless specifically required for v0.1, it should either be deferred or documented as optional future behavior.

## Recommendation

**Ready with Minor Clarifications**

Aether is ready to proceed toward scaffolding after a small clarification pass. The architecture is strong enough to scaffold the Tauri application, but the attachment/file-access boundary and a handful of UI placement/default decisions should be resolved before implementing interactive behavior.

## Prioritized Checklist

1. Clarify whether v0.1 includes text attachments or defers all file attachment behavior.
2. If text attachments remain in v0.1, define limits, accepted encodings, max file size, max file count, prompt insertion behavior, and unsupported-file errors.
3. Decide whether `Recent Files...` belongs in v0.1 or should be deferred.
4. Define where Clear Conversation lives and how confirmation works.
5. Define where Copy Response appears in the message UI.
6. Define default window size, minimum window size, resizability, and titlebar approach.
7. Define v0.1 settings storage format and location.
8. Define structured log defaults and log location.
9. Define launch behavior setting options and default.
10. Define normal-user vs. developer error detail levels.
11. Define the exact model-management guidance behavior for v0.1.
12. Define greeting personalization behavior or defer the setting.

## Remaining Clarification Count

12
