mod conversation;
mod model_provider;
mod model_recommendations;
mod ollama;
mod settings;
mod shell;
pub mod storage;
mod system_check;

use conversation::{
    ActiveStreams, CancelStreamRequest, CancelStreamResponse, StartStreamResponse,
    SubmitMessageRequest, SubmitMessageResponse,
};
use model_provider::{AvailableModel, CancellationToken, ProviderErrorPayload};
use model_recommendations::ModelRecommendationCatalog;
use ollama::{ModelDownloadProgress, OllamaStatus};
use serde::{Deserialize, Serialize};
use settings::AppSettings;
pub use shell::{ShellMetadata, DEFAULT_GREETING, DEFAULT_MODEL_NAME, DEFAULT_PROMPT};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use storage::{ConversationSummary, StoredConversation};
use system_check::SystemCheckResult;
use tauri::{AppHandle, Emitter, Manager, State};

const ACTIVE_CONVERSATION_ID: &str = "active-conversation";
const CONVERSATION_DATABASE_FILE_NAME: &str = "conversations.sqlite";
const MODEL_DOWNLOAD_PROGRESS_EVENT: &str = "model-download-progress";

#[derive(Clone, Default)]
struct ActiveModelDownloads {
    downloads: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelSelectionState {
    recommendations: ModelRecommendationCatalog,
    installed_models: Vec<AvailableModel>,
    selected_model: Option<String>,
    selected_model_installed: bool,
    fallback_model: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelSelectionRequest {
    selected_model: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelDownloadRequest {
    model: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartModelDownloadResponse {
    download_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CancelModelDownloadRequest {
    download_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CancelModelDownloadResponse {
    download_id: String,
    cancelled: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ModelDownloadEvent {
    Progress {
        download_id: String,
        model: String,
        progress: ModelDownloadProgress,
    },
    Completed {
        download_id: String,
        model: String,
    },
    Cancelled {
        download_id: String,
        model: String,
    },
    Failed {
        download_id: String,
        model: String,
        error: ProviderErrorPayload,
    },
}

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

fn build_model_selection_state(
    recommendations: ModelRecommendationCatalog,
    installed_models: Vec<AvailableModel>,
    selected_model: Option<String>,
) -> ModelSelectionState {
    let selected_model = selected_model.filter(|model| ollama::validate_model_name(model).is_ok());
    let selected_model_installed = selected_model
        .as_ref()
        .map(|selected| installed_models.iter().any(|model| model.name == *selected))
        .unwrap_or(false);
    let fallback_model = if selected_model_installed {
        selected_model.clone()
    } else {
        installed_models.first().map(|model| model.name.clone())
    };

    ModelSelectionState {
        recommendations,
        installed_models,
        selected_model,
        selected_model_installed,
        fallback_model,
    }
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
async fn model_selection_state(
    request: ModelSelectionRequest,
) -> Result<ModelSelectionState, ProviderErrorPayload> {
    use crate::model_provider::ModelProvider;

    let provider = ollama::OllamaProvider::local();
    let installed_models = provider
        .list_models()
        .await
        .map_err(ProviderErrorPayload::from)?;
    Ok(build_model_selection_state(
        model_recommendations::load_model_recommendations(),
        installed_models,
        request.selected_model,
    ))
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
async fn check_ollama_status() -> OllamaStatus {
    ollama::check_local_ollama_status().await
}

#[tauri::command]
fn start_ollama() -> Result<(), String> {
    ollama::start_local_ollama()
}

#[tauri::command]
fn start_model_download(
    app: AppHandle,
    active_downloads: State<'_, ActiveModelDownloads>,
    request: ModelDownloadRequest,
) -> Result<StartModelDownloadResponse, ProviderErrorPayload> {
    ollama::validate_model_name(&request.model)
        .map_err(model_provider::ProviderError::request_failed)
        .map_err(ProviderErrorPayload::from)?;

    let download_id = format!(
        "model-download-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default()
    );
    let cancellation = CancellationToken::default();
    active_downloads
        .downloads
        .lock()
        .map_err(|_| {
            model_provider::ProviderError::request_failed("Could not track the model download.")
        })
        .map_err(ProviderErrorPayload::from)?
        .insert(download_id.clone(), cancellation.clone());

    let downloads = active_downloads.inner().clone();
    let model = request.model;
    let download_id_for_task = download_id.clone();
    tauri::async_runtime::spawn(async move {
        let provider = ollama::OllamaProvider::local();
        let progress_app = app.clone();
        let progress_download_id = download_id_for_task.clone();
        let progress_model = model.clone();
        let result = provider
            .pull_model(&model, cancellation, move |progress| {
                let _ = progress_app.emit(
                    MODEL_DOWNLOAD_PROGRESS_EVENT,
                    ModelDownloadEvent::Progress {
                        download_id: progress_download_id.clone(),
                        model: progress_model.clone(),
                        progress,
                    },
                );
            })
            .await;

        if let Ok(mut active) = downloads.downloads.lock() {
            active.remove(&download_id_for_task);
        }

        match result {
            Ok(()) => {
                let _ = app.emit(
                    MODEL_DOWNLOAD_PROGRESS_EVENT,
                    ModelDownloadEvent::Completed {
                        download_id: download_id_for_task,
                        model,
                    },
                );
            }
            Err(error) if error.kind == model_provider::ProviderErrorKind::Cancelled => {
                let _ = app.emit(
                    MODEL_DOWNLOAD_PROGRESS_EVENT,
                    ModelDownloadEvent::Cancelled {
                        download_id: download_id_for_task,
                        model,
                    },
                );
            }
            Err(error) => {
                let _ = app.emit(
                    MODEL_DOWNLOAD_PROGRESS_EVENT,
                    ModelDownloadEvent::Failed {
                        download_id: download_id_for_task,
                        model,
                        error: ProviderErrorPayload::from(error),
                    },
                );
            }
        }
    });

    Ok(StartModelDownloadResponse { download_id })
}

#[tauri::command]
fn cancel_model_download(
    active_downloads: State<'_, ActiveModelDownloads>,
    request: CancelModelDownloadRequest,
) -> CancelModelDownloadResponse {
    let cancellation = active_downloads
        .downloads
        .lock()
        .ok()
        .and_then(|active| active.get(&request.download_id).cloned());

    if let Some(cancellation) = cancellation {
        cancellation.cancel();
        return CancelModelDownloadResponse {
            download_id: request.download_id,
            cancelled: true,
        };
    }

    CancelModelDownloadResponse {
        download_id: request.download_id,
        cancelled: false,
    }
}

#[tauri::command]
async fn verify_model(request: ModelDownloadRequest) -> Result<(), ProviderErrorPayload> {
    ollama::verify_local_model(&request.model)
        .await
        .map_err(ProviderErrorPayload::from)
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
        .manage(ActiveModelDownloads::default())
        .invoke_handler(tauri::generate_handler![
            shell_metadata,
            list_models,
            model_selection_state,
            load_settings,
            save_settings,
            run_system_check,
            check_ollama_status,
            start_ollama,
            start_model_download,
            cancel_model_download,
            verify_model,
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

    #[test]
    fn model_selection_state_uses_existing_selected_model() {
        let state = build_model_selection_state(
            model_recommendations::load_model_recommendations(),
            vec![
                AvailableModel {
                    name: "llama3.2:latest".to_string(),
                    provider: "Ollama".to_string(),
                },
                AvailableModel {
                    name: "qwen3:8b".to_string(),
                    provider: "Ollama".to_string(),
                },
            ],
            Some("qwen3:8b".to_string()),
        );

        assert!(state.selected_model_installed);
        assert_eq!(state.fallback_model, Some("qwen3:8b".to_string()));
    }

    #[test]
    fn model_selection_state_falls_back_to_first_installed_model() {
        let state = build_model_selection_state(
            model_recommendations::load_model_recommendations(),
            vec![AvailableModel {
                name: "llama3.2:latest".to_string(),
                provider: "Ollama".to_string(),
            }],
            Some("missing:model".to_string()),
        );

        assert!(!state.selected_model_installed);
        assert_eq!(state.fallback_model, Some("llama3.2:latest".to_string()));
    }

    #[test]
    fn model_selection_state_handles_no_models() {
        let state = build_model_selection_state(
            model_recommendations::load_model_recommendations(),
            Vec::new(),
            Some("qwen3:8b".to_string()),
        );

        assert!(!state.selected_model_installed);
        assert_eq!(state.fallback_model, None);
        assert_eq!(state.recommendations.recommended.name, "qwen3:8b");
    }
}
