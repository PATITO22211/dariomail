use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::RwLock;
use tracing::warn;

use crate::error::ApiError;
use crate::jmap::build::{
    build_destroy, build_draft, build_email_get, build_email_query, build_empty_trash,
    build_identity_get, build_keyword_update, build_mailbox_create_archive, build_mailbox_get,
    build_move, build_send, build_thread_get, build_thread_query, DraftInput, OutboundAttachment,
    OutboundMail,
};
use crate::jmap::parse::{
    assemble_thread_page, build_thread_detail, created_id, decode_cursor, ensure_set_ok,
    message_html, parse_email_list, parse_mailboxes, parse_method_responses, parse_threads,
    EmailRecord, Mailbox, ThreadDetail, ThreadPage,
};
use crate::jmap::search::search_filter;
use crate::sanitize::html_to_text;

#[derive(Clone, Debug)]
struct Session {
    api_url: String,
    download_url: String,
    upload_url: String,
    event_source_url: String,
    account_id: String,
    username: String,
}

pub struct JmapClient {
    http: reqwest::Client,
    base_url: String,
    user: String,
    password: String,
    session: RwLock<Option<Session>>,
}

#[derive(Debug, Deserialize)]
struct UploadResponse {
    #[serde(rename = "blobId")]
    blob_id: String,
    #[serde(default)]
    size: u64,
}

impl JmapClient {
    pub fn new(base_url: String, user: String, password: String) -> Result<Self, ApiError> {
        let http = reqwest::Client::builder()
            .use_rustls_tls()
            .timeout(Duration::from_secs(40))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|err| {
                ApiError::Upstream(format!("No se pudo crear el cliente HTTP ({err})"))
            })?;
        Ok(Self {
            http,
            base_url: base_url.trim_end_matches('/').to_string(),
            user,
            password,
            session: RwLock::new(None),
        })
    }

    pub fn user_email(&self) -> &str {
        &self.user
    }

    pub async fn mailboxes(&self) -> Result<Vec<Mailbox>, ApiError> {
        let session = self.session().await?;
        let response = self.call(&build_mailbox_get(&session.account_id)).await?;
        let calls = parse_method_responses(&response)?;
        let mut list = parse_mailboxes(&method_payload(&calls, "mb")?)?;
        if !list
            .iter()
            .any(|mailbox| mailbox.role.as_deref() == Some("archive"))
        {
            if let Err(err) = self
                .call(&build_mailbox_create_archive(&session.account_id))
                .await
            {
                warn!("no se pudo crear el archivo: {err}");
            } else {
                let response = self.call(&build_mailbox_get(&session.account_id)).await?;
                let calls = parse_method_responses(&response)?;
                list = parse_mailboxes(&method_payload(&calls, "mb")?)?;
            }
        }
        Ok(list)
    }

    pub async fn thread_page(
        &self,
        mailbox_id: &str,
        limit: u64,
        cursor: Option<&str>,
    ) -> Result<ThreadPage, ApiError> {
        let session = self.session().await?;
        let limit = limit.clamp(1, 100);
        let anchor = match cursor {
            Some(value) if !value.is_empty() => Some(decode_cursor(value)?),
            _ => None,
        };
        let first = self
            .call(&build_thread_query(
                &session.account_id,
                mailbox_id,
                limit,
                anchor.as_deref(),
            ))
            .await?;
        self.finish_page(&session.account_id, first, limit as usize)
            .await
    }

    pub async fn search_page(
        &self,
        mailbox_id: Option<&str>,
        query: &str,
        limit: u64,
        cursor: Option<&str>,
    ) -> Result<ThreadPage, ApiError> {
        let session = self.session().await?;
        let limit = limit.clamp(1, 100);
        let anchor = match cursor {
            Some(value) if !value.is_empty() => Some(decode_cursor(value)?),
            _ => None,
        };
        let filter = search_filter(query, mailbox_id)?;
        let first = self
            .call(&build_email_query(
                &session.account_id,
                filter,
                limit,
                anchor.as_deref(),
            ))
            .await?;
        let mut page = self
            .finish_page(&session.account_id, first, limit as usize)
            .await?;
        let boxes = self.mailboxes().await?;
        for thread in &mut page.threads {
            thread.folder = thread.mailbox_ids.iter().find_map(|id| {
                boxes
                    .iter()
                    .find(|mailbox| &mailbox.id == id)
                    .and_then(|mailbox| mailbox.folder.clone())
            });
        }
        Ok(page)
    }

    async fn finish_page(
        &self,
        account_id: &str,
        first: serde_json::Value,
        limit: usize,
    ) -> Result<ThreadPage, ApiError> {
        let calls = parse_method_responses(&first)?;
        let query_ids = string_ids(method_payload(&calls, "q")?.get("ids"))?;
        let reps = parse_email_list(method_payload(&calls, "e")?.get("list"))?;
        if reps.is_empty() {
            return Ok(ThreadPage {
                threads: Vec::new(),
                cursor: None,
            });
        }
        let thread_ids = dedup(reps.iter().map(|email| email.thread_id.clone()));
        let second = self
            .call(&build_thread_get(account_id, &thread_ids))
            .await?;
        let threads = parse_threads(&method_payload(&parse_method_responses(&second)?, "t")?)?;
        let email_ids = dedup(threads.iter().flat_map(|thread| thread.email_ids.clone()));
        let emails = if email_ids.is_empty() {
            Vec::new()
        } else {
            let third = self
                .call(&build_email_get(account_id, &email_ids, false))
                .await?;
            parse_email_list(method_payload(&parse_method_responses(&third)?, "e")?.get("list"))?
        };
        Ok(assemble_thread_page(
            &query_ids, &reps, &threads, &emails, limit,
        ))
    }

    pub async fn thread(
        &self,
        thread_id: &str,
        trusted: &std::collections::HashSet<String>,
    ) -> Result<ThreadDetail, ApiError> {
        let session = self.session().await?;
        let first = self
            .call(&build_thread_get(
                &session.account_id,
                &[thread_id.to_string()],
            ))
            .await?;
        let threads = parse_threads(&method_payload(&parse_method_responses(&first)?, "t")?)?;
        let thread = threads
            .into_iter()
            .find(|thread| thread.id == thread_id)
            .ok_or_else(|| ApiError::NotFound("No se encontró el hilo".into()))?;
        if thread.email_ids.is_empty() {
            return Err(ApiError::NotFound("El hilo no tiene mensajes".into()));
        }
        let second = self
            .call(&build_email_get(
                &session.account_id,
                &thread.email_ids,
                true,
            ))
            .await?;
        let emails =
            parse_email_list(method_payload(&parse_method_responses(&second)?, "e")?.get("list"))?;
        build_thread_detail(&thread, &emails, trusted)
    }

    pub async fn message_html(
        &self,
        email_id: &str,
        allow_remote_images: bool,
        trusted: &std::collections::HashSet<String>,
    ) -> Result<String, ApiError> {
        let email = self.email(email_id, true).await?;
        let sender = email
            .from
            .first()
            .map(|person| person.email.to_ascii_lowercase())
            .unwrap_or_default();
        let allow = allow_remote_images || trusted.contains(&sender);
        Ok(message_html(&email, allow))
    }

    pub async fn set_seen(&self, email_id: &str, seen: bool) -> Result<(), ApiError> {
        let session = self.session().await?;
        let response = self
            .call(&build_keyword_update(&session.account_id, email_id, seen))
            .await?;
        ensure_set_ok(&method_payload(&parse_method_responses(&response)?, "u")?)
    }

    pub async fn archive(&self, email_id: &str) -> Result<(), ApiError> {
        let archive = self
            .mailbox_by_role("archive")
            .await?
            .ok_or_else(|| ApiError::BadRequest("No hay buzón de archivo".into()))?;
        self.move_email(email_id, &archive, true).await
    }

    pub async fn trash(&self, email_id: &str) -> Result<(), ApiError> {
        let trash = self
            .mailbox_by_role("trash")
            .await?
            .ok_or_else(|| ApiError::BadRequest("No hay papelera".into()))?;
        self.move_email(email_id, &trash, false).await
    }

    pub async fn move_email(
        &self,
        email_id: &str,
        mailbox_id: &str,
        mark_seen: bool,
    ) -> Result<(), ApiError> {
        let session = self.session().await?;
        let email = self.email(email_id, false).await?;
        let response = self
            .call(&build_move(
                &session.account_id,
                email_id,
                &email.mailbox_ids,
                mailbox_id,
                mark_seen,
            ))
            .await?;
        ensure_set_ok(&method_payload(&parse_method_responses(&response)?, "u")?)
    }

    pub async fn destroy_draft(&self, email_id: &str) -> Result<(), ApiError> {
        let email = self.email(email_id, false).await?;
        let drafts = self
            .mailbox_by_role("drafts")
            .await?
            .ok_or_else(|| ApiError::BadRequest("No hay buzón de borradores".into()))?;
        if !email.mailbox_ids.iter().any(|id| id == &drafts) {
            return Err(ApiError::BadRequest("Solo se descartan borradores".into()));
        }
        let session = self.session().await?;
        let response = self
            .call(&build_destroy(&session.account_id, email_id))
            .await?;
        ensure_set_ok(&method_payload(&parse_method_responses(&response)?, "d")?)
    }

    pub async fn empty_trash(&self) -> Result<(), ApiError> {
        let session = self.session().await?;
        let trash = self
            .mailbox_by_role("trash")
            .await?
            .ok_or_else(|| ApiError::BadRequest("No hay papelera".into()))?;
        for _ in 0..10 {
            let response = self
                .call(&build_empty_trash(&session.account_id, &trash))
                .await?;
            let calls = parse_method_responses(&response)?;
            let ids = string_ids(method_payload(&calls, "q")?.get("ids"))?;
            if ids.is_empty() {
                return Ok(());
            }
            ensure_set_ok(&method_payload(&calls, "d")?)?;
            if ids.len() < 500 {
                return Ok(());
            }
        }
        Ok(())
    }

    pub async fn save_draft(
        &self,
        existing_id: Option<&str>,
        to: Vec<(String, String)>,
        subject: String,
        html: String,
        text: String,
    ) -> Result<String, ApiError> {
        let session = self.session().await?;
        let drafts = self
            .mailbox_by_role("drafts")
            .await?
            .ok_or_else(|| ApiError::BadRequest("No hay buzón de borradores".into()))?;
        let text = if text.trim().is_empty() {
            html_to_text(&html)
        } else {
            text
        };
        let response = self
            .call(&build_draft(
                &session.account_id,
                &drafts,
                existing_id,
                &DraftInput {
                    from_email: self.user.clone(),
                    from_name: display_name(&self.user),
                    to,
                    subject,
                    html,
                    text,
                },
            ))
            .await?;
        let payload = method_payload(&parse_method_responses(&response)?, "d")?;
        ensure_set_ok(&payload)?;
        if let Some(id) = existing_id {
            return Ok(id.to_string());
        }
        created_id(&payload, "draft")
            .ok_or_else(|| ApiError::Upstream("El borrador no devolvió id".into()))
    }

    pub async fn send(&self, mut mail: OutboundMail) -> Result<String, ApiError> {
        let session = self.session().await?;
        mail.identity_id = self.identity_id(&session).await?;
        if mail.sent_mailbox_id.is_empty() {
            mail.sent_mailbox_id = self
                .mailbox_by_role("sent")
                .await?
                .ok_or_else(|| ApiError::BadRequest("No hay buzón de enviados".into()))?;
        }
        let response = self.call(&build_send(&session.account_id, &mail)).await?;
        let calls = parse_method_responses(&response)?;
        let email_set = method_payload(&calls, "em")?;
        ensure_set_ok(&email_set)?;
        ensure_set_ok(&method_payload(&calls, "sub")?)?;
        created_id(&email_set, "msg")
            .ok_or_else(|| ApiError::Upstream("El envío no devolvió id".into()))
    }

    pub async fn upload_blob(
        &self,
        bytes: Vec<u8>,
        content_type: &str,
    ) -> Result<OutboundAttachment, ApiError> {
        let session = self.session().await?;
        let url = fill_upload(&session.upload_url, &session.account_id);
        let size = bytes.len() as u64;
        let response = self
            .http
            .post(url)
            .header("Authorization", self.authorization())
            .header("Content-Type", content_type)
            .body(bytes)
            .send()
            .await
            .map_err(|err| ApiError::Upstream(format!("No se pudo subir el adjunto ({err})")))?;
        if !response.status().is_success() {
            return Err(ApiError::Upstream("El correo rechazó el adjunto".into()));
        }
        let payload: UploadResponse = response
            .json()
            .await
            .map_err(|_| ApiError::Upstream("Respuesta de subida ilegible".into()))?;
        Ok(OutboundAttachment {
            blob_id: payload.blob_id,
            name: String::new(),
            content_type: content_type.to_string(),
            size: if payload.size == 0 {
                size
            } else {
                payload.size
            },
        })
    }

    pub async fn download(&self, blob_id: &str, name: &str) -> Result<reqwest::Response, ApiError> {
        if !valid_blob_id(blob_id) {
            return Err(ApiError::BadRequest(
                "Identificador de adjunto no válido".into(),
            ));
        }
        let session = self.session().await?;
        let url = fill_download(&session.download_url, &session.account_id, blob_id, name);
        let response = self
            .http
            .get(url)
            .header("Authorization", self.authorization())
            .send()
            .await
            .map_err(|err| {
                ApiError::Upstream(format!("No se pudo descargar el adjunto ({err})"))
            })?;
        if response.status().as_u16() == 404 {
            return Err(ApiError::NotFound("No se encontró el adjunto".into()));
        }
        if !response.status().is_success() {
            return Err(ApiError::Upstream("El correo no entregó el adjunto".into()));
        }
        Ok(response)
    }

    pub async fn open_events(&self) -> Result<reqwest::Response, ApiError> {
        let session = self.session().await?;
        let url = fill_event_source(&session.event_source_url);
        let response = self
            .http
            .get(url)
            .timeout(Duration::from_secs(3600))
            .header("Authorization", self.authorization())
            .header("Accept", "text/event-stream")
            .send()
            .await
            .map_err(|err| {
                ApiError::Upstream(format!("No se pudo abrir el canal de cambios ({err})"))
            })?;
        if !response.status().is_success() {
            return Err(ApiError::Upstream(
                "El canal de cambios no está disponible".into(),
            ));
        }
        Ok(response)
    }

    async fn email(&self, email_id: &str, with_body: bool) -> Result<EmailRecord, ApiError> {
        let session = self.session().await?;
        let response = self
            .call(&build_email_get(
                &session.account_id,
                &[email_id.to_string()],
                with_body,
            ))
            .await?;
        let emails = parse_email_list(
            method_payload(&parse_method_responses(&response)?, "e")?.get("list"),
        )?;
        emails
            .into_iter()
            .find(|email| email.id == email_id)
            .ok_or_else(|| ApiError::NotFound("No se encontró el mensaje".into()))
    }

    async fn mailbox_by_role(&self, role: &str) -> Result<Option<String>, ApiError> {
        let boxes = self.mailboxes().await?;
        Ok(boxes
            .into_iter()
            .find(|mailbox| mailbox.role.as_deref() == Some(role))
            .map(|mailbox| mailbox.id))
    }

    async fn identity_id(&self, session: &Session) -> Result<String, ApiError> {
        let response = self.call(&build_identity_get(&session.account_id)).await?;
        let payload = method_payload(&parse_method_responses(&response)?, "id")?;
        let list = payload
            .get("list")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let matched = list.iter().find(|item| {
            item.get("email")
                .and_then(|v| v.as_str())
                .is_some_and(|email| email.eq_ignore_ascii_case(&self.user))
        });
        let chosen = matched.or_else(|| list.first());
        chosen
            .and_then(|item| item.get("id"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| ApiError::Upstream("No hay identidad de envío".into()))
    }

    async fn call(&self, body: &Value) -> Result<Value, ApiError> {
        let session = self.session().await?;
        self.post_json(&session.api_url, body).await
    }

    async fn post_json(&self, url: &str, body: &Value) -> Result<Value, ApiError> {
        let response = self
            .http
            .post(url)
            .header("Authorization", self.authorization())
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .json(body)
            .send()
            .await
            .map_err(|err| {
                ApiError::Upstream(format!("El servidor de correo no respondió ({err})"))
            })?;
        let status = response.status();
        if status.as_u16() == 401 {
            *self.session.write().await = None;
            return Err(ApiError::Upstream(
                "El correo rechazó la credencial de aplicación".into(),
            ));
        }
        if !status.is_success() {
            return Err(ApiError::Upstream(format!(
                "El servidor de correo respondió {}",
                status.as_u16()
            )));
        }
        response
            .json()
            .await
            .map_err(|_| ApiError::Upstream("Respuesta JMAP ilegible".into()))
    }

    async fn session(&self) -> Result<Session, ApiError> {
        if let Some(session) = self.session.read().await.clone() {
            return Ok(session);
        }
        // Stalwart responde 307 en /.well-known/jmap hacia /jmap/session (RFC 8620 lo permite).
        // Seguimos hasta 3 redirecciones solo dentro del mismo origen para no mandar la credencial fuera.
        let mut url = reqwest::Url::parse(&format!("{}/.well-known/jmap", self.base_url))
            .map_err(|_| ApiError::Upstream("STALWART_BASE_URL no es válida".into()))?;
        let mut hops = 0;
        let response = loop {
            let response = self
                .http
                .get(url.clone())
                .header("Authorization", self.authorization())
                .header("Accept", "application/json")
                .send()
                .await
                .map_err(|err| {
                    ApiError::Upstream(format!("No se pudo leer la sesión JMAP ({err})"))
                })?;
            if !response.status().is_redirection() || hops >= 3 {
                break response;
            }
            let next = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .and_then(|location| url.join(location).ok())
                .ok_or_else(|| ApiError::Upstream("Redirección JMAP sin destino".into()))?;
            if next.origin() != url.origin() {
                return Err(ApiError::Upstream(
                    "La sesión JMAP redirige a otro servidor".into(),
                ));
            }
            let mut next = next;
            let _ = next.set_username("");
            let _ = next.set_password(None);
            url = next;
            hops += 1;
        };
        if !response.status().is_success() {
            return Err(ApiError::Upstream("No se pudo abrir la sesión JMAP".into()));
        }
        let body: Value = response
            .json()
            .await
            .map_err(|_| ApiError::Upstream("La sesión JMAP no es JSON".into()))?;
        let session = parse_session(&body)?;
        tracing::debug!(username = %session.username, api = %session.api_url, "sesión JMAP");
        *self.session.write().await = Some(session.clone());
        Ok(session)
    }

    fn authorization(&self) -> String {
        let raw = format!("{}:{}", self.user, self.password);
        format!("Basic {}", STANDARD.encode(raw.as_bytes()))
    }
}

pub fn display_name(email: &str) -> String {
    let local = email.split('@').next().unwrap_or(email);
    let mut chars = local.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => email.to_string(),
    }
}

fn parse_session(body: &Value) -> Result<Session, ApiError> {
    let api_url = required_string(body, "apiUrl")?;
    let download_url = required_string(body, "downloadUrl")?;
    let upload_url = required_string(body, "uploadUrl")?;
    let event_source_url = required_string(body, "eventSourceUrl")?;
    let account_id = body
        .pointer("/primaryAccounts/urn:ietf:params:jmap:mail")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::Upstream("La sesión JMAP no trae cuenta de correo".into()))?
        .to_string();
    let username = body
        .get("username")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(Session {
        api_url,
        download_url,
        upload_url,
        event_source_url,
        account_id,
        username,
    })
}

fn required_string(body: &Value, key: &str) -> Result<String, ApiError> {
    body.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| ApiError::Upstream(format!("La sesión JMAP no trae {key}")))
}

fn method_payload(
    calls: &[crate::jmap::parse::MethodResponse],
    id: &str,
) -> Result<Value, ApiError> {
    Ok(crate::jmap::parse::method_by_id(calls, id)?.payload.clone())
}

fn string_ids(value: Option<&Value>) -> Result<Vec<String>, ApiError> {
    let list = value
        .and_then(|v| v.as_array())
        .ok_or_else(|| ApiError::Upstream("La consulta JMAP no trae ids".into()))?;
    Ok(list
        .iter()
        .filter_map(|id| id.as_str().map(|s| s.to_string()))
        .collect())
}

fn dedup(ids: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut out = Vec::new();
    for id in ids {
        if id.is_empty() || out.iter().any(|seen| seen == &id) {
            continue;
        }
        out.push(id);
    }
    out
}

pub fn fill_event_source(template: &str) -> String {
    template
        .replace("{types}", "Email,Mailbox,Thread,EmailDelivery")
        .replace("{closeafter}", "no")
        .replace("{ping}", "15")
}

pub fn fill_upload(template: &str, account_id: &str) -> String {
    template.replace("{accountId}", &urlencoding::encode(account_id))
}

pub fn fill_download(template: &str, account_id: &str, blob_id: &str, name: &str) -> String {
    let safe_name = if name.trim().is_empty() {
        "adjunto"
    } else {
        name
    };
    template
        .replace("{accountId}", &urlencoding::encode(account_id))
        .replace("{blobId}", &urlencoding::encode(blob_id))
        .replace("{name}", &urlencoding::encode(safe_name))
        .replace("{type}", "")
}

pub fn valid_blob_id(blob_id: &str) -> bool {
    !blob_id.is_empty()
        && blob_id.len() <= 512
        && !blob_id.contains("..")
        && blob_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '=' | '.'))
}
