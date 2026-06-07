use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Risk levels for audit entries.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuditRisk {
    Low,
    Medium,
    High,
    Critical,
}

/// Permission decision recorded in the audit log.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuditDecision {
    Allow,
    Deny,
    ApprovalRequired,
}

/// A single audit log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: String,
    pub actor: String,
    pub action: String,
    pub resource: String,
    pub risk_level: AuditRisk,
    pub decision: AuditDecision,
    pub confirmed_by_user: bool,
    pub result: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Input for creating an audit entry.
pub struct AuditInput<'a> {
    pub actor: &'a str,
    pub action: &'a str,
    pub resource: &'a str,
    pub risk_level: AuditRisk,
    pub decision: AuditDecision,
    pub confirmed_by_user: bool,
    pub result: &'a str,
    pub metadata: Option<serde_json::Value>,
}

/// Persistent audit log for security-sensitive operations.
///
/// Writes entries to a JSONL file for durability. Also keeps an in-memory
/// ring buffer for quick UI access.
pub struct AuditLog {
    entries: Arc<Mutex<Vec<AuditEntry>>>,
    log_path: Option<PathBuf>,
    max_memory: usize,
}

impl AuditLog {
    pub fn new(log_dir: Option<PathBuf>) -> Self {
        let log_path = log_dir.map(|d| d.join("audit.jsonl"));
        Self {
            entries: Arc::new(Mutex::new(Vec::new())),
            log_path,
            max_memory: 500,
        }
    }

    /// Record an audit entry.
    pub async fn record(&self, entry: AuditEntry) {
        // Persist to file
        if let Some(ref path) = self.log_path {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
                if let Ok(json) = serde_json::to_string(&entry) {
                    let _ = writeln!(file, "{}", json);
                }
            }
        }

        // Keep in memory (ring buffer)
        let mut buf = self.entries.lock().await;
        if buf.len() >= self.max_memory {
            buf.remove(0);
        }
        buf.push(entry);
    }

    /// Create and record an audit entry in one call.
    pub async fn audit(&self, input: AuditInput<'_>) {
        let entry = AuditEntry {
            id: format!("audit-{}-{}", chrono_millis(), rand_suffix()),
            timestamp: chrono_now(),
            actor: input.actor.to_string(),
            action: input.action.to_string(),
            resource: input.resource.to_string(),
            risk_level: input.risk_level,
            decision: input.decision,
            confirmed_by_user: input.confirmed_by_user,
            result: input.result.to_string(),
            metadata: input.metadata,
        };
        self.record(entry).await;
    }

    /// Get the most recent `n` entries from memory.
    pub async fn recent(&self, n: usize) -> Vec<AuditEntry> {
        let buf = self.entries.lock().await;
        buf.iter().rev().take(n).cloned().collect()
    }

    /// Get all in-memory entries.
    pub async fn all(&self) -> Vec<AuditEntry> {
        let buf = self.entries.lock().await;
        buf.clone()
    }

    /// Load entries from the JSONL file into memory.
    pub async fn load_from_disk(&self) -> Result<usize, String> {
        let path = self.log_path.as_ref().ok_or("No log path configured")?;
        if !path.exists() {
            return Ok(0);
        }

        let content =
            fs::read_to_string(path).map_err(|e| format!("Failed to read audit log: {}", e))?;
        let mut count = 0;
        let mut buf = self.entries.lock().await;

        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(entry) = serde_json::from_str::<AuditEntry>(line) {
                if buf.len() >= self.max_memory {
                    buf.remove(0);
                }
                buf.push(entry);
                count += 1;
            }
        }

        Ok(count)
    }

    /// Number of in-memory entries.
    pub async fn len(&self) -> usize {
        let buf = self.entries.lock().await;
        buf.len()
    }
}

impl Default for AuditLog {
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

fn chrono_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn rand_suffix() -> u32 {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let s = RandomState::new();
    let mut h = s.build_hasher();
    h.write_u64(chrono_millis() as u64);
    h.finish() as u32
}
