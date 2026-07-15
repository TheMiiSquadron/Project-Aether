use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE_NAME: &str = "settings.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub selected_model: String,
    pub font_size: u8,
    pub composer_style: String,
    pub show_context_counter: bool,
    pub developer_mode: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "crimson".to_string(),
            selected_model: crate::shell::DEFAULT_MODEL_NAME.to_string(),
            font_size: 16,
            composer_style: "subtle".to_string(),
            show_context_counter: false,
            developer_mode: false,
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Could not locate Aether settings folder: {error}"))?;

    Ok(config_dir.join(SETTINGS_FILE_NAME))
}

pub fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;

    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read Aether settings: {error}"))?;
    serde_json::from_str(&text).map_err(|error| format!("Could not parse Aether settings: {error}"))
}

pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create Aether settings folder: {error}"))?;
    }

    let text = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Could not serialize Aether settings: {error}"))?;
    fs::write(&path, format!("{text}\n"))
        .map_err(|error| format!("Could not save Aether settings: {error}"))?;

    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_match_v0_1_scope() {
        let settings = AppSettings::default();

        assert_eq!(settings.theme, "crimson");
        assert_eq!(settings.selected_model, crate::shell::DEFAULT_MODEL_NAME);
        assert_eq!(settings.font_size, 16);
        assert_eq!(settings.composer_style, "subtle");
        assert!(!settings.show_context_counter);
        assert!(!settings.developer_mode);
    }
}
