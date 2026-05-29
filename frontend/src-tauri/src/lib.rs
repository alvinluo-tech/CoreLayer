use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub reply: String,
    #[serde(default)]
    pub tool_calls: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub model_used: String,
    pub message_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub tool_calls: Option<String>,
    pub tool_call_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationWithMessages {
    pub conversation: Conversation,
    pub messages: Vec<ConversationMessage>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationListResponse {
    pub conversations: Vec<Conversation>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageResponse {
    pub user_message: ConversationMessage,
    pub assistant_message: ConversationMessage,
    pub conversation: Conversation,
}

#[derive(Debug, Serialize, Deserialize)]
struct DaemonErrorResponse {
    error: Option<String>,
}

async fn get_daemon_url() -> String {
    std::env::var("DAEMON_URL").unwrap_or_else(|_| "http://127.0.0.1:3001".to_string())
}

async fn daemon_get<T: for<'de> Deserialize<'de>>(path: &str) -> Result<T, String> {
    let client = reqwest::Client::new();
    let url = format!("{}{}", get_daemon_url().await, path);

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("无法连接到 daemon: {}", e))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        if let Ok(err_resp) = serde_json::from_str::<DaemonErrorResponse>(&body_text) {
            if let Some(err) = err_resp.error {
                return Err(format!("Daemon 错误: {}", err));
            }
        }
        return Err(format!("Daemon 返回错误 ({}): {}", status, body_text));
    }

    serde_json::from_str::<T>(&body_text)
        .map_err(|e| format!("解析响应失败: {}", e))
}

async fn daemon_post<T: for<'de> Deserialize<'de>>(path: &str, body: serde_json::Value) -> Result<T, String> {
    let client = reqwest::Client::new();
    let url = format!("{}{}", get_daemon_url().await, path);

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("无法连接到 daemon: {}", e))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        if let Ok(err_resp) = serde_json::from_str::<DaemonErrorResponse>(&body_text) {
            if let Some(err) = err_resp.error {
                return Err(format!("Daemon 错误: {}", err));
            }
        }
        return Err(format!("Daemon 返回错误 ({}): {}", status, body_text));
    }

    serde_json::from_str::<T>(&body_text)
        .map_err(|e| format!("解析响应失败: {}", e))
}

async fn daemon_patch<T: for<'de> Deserialize<'de>>(path: &str, body: serde_json::Value) -> Result<T, String> {
    let client = reqwest::Client::new();
    let url = format!("{}{}", get_daemon_url().await, path);

    let response = client
        .patch(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("无法连接到 daemon: {}", e))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        if let Ok(err_resp) = serde_json::from_str::<DaemonErrorResponse>(&body_text) {
            if let Some(err) = err_resp.error {
                return Err(format!("Daemon 错误: {}", err));
            }
        }
        return Err(format!("Daemon 返回错误 ({}): {}", status, body_text));
    }

    serde_json::from_str::<T>(&body_text)
        .map_err(|e| format!("解析响应失败: {}", e))
}

async fn daemon_delete(path: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("{}{}", get_daemon_url().await, path);

    let response = client
        .delete(&url)
        .send()
        .await
        .map_err(|e| format!("无法连接到 daemon: {}", e))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        if let Ok(err_resp) = serde_json::from_str::<DaemonErrorResponse>(&body_text) {
            if let Some(err) = err_resp.error {
                return Err(format!("Daemon 错误: {}", err));
            }
        }
        return Err(format!("Daemon 返回错误 ({}): {}", status, body_text));
    }

    serde_json::from_str::<serde_json::Value>(&body_text)
        .map_err(|e| format!("解析响应失败: {}", e))
}

// ---- Existing Commands ----

#[tauri::command]
async fn send_message(message: String) -> Result<ChatResponse, String> {
    daemon_post("/api/chat", serde_json::json!({ "message": message })).await
}

#[tauri::command]
async fn health_check() -> Result<HealthResponse, String> {
    daemon_get("/health").await
}

// ---- Conversation Commands ----

#[tauri::command]
async fn list_conversations() -> Result<ConversationListResponse, String> {
    daemon_get("/api/conversations").await
}

#[tauri::command]
async fn create_conversation(title: Option<String>) -> Result<Conversation, String> {
    let body = match title {
        Some(t) => serde_json::json!({ "title": t }),
        None => serde_json::json!({}),
    };
    let resp: serde_json::Value = daemon_post("/api/conversations", body).await?;
    serde_json::from_value(resp.get("conversation").cloned().unwrap_or(resp))
        .map_err(|e| format!("解析 conversation 失败: {}", e))
}

#[tauri::command]
async fn get_conversation(id: String) -> Result<ConversationWithMessages, String> {
    daemon_get(&format!("/api/conversations/{}", id)).await
}

#[tauri::command]
async fn delete_conversation(id: String) -> Result<serde_json::Value, String> {
    daemon_delete(&format!("/api/conversations/{}", id)).await
}

#[tauri::command]
async fn update_conversation(id: String, title: String) -> Result<Conversation, String> {
    let resp: serde_json::Value = daemon_patch(
        &format!("/api/conversations/{}", id),
        serde_json::json!({ "title": title }),
    )
    .await?;
    serde_json::from_value(resp.get("conversation").cloned().unwrap_or(resp))
        .map_err(|e| format!("解析 conversation 失败: {}", e))
}

#[tauri::command]
async fn send_conversation_message(
    conversation_id: String,
    content: String,
) -> Result<SendMessageResponse, String> {
    daemon_post(
        &format!("/api/conversations/{}/messages", conversation_id),
        serde_json::json!({ "content": content }),
    )
    .await
}

// ---- Task Commands ----

#[tauri::command]
async fn query_tasks(
    status: Option<String>,
    priority: Option<i32>,
) -> Result<serde_json::Value, String> {
    let mut path = "/api/tasks".to_string();
    let mut params = Vec::new();
    if let Some(s) = status {
        params.push(format!("status={}", s));
    }
    if let Some(p) = priority {
        params.push(format!("priority={}", p));
    }
    if !params.is_empty() {
        path = format!("{}?{}", path, params.join("&"));
    }
    daemon_get(&path).await
}

#[tauri::command]
async fn create_task(
    title: String,
    priority: Option<i32>,
    due_date: Option<String>,
    tags: Option<Vec<String>>,
    description: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut body = serde_json::json!({ "title": title });
    if let Some(p) = priority {
        body["priority"] = serde_json::json!(p);
    }
    if let Some(d) = due_date {
        body["dueDate"] = serde_json::json!(d);
    }
    if let Some(t) = tags {
        body["tags"] = serde_json::json!(t);
    }
    if let Some(d) = description {
        body["description"] = serde_json::json!(d);
    }
    daemon_post("/api/tasks", body).await
}

#[tauri::command]
async fn update_task(
    task_id: String,
    title: Option<String>,
    priority: Option<i32>,
    status: Option<String>,
    due_date: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let mut body = serde_json::json!({});
    if let Some(t) = title {
        body["title"] = serde_json::json!(t);
    }
    if let Some(p) = priority {
        body["priority"] = serde_json::json!(p);
    }
    if let Some(s) = status {
        body["status"] = serde_json::json!(s);
    }
    if let Some(d) = due_date {
        body["dueDate"] = serde_json::json!(d);
    }
    if let Some(t) = tags {
        body["tags"] = serde_json::json!(t);
    }
    daemon_patch(&format!("/api/tasks/{}", task_id), body).await
}

#[tauri::command]
async fn delete_task(task_id: String) -> Result<serde_json::Value, String> {
    daemon_delete(&format!("/api/tasks/{}", task_id)).await
}

// ---- Article Commands ----

#[tauri::command]
async fn get_reading_list(
    status: Option<String>,
    category: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut path = "/api/articles".to_string();
    let mut params = Vec::new();
    if let Some(s) = status {
        params.push(format!("status={}", s));
    }
    if let Some(c) = category {
        params.push(format!("category={}", c));
    }
    if !params.is_empty() {
        path = format!("{}?{}", path, params.join("&"));
    }
    daemon_get(&path).await
}

#[tauri::command]
async fn add_article(
    title: String,
    url: Option<String>,
    category: Option<String>,
    description: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut body = serde_json::json!({ "title": title });
    if let Some(u) = url {
        body["url"] = serde_json::json!(u);
    }
    if let Some(c) = category {
        body["category"] = serde_json::json!(c);
    }
    if let Some(d) = description {
        body["description"] = serde_json::json!(d);
    }
    daemon_post("/api/articles", body).await
}

#[tauri::command]
async fn update_reading_status(
    article_id: String,
    status: String,
    rating: Option<i32>,
    notes: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut body = serde_json::json!({ "status": status });
    if let Some(r) = rating {
        body["rating"] = serde_json::json!(r);
    }
    if let Some(n) = notes {
        body["notes"] = serde_json::json!(n);
    }
    daemon_patch(&format!("/api/articles/{}", article_id), body).await
}

// ---- Review Commands ----

#[tauri::command]
async fn get_daily_summary(date: Option<String>) -> Result<serde_json::Value, String> {
    let mut path = "/api/reviews/daily-summary".to_string();
    if let Some(d) = date {
        path = format!("{}?date={}", path, d);
    }
    daemon_get(&path).await
}

#[tauri::command]
async fn get_weekly_stats(week_start: Option<String>) -> Result<serde_json::Value, String> {
    let mut path = "/api/reviews/weekly-stats".to_string();
    if let Some(w) = week_start {
        path = format!("{}?weekStart={}", path, w);
    }
    daemon_get(&path).await
}

// ---- Settings Commands ----

#[tauri::command]
async fn get_settings() -> Result<serde_json::Value, String> {
    daemon_get("/api/settings").await
}

#[tauri::command]
async fn update_storage_mode(mode: String) -> Result<serde_json::Value, String> {
    daemon_put("/api/settings/storage-mode", serde_json::json!({ "mode": mode })).await
}

async fn daemon_put<T: for<'de> Deserialize<'de>>(path: &str, body: serde_json::Value) -> Result<T, String> {
    let client = reqwest::Client::new();
    let url = format!("{}{}", get_daemon_url().await, path);

    let response = client
        .put(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("无法连接到 daemon: {}", e))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        if let Ok(err_resp) = serde_json::from_str::<DaemonErrorResponse>(&body_text) {
            if let Some(err) = err_resp.error {
                return Err(format!("Daemon 错误: {}", err));
            }
        }
        return Err(format!("Daemon 返回错误 ({}): {}", status, body_text));
    }

    serde_json::from_str::<T>(&body_text)
        .map_err(|e| format!("解析响应失败: {}", e))
}

// ---- Voice Commands ----

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceStatus {
    pub asr: bool,
    pub tts: bool,
    pub tts_models: Vec<String>,
}

#[tauri::command]
async fn get_voice_status() -> Result<VoiceStatus, String> {
    daemon_get("/api/voice/status").await
}

#[tauri::command]
async fn get_daemon_url_command() -> Result<String, String> {
    Ok(get_daemon_url().await)
}

// ---- MCP Server Commands ----

#[tauri::command]
async fn list_mcp_servers() -> Result<serde_json::Value, String> {
    daemon_get("/api/mcp/servers").await
}

#[tauri::command]
async fn connect_mcp_server(config: serde_json::Value) -> Result<serde_json::Value, String> {
    daemon_post("/api/mcp/servers", config).await
}

#[tauri::command]
async fn disconnect_mcp_server(server_id: String) -> Result<serde_json::Value, String> {
    daemon_delete(&format!("/api/mcp/servers/{}", server_id)).await
}

#[tauri::command]
async fn list_mcp_tools() -> Result<serde_json::Value, String> {
    daemon_get("/api/mcp/tools").await
}

#[tauri::command]
async fn list_mcp_resources() -> Result<serde_json::Value, String> {
    daemon_get("/api/mcp/resources").await
}

#[tauri::command]
async fn list_mcp_prompts() -> Result<serde_json::Value, String> {
    daemon_get("/api/mcp/prompts").await
}

// ---- Unified Tool Registry Commands ----

#[tauri::command]
async fn list_all_tools() -> Result<serde_json::Value, String> {
    daemon_get("/api/tools").await
}

#[tauri::command]
async fn get_tool(tool_id: String) -> Result<serde_json::Value, String> {
    daemon_get(&format!("/api/tools/{}", tool_id)).await
}

// ---- Model Gateway Commands ----

#[tauri::command]
async fn list_model_profiles() -> Result<serde_json::Value, String> {
    daemon_get("/api/mcp/models").await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            send_message,
            health_check,
            list_conversations,
            create_conversation,
            get_conversation,
            delete_conversation,
            update_conversation,
            send_conversation_message,
            query_tasks,
            create_task,
            update_task,
            delete_task,
            get_reading_list,
            add_article,
            update_reading_status,
            get_daily_summary,
            get_weekly_stats,
            get_settings,
            update_storage_mode,
            get_voice_status,
            get_daemon_url_command,
            list_mcp_servers,
            connect_mcp_server,
            disconnect_mcp_server,
            list_mcp_tools,
            list_mcp_resources,
            list_mcp_prompts,
            list_all_tools,
            get_tool,
            list_model_profiles
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
