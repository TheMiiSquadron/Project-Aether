use serde::{Deserialize, Serialize};

const MODEL_RECOMMENDATIONS_JSON: &str = include_str!("../model-recommendations.json");

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRecommendationCatalog {
    pub recommended: RecommendedModel,
    pub alternatives: Vec<RecommendedModel>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedModel {
    pub name: String,
    pub title: String,
    pub description: String,
    pub detail: Option<String>,
}

pub fn load_model_recommendations() -> ModelRecommendationCatalog {
    serde_json::from_str(MODEL_RECOMMENDATIONS_JSON)
        .expect("bundled model recommendation config must be valid")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_recommendation_config_loads() {
        let catalog = load_model_recommendations();

        assert!(!catalog.recommended.name.trim().is_empty());
        assert!(!catalog.recommended.title.trim().is_empty());
        assert!(!catalog.alternatives.is_empty());
    }

    #[test]
    fn recommendation_config_is_data_driven() {
        let catalog = load_model_recommendations();

        assert_eq!(catalog.recommended.name, "qwen3:8b");
        assert!(catalog
            .alternatives
            .iter()
            .any(|model| model.name == "llama3.2"));
    }
}
