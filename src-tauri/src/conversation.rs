use crate::model_provider::{
    CancellationToken, ConversationRequest, ModelProvider, ProviderErrorKind, ProviderErrorPayload,
    ProviderStreamEvent, StreamEventHandler,
};
use crate::ollama::OllamaProvider;
use crate::shell::DEFAULT_MODEL_NAME;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Emitter};

const NOVA_SYSTEM_PROMPT: &str = include_str!("../../prompts/nova-system-prompt.md");
pub const CONVERSATION_STREAM_EVENT: &str = "conversation-stream";
static NEXT_STREAM_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitMessageRequest {
    pub message: String,
    pub model: Option<String>,
    pub stream_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitMessageResponse {
    pub model: String,
    pub response: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartStreamResponse {
    pub stream_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelStreamRequest {
    pub stream_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelStreamResponse {
    pub stream_id: String,
    pub cancelled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationStreamPayload {
    pub stream_id: String,
    pub event: ProviderStreamEvent,
}

#[derive(Clone, Default)]
pub struct ActiveStreams {
    streams: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl ActiveStreams {
    fn insert(&self, stream_id: String, cancellation: CancellationToken) {
        self.streams
            .lock()
            .expect("active streams lock")
            .insert(stream_id, cancellation);
    }

    fn remove(&self, stream_id: &str) {
        self.streams
            .lock()
            .expect("active streams lock")
            .remove(stream_id);
    }

    pub fn cancel(&self, stream_id: &str) -> bool {
        let token = self
            .streams
            .lock()
            .expect("active streams lock")
            .get(stream_id)
            .cloned();

        if let Some(token) = token {
            token.cancel();
            true
        } else {
            false
        }
    }
}

fn nova_system_prompt() -> &'static str {
    NOVA_SYSTEM_PROMPT.trim()
}

fn generated_file_language_hint(user_message: &str) -> Option<&'static str> {
    let lower_message = user_message.to_lowercase();
    let asks_for_generated_content = ["generate", "create", "write", "draft", "make"]
        .iter()
        .any(|verb| lower_message.contains(verb));

    if !asks_for_generated_content {
        return None;
    }

    let language = [
        ("dockerfile", "dockerfile"),
        ("readme.md", "markdown"),
        ("changelog.md", "markdown"),
        (".md", "markdown"),
        (".json", "json"),
        (".toml", "toml"),
        (".yaml", "yaml"),
        (".yml", "yaml"),
        (".xml", "xml"),
        (".rs", "rust"),
        (".py", "python"),
        (".ts", "typescript"),
        (".tsx", "tsx"),
        (".js", "javascript"),
        (".jsx", "jsx"),
        (".sh", "bash"),
        (".bash", "bash"),
        (".ps1", "powershell"),
        (".html", "html"),
        (".css", "css"),
    ]
    .iter()
    .find_map(|(needle, language)| lower_message.contains(needle).then_some(*language));

    language.or_else(|| lower_message.contains("license").then_some("text"))
}

fn build_prompt(user_message: &str) -> String {
    let format_instruction = generated_file_language_hint(user_message)
        .map(|language| {
            format!(
                "\n\nAssistant response requirements:\nThe user appears to be asking for generated file contents. Your first line must be exactly ```{language}. Return the complete file contents inside that single fenced code block. Do not use an unlabeled code fence or render the file as ordinary Markdown outside the code block."
            )
        })
        .unwrap_or_default();

    format!(
        "System:\n{}\n\nUser:\n{}{}",
        nova_system_prompt(),
        user_message,
        format_instruction
    )
}

fn normalize_submit_request(
    request: SubmitMessageRequest,
) -> Result<(String, String), ProviderErrorPayload> {
    let message = request.message.trim().to_string();
    if message.is_empty() {
        return Err(ProviderErrorPayload {
            kind: ProviderErrorKind::RequestFailed,
            message: "Nova needs a message before sending.".to_string(),
            action: "Type a message, then try again.".to_string(),
            diagnostics: None,
        });
    }

    let model = request
        .model
        .filter(|model| !model.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL_NAME.to_string());

    Ok((model, build_prompt(&message)))
}

pub async fn submit_to_provider<P: ModelProvider + Sync>(
    provider: &P,
    request: SubmitMessageRequest,
) -> Result<SubmitMessageResponse, ProviderErrorPayload> {
    let (model, prompt) = normalize_submit_request(request)?;
    let response = provider
        .send_message(ConversationRequest {
            model,
            message: prompt,
        })
        .await
        .map_err(ProviderErrorPayload::from)?;

    Ok(SubmitMessageResponse {
        model: response.model,
        response: response.response,
    })
}

pub async fn submit_message(
    request: SubmitMessageRequest,
) -> Result<SubmitMessageResponse, ProviderErrorPayload> {
    let provider = OllamaProvider::local();
    submit_to_provider(&provider, request).await
}

pub fn start_streaming_message(
    app: AppHandle,
    active_streams: ActiveStreams,
    request: SubmitMessageRequest,
) -> Result<StartStreamResponse, ProviderErrorPayload> {
    let provided_stream_id = request
        .stream_id
        .clone()
        .filter(|stream_id| !stream_id.trim().is_empty());
    let (model, prompt) = normalize_submit_request(request)?;
    let stream_id = provided_stream_id
        .unwrap_or_else(|| format!("stream-{}", NEXT_STREAM_ID.fetch_add(1, Ordering::SeqCst)));
    let cancellation = CancellationToken::default();

    active_streams.insert(stream_id.clone(), cancellation.clone());

    let stream_id_for_task = stream_id.clone();
    tauri::async_runtime::spawn(async move {
        let provider = OllamaProvider::local();
        let emit_app = app.clone();
        let emit_stream_id = stream_id_for_task.clone();
        let on_event: StreamEventHandler = Arc::new(move |event| {
            let _ = emit_app.emit(
                CONVERSATION_STREAM_EVENT,
                ConversationStreamPayload {
                    stream_id: emit_stream_id.clone(),
                    event,
                },
            );
        });

        let result = provider
            .stream_message(
                ConversationRequest {
                    model,
                    message: prompt,
                },
                cancellation,
                on_event.clone(),
            )
            .await;

        if let Err(error) = result {
            on_event(ProviderStreamEvent::Failed {
                error: ProviderErrorPayload::from(error),
            });
        }

        active_streams.remove(&stream_id_for_task);
    });

    Ok(StartStreamResponse { stream_id })
}

pub fn cancel_streaming_message(
    active_streams: ActiveStreams,
    request: CancelStreamRequest,
) -> CancelStreamResponse {
    let cancelled = active_streams.cancel(&request.stream_id);

    CancelStreamResponse {
        stream_id: request.stream_id,
        cancelled,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model_provider::{
        CancellationToken, ConversationRequest, ConversationResponse, ModelProvider, ProviderError,
        StreamEventHandler,
    };
    use async_trait::async_trait;
    use std::sync::Mutex;

    struct MockProvider {
        request: Mutex<Option<ConversationRequest>>,
        result: Result<ConversationResponse, ProviderError>,
    }

    #[async_trait]
    impl ModelProvider for MockProvider {
        async fn send_message(
            &self,
            request: ConversationRequest,
        ) -> Result<ConversationResponse, ProviderError> {
            *self.request.lock().expect("request lock") = Some(request);
            self.result.clone()
        }

        async fn stream_message(
            &self,
            request: ConversationRequest,
            _cancellation: CancellationToken,
            on_event: StreamEventHandler,
        ) -> Result<(), ProviderError> {
            *self.request.lock().expect("request lock") = Some(request);
            match &self.result {
                Ok(response) => {
                    on_event(ProviderStreamEvent::Started {
                        model: response.model.clone(),
                    });
                    on_event(ProviderStreamEvent::Chunk {
                        content: response.response.clone(),
                    });
                    on_event(ProviderStreamEvent::Completed {
                        model: response.model.clone(),
                    });
                    Ok(())
                }
                Err(error) => Err(error.clone()),
            }
        }

        async fn list_models(
            &self,
        ) -> Result<Vec<crate::model_provider::AvailableModel>, ProviderError> {
            Ok(vec![crate::model_provider::AvailableModel {
                name: DEFAULT_MODEL_NAME.to_string(),
                provider: "Ollama".to_string(),
            }])
        }
    }

    #[tokio::test]
    async fn submit_uses_default_model_trims_message_and_injects_identity_prompt() {
        let provider = MockProvider {
            request: Mutex::new(None),
            result: Ok(ConversationResponse {
                model: DEFAULT_MODEL_NAME.to_string(),
                response: "Hello.".to_string(),
            }),
        };

        let result = submit_to_provider(
            &provider,
            SubmitMessageRequest {
                message: "  Hello Nova  ".to_string(),
                model: None,
                stream_id: None,
            },
        )
        .await
        .expect("submit succeeds");

        assert_eq!(result.response, "Hello.");
        let request = provider
            .request
            .lock()
            .expect("request lock")
            .clone()
            .expect("provider receives request");

        assert_eq!(request.model, DEFAULT_MODEL_NAME);
        assert!(request.message.starts_with("System:\nYou are Nova."));
        assert!(request
            .message
            .contains("You are the AI assistant built into Project Aether."));
        assert!(request
            .message
            .contains("When explicitly asked to generate the complete contents of a file"));
        assert!(request
            .message
            .contains("return the file contents inside one appropriately fenced code block"));
        assert!(request
            .message
            .contains("The opening fence must include the matching language identifier"));
        assert!(request
            .message
            .contains("use `markdown` for Markdown files such as README.md"));
        assert!(request.message.contains("User:\nHello Nova"));
        assert!(!request.message.contains("  Hello Nova  "));
    }

    #[tokio::test]
    async fn submit_adds_file_generation_format_hint_for_markdown_files() {
        let provider = MockProvider {
            request: Mutex::new(None),
            result: Ok(ConversationResponse {
                model: DEFAULT_MODEL_NAME.to_string(),
                response: "```markdown\n# Widget Lab\n```".to_string(),
            }),
        };

        submit_to_provider(
            &provider,
            SubmitMessageRequest {
                message: "Generate a README.md for Widget Lab.".to_string(),
                model: None,
                stream_id: None,
            },
        )
        .await
        .expect("submit succeeds");

        let request = provider
            .request
            .lock()
            .expect("request lock")
            .clone()
            .expect("provider receives request");

        assert!(request.message.contains("Assistant response requirements:"));
        assert!(request
            .message
            .contains("Your first line must be exactly ```markdown"));
    }

    #[tokio::test]
    async fn submit_does_not_add_file_generation_hint_for_explanations() {
        let provider = MockProvider {
            request: Mutex::new(None),
            result: Ok(ConversationResponse {
                model: DEFAULT_MODEL_NAME.to_string(),
                response: "Markdown headings use hash symbols.".to_string(),
            }),
        };

        submit_to_provider(
            &provider,
            SubmitMessageRequest {
                message: "Explain Markdown headings in two short bullets.".to_string(),
                model: None,
                stream_id: None,
            },
        )
        .await
        .expect("submit succeeds");

        let request = provider
            .request
            .lock()
            .expect("request lock")
            .clone()
            .expect("provider receives request");

        assert!(!request.message.contains("Assistant response requirements:"));
    }

    #[tokio::test]
    async fn submit_normalizes_provider_errors() {
        let provider = MockProvider {
            request: Mutex::new(None),
            result: Err(ProviderError::model_missing("qwen3:8b")),
        };

        let error = submit_to_provider(
            &provider,
            SubmitMessageRequest {
                message: "Hello".to_string(),
                model: Some("qwen3:8b".to_string()),
                stream_id: None,
            },
        )
        .await
        .expect_err("missing model returns normalized error");

        assert_eq!(
            error.message,
            "Nova could not find the local model `qwen3:8b`."
        );
        assert!(error.action.contains("ollama pull qwen3:8b"));
    }

    #[test]
    fn active_streams_cancel_registered_stream() {
        let active_streams = ActiveStreams::default();
        let token = CancellationToken::default();

        active_streams.insert("stream-test".to_string(), token.clone());

        assert!(active_streams.cancel("stream-test"));
        assert!(token.is_cancelled());
    }

    #[test]
    fn active_streams_report_missing_cancel_target() {
        let active_streams = ActiveStreams::default();

        assert!(!active_streams.cancel("stream-missing"));
    }
}
