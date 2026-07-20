use crate::model_provider::{
    normalize_stream_result, CancellationToken, ConversationRequest, ConversationResponse,
    ModelProvider, ProviderError, ProviderStreamEvent, StreamEventHandler,
};
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::env;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

const OLLAMA_GENERATE_URL: &str = "http://127.0.0.1:11434/api/generate";
const OLLAMA_TAGS_URL: &str = "http://127.0.0.1:11434/api/tags";
const OLLAMA_VERSION_URL: &str = "http://127.0.0.1:11434/api/version";
const OLLAMA_PULL_URL: &str = "http://127.0.0.1:11434/api/pull";
const OLLAMA_STATUS_TIMEOUT_MS: u64 = 1_500;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct OllamaProvider {
    client: reqwest::Client,
    generate_url: String,
    tags_url: String,
    version_url: String,
    pull_url: String,
}

impl OllamaProvider {
    pub fn local() -> Self {
        Self::new(
            OLLAMA_GENERATE_URL,
            OLLAMA_TAGS_URL,
            OLLAMA_VERSION_URL,
            OLLAMA_PULL_URL,
        )
    }

    pub fn new(
        generate_url: impl Into<String>,
        tags_url: impl Into<String>,
        version_url: impl Into<String>,
        pull_url: impl Into<String>,
    ) -> Self {
        Self {
            client: reqwest::Client::new(),
            generate_url: generate_url.into(),
            tags_url: tags_url.into(),
            version_url: version_url.into(),
            pull_url: pull_url.into(),
        }
    }

    pub fn local_status_client() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_millis(OLLAMA_STATUS_TIMEOUT_MS))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
            generate_url: OLLAMA_GENERATE_URL.to_string(),
            tags_url: OLLAMA_TAGS_URL.to_string(),
            version_url: OLLAMA_VERSION_URL.to_string(),
            pull_url: OLLAMA_PULL_URL.to_string(),
        }
    }
}

#[derive(Debug, Serialize)]
struct OllamaGenerateRequest<'a> {
    model: &'a str,
    prompt: &'a str,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct OllamaPullRequest<'a> {
    name: &'a str,
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

#[derive(Debug, Deserialize)]
struct OllamaVersionResponse {
    version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaPullResponse {
    status: Option<String>,
    completed: Option<u64>,
    total: Option<u64>,
    error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub installation_detected: bool,
    pub service_reachable: bool,
    pub version: Option<String>,
    pub models_installed: bool,
    pub model_count: usize,
    pub model_names: Vec<String>,
    pub can_start: bool,
    pub unavailable_fields: Vec<OllamaStatusField>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OllamaStatusField {
    Installation,
    Version,
    Models,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadProgress {
    pub status: ModelDownloadStatus,
    pub message: String,
    pub percentage: Option<f64>,
    pub completed_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ModelDownloadStatus {
    Downloading,
    Complete,
}

impl OllamaStatus {
    fn unavailable(
        installation_detected: bool,
        can_start: bool,
        unavailable_fields: Vec<OllamaStatusField>,
    ) -> Self {
        Self {
            installation_detected,
            service_reachable: false,
            version: None,
            models_installed: false,
            model_count: 0,
            model_names: Vec::new(),
            can_start,
            unavailable_fields,
        }
    }
}

fn normalize_ollama_transport_error(error: reqwest::Error) -> ProviderError {
    if error.is_timeout() {
        ProviderError::timeout(error.to_string())
    } else {
        ProviderError::ollama_unavailable(error.to_string())
    }
}

pub async fn check_local_ollama_status() -> OllamaStatus {
    let provider = OllamaProvider::local_status_client();
    check_ollama_status_with_provider(&provider).await
}

async fn check_ollama_status_with_provider(provider: &OllamaProvider) -> OllamaStatus {
    let executable = find_ollama_executable();
    check_ollama_status_with_provider_and_installation(
        provider,
        executable.is_some(),
        executable.is_some(),
    )
    .await
}

async fn check_ollama_status_with_provider_and_installation(
    provider: &OllamaProvider,
    installation_detected: bool,
    can_start: bool,
) -> OllamaStatus {
    let version_result = provider.fetch_version().await;
    let models_result = provider.list_models().await;
    let service_reachable = version_result.is_ok() || models_result.is_ok();

    if !service_reachable {
        let unavailable_fields = if installation_detected {
            vec![OllamaStatusField::Version, OllamaStatusField::Models]
        } else {
            vec![
                OllamaStatusField::Installation,
                OllamaStatusField::Version,
                OllamaStatusField::Models,
            ]
        };
        return OllamaStatus::unavailable(installation_detected, can_start, unavailable_fields);
    }

    let version = version_result
        .ok()
        .flatten()
        .map(clean_status_value)
        .filter(|version| !contains_sensitive_status_value(version));
    let mut unavailable_fields = Vec::new();
    if version.is_none() {
        unavailable_fields.push(OllamaStatusField::Version);
    }

    let model_names = match models_result {
        Ok(models) => models
            .into_iter()
            .map(|model| clean_status_value(model.name))
            .filter(|name| !name.is_empty() && !contains_sensitive_status_value(name))
            .collect::<Vec<_>>(),
        Err(_) => {
            unavailable_fields.push(OllamaStatusField::Models);
            Vec::new()
        }
    };

    OllamaStatus {
        installation_detected: installation_detected || service_reachable,
        service_reachable: true,
        version,
        models_installed: !model_names.is_empty(),
        model_count: model_names.len(),
        model_names,
        can_start,
        unavailable_fields,
    }
}

impl OllamaProvider {
    async fn fetch_version(&self) -> Result<Option<String>, ProviderError> {
        let response = self
            .client
            .get(&self.version_url)
            .send()
            .await
            .map_err(normalize_ollama_transport_error)?;

        if !response.status().is_success() {
            let status = response.status();
            return Err(ProviderError::request_failed(format!(
                "Ollama returned HTTP {status} while reading version."
            )));
        }

        let body = response
            .json::<OllamaVersionResponse>()
            .await
            .map_err(|error| ProviderError::request_failed(error.to_string()))?;

        Ok(body.version)
    }

    pub async fn pull_model<F>(
        &self,
        model: &str,
        cancellation: CancellationToken,
        mut on_progress: F,
    ) -> Result<(), ProviderError>
    where
        F: FnMut(ModelDownloadProgress) + Send,
    {
        validate_model_name(model).map_err(ProviderError::request_failed)?;

        let pull_request = OllamaPullRequest {
            name: model,
            stream: true,
        };
        let response = self
            .client
            .post(&self.pull_url)
            .json(&pull_request)
            .send()
            .await
            .map_err(normalize_ollama_transport_error)?;

        if !response.status().is_success() {
            let status = response.status();
            return Err(ProviderError::request_failed(format!(
                "Ollama returned HTTP {status} while downloading a model."
            )));
        }

        let mut stream = response.bytes_stream();
        let mut pending = String::new();
        let mut saw_complete = false;

        while let Some(chunk) = stream.next().await {
            if cancellation.is_cancelled() {
                return Err(ProviderError {
                    kind: crate::model_provider::ProviderErrorKind::Cancelled,
                    message: "The model download was cancelled.".to_string(),
                    action: "Choose a model and try again when you are ready.".to_string(),
                    diagnostics: None,
                });
            }

            let chunk = chunk.map_err(|error| ProviderError::request_failed(error.to_string()))?;
            pending.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(newline_index) = pending.find('\n') {
                let line = pending[..newline_index].trim().to_string();
                pending = pending[newline_index + 1..].to_string();
                if let Some(progress) = parse_pull_progress_line(&line)? {
                    saw_complete = progress.status == ModelDownloadStatus::Complete;
                    on_progress(progress);
                }
            }
        }

        if !pending.trim().is_empty() {
            if let Some(progress) = parse_pull_progress_line(pending.trim())? {
                saw_complete = progress.status == ModelDownloadStatus::Complete;
                on_progress(progress);
            }
        }

        if !saw_complete {
            on_progress(ModelDownloadProgress {
                status: ModelDownloadStatus::Complete,
                message: "Download complete.".to_string(),
                percentage: Some(100.0),
                completed_bytes: None,
                total_bytes: None,
            });
        }

        Ok(())
    }
}

pub fn validate_model_name(model: &str) -> Result<(), String> {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        return Err("Model name cannot be empty.".to_string());
    }
    if trimmed.len() > 96 {
        return Err("Model name is too long.".to_string());
    }
    if trimmed != model {
        return Err("Model name must not include surrounding whitespace.".to_string());
    }
    if !trimmed.chars().all(|character| {
        character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-' | ':' | '/')
    }) {
        return Err("Model name contains unsupported characters.".to_string());
    }
    Ok(())
}

fn parse_pull_progress_line(line: &str) -> Result<Option<ModelDownloadProgress>, ProviderError> {
    if line.trim().is_empty() {
        return Ok(None);
    }

    let payload: OllamaPullResponse = serde_json::from_str(line)
        .map_err(|error| ProviderError::request_failed(error.to_string()))?;

    if let Some(error) = payload.error {
        return Err(ProviderError::request_failed(error));
    }

    let message = payload
        .status
        .unwrap_or_else(|| "Downloading model.".to_string());
    let percentage = match (payload.completed, payload.total) {
        (Some(completed), Some(total)) if total > 0 => {
            Some(((completed as f64 / total as f64) * 100.0).min(100.0))
        }
        _ => {
            if message.to_lowercase().contains("success") {
                Some(100.0)
            } else {
                None
            }
        }
    };
    let status = if percentage == Some(100.0) || message.to_lowercase().contains("success") {
        ModelDownloadStatus::Complete
    } else {
        ModelDownloadStatus::Downloading
    };

    Ok(Some(ModelDownloadProgress {
        status,
        message,
        percentage,
        completed_bytes: payload.completed,
        total_bytes: payload.total,
    }))
}

pub async fn verify_local_model(model: &str) -> Result<(), ProviderError> {
    validate_model_name(model).map_err(ProviderError::request_failed)?;

    let provider = OllamaProvider::local();
    verify_model_with_provider(&provider, model).await
}

async fn verify_model_with_provider(
    provider: &OllamaProvider,
    model: &str,
) -> Result<(), ProviderError> {
    validate_model_name(model).map_err(ProviderError::request_failed)?;

    let cancellation = CancellationToken::default();
    let received_content = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    let content_for_handler = received_content.clone();
    let handler: StreamEventHandler = std::sync::Arc::new(move |event| {
        if let ProviderStreamEvent::Chunk { content } = event {
            if let Ok(mut response) = content_for_handler.lock() {
                response.push_str(&content);
            }
        }
    });

    provider
        .stream_message(
            ConversationRequest {
                model: model.to_string(),
                message: "Reply only with:\n\nSetup successful.".to_string(),
            },
            cancellation,
            handler,
        )
        .await?;

    let response = received_content
        .lock()
        .map(|content| content.trim().to_lowercase())
        .unwrap_or_default();
    if response.contains("setup successful") {
        Ok(())
    } else {
        Err(ProviderError::request_failed(
            "The model responded, but did not complete the setup verification.",
        ))
    }
}

pub fn start_local_ollama() -> Result<(), String> {
    let executable = find_ollama_executable()
        .ok_or_else(|| "Ollama could not be found on this device.".to_string())?;

    let mut command = Command::new(executable);
    command
        .arg("serve")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .spawn()
        .map(|_| ())
        .map_err(|_| "Aether could not start Ollama safely.".to_string())
}

fn find_ollama_executable() -> Option<PathBuf> {
    executable_candidates()
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn executable_candidates() -> Vec<PathBuf> {
    let executable_name = if cfg!(target_os = "windows") {
        "ollama.exe"
    } else {
        "ollama"
    };
    let mut candidates = Vec::new();

    if let Some(paths) = env::var_os("PATH") {
        candidates.extend(env::split_paths(&paths).map(|path| path.join(executable_name)));
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(local_app_data)
                    .join("Programs")
                    .join("Ollama")
                    .join("ollama.exe"),
            );
        }
        if let Some(program_files) = env::var_os("ProgramFiles") {
            candidates.push(
                PathBuf::from(program_files)
                    .join("Ollama")
                    .join("ollama.exe"),
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/usr/local/bin/ollama"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/ollama"));
        candidates.push(PathBuf::from(
            "/Applications/Ollama.app/Contents/Resources/ollama",
        ));
    }

    #[cfg(target_os = "linux")]
    {
        candidates.push(PathBuf::from("/usr/bin/ollama"));
        candidates.push(PathBuf::from("/usr/local/bin/ollama"));
    }

    candidates
}

fn clean_status_value(value: String) -> String {
    value.trim().chars().take(180).collect()
}

fn contains_sensitive_status_value(value: &str) -> bool {
    let lower = value.to_lowercase();
    [
        "serial",
        "uuid",
        "mac address",
        "ip address",
        "device id",
        "pnpdeviceid",
        "\\",
        "/users/",
        "users\\",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
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
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    struct MockRoute {
        path: &'static str,
        status: &'static str,
        body: &'static str,
        delay_ms: u64,
    }

    fn spawn_ollama_server(routes: Vec<MockRoute>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test server binds");
        let address = listener.local_addr().expect("test server address");

        thread::spawn(move || {
            for _ in 0..routes.len() {
                let (mut stream, _) = listener.accept().expect("test connection accepted");
                let mut buffer = [0_u8; 1024];
                let bytes_read = stream.read(&mut buffer).expect("request can be read");
                let request = String::from_utf8_lossy(&buffer[..bytes_read]);
                let path = request
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .unwrap_or("/");
                let route = routes
                    .iter()
                    .find(|route| route.path == path)
                    .expect("mock route exists");

                if route.delay_ms > 0 {
                    thread::sleep(Duration::from_millis(route.delay_ms));
                }

                let response = format!(
                    "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    route.status,
                    route.body.len(),
                    route.body
                );
                stream
                    .write_all(response.as_bytes())
                    .expect("response can be written");
            }
        });

        format!("http://{address}")
    }

    fn unused_local_base_url() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("unused listener binds");
        let address = listener.local_addr().expect("unused listener address");
        drop(listener);
        format!("http://{address}")
    }

    fn test_provider(base_url: &str) -> OllamaProvider {
        OllamaProvider {
            client: reqwest::Client::builder()
                .timeout(Duration::from_millis(OLLAMA_STATUS_TIMEOUT_MS))
                .build()
                .expect("status test client builds"),
            generate_url: format!("{base_url}/api/generate"),
            tags_url: format!("{base_url}/api/tags"),
            version_url: format!("{base_url}/api/version"),
            pull_url: format!("{base_url}/api/pull"),
        }
    }

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

    #[tokio::test]
    async fn status_reports_reachable_version_and_models() {
        let base_url = spawn_ollama_server(vec![
            MockRoute {
                path: "/api/version",
                status: "200 OK",
                body: r#"{"version":"0.5.7"}"#,
                delay_ms: 0,
            },
            MockRoute {
                path: "/api/tags",
                status: "200 OK",
                body: r#"{"models":[{"name":"llama3.2:latest"},{"name":"qwen3:8b"}]}"#,
                delay_ms: 0,
            },
        ]);
        let status = check_ollama_status_with_provider_and_installation(
            &test_provider(&base_url),
            true,
            true,
        )
        .await;

        assert!(status.installation_detected);
        assert!(status.service_reachable);
        assert_eq!(status.version, Some("0.5.7".to_string()));
        assert!(status.models_installed);
        assert_eq!(status.model_count, 2);
        assert_eq!(status.model_names, vec!["llama3.2:latest", "qwen3:8b"]);
        assert!(status.unavailable_fields.is_empty());
    }

    #[tokio::test]
    async fn status_reports_reachable_with_no_models() {
        let base_url = spawn_ollama_server(vec![
            MockRoute {
                path: "/api/version",
                status: "200 OK",
                body: r#"{"version":"0.5.7"}"#,
                delay_ms: 0,
            },
            MockRoute {
                path: "/api/tags",
                status: "200 OK",
                body: r#"{"models":[]}"#,
                delay_ms: 0,
            },
        ]);
        let status = check_ollama_status_with_provider_and_installation(
            &test_provider(&base_url),
            true,
            true,
        )
        .await;

        assert!(status.service_reachable);
        assert!(!status.models_installed);
        assert_eq!(status.model_count, 0);
        assert!(status.model_names.is_empty());
    }

    #[tokio::test]
    async fn status_treats_missing_version_as_partial_success() {
        let base_url = spawn_ollama_server(vec![
            MockRoute {
                path: "/api/version",
                status: "200 OK",
                body: r#"{}"#,
                delay_ms: 0,
            },
            MockRoute {
                path: "/api/tags",
                status: "200 OK",
                body: r#"{"models":[{"name":"llama3.2:latest"}]}"#,
                delay_ms: 0,
            },
        ]);
        let status = check_ollama_status_with_provider_and_installation(
            &test_provider(&base_url),
            true,
            true,
        )
        .await;

        assert!(status.service_reachable);
        assert_eq!(status.version, None);
        assert!(status
            .unavailable_fields
            .contains(&OllamaStatusField::Version));
    }

    #[tokio::test]
    async fn status_reports_installed_but_unreachable() {
        let base_url = unused_local_base_url();
        let status = check_ollama_status_with_provider_and_installation(
            &test_provider(&base_url),
            true,
            true,
        )
        .await;

        assert!(status.installation_detected);
        assert!(!status.service_reachable);
        assert!(status.can_start);
        assert_eq!(status.model_count, 0);
    }

    #[tokio::test]
    async fn status_reports_not_installed_when_unreachable_and_not_detected() {
        let base_url = unused_local_base_url();
        let status = check_ollama_status_with_provider_and_installation(
            &test_provider(&base_url),
            false,
            false,
        )
        .await;

        assert!(!status.installation_detected);
        assert!(!status.service_reachable);
        assert!(!status.can_start);
        assert!(status
            .unavailable_fields
            .contains(&OllamaStatusField::Installation));
    }

    #[tokio::test]
    async fn status_times_out_without_freezing() {
        let base_url = spawn_ollama_server(vec![
            MockRoute {
                path: "/api/version",
                status: "200 OK",
                body: r#"{"version":"0.5.7"}"#,
                delay_ms: OLLAMA_STATUS_TIMEOUT_MS + 250,
            },
            MockRoute {
                path: "/api/tags",
                status: "200 OK",
                body: r#"{"models":[]}"#,
                delay_ms: OLLAMA_STATUS_TIMEOUT_MS + 250,
            },
        ]);
        let started = std::time::Instant::now();
        let status = check_ollama_status_with_provider_and_installation(
            &test_provider(&base_url),
            true,
            true,
        )
        .await;

        assert!(!status.service_reachable);
        assert!(started.elapsed() < Duration::from_millis(OLLAMA_STATUS_TIMEOUT_MS * 3));
    }

    #[tokio::test]
    async fn status_treats_malformed_model_response_as_partial() {
        let base_url = spawn_ollama_server(vec![
            MockRoute {
                path: "/api/version",
                status: "200 OK",
                body: r#"{"version":"0.5.7"}"#,
                delay_ms: 0,
            },
            MockRoute {
                path: "/api/tags",
                status: "200 OK",
                body: r#"{"models":"not-a-list"}"#,
                delay_ms: 0,
            },
        ]);
        let status = check_ollama_status_with_provider_and_installation(
            &test_provider(&base_url),
            true,
            true,
        )
        .await;

        assert!(status.service_reachable);
        assert_eq!(status.version, Some("0.5.7".to_string()));
        assert!(status
            .unavailable_fields
            .contains(&OllamaStatusField::Models));
    }

    #[tokio::test]
    async fn status_contract_excludes_sensitive_paths_and_identifiers() {
        let base_url = spawn_ollama_server(vec![
            MockRoute {
                path: "/api/version",
                status: "200 OK",
                body: r#"{"version":"0.5.7 C:\\Users\\alex\\secret"}"#,
                delay_ms: 0,
            },
            MockRoute {
                path: "/api/tags",
                status: "200 OK",
                body: r#"{"models":[{"name":"safe-model"},{"name":"serial-number-leak"}]}"#,
                delay_ms: 0,
            },
        ]);
        let status = check_ollama_status_with_provider_and_installation(
            &test_provider(&base_url),
            true,
            true,
        )
        .await;
        let serialized = serde_json::to_string(&status).expect("status serializes");

        assert_eq!(status.model_names, vec!["safe-model"]);
        assert!(!serialized.to_lowercase().contains("serial"));
        assert!(!serialized.to_lowercase().contains("users"));
        assert!(!serialized.contains('\\'));
    }

    #[test]
    fn model_name_validation_rejects_unsafe_input() {
        assert!(validate_model_name("qwen3:8b").is_ok());
        assert!(validate_model_name("llama3.2").is_ok());
        assert!(validate_model_name(" qwen3:8b").is_err());
        assert!(validate_model_name("qwen3:8b && calc").is_err());
        assert!(validate_model_name("").is_err());
    }

    #[tokio::test]
    async fn pull_model_reports_progress_and_completion() {
        let base_url = spawn_ollama_server(vec![MockRoute {
            path: "/api/pull",
            status: "200 OK",
            body: "{\"status\":\"pulling manifest\"}\n{\"status\":\"downloading\",\"completed\":50,\"total\":100}\n{\"status\":\"success\"}\n",
            delay_ms: 0,
        }]);
        let provider = test_provider(&base_url);
        let mut events = Vec::new();

        provider
            .pull_model("qwen3:8b", CancellationToken::default(), |progress| {
                events.push(progress);
            })
            .await
            .expect("download succeeds");

        assert!(events.iter().any(|event| event.percentage == Some(50.0)));
        assert_eq!(
            events.last().map(|event| event.status),
            Some(ModelDownloadStatus::Complete)
        );
    }

    #[tokio::test]
    async fn pull_model_can_be_cancelled() {
        let base_url = spawn_ollama_server(vec![MockRoute {
            path: "/api/pull",
            status: "200 OK",
            body: "{\"status\":\"downloading\",\"completed\":50,\"total\":100}\n",
            delay_ms: 0,
        }]);
        let provider = test_provider(&base_url);
        let cancellation = CancellationToken::default();
        cancellation.cancel();
        let error = provider
            .pull_model("qwen3:8b", cancellation, |_| {})
            .await
            .expect_err("download is cancelled");

        assert_eq!(
            error.kind,
            crate::model_provider::ProviderErrorKind::Cancelled
        );
    }

    #[tokio::test]
    async fn pull_model_reports_download_failure() {
        let base_url = spawn_ollama_server(vec![MockRoute {
            path: "/api/pull",
            status: "200 OK",
            body: "{\"error\":\"network interrupted\"}\n",
            delay_ms: 0,
        }]);
        let provider = test_provider(&base_url);
        let error = provider
            .pull_model("qwen3:8b", CancellationToken::default(), |_| {})
            .await
            .expect_err("download fails");

        assert_eq!(
            error.kind,
            crate::model_provider::ProviderErrorKind::RequestFailed
        );
    }

    #[tokio::test]
    async fn verify_model_accepts_streaming_setup_success() {
        let base_url = spawn_ollama_server(vec![MockRoute {
            path: "/api/generate",
            status: "200 OK",
            body: "{\"response\":\"Setup successful.\",\"done\":false}\n{\"done\":true}\n",
            delay_ms: 0,
        }]);

        verify_model_with_provider(&test_provider(&base_url), "qwen3:8b")
            .await
            .expect("verification succeeds");
    }

    #[tokio::test]
    async fn verify_model_fails_without_expected_response() {
        let base_url = spawn_ollama_server(vec![MockRoute {
            path: "/api/generate",
            status: "200 OK",
            body: "{\"response\":\"Ready.\",\"done\":false}\n{\"done\":true}\n",
            delay_ms: 0,
        }]);
        let error = verify_model_with_provider(&test_provider(&base_url), "qwen3:8b")
            .await
            .expect_err("verification fails");

        assert_eq!(
            error.kind,
            crate::model_provider::ProviderErrorKind::RequestFailed
        );
    }
}
