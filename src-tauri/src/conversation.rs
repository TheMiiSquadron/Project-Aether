use crate::model_provider::{ConversationRequest, ModelProvider, ProviderErrorPayload};
use crate::ollama::OllamaProvider;
use crate::shell::DEFAULT_MODEL_NAME;
use serde::{Deserialize, Serialize};

const NOVA_SYSTEM_PROMPT: &str = include_str!("../../prompts/nova-system-prompt.md");

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitMessageRequest {
    pub message: String,
    pub model: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitMessageResponse {
    pub model: String,
    pub response: String,
}

fn nova_system_prompt() -> &'static str {
    NOVA_SYSTEM_PROMPT.trim()
}

fn build_prompt(user_message: &str) -> String {
    format!(
        "System:\n{}\n\nUser:\n{}",
        nova_system_prompt(),
        user_message
    )
}

pub async fn submit_to_provider<P: ModelProvider + Sync>(
    provider: &P,
    request: SubmitMessageRequest,
) -> Result<SubmitMessageResponse, ProviderErrorPayload> {
    let message = request.message.trim().to_string();
    if message.is_empty() {
        return Err(ProviderErrorPayload {
            kind: crate::model_provider::ProviderErrorKind::RequestFailed,
            message: "Nova needs a message before sending.".to_string(),
            action: "Type a message, then try again.".to_string(),
            diagnostics: None,
        });
    }

    let model = request
        .model
        .filter(|model| !model.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL_NAME.to_string());
    let prompt = build_prompt(&message);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model_provider::{
        ConversationRequest, ConversationResponse, ModelProvider, ProviderError,
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
        assert!(request.message.contains("User:\nHello Nova"));
        assert!(!request.message.contains("  Hello Nova  "));
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
}
