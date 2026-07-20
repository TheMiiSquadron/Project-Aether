mod conversation;
mod model_provider;
mod ollama;
mod settings;
mod shell;
pub mod storage;
mod system_check;

use conversation::{
    ActiveStreams, CancelStreamRequest, CancelStreamResponse, StartStreamResponse,
    SubmitMessageRequest, SubmitMessageResponse,
};
use model_provider::{AvailableModel, ProviderErrorPayload};
use settings::AppSettings;
pub use shell::{ShellMetadata, DEFAULT_GREETING, DEFAULT_MODEL_NAME, DEFAULT_PROMPT};
use std::fs;
use std::path::PathBuf;
use storage::{ConversationSummary, StoredConversation};
use system_check::SystemCheckResult;
use tauri::{AppHandle, Manager, State};

const ACTIVE_CONVERSATION_ID: &str = "active-conversation";
const CONVERSATION_DATABASE_FILE_NAME: &str = "conversations.sqlite";

fn conversation_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate Aether conversation storage: {error}"))?;

    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Could not create Aether conversation storage: {error}"))?;

    Ok(data_dir.join(CONVERSATION_DATABASE_FILE_NAME))
}

fn open_conversation_store(app: &AppHandle) -> Result<storage::ConversationStore, String> {
    storage::ConversationStore::open(conversation_database_path(app)?)
        .map_err(|error| format!("Could not open Aether conversation storage: {error}"))
}

#[tauri::command]
fn shell_metadata() -> ShellMetadata {
    ShellMetadata::default()
}

#[tauri::command]
async fn list_models() -> Result<Vec<AvailableModel>, ProviderErrorPayload> {
    use crate::model_provider::ModelProvider;

    let provider = ollama::OllamaProvider::local();
    provider
        .list_models()
        .await
        .map_err(ProviderErrorPayload::from)
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    settings::load_settings(app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    settings::save_settings(app, settings)
}

#[tauri::command]
fn run_system_check(app: AppHandle) -> Result<SystemCheckResult, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate Aether data storage: {error}"))?;

    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Could not prepare Aether data storage: {error}"))?;

    system_check::collect_system_check(&data_dir)
}

#[tauri::command]
fn load_active_conversation(app: AppHandle) -> Result<Option<StoredConversation>, String> {
    let store = open_conversation_store(&app)?;
    store
        .load_conversation(ACTIVE_CONVERSATION_ID)
        .map_err(|error| format!("Could not load Aether conversation: {error}"))
}

#[tauri::command]
fn list_conversations(app: AppHandle) -> Result<Vec<ConversationSummary>, String> {
    let store = open_conversation_store(&app)?;
    store
        .list_conversations()
        .map_err(|error| format!("Could not list Aether conversations: {error}"))
}

#[tauri::command]
fn search_conversations(app: AppHandle, query: String) -> Result<Vec<ConversationSummary>, String> {
    let store = open_conversation_store(&app)?;
    store
        .search_conversations(&query)
        .map_err(|error| format!("Could not search Aether conversations: {error}"))
}

#[tauri::command]
fn load_conversation(app: AppHandle, id: String) -> Result<Option<StoredConversation>, String> {
    let store = open_conversation_store(&app)?;
    store
        .load_conversation(&id)
        .map_err(|error| format!("Could not load Aether conversation: {error}"))
}

#[tauri::command]
fn save_conversation(app: AppHandle, conversation: StoredConversation) -> Result<(), String> {
    let mut store = open_conversation_store(&app)?;
    store
        .save_conversation(&conversation)
        .map_err(|error| format!("Could not save Aether conversation: {error}"))
}

#[tauri::command]
fn delete_conversation(app: AppHandle, id: String) -> Result<(), String> {
    let store = open_conversation_store(&app)?;
    store
        .delete_conversation(&id)
        .map(|_| ())
        .map_err(|error| format!("Could not delete Aether conversation: {error}"))
}

#[tauri::command]
fn rename_conversation(
    app: AppHandle,
    id: String,
    title: String,
    updated_at: String,
) -> Result<(), String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Conversation title cannot be empty.".to_string());
    }

    let store = open_conversation_store(&app)?;
    store
        .rename_conversation(&id, title, &updated_at)
        .map(|_| ())
        .map_err(|error| format!("Could not rename Aether conversation: {error}"))
}

#[tauri::command]
fn save_active_conversation(
    app: AppHandle,
    conversation: StoredConversation,
) -> Result<(), String> {
    let mut conversation = conversation;
    conversation.id = ACTIVE_CONVERSATION_ID.to_string();
    for message in &mut conversation.messages {
        message.conversation_id = ACTIVE_CONVERSATION_ID.to_string();
    }

    let mut store = open_conversation_store(&app)?;
    store
        .save_conversation(&conversation)
        .map_err(|error| format!("Could not save Aether conversation: {error}"))
}

#[tauri::command]
fn clear_active_conversation(app: AppHandle) -> Result<(), String> {
    let store = open_conversation_store(&app)?;
    store
        .delete_conversation(ACTIVE_CONVERSATION_ID)
        .map(|_| ())
        .map_err(|error| format!("Could not clear Aether conversation: {error}"))
}

#[tauri::command]
async fn submit_message(
    request: SubmitMessageRequest,
) -> Result<SubmitMessageResponse, ProviderErrorPayload> {
    conversation::submit_message(request).await
}

#[tauri::command]
fn start_streaming_message(
    app: AppHandle,
    active_streams: State<'_, ActiveStreams>,
    request: SubmitMessageRequest,
) -> Result<StartStreamResponse, ProviderErrorPayload> {
    conversation::start_streaming_message(app, active_streams.inner().clone(), request)
}

#[tauri::command]
fn cancel_streaming_message(
    active_streams: State<'_, ActiveStreams>,
    request: CancelStreamRequest,
) -> CancelStreamResponse {
    conversation::cancel_streaming_message(active_streams.inner().clone(), request)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ActiveStreams::default())
        .invoke_handler(tauri::generate_handler![
            shell_metadata,
            list_models,
            load_settings,
            save_settings,
            run_system_check,
            load_active_conversation,
            list_conversations,
            search_conversations,
            load_conversation,
            save_conversation,
            delete_conversation,
            rename_conversation,
            save_active_conversation,
            clear_active_conversation,
            submit_message,
            start_streaming_message,
            cancel_streaming_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aether");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_metadata_matches_frozen_empty_state() {
        let metadata = shell_metadata();

        assert_eq!(metadata.assistant_name, "Nova");
        assert_eq!(metadata.greeting, DEFAULT_GREETING);
        assert_eq!(metadata.prompt, DEFAULT_PROMPT);
        assert_eq!(metadata.model_name, DEFAULT_MODEL_NAME);
    }
}
