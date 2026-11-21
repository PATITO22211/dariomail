use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_TYPE, SET_COOKIE};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use futures::TryStreamExt;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::{self, LoginLimiter};
use crate::config::Config;
use crate::error::ApiError;
use crate::jmap::OutboundAttachment;
use crate::jmap::{display_name, valid_blob_id, JmapClient, OutboundMail};
use crate::sanitize::html_to_text;
use crate::trust::TrustedSenders;

#[derive(Clone)]
pub struct AppState {
    pub cfg: Arc<Config>,
    pub jmap: Arc<JmapClient>,
    pub limiter: Arc<LoginLimiter>,
    pub trust: Arc<TrustedSenders>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
        .route("/api/mailboxes", get(mailboxes))
        .route("/api/threads", get(threads))
        .route("/api/threads/:id", get(thread))
        .route("/api/search", get(search))
        .route("/api/senders/trust", post(trust_sender))
        .route("/api/messages/:id/html", get(message_html))
        .route("/api/messages/:id/read", post(mark_read))
        .route("/api/messages/:id/unread", post(mark_unread))
        .route("/api/messages/:id/archive", post(archive_message))
        .route("/api/messages/:id/move", post(move_message))
        .route("/api/messages/:id", axum::routing::delete(trash_message))
        .route("/api/messages/send", post(send_message))
        .route("/api/drafts", post(save_draft))
        .route("/api/drafts/:id", axum::routing::delete(delete_draft))
        .route("/api/trash/empty", post(empty_trash))
        .route("/api/blobs/:blob_id", get(blob))
        .route("/api/events", get(events))
        .with_state(state)
}

#[derive(Deserialize)]
struct LoginBody {
    password: String,
}

#[derive(Deserialize)]
struct ThreadQuery {
    #[serde(rename = "mailboxId")]
    mailbox_id: String,
    #[serde(default = "default_limit")]
    limit: u64,
    cursor: Option<String>,
}

fn default_limit() -> u64 {
    40
}

#[derive(Deserialize)]
struct HtmlQuery {
    #[serde(default, rename = "allowImages")]
    allow_images: Option<String>,
}

#[derive(Deserialize)]
struct MoveBody {
    #[serde(rename = "mailboxId")]
    mailbox_id: String,
}

#[derive(Deserialize)]
struct AttachmentIn {
    filename: String,
    #[serde(rename = "contentType", default = "default_octet")]
    content_type: String,
    #[serde(default, rename = "dataBase64")]
    data_base64: Option<String>,
    #[serde(default, rename = "blobId")]
    blob_id: Option<String>,
    #[serde(default)]
    size: Option<u64>,
}

#[derive(Deserialize)]
struct SearchParams {
    q: String,
    #[serde(default, rename = "mailboxId")]
    mailbox_id: Option<String>,
    cursor: Option<String>,
    #[serde(default = "default_limit")]
    limit: u64,
}

#[derive(Deserialize)]
struct TrustBody {
    email: String,
}

fn default_octet() -> String {
    "application/octet-stream".into()
}

#[derive(Deserialize)]
struct SendBody {
    to: Vec<String>,
    #[serde(default)]
    cc: Vec<String>,
    #[serde(default)]
    bcc: Vec<String>,
    #[serde(default)]
    subject: String,
    #[serde(default)]
    html: String,
    #[serde(default)]
    text: String,
    #[serde(default, rename = "inReplyTo")]
    in_reply_to: Vec<String>,
    #[serde(default)]
    references: Vec<String>,
    #[serde(default)]
    attachments: Vec<AttachmentIn>,
    #[serde(default, rename = "draftId")]
    draft_id: Option<String>,
}

#[derive(Deserialize)]
struct DraftBody {
    id: Option<String>,
    #[serde(default)]
    to: Vec<String>,
    #[serde(default)]
    subject: String,
    #[serde(default)]
    html: String,
    #[serde(default)]
    text: String,
}

#[derive(Deserialize)]
struct BlobQuery {
    #[serde(default)]
    name: String,
}

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<LoginBody>,
) -> Result<Response, ApiError> {
    let key = auth::client_key(&headers);
    if !state.limiter.check(&key) {
        return Err(ApiError::TooMany(
            "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.".into(),
        ));
    }
    if body.password.trim().is_empty()
        || !auth::verify_password(&body.password, &state.cfg.password_hash)
    {
        state.limiter.record_failure(&key);
        return Err(ApiError::Unauthorized("La clave no coincide".into()));
    }
    let token = auth::issue_session(&state.cfg.secret)?;
    Ok(no_store(
        StatusCode::OK,
        json!({
            "email": state.cfg.user,
            "name": display_name(&state.cfg.user)
        }),
        Some(auth::set_cookie_header(&token, state.cfg.cookie_secure)),
    ))
}

async fn logout(State(state): State<AppState>) -> Response {
    no_store(
        StatusCode::OK,
        json!({ "ok": true }),
        Some(auth::clear_cookie_header(state.cfg.cookie_secure)),
    )
}

async fn me(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    Ok(Json(json!({
        "email": state.cfg.user,
        "name": display_name(&state.cfg.user)
    })))
}

async fn mailboxes(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    let list = state.jmap.mailboxes().await?;
    Ok(Json(json!({ "mailboxes": list })))
}

async fn threads(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ThreadQuery>,
) -> Result<Json<ThreadPageJson>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    if query.mailbox_id.trim().is_empty() {
        return Err(ApiError::BadRequest("Falta mailboxId".into()));
    }
    let page = state
        .jmap
        .thread_page(&query.mailbox_id, query.limit, query.cursor.as_deref())
        .await?;
    Ok(Json(ThreadPageJson(page)))
}

#[derive(serde::Serialize)]
struct ThreadPageJson(crate::jmap::ThreadPage);

async fn thread(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<crate::jmap::ThreadDetail>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    Ok(Json(state.jmap.thread(&id, &state.trust.snapshot()).await?))
}

async fn search(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SearchParams>,
) -> Result<Json<ThreadPageJson>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    let page = state
        .jmap
        .search_page(
            query.mailbox_id.as_deref(),
            &query.q,
            query.limit,
            query.cursor.as_deref(),
        )
        .await?;
    Ok(Json(ThreadPageJson(page)))
}

async fn trust_sender(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<TrustBody>,
) -> Result<Json<Value>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    state.trust.trust(&body.email)?;
    Ok(Json(
        json!({ "ok": true, "email": body.email.trim().to_ascii_lowercase() }),
    ))
}

async fn message_html(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<HtmlQuery>,
) -> Result<Response, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    let allow = matches!(
        query.allow_images.as_deref(),
        Some("1") | Some("true") | Some("yes")
    );
    let html = state
        .jmap
        .message_html(&id, allow, &state.trust.snapshot())
        .await?;
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "text/html; charset=utf-8")
        .header(CACHE_CONTROL, "no-store")
        .header("x-content-type-options", "nosniff")
        .body(Body::from(html))
        .map_err(|_| ApiError::Upstream("No se pudo escribir la respuesta".into()))
}

async fn mark_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    state.jmap.set_seen(&id, true).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn mark_unread(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    state.jmap.set_seen(&id, false).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn archive_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    state.jmap.archive(&id).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn trash_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    state.jmap.trash(&id).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn move_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<MoveBody>,
) -> Result<Json<Value>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    if !valid_mailbox_id(&body.mailbox_id) {
        return Err(ApiError::BadRequest("Buzón no válido".into()));
    }
    state.jmap.move_email(&id, &body.mailbox_id, false).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn send_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SendBody>,
) -> Result<Json<Value>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    let to = parse_people(&body.to)?;
    let cc = parse_people(&body.cc)?;
    let bcc = parse_people(&body.bcc)?;
    if to.is_empty() && cc.is_empty() && bcc.is_empty() {
        return Err(ApiError::BadRequest("Falta un destinatario".into()));
    }
    let mut attachments = Vec::new();
    for incoming in body.attachments {
        attachments.push(prepare_attachment(&state, incoming).await?);
    }
    let text = if body.text.trim().is_empty() {
        html_to_text(&body.html)
    } else {
        body.text
    };
    let subject = if body.subject.trim().is_empty() {
        "(Sin asunto)".into()
    } else {
        body.subject
    };
    let email_id = state
        .jmap
        .send(OutboundMail {
            from_email: state.cfg.user.clone(),
            from_name: display_name(&state.cfg.user),
            to,
            cc,
            bcc,
            subject,
            html: body.html,
            text,
            sent_mailbox_id: String::new(),
            in_reply_to: body.in_reply_to,
            references: body.references,
            attachments,
            draft_id: body.draft_id.filter(|id| !id.is_empty()),
            identity_id: String::new(),
        })
        .await?;
    Ok(Json(json!({ "ok": true, "emailId": email_id })))
}

async fn save_draft(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<DraftBody>,
) -> Result<Json<Value>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    let to = if body.to.is_empty() {
        Vec::new()
    } else {
        parse_people(&body.to)?
    };
    let subject = if body.subject.trim().is_empty() {
        "(Sin asunto)".into()
    } else {
        body.subject
    };
    let id = state
        .jmap
        .save_draft(
            body.id.as_deref().filter(|id| !id.is_empty()),
            to,
            subject,
            body.html,
            body.text,
        )
        .await?;
    Ok(Json(json!({ "id": id })))
}

async fn delete_draft(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    state.jmap.destroy_draft(&id).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn empty_trash(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    state.jmap.empty_trash().await?;
    Ok(Json(json!({ "ok": true })))
}

async fn blob(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(blob_id): Path<String>,
    Query(query): Query<BlobQuery>,
) -> Result<Response, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    if !valid_blob_id(&blob_id) {
        return Err(ApiError::BadRequest(
            "Identificador de adjunto no válido".into(),
        ));
    }
    let name = sanitize_filename(&query.name);
    let upstream = state.jmap.download(&blob_id, &name).await?;
    let content_type = upstream
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let safe_type = safe_content_type(&content_type);
    let stream =
        upstream
            .bytes_stream()
            .map_err(|err| -> Box<dyn std::error::Error + Send + Sync> {
                Box::new(std::io::Error::other(err))
            });
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, safe_type)
        .header(
            CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", name.replace('"', "")),
        )
        .header(CACHE_CONTROL, "private, no-store")
        .header("x-content-type-options", "nosniff")
        .body(Body::from_stream(stream))
        .map_err(|_| ApiError::Upstream("No se pudo escribir el adjunto".into()))
}

async fn events(State(state): State<AppState>, headers: HeaderMap) -> Result<Response, ApiError> {
    auth::require_session(&state.cfg.secret, &headers)?;
    let upstream = state.jmap.open_events().await?;
    let stream =
        upstream
            .bytes_stream()
            .map_err(|err| -> Box<dyn std::error::Error + Send + Sync> {
                Box::new(std::io::Error::other(err))
            });
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "text/event-stream; charset=utf-8")
        .header(CACHE_CONTROL, "no-cache, no-store")
        .header("x-accel-buffering", "no")
        .body(Body::from_stream(stream))
        .map_err(|_| ApiError::Upstream("No se pudo abrir el canal".into()))
}

fn no_store(status: StatusCode, body: Value, cookie: Option<String>) -> Response {
    let mut response = Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "application/json")
        .header(CACHE_CONTROL, "no-store");
    if let Some(cookie) = cookie {
        response = response.header(SET_COOKIE, cookie);
    }
    response
        .body(Body::from(body.to_string()))
        .unwrap_or_else(|_| Response::new(Body::from("{}")))
}

async fn prepare_attachment(
    state: &AppState,
    incoming: AttachmentIn,
) -> Result<OutboundAttachment, ApiError> {
    let name = sanitize_filename(&incoming.filename);
    if let Some(blob_id) = incoming.blob_id.as_deref() {
        if !valid_blob_id(blob_id) {
            return Err(ApiError::BadRequest(
                "Identificador de adjunto no válido".into(),
            ));
        }
        return Ok(OutboundAttachment {
            blob_id: blob_id.to_string(),
            name,
            content_type: incoming.content_type,
            size: incoming.size.unwrap_or(0),
        });
    }
    let encoded = incoming
        .data_base64
        .ok_or_else(|| ApiError::BadRequest("Adjunto incompleto".into()))?;
    let bytes = STANDARD
        .decode(encoded.trim())
        .map_err(|_| ApiError::BadRequest("Adjunto en base64 no válido".into()))?;
    if bytes.len() > 15 * 1024 * 1024 {
        return Err(ApiError::BadRequest("El adjunto supera el límite".into()));
    }
    let mut uploaded = state
        .jmap
        .upload_blob(bytes, &incoming.content_type)
        .await?;
    uploaded.name = name;
    Ok(uploaded)
}

fn parse_people(values: &[String]) -> Result<Vec<(String, String)>, ApiError> {
    let mut people = Vec::new();
    for value in values {
        let email = value.trim();
        if email.is_empty() {
            continue;
        }
        if !valid_email(email) {
            return Err(ApiError::BadRequest(format!(
                "Destinatario no válido: {email}"
            )));
        }
        people.push((email.to_string(), email.to_string()));
    }
    Ok(people)
}

fn valid_email(value: &str) -> bool {
    let Some((local, host)) = value.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !local.contains(' ')
        && host.contains('.')
        && !host.starts_with('.')
        && !host.ends_with('.')
        && !host.contains(' ')
}

fn valid_mailbox_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '='))
}

fn sanitize_filename(name: &str) -> String {
    let trimmed = name.trim().replace(['\r', '\n', '"', '\\'], "");
    let cleaned: String = trimmed
        .chars()
        .map(|ch| if ch.is_control() { '_' } else { ch })
        .collect();
    if cleaned.is_empty() {
        "adjunto".into()
    } else {
        cleaned
    }
}

fn safe_content_type(content_type: &str) -> &'static str {
    let base = content_type
        .split(';')
        .next()
        .unwrap_or("application/octet-stream")
        .trim()
        .to_ascii_lowercase();
    match base.as_str() {
        "text/plain" => "text/plain; charset=utf-8",
        "text/html" | "image/svg+xml" | "application/xhtml+xml" => "application/octet-stream",
        "application/pdf" => "application/pdf",
        "image/png" => "image/png",
        "image/jpeg" => "image/jpeg",
        "image/gif" => "image/gif",
        "image/webp" => "image/webp",
        "application/zip" => "application/zip",
        "application/json" => "application/json",
        _ => "application/octet-stream",
    }
}
