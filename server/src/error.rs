use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("{0}")]
    Unauthorized(String),
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    TooMany(String),
    #[error("{0}")]
    Upstream(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            ApiError::Unauthorized(message) => (StatusCode::UNAUTHORIZED, message.clone()),
            ApiError::BadRequest(message) => (StatusCode::BAD_REQUEST, message.clone()),
            ApiError::NotFound(message) => (StatusCode::NOT_FOUND, message.clone()),
            ApiError::TooMany(message) => (StatusCode::TOO_MANY_REQUESTS, message.clone()),
            ApiError::Upstream(message) => (StatusCode::BAD_GATEWAY, message.clone()),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}
