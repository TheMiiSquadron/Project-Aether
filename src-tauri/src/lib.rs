mod shell;

pub use shell::{ShellMetadata, DEFAULT_GREETING, DEFAULT_MODEL_NAME, DEFAULT_PROMPT};

#[tauri::command]
fn shell_metadata() -> ShellMetadata {
    ShellMetadata::default()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![shell_metadata])
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
