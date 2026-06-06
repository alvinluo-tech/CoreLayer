use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};
use tokio::sync::Mutex;

const HEALTH_CHECK_TIMEOUT_MS: u64 = 5_000;
const STARTUP_TIMEOUT_MS: u64 = 15_000;
const HEALTH_POLL_INTERVAL_MS: u64 = 250;
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
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub log_path: Option<String>,
    pub runtime_mode: String,
}

pub struct DaemonSupervisor {
    url: String,
    client: Client,
    child: Option<Child>,
    owns_process: bool,
    restart_attempts: u32,
    selected_port: Option<u16>,
    log_path: Option<String>,
    last_health_check: Arc<Mutex<Option<String>>>,
    last_error: Arc<Mutex<Option<String>>>,
    app_data_dir: Option<PathBuf>,
}

impl DaemonSupervisor {
    pub fn new(url: String) -> Self {
        Self {
            url,
            client: Client::builder()
                .timeout(Duration::from_millis(HEALTH_CHECK_TIMEOUT_MS))
                .build()
                .expect("failed to build HTTP client"),
            child: None,
            owns_process: false,
            restart_attempts: 0,
            selected_port: None,
            log_path: None,
            last_health_check: Arc::new(Mutex::new(None)),
            last_error: Arc::new(Mutex::new(None)),
            app_data_dir: None,
        }
    }

    /// Initialize the supervisor. If DAEMON_URL is set, use external mode.
    /// Otherwise, find the bundled daemon and prepare to spawn it.
    pub fn initialize(&mut self, app_handle: &tauri::AppHandle) {
        use tauri::Manager;

        let external_url = std::env::var("DAEMON_URL").ok();
        if let Some(url) = external_url {
            self.url = url;
            self.owns_process = false;
            log::info!("[DaemonSupervisor] External mode: {}", self.url);
            return;
        }

        // Sidecar mode: allocate port and find daemon script
        self.owns_process = true;
        self.selected_port = Some(allocate_port());
        self.url = format!("http://127.0.0.1:{}", self.selected_port.unwrap());

        // Resolve app data directory
        let app_data = app_handle
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        self.app_data_dir = Some(app_data.clone());

        // Set up log path
        let log_dir = app_data.join("logs");
        let _ = std::fs::create_dir_all(&log_dir);
        self.log_path = Some(log_dir.join("daemon.log").to_string_lossy().to_string());

        log::info!(
            "[DaemonSupervisor] Sidecar mode: port={}, data={}",
            self.selected_port.unwrap(),
            app_data.display()
        );
    }

    /// Start the owned daemon process.
    pub async fn start_owned_daemon(&mut self) -> Result<(), String> {
        if !self.owns_process {
            return Err("Cannot start external daemon".to_string());
        }

        let port = self.selected_port.ok_or("Port not allocated")?;
        let app_data = self.app_data_dir.as_ref().ok_or("App data dir not set")?;

        // Find the bundled daemon script
        let script_path = find_daemon_script()?;
        log::info!(
            "[DaemonSupervisor] Starting daemon from: {}",
            script_path.display()
        );

        // Set up environment variables
        let app_data_str = app_data.to_string_lossy().to_string();

        let mut cmd = Command::new("node");
        cmd.arg(&script_path)
            .env("DAEMON_HOST", "127.0.0.1")
            .env("DAEMON_PORT", port.to_string())
            .env("JARVIS_RUNTIME_MODE", "sidecar")
            .env("JARVIS_APP_DATA_DIR", &app_data_str)
            .env(
                "JARVIS_LOG_DIR",
                app_data.join("logs").to_string_lossy().as_ref(),
            )
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn daemon: {}. Is Node.js installed?", e))?;

        let pid = child.id();
        self.child = Some(child);
        log::info!("[DaemonSupervisor] Daemon spawned, PID: {}", pid);

        // Wait for health check
        match self.wait_for_health().await {
            Ok(()) => {
                log::info!("[DaemonSupervisor] Daemon is healthy");
                self.restart_attempts = 0;
                Ok(())
            }
            Err(e) => {
                *self.last_error.lock().await = Some(e.clone());
                log::error!("[DaemonSupervisor] Daemon failed to start: {}", e);
                // Stop the child if health check failed
                self.stop_child();
                Err(e)
            }
        }
    }

    /// Poll /health until it responds or timeout is reached.
    async fn wait_for_health(&self) -> Result<(), String> {
        let health_url = format!("{}/health", self.url);
        let deadline = Instant::now() + Duration::from_millis(STARTUP_TIMEOUT_MS);
        let mut last_err = String::new();

        while Instant::now() < deadline {
            match self
                .client
                .get(&health_url)
                .timeout(Duration::from_millis(1000))
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    *self.last_health_check.lock().await = Some(chrono_now());
                    return Ok(());
                }
                Ok(resp) => {
                    last_err = format!("HTTP {}", resp.status());
                }
                Err(e) => {
                    last_err = format!("{}", e);
                }
            }
            tokio::time::sleep(Duration::from_millis(HEALTH_POLL_INTERVAL_MS)).await;
        }

        Err(format!(
            "Daemon health check timed out after {}ms. Last error: {}",
            STARTUP_TIMEOUT_MS, last_err
        ))
    }

    /// Stop the owned child process.
    fn stop_child(&mut self) {
        if let Some(mut child) = self.child.take() {
            let pid = child.id();
            log::info!("[DaemonSupervisor] Stopping daemon PID: {}", pid);
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    pub async fn check_health(&self) -> bool {
        let health_url = format!("{}/health", self.url);
        match self.client.get(&health_url).send().await {
            Ok(resp) => {
                let healthy = resp.status().is_success();
                *self.last_health_check.lock().await = Some(chrono_now());
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
        let running = self.child.is_some() || !self.owns_process;
        let healthy = if running {
            self.check_health().await
        } else {
            false
        };

        DaemonStatus {
            running,
            healthy,
            url: self.url.clone(),
            restart_attempts: self.restart_attempts,
            last_health_check: self.last_health_check.lock().await.clone(),
            last_error: self.last_error.lock().await.clone(),
            pid: self.child.as_ref().map(|c| c.id()),
            port: self.selected_port,
            log_path: self.log_path.clone(),
            runtime_mode: if self.owns_process {
                "sidecar".to_string()
            } else {
                "external".to_string()
            },
        }
    }

    pub async fn restart(&mut self, app_handle: &tauri::AppHandle) -> Result<DaemonStatus, String> {
        if self.restart_attempts >= MAX_RESTART_ATTEMPTS {
            return Err(format!(
                "Max restart attempts ({}) exceeded. Manual intervention required.",
                MAX_RESTART_ATTEMPTS
            ));
        }

        self.restart_attempts += 1;
        *self.last_error.lock().await = Some(format!("Restart attempt {}", self.restart_attempts));

        // Stop existing process
        self.stop_child();

        // Re-initialize (re-allocate port)
        self.initialize(app_handle);

        // Start daemon
        self.start_owned_daemon().await?;

        Ok(self.get_status().await)
    }

    pub fn reset_restart_attempts(&mut self) {
        self.restart_attempts = 0;
    }

    pub fn url(&self) -> &str {
        &self.url
    }

    pub fn owns_process(&self) -> bool {
        self.owns_process
    }

    /// Clean up on app exit
    pub fn shutdown(&mut self) {
        if self.owns_process {
            self.stop_child();
        }
    }
}

impl Drop for DaemonSupervisor {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// Find the bundled daemon script in Tauri resources.
fn find_daemon_script() -> Result<PathBuf, String> {
    // Check for bundled resources (packaged app)
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Cannot determine exe path: {}", e))?
        .parent()
        .ok_or("Cannot determine exe directory")?
        .to_path_buf();

    // Try resources/daemon/index.mjs relative to executable
    let bundled = exe_dir.join("resources").join("daemon").join("index.mjs");
    if bundled.exists() {
        return Ok(bundled);
    }

    // Try relative to current working directory (dev mode)
    let cwd_script = std::env::current_dir()
        .map_err(|e| format!("Cannot determine cwd: {}", e))?
        .join("frontend")
        .join("src-tauri")
        .join("resources")
        .join("daemon")
        .join("index.mjs");
    if cwd_script.exists() {
        return Ok(cwd_script);
    }

    // Try .sidecar-build/index.mjs (dev build)
    let sidecar_build = std::env::current_dir()
        .map_err(|e| format!("Cannot determine cwd: {}", e))?
        .join(".sidecar-build")
        .join("index.mjs");
    if sidecar_build.exists() {
        return Ok(sidecar_build);
    }

    Err(
        "Daemon script not found. Run 'pnpm build:daemon:sidecar' first, \
         or set DAEMON_URL to use an external daemon."
            .to_string(),
    )
}

/// Allocate a free port by binding to port 0.
fn allocate_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("Failed to bind to port 0")
        .local_addr()
        .expect("Failed to get local address")
        .port()
}

fn chrono_now() -> String {
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
pub async fn start_daemon(
    state: State<'_, DaemonSupervisorState>,
    _app_handle: tauri::AppHandle,
) -> Result<DaemonStatus, String> {
    let mut supervisor = state.0.lock().await;
    if supervisor.check_health().await {
        return Ok(supervisor.get_status().await);
    }
    supervisor.start_owned_daemon().await?;
    Ok(supervisor.get_status().await)
}

#[tauri::command]
pub async fn stop_daemon(state: State<'_, DaemonSupervisorState>) -> Result<DaemonStatus, String> {
    let mut supervisor = state.0.lock().await;
    supervisor.stop_child();
    supervisor.reset_restart_attempts();
    Ok(supervisor.get_status().await)
}

#[tauri::command]
pub async fn restart_daemon(
    state: State<'_, DaemonSupervisorState>,
    app_handle: tauri::AppHandle,
) -> Result<DaemonStatus, String> {
    let mut supervisor = state.0.lock().await;
    supervisor.restart(&app_handle).await
}
