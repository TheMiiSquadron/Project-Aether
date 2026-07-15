use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRequest {
    pub model: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationResponse {
    pub model: String,
    pub response: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableModel {
    pub name: String,
    pub provider: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderErrorPayload {
    pub kind: ProviderErrorKind,
    pub message: String,
    pub action: String,
    pub diagnostics: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderErrorKind {
    OllamaUnavailable,
    ModelMissing,
    Timeout,
    RequestFailed,
    EmptyResponse,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderError {
    pub kind: ProviderErrorKind,
    pub message: String,
    pub action: String,
    pub diagnostics: Option<String>,
}

impl ProviderError {
    pub fn ollama_unavailable(diagnostics: impl Into<String>) -> Self {
        Self {
            kind: ProviderErrorKind::OllamaUnavailable,
            message: "Nova could not connect to Ollama.".to_string(),
            action: "Make sure Ollama is running, then try again.".to_string(),
            diagnostics: Some(diagnostics.into()),
        }
    }

    pub fn model_missing(model: &str) -> Self {
        Self {
            kind: ProviderErrorKind::ModelMissing,
            message: format!("Nova could not find the local model `{model}`."),
            action: format!(
                "Install it with `ollama pull {model}`, or choose an installed model later."
            ),
            diagnostics: None,
        }
    }

    pub fn request_failed(diagnostics: impl Into<String>) -> Self {
        Self {
            kind: ProviderErrorKind::RequestFailed,
            message: "Nova could not complete the request.".to_string(),
            action: "Try again. If the problem continues, check Ollama and the selected model."
                .to_string(),
            diagnostics: Some(diagnostics.into()),
        }
    }

    pub fn timeout(diagnostics: impl Into<String>) -> Self {
        Self {
            kind: ProviderErrorKind::Timeout,
            message: "Nova's request timed out.".to_string(),
            action: "Try again, or choose a smaller local model if the problem continues."
                .to_string(),
            diagnostics: Some(diagnostics.into()),
        }
    }

    pub fn empty_response(model: &str) -> Self {
        Self {
            kind: ProviderErrorKind::EmptyResponse,
            message: "Nova received an empty response.".to_string(),
            action: "Try sending the message again.".to_string(),
            diagnostics: Some(format!("Model `{model}` returned an empty response.")),
        }
    }
}

impl From<ProviderError> for ProviderErrorPayload {
    fn from(error: ProviderError) -> Self {
        Self {
            kind: error.kind,
            message: error.message,
            action: error.action,
            diagnostics: error.diagnostics,
        }
    }
}

impl fmt::Display for ProviderError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{} {}", self.message, self.action)
    }
}

impl std::error::Error for ProviderError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ProviderStreamEvent {
    Started { model: String },
    Chunk { content: String },
    Completed { model: String },
    Cancelled,
    Failed { error: ProviderErrorPayload },
}

#[derive(Clone, Default)]
pub struct CancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

pub fn normalize_stream_result(
    model: &str,
    response: &str,
    was_cancelled: bool,
) -> Result<ProviderStreamEvent, ProviderError> {
    if was_cancelled {
        return Ok(ProviderStreamEvent::Cancelled);
    }

    if response.trim().is_empty() {
        return Err(ProviderError::empty_response(model));
    }

    Ok(ProviderStreamEvent::Completed {
        model: model.to_string(),
    })
}

#[async_trait]
pub trait ModelProvider {
    async fn send_message(
        &self,
        request: ConversationRequest,
    ) -> Result<ConversationResponse, ProviderError>;

    async fn stream_message(
        &self,
        request: ConversationRequest,
        cancellation: CancellationToken,
        on_event: StreamEventHandler,
    ) -> Result<(), ProviderError>;

    async fn list_models(&self) -> Result<Vec<AvailableModel>, ProviderError>;
}

pub type StreamEventHandler = Arc<dyn Fn(ProviderStreamEvent) + Send + Sync>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_model_error_is_actionable() {
        let error = ProviderError::model_missing("qwen3:8b");
        let payload = ProviderErrorPayload::from(error);

        assert_eq!(payload.kind, ProviderErrorKind::ModelMissing);
        assert!(payload.message.contains("qwen3:8b"));
        assert!(payload.action.contains("ollama pull qwen3:8b"));
        assert!(payload.diagnostics.is_none());
    }

    #[test]
    fn unavailable_error_keeps_diagnostics_separate() {
        let payload =
            ProviderErrorPayload::from(ProviderError::ollama_unavailable("connection refused"));

        assert_eq!(payload.message, "Nova could not connect to Ollama.");
        assert_eq!(
            payload.action,
            "Make sure Ollama is running, then try again."
        );
        assert_eq!(payload.diagnostics, Some("connection refused".to_string()));
    }

    #[test]
    fn completion_stream_result_requires_content() {
        let result = normalize_stream_result("llama3.2:latest", "Hello", false)
            .expect("complete stream with content");

        assert_eq!(
            result,
            ProviderStreamEvent::Completed {
                model: "llama3.2:latest".to_string()
            }
        );
    }

    #[test]
    fn cancellation_stream_result_wins_over_empty_content() {
        let result =
            normalize_stream_result("llama3.2:latest", "", true).expect("cancelled stream");

        assert_eq!(result, ProviderStreamEvent::Cancelled);
    }

    #[test]
    fn empty_stream_result_becomes_actionable_error() {
        let error = normalize_stream_result("llama3.2:latest", "", false)
            .expect_err("empty completed stream fails");

        assert_eq!(error.kind, ProviderErrorKind::EmptyResponse);
        assert!(error.action.contains("Try sending"));
    }
}
