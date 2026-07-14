# Settings Design — v0.1

Status: Draft 0.1

This document defines the initial settings experience for Aether v0.1.

Settings should support real behavior in the first release without turning the application into a configuration dashboard. Every setting should help the user control how Aether behaves while preserving the conversation-first experience.

## General

General settings control basic application behavior that affects everyday use.

Included settings:

* Launch behavior
* Restore last selected model
* Confirm before clearing the current conversation

Purpose:

General settings should make Aether predictable when it opens, preserve the user's expected model choice, and protect against accidental loss of the current temporary conversation.

Default launch behavior:

* Open directly into a new empty conversation.
* Restore the previous window size.
* Restore the last selected model when available.

Complex startup modes, startup dashboards, and automatic conversation restoration are deferred.

## Appearance

Appearance settings control comfort, readability, and the shape of the primary interaction surface.

Included settings:

* Theme: Dark / Light / System
* Composer style: Rounded / Subtle (default) / Square
* Font size
* Optional character/context counter

Purpose:

Appearance settings should let users tune Aether for long sessions without changing the core layout or distracting from the conversation.

## Models

Model settings control provider readiness and model selection.

Included settings:

* Provider status
* Default provider
* Default model
* Refresh installed models
* Open model-management guidance

Purpose:

Model settings should help the user understand whether Nova can respond, choose which local model to use, and refresh or manage installed models without exposing unnecessary provider internals during normal chat.

## Behavior

Behavior settings control how the conversation interface responds to user actions.

Included settings:

* Enter sends
* Shift+Enter inserts newline
* Auto-scroll during streaming
* Greeting personalization

Purpose:

Behavior settings should make the chat experience feel natural while preserving the defaults expected by most users.

For v0.1, greeting personalization is fixed to the default empty-state greeting:

```text
Hello, Alex.

What's on the agenda today?
```

Custom greetings and display-name personalization are deferred.

## Developer

Developer settings expose diagnostic tools for troubleshooting and implementation work.

Included settings:

* Enable structured logs
* Open log folder
* Show diagnostic details in errors

Purpose:

Developer settings should remain out of the way during normal use, but available when Aether needs to be inspected, debugged, or verified during development.

Structured logs are minimal or off by default. When enabled, logs are stored in the standard application log directory.

Advanced logging controls, log rotation policy, and log retention settings are deferred.

Normal mode should show friendly, actionable error messages. Developer Mode may reveal technical diagnostics such as provider endpoints, raw error details, status codes, or stack traces when useful for debugging.

## Storage Defaults

v0.1 settings are stored as a human-readable JSON or TOML file in the standard Tauri application config/data directory.

The implementation may choose either JSON or TOML for the first release, but the file should remain inspectable and editable during development.

## Deferred Settings

The following settings categories are intentionally excluded from v0.1:

* Memory
* Plugins
* Tools
* Automation
* Advanced privacy settings

These systems do not yet exist in v0.1, so exposing settings for them would create placeholder controls without real behavior.

## Design Principle

Every setting in v0.1 must correspond to a real implemented capability.

Placeholder settings are not permitted.
