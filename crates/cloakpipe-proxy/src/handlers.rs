//! HTTP request handlers for the proxy.

use crate::state::AppState;
use crate::streaming;
use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use cloakpipe_core::{replacer::Replacer, rehydrator::Rehydrator};
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

/// Health check endpoint.
pub async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "cloakpipe"
    }))
}

/// Proxy handler for /v1/chat/completions.
/// Pseudonymizes the request, forwards to upstream, rehydrates the response.
pub async fn proxy_chat_completions(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(mut body): Json<Value>,
) -> Result<Response, (StatusCode, String)> {
    let request_id = Uuid::new_v4().to_string();
    let is_streaming = body
        .get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // Pseudonymize message contents
    let entities_count = pseudonymize_messages(&state, &mut body, &request_id)
        .await
        .map_err(|e| {
            tracing::error!(request_id = %request_id, "Pseudonymization failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Pseudonymization failed: {}", e))
        })?;

    tracing::info!(
        request_id = %request_id,
        entities = entities_count,
        streaming = is_streaming,
        "Forwarding pseudonymized request"
    );

    // Forward to upstream
    let upstream_url = format!(
        "{}/v1/chat/completions",
        state.config.proxy.upstream.trim_end_matches('/')
    );

    let mut req = state
        .http_client
        .post(&upstream_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", state.api_key))
        .json(&body);

    // Forward select headers
    if let Some(org) = headers.get("openai-organization") {
        req = req.header("OpenAI-Organization", org);
    }

    let upstream_resp = req.send().await.map_err(|e| {
        tracing::error!(request_id = %request_id, "Upstream request failed: {}", e);
        (StatusCode::BAD_GATEWAY, format!("Upstream request failed: {}", e))
    })?;

    let status = upstream_resp.status();
    if !status.is_success() {
        let error_body = upstream_resp.text().await.unwrap_or_default();
        tracing::warn!(request_id = %request_id, status = %status, "Upstream error");
        return Ok(Response::builder()
            .status(StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY))
            .header("Content-Type", "application/json")
            .body(Body::from(error_body))
            .unwrap());
    }

    if is_streaming {
        // SSE streaming rehydration
        let vault = state.vault.clone();
        let stream = streaming::rehydrate_stream(upstream_resp, vault, request_id.clone()).await;

        Ok(Response::builder()
            .status(200)
            .header("Content-Type", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .header("X-CloakPipe-Request-Id", &request_id)
            .body(Body::from_stream(stream))
            .unwrap())
    } else {
        // Non-streaming: rehydrate full response
        let resp_text = upstream_resp.text().await.map_err(|e| {
            (StatusCode::BAD_GATEWAY, format!("Failed to read upstream response: {}", e))
        })?;

        let mut resp_json: Value = serde_json::from_str(&resp_text).map_err(|e| {
            (StatusCode::BAD_GATEWAY, format!("Invalid upstream JSON: {}", e))
        })?;

        // Rehydrate assistant message content
        let vault = state.vault.lock().await;
        if let Some(choices) = resp_json.get_mut("choices").and_then(|c| c.as_array_mut()) {
            for choice in choices {
                if let Some(content) = choice
                    .get_mut("message")
                    .and_then(|m| m.get_mut("content"))
                    .and_then(|c| c.as_str())
                    .map(|s| s.to_string())
                {
                    if let Ok(rehydrated) = Rehydrator::rehydrate(&content, &vault) {
                        choice["message"]["content"] =
                            Value::String(rehydrated.text);

                        let _ = state.audit.log_rehydrate(
                            &request_id,
                            rehydrated.rehydrated_count,
                        );
                    }
                }
            }
        }

        Ok(Response::builder()
            .status(200)
            .header("Content-Type", "application/json")
            .header("X-CloakPipe-Request-Id", &request_id)
            .body(Body::from(serde_json::to_string(&resp_json).unwrap()))
            .unwrap())
    }
}

/// Proxy handler for /v1/embeddings.
/// Pseudonymizes the input text(s), forwards to upstream, returns embeddings as-is.
pub async fn proxy_embeddings(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(mut body): Json<Value>,
) -> Result<Response, (StatusCode, String)> {
    let request_id = Uuid::new_v4().to_string();

    // Pseudonymize embedding input(s)
    let entities_count = pseudonymize_embedding_input(&state, &mut body, &request_id)
        .await
        .map_err(|e| {
            tracing::error!(request_id = %request_id, "Pseudonymization failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Pseudonymization failed: {}", e))
        })?;

    tracing::info!(
        request_id = %request_id,
        entities = entities_count,
        "Forwarding pseudonymized embeddings request"
    );

    let upstream_url = format!(
        "{}/v1/embeddings",
        state.config.proxy.upstream.trim_end_matches('/')
    );

    let mut req = state
        .http_client
        .post(&upstream_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", state.api_key))
        .json(&body);

    if let Some(org) = headers.get("openai-organization") {
        req = req.header("OpenAI-Organization", org);
    }

    let upstream_resp = req.send().await.map_err(|e| {
        tracing::error!(request_id = %request_id, "Upstream request failed: {}", e);
        (StatusCode::BAD_GATEWAY, format!("Upstream request failed: {}", e))
    })?;

    let status = upstream_resp.status();
    let resp_body = upstream_resp.text().await.unwrap_or_default();

    if !status.is_success() {
        tracing::warn!(request_id = %request_id, status = %status, "Upstream error");
    }

    // Embeddings are numerical vectors — no rehydration needed
    Ok(Response::builder()
        .status(StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK))
        .header("Content-Type", "application/json")
        .header("X-CloakPipe-Request-Id", &request_id)
        .body(Body::from(resp_body))
        .unwrap())
}

/// Pseudonymize all message contents in the request body.
async fn pseudonymize_messages(
    state: &AppState,
    body: &mut Value,
    request_id: &str,
) -> anyhow::Result<usize> {
    let mut total_entities = 0;

    if let Some(messages) = body.get_mut("messages").and_then(|m| m.as_array_mut()) {
        let mut vault = state.vault.lock().await;
        for msg in messages {
            if let Some(content) = msg.get_mut("content").and_then(|c| c.as_str()).map(|s| s.to_string()) {
                let entities = state.detector.detect(&content)?;
                if !entities.is_empty() {
                    let result = Replacer::pseudonymize(&content, &entities, &mut vault)?;
                    msg["content"] = Value::String(result.text);

                    let categories: Vec<String> = entities
                        .iter()
                        .map(|e| format!("{:?}", e.category))
                        .collect();

                    let _ = state.audit.log_pseudonymize(
                        request_id,
                        entities.len(),
                        entities.len(),
                        categories,
                    );

                    total_entities += entities.len();
                }
            }
        }
    }

    Ok(total_entities)
}

/// Pseudonymize embedding input (string or array of strings).
async fn pseudonymize_embedding_input(
    state: &AppState,
    body: &mut Value,
    request_id: &str,
) -> anyhow::Result<usize> {
    let mut total_entities = 0;
    let mut vault = state.vault.lock().await;

    if let Some(input) = body.get_mut("input") {
        match input {
            Value::String(text) => {
                let original = text.clone();
                let entities = state.detector.detect(&original)?;
                if !entities.is_empty() {
                    let result = Replacer::pseudonymize(&original, &entities, &mut vault)?;
                    *input = Value::String(result.text);

                    let categories: Vec<String> = entities
                        .iter()
                        .map(|e| format!("{:?}", e.category))
                        .collect();
                    let _ = state.audit.log_pseudonymize(
                        request_id,
                        entities.len(),
                        entities.len(),
                        categories,
                    );
                    total_entities += entities.len();
                }
            }
            Value::Array(items) => {
                for item in items.iter_mut() {
                    if let Some(text) = item.as_str().map(|s| s.to_string()) {
                        let entities = state.detector.detect(&text)?;
                        if !entities.is_empty() {
                            let result = Replacer::pseudonymize(&text, &entities, &mut vault)?;
                            *item = Value::String(result.text);

                            let categories: Vec<String> = entities
                                .iter()
                                .map(|e| format!("{:?}", e.category))
                                .collect();
                            let _ = state.audit.log_pseudonymize(
                                request_id,
                                entities.len(),
                                entities.len(),
                                categories,
                            );
                            total_entities += entities.len();
                        }
                    }
                }
            }
            _ => {}
        }
    }

    Ok(total_entities)
}
