use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Kinds of runtime components that Jarvis can manage.
///
/// Short-form canonical names matching @jarvis/runtime-protocol RuntimeKind.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum RuntimeKind {
    #[serde(rename = "agent")]
    Agent,
    #[serde(rename = "tool")]
    Tool,
    #[serde(rename = "coding")]
    Coding,
    #[serde(rename = "voice")]
    Voice,
    #[serde(rename = "memory")]
    Memory,
    #[serde(rename = "scheduler")]
    Scheduler,
    #[serde(rename = "computer-control")]
    ComputerControl,
}

/// Status of a managed runtime component.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeStatus {
    /// Not yet started.
    Pending,
    /// Starting up, waiting for health check.
    Starting,
    /// Running and healthy.
    Running,
    /// Running but health check is failing.
    Degraded,
    /// Stopped intentionally.
    Stopped,
    /// Crashed and may be restarted.
    Failed,
}

/// Describes a single managed runtime component.
///
/// In the current architecture, all components map to the same daemon process.
/// The registry is designed so that future phases can split into separate processes
/// without changing the UI contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeComponent {
    pub kind: RuntimeKind,
    pub status: RuntimeStatus,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub health_url: Option<String>,
    pub log_path: Option<String>,
    pub restart_policy: RestartPolicy,
    pub last_health_check: Option<String>,
    pub last_error: Option<String>,
}

/// How a runtime should be restarted on failure.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RestartPolicy {
    /// Never restart automatically.
    Never,
    /// Restart up to N times before giving up.
    MaxAttempts(u32),
    /// Always restart (not recommended for production).
    Always,
}

/// Central registry of all runtime components.
///
/// Thread-safe via `Arc<Mutex<...>>` so Tauri commands and background tasks
/// can read and update component state concurrently.
///
/// Currently unused — the single daemon maps all components to one process.
/// Will be used when runtimes are split into separate processes.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct RuntimeRegistry {
    components: Arc<Mutex<HashMap<RuntimeKind, RuntimeComponent>>>,
}

#[allow(dead_code)]
impl RuntimeRegistry {
    pub fn new() -> Self {
        Self {
            components: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Register or update a runtime component.
    pub async fn upsert(&self, component: RuntimeComponent) {
        let mut map = self.components.lock().await;
        map.insert(component.kind.clone(), component);
    }

    /// Get a snapshot of all registered components.
    pub async fn list(&self) -> Vec<RuntimeComponent> {
        let map = self.components.lock().await;
        map.values().cloned().collect()
    }

    /// Get a single component by kind.
    pub async fn get(&self, kind: &RuntimeKind) -> Option<RuntimeComponent> {
        let map = self.components.lock().await;
        map.get(kind).cloned()
    }

    /// Update the status of a component.
    pub async fn set_status(&self, kind: &RuntimeKind, status: RuntimeStatus) {
        let mut map = self.components.lock().await;
        if let Some(component) = map.get_mut(kind) {
            component.status = status;
        }
    }
}

impl Default for RuntimeRegistry {
    fn default() -> Self {
        Self::new()
    }
}
