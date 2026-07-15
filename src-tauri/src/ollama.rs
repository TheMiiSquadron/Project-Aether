use crate::model_provider::{
    normalize_stream_result, CancellationToken, ConversationRequest, ConversationResponse,
    ModelProvider, ProviderError, ProviderStreamEvent, StreamEventHandler,
};
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

const OLLAMA_GENERATE_URL: &str = "http://127.0.0.1:11434/api/generate";
const OLLAMA_TAGS_URL: &str = "http://127.0.0.1:11434/api/tags";

pub struct OllamaProvider {
    client: reqwest::Client,
    generate_url: String,
    tags_url: String,
}

impl OllamaProvider {
    pub fn local() -> Self {
        Self::new(OLLAMA_GENERATE_URL, OLLAMA_TAGS_URL)
    }

    pub fn new(generate_url: impl Into<String>, tags_url: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            generate_url: generate_url.into(),
            tags_url: tags_url.into(),
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
struct OllamaStreamResponse {
    response: Option<String>,
    done: Option<bool>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaErrorResponse {
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaTagModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaTagModel {
    name: String,
}

fn normalize_ollama_transport_error(error: reqwest::Error) -> ProviderError {
    if error.is_timeout() {
        ProviderError::timeout(error.to_string())
    } else {
        ProviderError::ollama_unavailable(error.to_string())
    }
}

fn normalize_ollama_api_error(model: &str, detail: String) -> ProviderError {
    let lower_detail = detail.to_lowercase();
    if lower_detail.contains("model") && lower_detail.contains("not found") {
        ProviderError::model_missing(model)
    } else {
        ProviderError::request_failed(detail)
    }
}

fn normalize_ollama_stream_line(line: &str) -> Result<Option<ProviderStreamEvent>, ProviderError> {
    if line.trim().is_empty() {
        return Ok(None);
    }

    let payload: OllamaStreamResponse = serde_json::from_str(line)
        .map_err(|error| ProviderError::request_failed(error.to_string()))?;

    if let Some(error) = payload.error {
        return Err(normalize_ollama_api_error("", error));
    }

    if let Some(response) = payload.response.filter(|response| !response.is_empty()) {
        return Ok(Some(ProviderStreamEvent::Chunk { content: response }));
    }

    if payload.done.unwrap_or(false) {
        return Ok(None);
    }

    Ok(None)
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
            .map_err(normalize_ollama_transport_error)?;

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
            return Err(normalize_ollama_api_error(&request.model, detail));
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

    async fn stream_message(
        &self,
        request: ConversationRequest,
        cancellation: CancellationToken,
        on_event: StreamEventHandler,
    ) -> Result<(), ProviderError> {
        let ollama_request = OllamaGenerateRequest {
            model: &request.model,
            prompt: &request.message,
            stream: true,
        };

        let response = self
            .client
            .post(&self.generate_url)
            .json(&ollama_request)
            .send()
            .await
            .map_err(normalize_ollama_transport_error)?;

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
            return Err(normalize_ollama_api_error(&request.model, detail));
        }

        on_event(ProviderStreamEvent::Started {
            model: request.model.clone(),
        });

        let mut stream = response.bytes_stream();
        let mut pending = String::new();
        let mut assistant_response = String::new();

        while let Some(chunk) = stream.next().await {
            if cancellation.is_cancelled() {
                on_event(ProviderStreamEvent::Cancelled);
                return Ok(());
            }

            let chunk = chunk.map_err(|error| ProviderError::request_failed(error.to_string()))?;
            pending.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(newline_index) = pending.find('\n') {
                let line = pending[..newline_index].trim().to_string();
                pending = pending[newline_index + 1..].to_string();

                if cancellation.is_cancelled() {
                    on_event(ProviderStreamEvent::Cancelled);
                    return Ok(());
                }

                if let Some(event) = normalize_ollama_stream_line(&line)? {
                    if let ProviderStreamEvent::Chunk { content } = &event {
                        assistant_response.push_str(content);
                    }
                    on_event(event);
                }
            }
        }

        if !pending.trim().is_empty() {
            if let Some(event) = normalize_ollama_stream_line(pending.trim())? {
                if let ProviderStreamEvent::Chunk { content } = &event {
                    assistant_response.push_str(content);
                }
                on_event(event);
            }
        }

        let final_event = normalize_stream_result(
            &request.model,
            &assistant_response,
            cancellation.is_cancelled(),
        )?;
        on_event(final_event);

        Ok(())
    }

    async fn list_models(
        &self,
    ) -> Result<Vec<crate::model_provider::AvailableModel>, ProviderError> {
        let response = self
            .client
            .get(&self.tags_url)
            .send()
            .await
            .map_err(normalize_ollama_transport_error)?;

        if !response.status().is_success() {
            let status = response.status();
            return Err(ProviderError::request_failed(format!(
                "Ollama returned HTTP {status} while listing models."
            )));
        }

        let body = response
            .json::<OllamaTagsResponse>()
            .await
            .map_err(|error| ProviderError::request_failed(error.to_string()))?;

        Ok(body
            .models
            .into_iter()
            .map(|model| crate::model_provider::AvailableModel {
                name: model.name,
                provider: "Ollama".to_string(),
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stream_line_normalizes_response_chunks() {
        let event = normalize_ollama_stream_line(r#"{"response":"Hello","done":false}"#)
            .expect("valid stream line")
            .expect("chunk event");

        assert_eq!(
            event,
            ProviderStreamEvent::Chunk {
                content: "Hello".to_string()
            }
        );
    }

    #[test]
    fn stream_line_ignores_done_without_content() {
        let event = normalize_ollama_stream_line(r#"{"done":true}"#).expect("valid done line");

        assert_eq!(event, None);
    }

    #[test]
    fn stream_line_normalizes_ollama_errors() {
        let error = normalize_ollama_stream_line(r#"{"error":"model not found"}"#)
            .expect_err("ollama error line fails");

        assert!(error.message.contains("could not find"));
        assert_eq!(
            error.kind,
            crate::model_provider::ProviderErrorKind::ModelMissing
        );
    }
}
