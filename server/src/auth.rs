use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::http::header::{COOKIE, SET_COOKIE};
use axum::http::HeaderMap;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;

use crate::error::ApiError;

const COOKIE_NAME: &str = "dariomail_session";
const SESSION_SECONDS: u64 = 14 * 24 * 60 * 60;
const MAX_ATTEMPTS: usize = 8;
const WINDOW: Duration = Duration::from_secs(10 * 60);

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Deserialize)]
struct SessionClaims {
    exp: u64,
}

#[derive(Default)]
pub struct LoginLimiter {
    hits: Mutex<HashMap<String, Vec<Instant>>>,
}

impl LoginLimiter {
    pub fn check(&self, key: &str) -> bool {
        let mut map = self.hits.lock().expect("limitador");
        let now = Instant::now();
        let entry = map.entry(key.to_string()).or_default();
        entry.retain(|stamp| now.duration_since(*stamp) < WINDOW);
        entry.len() < MAX_ATTEMPTS
    }

    pub fn record_failure(&self, key: &str) {
        let mut map = self.hits.lock().expect("limitador");
        let now = Instant::now();
        let entry = map.entry(key.to_string()).or_default();
        entry.retain(|stamp| now.duration_since(*stamp) < WINDOW);
        entry.push(now);
    }
}

pub fn hash_password(password: &str) -> Result<String, ApiError> {
    let mut salt_bytes = [0u8; 16];
    getrandom::getrandom(&mut salt_bytes)
        .map_err(|_| ApiError::Upstream("No se pudo generar la sal".into()))?;
    let salt = SaltString::encode_b64(&salt_bytes)
        .map_err(|_| ApiError::Upstream("No se pudo codificar la sal".into()))?;
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| ApiError::Upstream("No se pudo calcular el hash".into()))
}

pub fn verify_password(password: &str, encoded: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(encoded) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

pub fn issue_session(secret: &str) -> Result<String, ApiError> {
    let exp = unix_now() + SESSION_SECONDS;
    let payload = serde_json::json!({ "exp": exp }).to_string();
    sign(secret, &payload)
}

pub fn session_is_valid(secret: &str, headers: &HeaderMap) -> bool {
    let Some(token) = cookie_value(headers) else {
        return false;
    };
    verify(secret, &token)
}

pub fn require_session(secret: &str, headers: &HeaderMap) -> Result<(), ApiError> {
    if session_is_valid(secret, headers) {
        Ok(())
    } else {
        Err(ApiError::Unauthorized("No autenticado".into()))
    }
}

pub fn set_cookie_header(token: &str, secure: bool) -> String {
    cookie_header(token, SESSION_SECONDS, secure)
}

pub fn clear_cookie_header(secure: bool) -> String {
    cookie_header("", 0, secure)
}

pub fn client_key(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "local".to_string())
}

fn cookie_header(token: &str, max_age: u64, secure: bool) -> String {
    let secure_attr = if secure { "; Secure" } else { "" };
    format!("{COOKIE_NAME}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={max_age}{secure_attr}")
}

fn cookie_value(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(COOKIE)?.to_str().ok()?;
    for part in raw.split(';') {
        let part = part.trim();
        if let Some(value) = part.strip_prefix(&format!("{COOKIE_NAME}=")) {
            return Some(value.to_string());
        }
    }
    None
}

fn sign(secret: &str, payload: &str) -> Result<String, ApiError> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| ApiError::BadRequest("DARIOMAIL_SECRET no es válido".into()))?;
    mac.update(payload.as_bytes());
    let sig = mac.finalize().into_bytes();
    Ok(format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(payload.as_bytes()),
        URL_SAFE_NO_PAD.encode(sig)
    ))
}

fn verify(secret: &str, token: &str) -> bool {
    let Some((payload_b64, sig_b64)) = token.split_once('.') else {
        return false;
    };
    let Ok(payload) = URL_SAFE_NO_PAD.decode(payload_b64) else {
        return false;
    };
    let Ok(sig) = URL_SAFE_NO_PAD.decode(sig_b64) else {
        return false;
    };
    let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(&payload);
    if mac.verify_slice(&sig).is_err() {
        return false;
    }
    let Ok(claims) = serde_json::from_slice::<SessionClaims>(&payload) else {
        return false;
    };
    claims.exp > unix_now()
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn cookie_name_header() -> axum::http::HeaderName {
    SET_COOKIE
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_and_cookie_roundtrip() {
        let hash = hash_password("clave-larga").unwrap();
        assert!(verify_password("clave-larga", &hash));
        assert!(!verify_password("otra", &hash));

        let token = issue_session("secreto-de-prueba-largo").unwrap();
        assert!(verify("secreto-de-prueba-largo", &token));
        assert!(!verify("otro-secreto-distinto", &token));
        assert!(!verify("secreto-de-prueba-largo", "no.es.valido"));
    }

    #[test]
    fn limiter_blocks_after_eight_failures() {
        let limiter = LoginLimiter::default();
        for _ in 0..8 {
            assert!(limiter.check("ip"));
            limiter.record_failure("ip");
        }
        assert!(!limiter.check("ip"));
    }
}
