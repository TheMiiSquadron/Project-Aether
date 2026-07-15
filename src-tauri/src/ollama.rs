use crate::model_provider::{
    ConversationRequest, ConversationResponse, ModelProvider, ProviderError,
};
use async_trait::async_trait;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

const OLLAMA_GENERATE_URL: &str = "http://127.0.0.1:11434/api/generate";

pub struct OllamaProvider {
    client: reqwest::Client,
    generate_url: String,
}

impl OllamaProvider {
    pub fn local() -> Self {
        Self::new(OLLAMA_GENERATE_URL)
    }

    pub fn new(generate_url: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            generate_url: generate_url.into(),
        }
    }
}

#[derive(Debug, Serialize)]
struct OllamaGenerateRequest<'a> {
    model: &'a str,
    prompt: &'a str,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct OllamaGenerateResponse {
    response: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaErrorResponse {
    error: Option<String>,
}

#[async_trait]
impl ModelProvider for OllamaProvider {
    async fn send_message(
        &self,
        request: ConversationRequest,
    ) -> Result<ConversationResponse, ProviderError> {
        let ollama_request = OllamaGenerateRequest {
            model: &request.model,
            prompt: &request.message,
            stream: false,
        };

        let response = self
            .client
            .post(&self.generate_url)
            .json(&ollama_request)
            .send()
            .await
            .map_err(|error| ProviderError::ollama_unavailable(error.to_string()))?;

        if response.status() == StatusCode::NOT_FOUND {
            return Err(ProviderError::model_missing(&request.model));
        }

        if !response.status().is_success() {
            let status = response.status();
            let detail = response
                .json::<OllamaErrorResponse>()
                .await
                .ok()
                .and_then(|payload| payload.error)
                .unwrap_or_else(|| format!("Ollama returned HTTP {status}."));
            return Err(ProviderError::request_failed(detail));
        }

        let body = response
            .json::<OllamaGenerateResponse>()
            .await
            .map_err(|error| ProviderError::request_failed(error.to_string()))?;
        let assistant_response = body.response.unwrap_or_default().trim().to_string();

        if assistant_response.is_empty() {
            return Err(ProviderError::empty_response(&request.model));
        }

        Ok(ConversationResponse {
            model: request.model,
            response: assistant_response,
        })
    }
}
