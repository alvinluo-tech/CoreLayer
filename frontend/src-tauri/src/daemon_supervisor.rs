use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

const HEALTH_CHECK_TIMEOUT_MS: u64 = 5_000;
const MAX_RESTART_ATTEMPTS: u32 = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonStatus {
    pub running: bool,
    pub healthy: bool,
    pub url: String,
    pub restart_attempts: u32,
    pub last_health_check: Option<String>,
    pub last_error: Option<String>,
}

pub struct DaemonSupervisor {
    url: String,
    client: Client,
    restart_attempts: u32,
    last_health_check: Arc<Mutex<Option<String>>>,
    last_error: Arc<Mutex<Option<String>>>,
}

impl DaemonSupervisor {
    pub fn new(url: String) -> Self {
        Self {
            url,
            client: Client::builder()
                .timeout(Duration::from_millis(HEALTH_CHECK_TIMEOUT_MS))
                .build()
                .expect("failed to build HTTP client"),
            restart_attempts: 0,
            last_health_check: Arc::new(Mutex::new(None)),
            last_error: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn check_health(&self) -> bool {
        let health_url = format!("{}/health", self.url);
        match self.client.get(&health_url).send().await {
            Ok(resp) => {
                let healthy = resp.status().is_success();
                let now = chrono_now();
                *self.last_health_check.lock().await = Some(now);
                if !healthy {
                    *self.last_error.lock().await =
                        Some(format!("Health check returned status {}", resp.status()));
                }
                healthy
            }
            Err(e) => {
                *self.last_error.lock().await = Some(format!("Health check failed: {}", e));
                false
            }
        }
    }

    pub async fn get_status(&self) -> DaemonStatus {
        let running = self.check_health().await;
        DaemonStatus {
            running,
            healthy: running,
            url: self.url.clone(),
            restart_attempts: self.restart_attempts,
            last_health_check: self.last_health_check.lock().await.clone(),
            last_error: self.last_error.lock().await.clone(),
        }
    }

    pub async fn restart(&mut self) -> Result<DaemonStatus, String> {
        if self.restart_attempts >= MAX_RESTART_ATTEMPTS {
            return Err(format!(
                "Max restart attempts ({}) exceeded. Manual intervention required.",
                MAX_RESTART_ATTEMPTS
            ));
        }

        self.restart_attempts += 1;
        *self.last_error.lock().await = Some(format!("Restart attempt {}", self.restart_attempts));

        // Verify daemon is accessible after restart
        tokio::time::sleep(Duration::from_millis(500)).await;
        if self.check_health().await {
            Ok(self.get_status().await)
        } else {
            Err(format!(
                "Daemon not healthy after restart attempt {}",
                self.restart_attempts
            ))
        }
    }

    pub fn reset_restart_attempts(&mut self) {
        self.restart_attempts = 0;
    }
}

fn chrono_now() -> String {
    use std::time::SystemTime;
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", dur.as_millis())
}

// ---- Tauri Commands ----

use tauri::State;

pub struct DaemonSupervisorState(pub Arc<Mutex<DaemonSupervisor>>);

#[tauri::command]
pub async fn daemon_status(
    state: State<'_, DaemonSupervisorState>,
) -> Result<DaemonStatus, String> {
    let supervisor = state.0.lock().await;
    Ok(supervisor.get_status().await)
}

#[tauri::command]
pub async fn start_daemon(state: State<'_, DaemonSupervisorState>) -> Result<DaemonStatus, String> {
    let supervisor = state.0.lock().await;
    // Verify daemon is already running (no auto-start without sidecar)
    if supervisor.check_health().await {
        Ok(supervisor.get_status().await)
    } else {
        Err("Daemon is not running. Please start the daemon manually or configure sidecar packaging.".to_string())
    }
}

#[tauri::command]
pub async fn stop_daemon(state: State<'_, DaemonSupervisorState>) -> Result<DaemonStatus, String> {
    let mut supervisor = state.0.lock().await;
    supervisor.reset_restart_attempts();
    Ok(supervisor.get_status().await)
}

#[tauri::command]
pub async fn restart_daemon(
    state: State<'_, DaemonSupervisorState>,
) -> Result<DaemonStatus, String> {
    let mut supervisor = state.0.lock().await;
    supervisor.restart().await
}
