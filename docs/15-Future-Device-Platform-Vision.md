# Future Device Platform Vision

Status: Planning  
Version: Draft 0.1  
Last Updated: 2026-07-17

## Purpose

Aether's long-term direction is larger than a local chat client. The platform can evolve from a conversation surface into a workspace, and eventually into a personal device operating layer that helps Nova understand and coordinate the user's devices, projects, utilities, and local capabilities.

This document captures future-facing ideas only. Nothing here changes the active v0.2 scope, which remains focused on conversation history and persistence.

## Product Direction

Aether's long-term evolution can be framed as:

1. **Conversation** — Nova can talk with the user through a polished local AI chat experience.
2. **Workspace** — Nova can preserve, organize, search, and resume the user's conversations and project contexts.
3. **Personal device operating layer** — Nova can understand device state, coordinate tools, surface useful context, and eventually help operate the user's personal computing environment.

The guiding question for future capabilities is:

> Does this help Nova help the user?

Aether should not add features merely because phones, tablets, or operating systems normally include them. Default-app-like capabilities only belong when Nova makes them meaningfully more useful, contextual, or integrated than a generic standalone utility.

## Theme-Aware Maps

Maps may eventually adapt visually to the active Aether theme.

Theme-aware maps should preserve map functionality while changing the visual atmosphere to match Aether's current environment:

* **Crimson** may influence dark surfaces, scarlet route highlights, warm labels, red pins, and subtle luminous accents.
* **Obsidian** may emphasize warm near-black terrain, minimal roads, muted labels, cream highlights, and restrained pins.
* **Observatory** may emphasize deep navy surfaces, cool water, blue route highlights, pale labels, and technical-looking markers.

Theme-aware maps should be treated as a future visual-system capability, not a v0.2 feature. The map should remain readable, accessible, and geographically accurate regardless of theme.

## Weather

Weather should be available conversationally through Nova.

Examples:

* "What's the weather tomorrow?"
* "Is this a good day to wash the Bel Air?"
* "Will it rain before I leave work?"

If useful later, weather may also appear as a compact contextual surface or card inside Aether. That surface should provide information Nova can reason about or personalize, not simply duplicate a generic weather app.

Aether should avoid building a standalone weather clone unless Nova adds meaningful context, planning value, or device/workspace integration.

## Default-App-Like Capabilities

Future candidate capabilities may include:

* Notes
* Calendar
* Calculator
* Maps
* Weather
* Downloads
* Similar small utilities

These should not be added just because they are common default apps on phones, tablets, or operating systems.

Each candidate should pass the guiding question:

> Does this help Nova help the user?

Examples of acceptable directions:

* **Notes** becomes useful if Nova can organize project ideas, summarize notes, and connect them to conversations.
* **Calendar** becomes useful if Nova can reason about time, reminders, project cadence, and availability.
* **Calculator** becomes useful if Nova can explain calculations, compare scenarios, and turn results into decisions.
* **Downloads** becomes useful if Nova can identify, summarize, organize, or route downloaded files.

If Nova does not improve the experience, the feature probably belongs outside Aether or should remain conversational.

## 3D Printing Support

3D printing support is a future concept and is explicitly deferred.

Possible future capabilities include:

* Printer presence and status
* Bed and nozzle temperatures
* Job progress
* Remaining time
* Material status
* Job pause, resume, cancel, or start controls
* Printer camera surfaces, where available
* STL or model preflight checks
* Support and overhang analysis
* Print readiness summaries

This should likely be implemented as a future tool or plugin rather than as core v0.x conversation functionality. Any job-control actions should require clear user intent and appropriate confirmation.

## Aethernet

**Aethernet** is the user-facing concept for Aether's personal device network.

Portal remains the underlying transport and integration engine. Aethernet is the product identity that describes the device layer exposed through Aether.

Aethernet may eventually represent:

* Connected Aether devices
* Device presence and availability
* Device health summaries
* File transfers
* Remote actions
* Portal-powered routing
* Future multi-device coordination

Example user-facing language:

```text
NOVA is online through Aethernet.
Orion is available.
Envy is sleeping.
Send this file to Orion.
```

Aethernet does **not** replace Ethernet, Wi-Fi, TCP/IP, Portal's transport implementation, or any existing networking protocol. It is a product identity for the personal device layer that Nova and Aether expose to the user.

## Roadmap Placement

These concepts should remain out of the active v0.2 implementation scope.

Suggested future homes:

* **Theme-aware maps** — future visual-system capability for Maps or workspace surfaces.
* **Weather** — future tool or workspace module; can begin conversationally before becoming a surface.
* **Default-app-like capabilities** — future workspace modules only when Nova adds meaningful value.
* **3D printing support** — future plugin/tool, likely after the general tool system exists.
* **Aethernet** — aligns naturally with Portal integration and multi-device awareness.

The existing roadmap already has natural places for several of these ideas:

* Portal integration can introduce the transport layer that powers Aethernet.
* Multi-device awareness can introduce Aethernet presence, device state, and coordination.
* The tool system can provide the foundation for weather, maps, downloads, and 3D printing.
* Workspace-oriented releases can decide whether notes, calendar, calculator, or similar surfaces deserve first-class treatment.

This document should inform future planning without forcing exact version numbers or renumbering the current roadmap.
