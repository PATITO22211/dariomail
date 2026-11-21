use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::error::ApiError;

pub struct TrustedSenders {
    path: PathBuf,
    emails: Mutex<HashSet<String>>,
}

impl TrustedSenders {
    pub fn load(path: impl Into<PathBuf>) -> Result<Self, ApiError> {
        let path = path.into();
        let emails = read_file(&path)?;
        Ok(Self {
            path,
            emails: Mutex::new(emails),
        })
    }

    pub fn contains(&self, email: &str) -> bool {
        let key = normalize(email);
        self.emails.lock().expect("remitentes").contains(&key)
    }

    pub fn snapshot(&self) -> HashSet<String> {
        self.emails.lock().expect("remitentes").clone()
    }

    pub fn trust(&self, email: &str) -> Result<(), ApiError> {
        let key = normalize(email);
        if !key.contains('@') || key.starts_with('@') || key.ends_with('@') {
            return Err(ApiError::BadRequest("Remitente no válido".into()));
        }
        {
            let mut guard = self.emails.lock().expect("remitentes");
            guard.insert(key);
        }
        self.persist()
    }

    fn persist(&self) -> Result<(), ApiError> {
        if let Some(parent) = self.path.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent).map_err(|_| {
                    ApiError::Upstream("No se pudo crear la carpeta de remitentes".into())
                })?;
            }
        }
        let list: Vec<String> = {
            let guard = self.emails.lock().expect("remitentes");
            let mut values: Vec<String> = guard.iter().cloned().collect();
            values.sort();
            values
        };
        let body = serde_json::to_string_pretty(&list)
            .map_err(|_| ApiError::Upstream("No se pudo guardar el remitente".into()))?;
        fs::write(&self.path, body)
            .map_err(|_| ApiError::Upstream("No se pudo guardar el remitente".into()))
    }
}

fn normalize(email: &str) -> String {
    email.trim().to_ascii_lowercase()
}

fn read_file(path: &Path) -> Result<HashSet<String>, ApiError> {
    if !path.exists() {
        return Ok(HashSet::new());
    }
    let raw = fs::read_to_string(path)
        .map_err(|_| ApiError::Upstream("No se pudo leer los remitentes de confianza".into()))?;
    let list: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
    Ok(list.into_iter().map(|email| normalize(&email)).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_and_reloads_sender() {
        let path = std::env::temp_dir().join(format!(
            "dariomail-trust-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let store = TrustedSenders::load(&path).unwrap();
        store.trust("Elena@Example.com").unwrap();
        assert!(store.contains("elena@example.com"));
        let again = TrustedSenders::load(&path).unwrap();
        assert!(again.contains("elena@example.com"));
        let _ = fs::remove_file(&path);
    }
}
