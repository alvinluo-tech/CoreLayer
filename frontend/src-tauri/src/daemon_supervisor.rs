use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
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
    pub app_data_dir: Option<String>,
    pub registered_runtimes: Vec<RegisteredRuntime>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredRuntime {
    pub kind: String,
    pub status: String,
    pub last_error: Option<String>,
}

pub struct DaemonSupervisor {
    url: String,
    client: Client,
    child: Option<Child>,
    owns_process: bool,
    restart_attempts: u32,
    selected_port: Option<u16>,
    log_path: Option<String>,
    sidecar_path: Option<PathBuf>,
    resource_dir: Option<PathBuf>,
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
            sidecar_path: None,
            resource_dir: None,
            last_health_check: Arc::new(Mutex::new(None)),
            last_error: Arc::new(Mutex::new(None)),
            app_data_dir: None,
        }
    }

    /// Initialize the supervisor. If DAEMON_URL is set, use external mode.
    /// Otherwise, find the bundled daemon and prepare to spawn it.
    pub fn initialize(&mut self, app_handle: &tauri::AppHandle) {
        use tauri::Manager;

        let external_url = std::env::var("DAEMON_URL")
            .ok()
            .or_else(default_dev_daemon_url);
        if let Some(url) = external_url {
            self.url = url;
            self.owns_process = false;
            self.selected_port = extract_port(&self.url);
            log::info!("[DaemonSupervisor] External mode: {}", self.url);
            return;
        }

        // Sidecar mode: allocate port and find the packaged daemon binary.
        self.owns_process = true;
        self.selected_port = Some(allocate_port());
        self.url = format!("http://127.0.0.1:{}", self.selected_port.unwrap());
        self.resource_dir = app_handle.path().resource_dir().ok();
        self.sidecar_path = match find_daemon_sidecar(app_handle) {
            Ok(path) => Some(path),
            Err(err) => {
                log::error!("[DaemonSupervisor] {}", err);
                None
            }
        };

        // Resolve app data directory
        let app_data = app_handle
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        self.app_data_dir = Some(app_data.clone());

        // Set up log directory (separate files for stdout/stderr)
        let log_dir = app_data.join("logs");
        let _ = std::fs::create_dir_all(&log_dir);
        self.log_path = Some(log_dir.to_string_lossy().to_string());

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

        let sidecar_path = self
            .sidecar_path
            .clone()
            .ok_or_else(find_daemon_sidecar_error)?;
        log::info!(
            "[DaemonSupervisor] Starting daemon sidecar: {}",
            sidecar_path.display()
        );

        // Set up environment variables and strip UNC prefixes for Node.js compatibility
        let sidecar_path_clean = clean_path(&sidecar_path);
        let app_data_clean = clean_path(app_data);
        let app_data_str = app_data_clean.to_string_lossy().to_string();
        let module_root = clean_path(find_sidecar_module_root(
            &sidecar_path,
            self.resource_dir.as_deref(),
        ));
        let log_dir = clean_path(app_data.join("logs"))
            .to_string_lossy()
            .to_string();

        let stdout_log = open_daemon_log(self.log_path.as_deref(), "stdout")?;
        let stderr_log = open_daemon_log(self.log_path.as_deref(), "stderr")?;

        let mut cmd = Command::new(&sidecar_path_clean);
        if let Some(parent) = sidecar_path_clean.parent() {
            cmd.current_dir(parent);
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let drives = ["C", "D", "E", "F", "G", "H"];
            for drive in drives.iter() {
                cmd.env(format!("={}:", drive), format!("{}:\\", drive));
            }
            // Prevent a black console window from popping up on Windows
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        cmd.env("DAEMON_HOST", "127.0.0.1")
            .env("DAEMON_PORT", port.to_string())
            .env("JARVIS_RUNTIME_MODE", "sidecar")
            .env("JARVIS_APP_DATA_DIR", &app_data_str)
            .env(
                "JARVIS_SIDECAR_MODULE_ROOT",
                module_root.to_string_lossy().as_ref(),
            )
            .env("JARVIS_LOG_DIR", &log_dir)
            .stdout(Stdio::from(stdout_log))
            .stderr(Stdio::from(stderr_log));

        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn daemon sidecar: {}", e))?;

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

        let registered_runtimes = if running && healthy {
            self.fetch_registered_runtimes().await
        } else {
            vec![]
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
            app_data_dir: self
                .app_data_dir
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
            registered_runtimes,
        }
    }

    async fn fetch_registered_runtimes(&self) -> Vec<RegisteredRuntime> {
        let status_url = format!("{}/api/runtime/status", self.url);
        match self.client.get(&status_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                #[derive(Deserialize)]
                struct RuntimeStatusResponse {
                    registered_runtimes: Option<Vec<RegisteredRuntime>>,
                }
                resp.json::<RuntimeStatusResponse>()
                    .await
                    .ok()
                    .and_then(|r| r.registered_runtimes)
                    .unwrap_or_default()
            }
            _ => vec![],
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

fn open_daemon_log(log_dir: Option<&str>, stream: &str) -> Result<std::fs::File, String> {
    let dir = log_dir.ok_or("Daemon log directory not initialized")?;
    let path = PathBuf::from(dir).join(format!("daemon-{}.log", stream));
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| {
            format!(
                "Cannot open daemon {} log {}: {}",
                stream,
                path.display(),
                e
            )
        })?;
    Ok(file)
}

fn find_daemon_sidecar(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;

    let packaged_name = sidecar_packaged_name();
    let source_name = sidecar_source_name();
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        candidates.push(resource_dir.join(&packaged_name));
        candidates.push(resource_dir.join("binaries").join(&packaged_name));
        candidates.push(resource_dir.join(&source_name));
        candidates.push(resource_dir.join("binaries").join(&source_name));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join(&packaged_name));
            candidates.push(exe_dir.join("binaries").join(&packaged_name));
            candidates.push(exe_dir.join(&source_name));
            candidates.push(exe_dir.join("binaries").join(&source_name));
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(
            cwd.join("frontend")
                .join("src-tauri")
                .join("binaries")
                .join(&source_name),
        );
        candidates.push(cwd.join("binaries").join(&source_name));
    }

    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(find_daemon_sidecar_error)
}

fn find_daemon_sidecar_error() -> String {
    format!(
        "Daemon sidecar not found. Run 'pnpm build:daemon:sidecar' first, \
         or set DAEMON_URL to use an external daemon. Expected source binary like {}.",
        sidecar_source_name()
    )
}

fn find_sidecar_module_root(sidecar_path: &Path, resource_dir: Option<&Path>) -> PathBuf {
    if let Some(dir) = resource_dir {
        if dir.join("node_modules").exists() {
            return dir.to_path_buf();
        }
        if dir.join("binaries").join("node_modules").exists() {
            return dir.join("binaries");
        }
    }

    if let Some(dir) = sidecar_path.parent() {
        if dir.join("node_modules").exists() {
            return dir.to_path_buf();
        }
        if dir.join("binaries").join("node_modules").exists() {
            return dir.join("binaries");
        }
    }

    sidecar_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf()
}

fn clean_path<P: AsRef<Path>>(path: P) -> PathBuf {
    let path = path.as_ref();
    let path_str = path.to_string_lossy();
    if let Some(stripped) = path_str.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

fn sidecar_packaged_name() -> String {
    if cfg!(target_os = "windows") {
        "jarvis-daemon.exe".to_string()
    } else {
        "jarvis-daemon".to_string()
    }
}

fn sidecar_source_name() -> String {
    let ext = if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    };
    format!("jarvis-daemon-{}{}", current_target_triple(), ext)
}

fn current_target_triple() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "aarch64-pc-windows-msvc"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu"
    } else {
        "unknown-target"
    }
}

fn default_dev_daemon_url() -> Option<String> {
    if cfg!(debug_assertions) {
        Some("http://localhost:3001".to_string())
    } else {
        None
    }
}

fn extract_port(url: &str) -> Option<u16> {
    url.rsplit(':').next()?.parse().ok()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_path() {
        let path = Path::new(r"\\?\C:\Users\test");
        let cleaned = clean_path(path);
        assert_eq!(cleaned.to_str().unwrap(), r"C:\Users\test");
    }

    #[test]
    fn test_rust_env_equals() {
        let mut cmd = Command::new("node");
        cmd.arg("-e").arg("console.log(process.env['=C:'])");
        cmd.env("=C:", "C:\\");
        let output = cmd.output().unwrap();
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert_eq!(stdout.trim(), "C:\\");
    }
}
