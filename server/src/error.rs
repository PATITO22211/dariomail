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
        if status.is_server_error() {
            tracing::warn!(status = status.as_u16(), error = %redact_userinfo(&message), "fallo hacia el correo");
        }
        (status, Json(json!({ "error": message }))).into_response()
    }
}

/// Quita `usuario:clave@` de cualquier URL antes de escribir al log.
fn redact_userinfo(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(pos) = rest.find("://") {
        out.push_str(&rest[..pos + 3]);
        rest = &rest[pos + 3..];
        let end = rest
            .find(|c: char| c == '/' || c == '?' || c == '#' || c.is_whitespace() || c == ')')
            .unwrap_or(rest.len());
        if let Some(at) = rest[..end].rfind('@') {
            out.push_str("***@");
            rest = &rest[at + 1..];
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::redact_userinfo;

    #[test]
    fn redacts_credentials_in_urls() {
        let msg = "fallo (https://dario%40x.com:secreto@mail.x.com/jmap/session) y a@b.com";
        let out = redact_userinfo(msg);
        assert!(!out.contains("secreto"));
        assert!(out.contains("https://***@mail.x.com/jmap/session"));
        assert!(out.contains("a@b.com"));
    }
}
