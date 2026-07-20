# Release Notes v0.2.0

Project Aether v0.2.0 makes Nova conversations persistent, organized, searchable, and exportable.

## Highlights

* Added SQLite-backed local conversation storage.
* Added schema version tracking for future storage migrations.
* Saved structured conversation and message records with roles, timestamps, active model, metadata, and completion states.
* Added automatic conversation persistence and reload after restart.
* Added a conversation sidebar with recent conversations.
* Added new chat, conversation switching, rename, and delete with confirmation.
* Added current conversation export as Markdown.
* Upgraded Markdown rendering with GitHub-Flavored Markdown support, syntax-highlighted code blocks, copy buttons, tables, task lists, blockquotes, and streaming-safe rendering.
* Added a Markdown showcase conversation for visual regression testing.
* Added basic local conversation search across titles and saved message content.

## Validation

Validated on Windows/Envy for v0.2.0:

* Frontend tests passed.
* Rust tests passed.
* Production frontend build passed.
* Tauri release build passed.
* Release executable launch smoke passed.
* MSI and NSIS installer bundles generated.

## Deferred

The following remain intentionally outside v0.2.0:

* Semantic search.
* Long-term memory.
* Tool calling.
* Agents and automation.
* Multi-device sync.
* Full backup and restore UI.
