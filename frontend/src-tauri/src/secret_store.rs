use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// A stored secret with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretEntry {
    pub key: String,
    pub value: String,
    pub description: Option<String>,
    pub created_at: String,
    pub rotated_at: Option<String>,
}

/// Metadata about a secret (without the value).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretInfo {
    pub key: String,
    pub description: Option<String>,
    pub created_at: String,
    pub rotated_at: Option<String>,
}

/// Simple file-based secret store for desktop use.
///
/// Stores secrets in a JSON file within the app data directory.
/// For production, this should use OS keychain (Windows Credential Manager,
/// macOS Keychain, Linux Secret Service) via a crate like `keyring`.
/// This implementation is a placeholder that provides the interface.
pub struct SecretStore {
    secrets: Arc<Mutex<HashMap<String, SecretEntry>>>,
    store_path: Option<PathBuf>,
}

impl SecretStore {
    pub fn new(app_data_dir: Option<PathBuf>) -> Self {
        let store_path = app_data_dir.map(|d| d.join("secrets.json"));
        Self {
            secrets: Arc::new(Mutex::new(HashMap::new())),
            store_path,
        }
    }

    /// Load secrets from disk.
    pub async fn load(&self) -> Result<(), String> {
        let path = self.store_path.as_ref().ok_or("No store path configured")?;
        if !path.exists() {
            return Ok(());
        }

        let content =
            fs::read_to_string(path).map_err(|e| format!("Failed to read secrets: {}", e))?;
        let entries: HashMap<String, SecretEntry> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse secrets: {}", e))?;

        let mut store = self.secrets.lock().await;
        *store = entries;
        Ok(())
    }

    /// Persist secrets to disk.
    async fn save(&self) -> Result<(), String> {
        let path = self.store_path.as_ref().ok_or("No store path configured")?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create secrets directory: {}", e))?;
        }

        let store = self.secrets.lock().await;
        let json = serde_json::to_string_pretty(&*store)
            .map_err(|e| format!("Failed to serialize secrets: {}", e))?;
        fs::write(path, json).map_err(|e| format!("Failed to write secrets: {}", e))
    }

    /// Store a secret.
    pub async fn set(
        &self,
        key: &str,
        value: &str,
        description: Option<&str>,
    ) -> Result<(), String> {
        let entry = SecretEntry {
            key: key.to_string(),
            value: value.to_string(),
            description: description.map(|d| d.to_string()),
            created_at: chrono_now(),
            rotated_at: None,
        };

        {
            let mut store = self.secrets.lock().await;
            store.insert(key.to_string(), entry);
        }

        self.save().await
    }

    /// Retrieve a secret value.
    pub async fn get(&self, key: &str) -> Option<String> {
        let store = self.secrets.lock().await;
        store.get(key).map(|e| e.value.clone())
    }

    /// Rotate a secret (update value, set rotated_at).
    pub async fn rotate(&self, key: &str, new_value: &str) -> Result<bool, String> {
        let mut store = self.secrets.lock().await;
        if let Some(entry) = store.get_mut(key) {
            entry.value = new_value.to_string();
            entry.rotated_at = Some(chrono_now());
            drop(store);
            self.save().await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Delete a secret.
    pub async fn delete(&self, key: &str) -> Result<bool, String> {
        let removed = {
            let mut store = self.secrets.lock().await;
            store.remove(key).is_some()
        };

        if removed {
            self.save().await?;
        }
        Ok(removed)
    }

    /// List all secret keys (without values).
    pub async fn list(&self) -> Vec<SecretInfo> {
        let store = self.secrets.lock().await;
        store
            .values()
            .map(|e| SecretInfo {
                key: e.key.clone(),
                description: e.description.clone(),
                created_at: e.created_at.clone(),
                rotated_at: e.rotated_at.clone(),
            })
            .collect()
    }

    /// Check if a secret exists.
    pub async fn has(&self, key: &str) -> bool {
        let store = self.secrets.lock().await;
        store.contains_key(key)
    }

    /// Number of stored secrets.
    pub async fn len(&self) -> usize {
        let store = self.secrets.lock().await;
        store.len()
    }
}

impl Default for SecretStore {
    fn default() -> Self {
        Self::new(None)
    }
}

fn chrono_now() -> String {
    let dur = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", dur.as_millis())
}
