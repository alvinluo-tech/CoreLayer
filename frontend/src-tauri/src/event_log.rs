use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Severity levels for runtime events.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EventSeverity {
    Info,
    Warn,
    Error,
    Debug,
}

/// A structured runtime event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEvent {
    pub id: String,
    pub timestamp: String,
    pub source: String,
    pub kind: String,
    pub severity: EventSeverity,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

/// In-memory ring buffer for runtime events.
///
/// Stores up to `capacity` events. Older events are evicted when the
/// buffer is full. Designed for UI display and diagnostics, not
/// persistent audit (see `audit_log` for that).
#[derive(Debug, Clone)]
pub struct EventLog {
    events: Arc<Mutex<VecDeque<RuntimeEvent>>>,
    capacity: usize,
}

impl EventLog {
    pub fn new(capacity: usize) -> Self {
        Self {
            events: Arc::new(Mutex::new(VecDeque::with_capacity(capacity))),
            capacity,
        }
    }

    /// Record a new event.
    pub async fn record(&self, event: RuntimeEvent) {
        let mut buf = self.events.lock().await;
        if buf.len() >= self.capacity {
            buf.pop_front();
        }
        buf.push_back(event);
    }

    /// Create and record an event in one call.
    pub async fn emit(
        &self,
        source: &str,
        kind: &str,
        severity: EventSeverity,
        message: &str,
        details: Option<serde_json::Value>,
    ) {
        let event = RuntimeEvent {
            id: format!("{}-{}", chrono_millis(), rand_suffix()),
            timestamp: chrono_now(),
            source: source.to_string(),
            kind: kind.to_string(),
            severity,
            message: message.to_string(),
            details,
        };
        self.record(event).await;
    }

    /// Get the most recent `n` events.
    pub async fn recent(&self, n: usize) -> Vec<RuntimeEvent> {
        let buf = self.events.lock().await;
        buf.iter().rev().take(n).cloned().collect()
    }

    /// Get all events.
    pub async fn all(&self) -> Vec<RuntimeEvent> {
        let buf = self.events.lock().await;
        buf.iter().cloned().collect()
    }

    /// Clear all events.
    pub async fn clear(&self) {
        let mut buf = self.events.lock().await;
        buf.clear();
    }

    /// Number of stored events.
    pub async fn len(&self) -> usize {
        let buf = self.events.lock().await;
        buf.len()
    }
}

impl Default for EventLog {
    fn default() -> Self {
        Self::new(1000)
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
