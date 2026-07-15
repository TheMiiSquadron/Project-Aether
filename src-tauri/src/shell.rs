use serde::Serialize;

pub const DEFAULT_GREETING: &str = "Hello, Alex.";
pub const DEFAULT_PROMPT: &str = "What's on the agenda today?";
pub const DEFAULT_MODEL_NAME: &str = "llama3.2:latest";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ShellMetadata {
    pub application_name: &'static str,
    pub assistant_name: &'static str,
    pub greeting: &'static str,
    pub prompt: &'static str,
    pub model_name: &'static str,
    pub provider_status: &'static str,
}

impl Default for ShellMetadata {
    fn default() -> Self {
        Self {
            application_name: "Aether",
            assistant_name: "Nova",
            greeting: DEFAULT_GREETING,
            prompt: DEFAULT_PROMPT,
            model_name: DEFAULT_MODEL_NAME,
            provider_status: "Ready",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_shell_metadata_is_static_placeholder_data() {
        let metadata = ShellMetadata::default();

        assert_eq!(metadata.application_name, "Aether");
        assert_eq!(metadata.assistant_name, "Nova");
        assert_eq!(metadata.greeting, "Hello, Alex.");
        assert_eq!(metadata.prompt, "What's on the agenda today?");
        assert_eq!(metadata.model_name, "llama3.2:latest");
        assert_eq!(metadata.provider_status, "Ready");
    }
}
