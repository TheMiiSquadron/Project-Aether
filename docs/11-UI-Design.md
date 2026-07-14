# UI Design — v0.1

Status: Draft 0.1

This document describes the first implementation target for Aether's v0.1 interface. It may evolve as the project moves from design into implementation, testing, and daily use.

This document intentionally avoids pixel-perfect mockups because UX principles take precedence over implementation details at this stage.

## Window Layout

Aether v0.1 opens directly into Nova's conversation window.

The layout is divided into three primary regions:

* Header
* Conversation Area
* Message Composer

The window should feel focused and immediate. A user should understand the current provider status, selected model, and next available action without navigating through menus or setup screens.

Conceptual layout:

```text
┌──────────────────────────────────────────────────────────┐
│ Aether                                      🟢 qwen3:8b ▼ │
│ Nova                                                   ⚙ │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                                                          │
│                         Nova                             │
│                                                          │
│               What would you like to work on?            │
│                                                          │
│                                                          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Message Nova...                                    Send │
└──────────────────────────────────────────────────────────┘
```

## Header

The header provides lightweight orientation without becoming a command center.

It should include:

* Aether/Nova identity
* Combined model and provider readiness control
* Settings button

The header should avoid a traditional menu-heavy interface. Aether should not feel like a dense desktop utility in v0.1. Menus may exist where the operating system expects them, but the primary experience should remain conversation-first.

## Window Behavior

Aether v0.1 should use a standard native title bar rather than custom window chrome.

The window should be resizable.

Initial sizing targets:

* Default size: approximately 1100 x 750.
* Minimum size: approximately 800 x 600.

The app should restore the previous window size on launch while still opening into a new empty conversation.

### Model & Status Control

Aether v0.1 should place a single compact control in the top-right corner of the window for model selection and provider readiness.

The control combines:

* Provider readiness indicator
* Current model name
* Dropdown affordance

Default appearance example:

```text
🟢 qwen3:8b ▼
```

Status colors:

* Green = Ready
* Yellow = Connecting
* Red = Unavailable

The control should avoid labels such as `Connected` and should not expose technical implementation details in normal use.

The purpose of the control is to answer one question: "Can I talk to Nova right now, and which model am I using?"

Selecting the control opens a lightweight popover.

The popover displays:

* Provider name, such as Ollama
* Available models
* Current model indicator
* A final action such as `Manage Models...`

The popover should remain intentionally minimal. It should not expose provider diagnostics or developer-oriented information during normal use.

UX note: model selection and provider readiness are intentionally combined into one control. This reduces visual clutter while keeping the essential readiness and model information always visible.

### Manage Models

For v0.1, `Manage Models...` opens a simple local guidance dialog with installation and help information for Ollama models.

This dialog may include common commands and guidance for installing or refreshing local models, but it is not a full model manager. Downloading, deleting, updating, and organizing models are deferred.

## Conversation Area

The conversation area is the visual focus of the application.

It should support:

* Empty state greeting
* Streaming responses
* Markdown
* Code blocks
* Error states
* Cancelled generation states

The empty state should feel complete rather than unfinished. It should introduce Nova with minimal text and invite the user to begin.

During generation, Nova's response should stream into the conversation naturally. Markdown and code blocks should render clearly as content arrives or immediately after generation completes.

Errors and cancelled responses should appear in context so the user understands what happened without leaving the conversation.

### Empty State Experience

The empty conversation is centered vertically and horizontally.

Aether v0.1 opens directly into a clean conversation view with no sidebar. The first screen should contain only the essential identity, greeting, and composer:

```text
Nova

Hello, Alex.

What's on the agenda today?
```

Beneath the greeting, the message composer should be visible with placeholder text similar to `Message Nova...`.

The text cursor should already be focused in the composer so the user can begin typing immediately without clicking.

No suggested prompts, onboarding cards, tutorials, news, or dashboard widgets are shown.

The empty state should feel like the beginning of a conversation rather than the beginning of a software session.

When the user sends the first message, the centered greeting gracefully disappears and the interface transitions into normal conversation mode, with the conversation aligned naturally for continued chat.

Design note: the greeting should remain calm, concise, and conversational. It should avoid overly enthusiastic onboarding language.

For v0.1, the greeting is fixed:

```text
Hello, Alex.

What's on the agenda today?
```

Custom greetings and display-name personalization are deferred.

## Message Composer

The message composer remains pinned to the bottom of the window and stays visible while the conversation scrolls.

The composer is the most frequently used control in Aether. It should prioritize comfort, speed, and simplicity over visual
novelty.

It should provide:

* Auto-growing multiline input
* Enter sends the message
* Shift+Enter inserts a newline
* Always-visible Send button for discoverability
* Send becomes Stop while Nova is generating
* Clear conversation in a secondary overflow menu

The composer should feel lightweight and reliable. Clear conversation should not compete visually with Send because it is less frequent and potentially disruptive.

Conceptual layout:

```text
┌────────────────────────────────────────────────────────────┐
│ +  Message Nova...                                   Send │
└────────────────────────────────────────────────────────────┘
```

### Attachments

The left side of the composer includes a compact `+` button for attachments.

For v0.1, attachments are user-initiated message context, not Tools or general file-access capabilities.

The user explicitly chooses or pastes text content. Aether may read that selected content into the current message context, but Nova cannot browse folders, search the filesystem, edit files, or access files independently.

Attachments are intentionally limited to a single UTF-8 text/code file up to 1 MB.

Supported examples include:

* `.txt`
* `.md`
* `.py`
* `.rs`
* `.ts`
* `.tsx`
* `.js`
* `.json`
* `.yaml`
* `.yml`
* `.toml`
* `.log`

Images, video, audio, and PDF attachments are intentionally deferred.

Unsupported files should produce a friendly, actionable message explaining that v0.1 only accepts one UTF-8 text/code file up to 1 MB.

Selecting `+` opens a lightweight attachment menu with minimal options, such as:

* Attach Text File...
* Paste Clipboard...

The attachment menu should remain intentionally minimal.

Design principle: **Support workflows before media.** Aether v0.1 is primarily a thinking and coding environment rather than a
multimedia chat client.

### Character Counter

A character or context counter is optional and disabled by default.

Users may enable it from Settings.

### Appearance

The message composer appearance should be configurable in Settings.

Supported styles:

* Rounded
* Subtle (default)
* Square

## Conversation Actions

Clear Conversation lives in a compact secondary overflow menu, such as `...`, away from the primary Send/Stop action.

Confirmation is enabled by default before clearing the current conversation.

Assistant messages expose a compact Copy action on hover or in an equivalent unobtrusive message action area.

## Sidebar

A sidebar is intentionally omitted from v0.1.

Persistent conversations are not implemented until a later version, so a sidebar would create empty interface structure before the underlying feature exists. Aether v0.1 should open into one temporary conversation.

## First Launch States

Aether should check Ollama automatically at launch and present one of three states.

### Ollama Available With Models

Aether opens directly to the normal empty conversation screen.

The selected or default model is ready, the model and status control shows a ready state, and the user can start typing immediately.

### Ollama Available Without Models

Aether explains that Ollama is available but no local models are installed.

The screen should provide a clear next step without technical clutter. The user should understand that Aether is working, but needs a model before Nova can respond.

### Ollama Unavailable

Aether presents a friendly setup screen rather than a technical failure.

Example:

```text
Nova needs a local model provider.

Aether could not connect to Ollama.

[Retry Connection]   [Setup Instructions]
```

The application should remain calm and useful even when setup is incomplete.

## Visual Direction

The initial visual direction is minimalist, calm, modern, and conversation-first.

Design targets:

* Dark mode default
* Warm near-black palette
* Soft borders
* Generous spacing
* Minimal animation
* Comfortable reading width
* Minimalist, conversation-first aesthetic

The interface should avoid pure black surfaces, harsh contrast, unnecessary decoration, and motion that does not clarify interaction.

Conversation content should use a comfortable reading width rather than stretching across the entire window.

## Design Direction

Aether's v0.1 interface should blend ChatGPT familiarity with Aether's own identity.

The experience should be familiar enough that a user immediately understands how to talk with Nova, while still feeling distinct, personal, and thoughtfully designed.

The agreed design philosophy is calm, modern, and distraction-free. Aether should feel like a focused place to talk with Nova, not a dashboard, terminal, or settings-heavy developer tool.
