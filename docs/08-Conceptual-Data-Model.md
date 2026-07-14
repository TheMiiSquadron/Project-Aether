# Conceptual Data Model

These entities describe the shared language of Aether v0.1. They are conceptual entities, not finalized Rust structs or database schemas.

## Conversation

Represents one active or saved chat session and remains independent of the storage format used to persist it.

**Fields**

* id
* title
* created_at
* updated_at
* messages
* selected_model
* metadata

## Message

Represents one item in a conversation, whether provided by the system, the user, or the assistant.

**Fields**

* id
* role (`system`, `user`, `assistant`)
* content
* timestamp
* status
* metadata

Initial message statuses are `pending`, `streaming`, `complete`, `cancelled`, and `error`.

## Model

Represents provider-neutral model metadata that the rest of the application can use without knowing provider-specific details.

**Fields**

* id
* display_name
* provider_id
* context_length
* supports_streaming
* available

## Provider

Represents a model provider, such as Ollama, and the normalized state Aether needs in order to use it.

**Fields**

* id
* display_name
* version
* status
* models
* capabilities

Initial provider statuses include `available`, `unavailable`, and `error`.

## Settings

Represents application configuration, not conversation history or long-term memory data.

**Fields**

* theme
* default_provider
* default_model
* font_size
* behavior_options
* developer_mode
