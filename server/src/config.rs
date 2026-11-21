use crate::error::ApiError;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub bind: String,
    pub stalwart_base_url: String,
    pub user: String,
    pub stalwart_password: String,
    pub secret: String,
    pub password_hash: String,
    pub cookie_secure: bool,
    pub trusted_senders_path: String,
}

impl Config {
    pub fn from_env() -> Result<Self, ApiError> {
        let port = std::env::var("PORT")
            .ok()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "3001".to_string());
        let port: u16 = port
            .parse()
            .map_err(|_| ApiError::BadRequest("PORT no es un número válido".into()))?;

        Ok(Self {
            port,
            bind: env_or("DARIOMAIL_BIND", "127.0.0.1"),
            stalwart_base_url: require("STALWART_BASE_URL")?,
            user: require("DARIOMAIL_USER")?,
            stalwart_password: require("STALWART_APP_PASSWORD")?,
            secret: require("DARIOMAIL_SECRET")?,
            password_hash: require("DARIOMAIL_LOGIN_PASSWORD_HASH")?,
            cookie_secure: env_or("DARIOMAIL_COOKIE_SECURE", "true") != "false",
            trusted_senders_path: env_or(
                "DARIOMAIL_TRUSTED_SENDERS_PATH",
                "data/trusted-senders.json",
            ),
        })
    }
}

fn require(key: &str) -> Result<String, ApiError> {
    match std::env::var(key) {
        Ok(value) if !value.trim().is_empty() => Ok(value),
        _ => Err(ApiError::BadRequest(format!("Falta la variable {key}"))),
    }
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key)
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default.to_string())
}
