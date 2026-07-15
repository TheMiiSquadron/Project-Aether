mod conversation;
mod model_provider;
mod ollama;
mod shell;

use conversation::{
    ActiveStreams, CancelStreamRequest, CancelStreamResponse, StartStreamResponse,
    SubmitMessageRequest, SubmitMessageResponse,
};
use model_provider::ProviderErrorPayload;
pub use shell::{ShellMetadata, DEFAULT_GREETING, DEFAULT_MODEL_NAME, DEFAULT_PROMPT};
use tauri::{AppHandle, State};

#[tauri::command]
fn shell_metadata() -> ShellMetadata {
    ShellMetadata::default()
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
