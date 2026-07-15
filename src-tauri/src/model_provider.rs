use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::fmt;

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
    RequestFailed,
    EmptyResponse,
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

#[async_trait]
pub trait ModelProvider {
    async fn send_message(
        &self,
        request: ConversationRequest,
    ) -> Result<ConversationResponse, ProviderError>;
}

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
}
