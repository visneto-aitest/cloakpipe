//! HTTP server setup and router configuration.

use crate::{handlers, state::AppState};
use axum::{routing::{get, post}, Router};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

/// Build the axum router with all routes and middleware.
pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(handlers::health))
        .route("/v1/chat/completions", post(handlers::proxy_chat_completions))
        .route("/v1/embeddings", post(handlers::proxy_embeddings))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Start the proxy server.
pub async fn start(state: AppState) -> anyhow::Result<()> {
    let listen_addr = state.config.proxy.listen.clone();
    let state = Arc::new(state);

    let app = build_router(state);

    tracing::info!("CloakPipe proxy listening on {}", listen_addr);

    let listener = tokio::net::TcpListener::bind(&listen_addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
