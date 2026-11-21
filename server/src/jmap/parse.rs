use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::Serialize;
use serde_json::Value;

use crate::error::ApiError;
use crate::sanitize::{html_to_text, sanitize_email_html, text_to_html};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mailbox {
    pub id: String,
    pub name: String,
    pub role: Option<String>,
    pub folder: Option<String>,
    pub total_emails: u64,
    pub unread_emails: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub name: String,
    pub size: String,
    pub kind: String,
    pub blob_id: String,
}

#[derive(Debug, Clone)]
pub struct EmailRecord {
    pub id: String,
    pub thread_id: String,
    pub mailbox_ids: Vec<String>,
    pub seen: bool,
    pub from: Vec<Person>,
    pub to: Vec<Person>,
    pub cc: Vec<Person>,
    pub subject: String,
    pub preview: String,
    pub received_at: String,
    pub message_ids: Vec<String>,
    pub in_reply_to: Vec<String>,
    pub references: Vec<String>,
    pub attachments: Vec<Attachment>,
    pub html: String,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct ThreadEmails {
    pub id: String,
    pub email_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSummary {
    pub id: String,
    pub subject: String,
    pub raw_subject: String,
    pub sender: Person,
    pub recipients: Vec<String>,
    pub preview: String,
    pub date: String,
    pub count: usize,
    pub unread: bool,
    pub message_ids: Vec<String>,
    #[serde(skip_serializing)]
    pub mailbox_ids: Vec<String>,
    pub folder: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadPage {
    pub threads: Vec<ThreadSummary>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiMessage {
    pub id: String,
    pub sender: Person,
    pub recipients: Vec<String>,
    pub timestamp: String,
    pub body_html: String,
    pub plain_snippet: String,
    pub is_html_rich: bool,
    pub unread: bool,
    pub message_id_header: Option<String>,
    pub references: Vec<String>,
    pub attachments: Vec<Attachment>,
    pub remote_images_blocked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadDetail {
    pub id: String,
    pub subject: String,
    pub raw_subject: String,
    pub unread: bool,
    pub updated_at: String,
    pub messages: Vec<ApiMessage>,
}

#[derive(Debug, Clone)]
pub struct MethodResponse {
    pub name: String,
    pub payload: Value,
    pub id: String,
}

pub fn parse_method_responses(body: &Value) -> Result<Vec<MethodResponse>, ApiError> {
    let list = body
        .get("methodResponses")
        .and_then(|v| v.as_array())
        .ok_or_else(|| ApiError::Upstream("Respuesta JMAP sin methodResponses".into()))?;
    let mut out = Vec::with_capacity(list.len());
    for call in list {
        let arr = call
            .as_array()
            .ok_or_else(|| ApiError::Upstream("Llamada JMAP mal formada".into()))?;
        if arr.len() < 3 {
            return Err(ApiError::Upstream("Llamada JMAP incompleta".into()));
        }
        let name = arr[0].as_str().unwrap_or("error").to_string();
        if name == "error" {
            let kind = arr[1]
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("error");
            return Err(ApiError::Upstream(format!(
                "El correo rechazó la operación ({kind})"
            )));
        }
        out.push(MethodResponse {
            name,
            payload: arr[1].clone(),
            id: arr[2].as_str().unwrap_or("").to_string(),
        });
    }
    Ok(out)
}

pub fn method_by_id<'a>(
    responses: &'a [MethodResponse],
    id: &str,
) -> Result<&'a MethodResponse, ApiError> {
    responses
        .iter()
        .find(|call| call.id == id)
        .ok_or_else(|| ApiError::Upstream(format!("Falta la respuesta JMAP {id}")))
}

pub fn parse_mailboxes(payload: &Value) -> Result<Vec<Mailbox>, ApiError> {
    let list = payload
        .get("list")
        .and_then(|v| v.as_array())
        .ok_or_else(|| ApiError::Upstream("Mailbox/get sin lista".into()))?;
    Ok(list
        .iter()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?.to_string();
            let name = item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let role = item
                .get("role")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let folder = folder_for_role(role.as_deref());
            Some(Mailbox {
                id,
                name,
                role,
                folder,
                total_emails: item
                    .get("totalEmails")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
                unread_emails: item
                    .get("unreadEmails")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
            })
        })
        .collect())
}

pub fn parse_email_list(list: Option<&Value>) -> Result<Vec<EmailRecord>, ApiError> {
    let Some(list) = list.and_then(|v| v.as_array()) else {
        return Ok(Vec::new());
    };
    Ok(list.iter().filter_map(parse_email).collect())
}

pub fn parse_threads(payload: &Value) -> Result<Vec<ThreadEmails>, ApiError> {
    let list = payload.get("list").and_then(|v| v.as_array());
    let Some(list) = list else {
        return Ok(Vec::new());
    };
    Ok(list
        .iter()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?.to_string();
            let email_ids = item
                .get("emailIds")
                .and_then(|v| v.as_array())
                .map(|ids| {
                    ids.iter()
                        .filter_map(|id| id.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            Some(ThreadEmails { id, email_ids })
        })
        .collect())
}

pub fn assemble_thread_page(
    query_ids: &[String],
    reps: &[EmailRecord],
    threads: &[ThreadEmails],
    emails: &[EmailRecord],
    limit: usize,
) -> ThreadPage {
    let mut summaries = Vec::new();
    for id in query_ids {
        let Some(rep) = reps.iter().find(|email| &email.id == id) else {
            continue;
        };
        let thread = threads.iter().find(|thread| thread.id == rep.thread_id);
        let message_ids = thread
            .map(|thread| thread.email_ids.clone())
            .filter(|ids| !ids.is_empty())
            .unwrap_or_else(|| vec![rep.id.clone()]);
        let related: Vec<&EmailRecord> = if emails.is_empty() {
            vec![rep]
        } else {
            message_ids
                .iter()
                .filter_map(|mid| emails.iter().find(|email| &email.id == mid))
                .collect()
        };
        let newest = related
            .iter()
            .max_by(|a, b| a.received_at.cmp(&b.received_at))
            .copied()
            .unwrap_or(rep);
        let unread = related.iter().any(|email| !email.seen);
        let sender = newest.from.first().cloned().unwrap_or(Person {
            name: "Desconocido".into(),
            email: "".into(),
        });
        summaries.push(ThreadSummary {
            id: if rep.thread_id.is_empty() {
                rep.id.clone()
            } else {
                rep.thread_id.clone()
            },
            subject: clean_subject(&newest.subject),
            raw_subject: if newest.subject.trim().is_empty() {
                "(Sin asunto)".into()
            } else {
                newest.subject.clone()
            },
            sender,
            recipients: newest
                .to
                .iter()
                .map(|person| person.email.clone())
                .collect(),
            preview: if newest.preview.is_empty() {
                html_to_text(&newest.text)
            } else {
                newest.preview.clone()
            },
            date: newest.received_at.clone(),
            count: message_ids.len(),
            unread,
            message_ids,
            mailbox_ids: newest.mailbox_ids.clone(),
            folder: None,
        });
    }
    let cursor = if query_ids.len() >= limit && !query_ids.is_empty() {
        query_ids.last().map(|id| encode_cursor(id))
    } else {
        None
    };
    ThreadPage {
        threads: summaries,
        cursor,
    }
}

pub fn build_thread_detail(
    thread: &ThreadEmails,
    emails: &[EmailRecord],
    trusted: &std::collections::HashSet<String>,
) -> Result<ThreadDetail, ApiError> {
    let mut ordered: Vec<&EmailRecord> = thread
        .email_ids
        .iter()
        .filter_map(|id| emails.iter().find(|email| &email.id == id))
        .collect();
    if ordered.is_empty() {
        return Err(ApiError::NotFound("No se encontró el hilo".into()));
    }
    ordered.sort_by(|a, b| a.received_at.cmp(&b.received_at));
    let newest = ordered[ordered.len() - 1];
    let messages = ordered
        .iter()
        .map(|email| {
            let sender = email
                .from
                .first()
                .map(|person| person.email.to_ascii_lowercase())
                .unwrap_or_default();
            message_from_email(email, trusted.contains(&sender))
        })
        .collect::<Vec<_>>();
    Ok(ThreadDetail {
        id: thread.id.clone(),
        subject: clean_subject(&newest.subject),
        raw_subject: if newest.subject.trim().is_empty() {
            "(Sin asunto)".into()
        } else {
            newest.subject.clone()
        },
        unread: messages.iter().any(|message| message.unread),
        updated_at: newest.received_at.clone(),
        messages,
    })
}

pub fn message_html(email: &EmailRecord, allow_remote_images: bool) -> String {
    let source = if email.html.trim().is_empty() {
        text_to_html(&email.text)
    } else {
        email.html.clone()
    };
    let clean = sanitize_email_html(&source, allow_remote_images);
    if clean.trim().is_empty() {
        "<p></p>".to_string()
    } else {
        clean
    }
}

pub fn clean_subject(subject: &str) -> String {
    let mut current = subject.trim().to_string();
    if current.is_empty() {
        return "(Sin asunto)".into();
    }
    loop {
        let lower = current.to_lowercase();
        let next = ["re:", "fwd:", "fw:", "rv:", "res:", "enc:"]
            .iter()
            .find_map(|prefix| {
                lower
                    .starts_with(prefix)
                    .then(|| current[prefix.len()..].trim().to_string())
            });
        match next {
            Some(stripped) if stripped.is_empty() => return "(Sin asunto)".into(),
            Some(stripped) if stripped != current => current = stripped,
            _ => break,
        }
    }
    if current.is_empty() {
        "(Sin asunto)".into()
    } else {
        current
    }
}

pub fn encode_cursor(anchor: &str) -> String {
    URL_SAFE_NO_PAD.encode(anchor.as_bytes())
}

pub fn decode_cursor(cursor: &str) -> Result<String, ApiError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(cursor.trim())
        .map_err(|_| ApiError::BadRequest("Cursor no válido".into()))?;
    String::from_utf8(bytes).map_err(|_| ApiError::BadRequest("Cursor no válido".into()))
}

pub fn ensure_set_ok(payload: &Value) -> Result<(), ApiError> {
    if let Some(map) = payload.get("notCreated").and_then(|v| v.as_object()) {
        if let Some((_, desc)) = map.iter().next() {
            let detail = desc
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("no se pudo crear");
            return Err(ApiError::Upstream(format!(
                "El correo rechazó el alta ({detail})"
            )));
        }
    }
    if let Some(map) = payload.get("notUpdated").and_then(|v| v.as_object()) {
        if let Some((_, desc)) = map.iter().next() {
            let detail = desc
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("no se pudo actualizar");
            return Err(ApiError::Upstream(format!(
                "El correo rechazó el cambio ({detail})"
            )));
        }
    }
    if let Some(map) = payload.get("notDestroyed").and_then(|v| v.as_object()) {
        if let Some((_, desc)) = map.iter().next() {
            let detail = desc
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("no se pudo borrar");
            return Err(ApiError::Upstream(format!(
                "El correo rechazó el borrado ({detail})"
            )));
        }
    }
    Ok(())
}

pub fn created_id(payload: &Value, key: &str) -> Option<String> {
    payload
        .get("created")
        .and_then(|v| v.get(key))
        .and_then(|v| v.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn message_from_email(email: &EmailRecord, allow_remote_images: bool) -> ApiMessage {
    let remote_images_blocked =
        !allow_remote_images && crate::sanitize::contains_remote_images(&email.html);
    let body_html = message_html(email, allow_remote_images);
    let plain = if email.preview.is_empty() {
        html_to_text(&body_html)
    } else {
        email.preview.clone()
    };
    let is_html_rich =
        body_html.contains("<img") || body_html.contains("<table") || body_html.contains("<div");
    ApiMessage {
        id: email.id.clone(),
        sender: email.from.first().cloned().unwrap_or(Person {
            name: "Desconocido".into(),
            email: String::new(),
        }),
        recipients: email.to.iter().map(|person| person.email.clone()).collect(),
        timestamp: email.received_at.clone(),
        body_html,
        plain_snippet: plain,
        is_html_rich,
        unread: !email.seen,
        message_id_header: email.message_ids.first().cloned(),
        references: email.references.clone(),
        attachments: email.attachments.clone(),
        remote_images_blocked,
    }
}

fn parse_email(item: &Value) -> Option<EmailRecord> {
    let id = item.get("id")?.as_str()?.to_string();
    let keywords = item.get("keywords").cloned().unwrap_or(Value::Null);
    let seen = keywords
        .get("$seen")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let (html, text) = extract_bodies(item);
    Some(EmailRecord {
        id,
        thread_id: item
            .get("threadId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        mailbox_ids: string_list(item.get("mailboxIds").and_then(|v| {
            v.as_object().map(|map| {
                map.iter()
                    .filter(|(_, on)| on.as_bool().unwrap_or(false))
                    .map(|(id, _)| Value::String(id.clone()))
                    .collect::<Vec<_>>()
            })
        })),
        seen,
        from: people(item.get("from")),
        to: people(item.get("to")),
        cc: people(item.get("cc")),
        subject: item
            .get("subject")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        preview: item
            .get("preview")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        received_at: item
            .get("receivedAt")
            .and_then(|v| v.as_str())
            .or_else(|| item.get("sentAt").and_then(|v| v.as_str()))
            .unwrap_or("")
            .to_string(),
        message_ids: string_array(item.get("messageId")),
        in_reply_to: string_array(item.get("inReplyTo")),
        references: string_array(item.get("references")),
        attachments: attachments(item.get("attachments")),
        html,
        text,
    })
}

fn string_list(values: Option<Vec<Value>>) -> Vec<String> {
    values
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect()
}

fn string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(|v| v.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn people(value: Option<&Value>) -> Vec<Person> {
    value
        .and_then(|v| v.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|item| {
                    let email = item.get("email")?.as_str()?.trim().to_string();
                    if email.is_empty() {
                        return None;
                    }
                    let name = item
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    let name = if name.is_empty() { email.clone() } else { name };
                    Some(Person { name, email })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn attachments(value: Option<&Value>) -> Vec<Attachment> {
    value
        .and_then(|v| v.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|item| {
                    let disposition = item
                        .get("disposition")
                        .and_then(|v| v.as_str())
                        .unwrap_or("attachment");
                    if disposition == "inline" {
                        return None;
                    }
                    let blob_id = item.get("blobId")?.as_str()?.to_string();
                    let name = item
                        .get("name")
                        .and_then(|v| v.as_str())
                        .filter(|name| !name.is_empty())
                        .unwrap_or("adjunto")
                        .to_string();
                    let mime = item
                        .get("type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("application/octet-stream");
                    let size = item.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                    Some(Attachment {
                        name,
                        size: format_size(size),
                        kind: kind_for(mime).to_string(),
                        blob_id,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn extract_bodies(email: &Value) -> (String, String) {
    let empty = Value::Null;
    let body_values = email.get("bodyValues").unwrap_or(&empty);
    (
        concat_parts(email.get("htmlBody"), body_values),
        concat_parts(email.get("textBody"), body_values),
    )
}

fn concat_parts(parts: Option<&Value>, body_values: &Value) -> String {
    let Some(parts) = parts.and_then(|v| v.as_array()) else {
        return String::new();
    };
    let mut out = String::new();
    for part in parts {
        let Some(part_id) = part.get("partId").and_then(|v| v.as_str()) else {
            continue;
        };
        let Some(value) = body_values
            .get(part_id)
            .and_then(|v| v.get("value"))
            .and_then(|v| v.as_str())
        else {
            continue;
        };
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(value);
    }
    out
}

fn folder_for_role(role: Option<&str>) -> Option<String> {
    match role {
        Some("inbox") => Some("inbox".into()),
        Some("sent") => Some("sent".into()),
        Some("drafts") => Some("drafts".into()),
        Some("trash") => Some("trash".into()),
        Some("archive") => Some("archive".into()),
        _ => None,
    }
}

fn format_size(size: u64) -> String {
    if size < 1024 {
        format!("{size} B")
    } else if size < 1024 * 1024 {
        format!("{} KB", size / 1024)
    } else {
        format!("{:.1} MB", size as f64 / 1024.0 / 1024.0)
    }
}

fn kind_for(mime: &str) -> &'static str {
    if mime.starts_with("image/") {
        "image"
    } else if mime == "application/pdf" {
        "pdf"
    } else {
        "doc"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_response() -> Value {
        json!({
            "methodResponses": [
                ["Email/query", {"ids": ["e2", "e1"], "position": 0}, "q"],
                ["Email/get", {"list": [
                    {
                        "id": "e2",
                        "threadId": "t2",
                        "mailboxIds": {"in": true},
                        "keywords": {},
                        "from": [{"name": "Elena Vance", "email": "elena@example.com"}],
                        "to": [{"email": "dario@example.com"}],
                        "subject": "Re: Re: Monografía",
                        "preview": "La prensa cierra el viernes",
                        "receivedAt": "2026-11-20T12:00:00Z"
                    },
                    {
                        "id": "e1",
                        "threadId": "t1",
                        "keywords": {"$seen": true},
                        "from": [{"name": "", "email": "news@example.com"}],
                        "to": [{"email": "dario@example.com"}],
                        "subject": "Fwd: Boletín",
                        "preview": "Edición de noviembre",
                        "receivedAt": "2026-11-18T09:00:00Z"
                    }
                ]}, "e"]
            ],
            "sessionState": "s1"
        })
    }

    #[test]
    fn parses_method_responses_and_assembles_threads() {
        let body = sample_response();
        let calls = parse_method_responses(&body).unwrap();
        assert_eq!(calls.len(), 2);
        let emails =
            parse_email_list(method_by_id(&calls, "e").unwrap().payload.get("list")).unwrap();
        assert_eq!(emails[0].from[0].name, "Elena Vance");
        assert!(!emails[0].seen);
        assert!(emails[1].seen);
        assert_eq!(emails[1].from[0].name, "news@example.com");

        let threads = vec![
            ThreadEmails {
                id: "t2".into(),
                email_ids: vec!["e2".into(), "e2b".into()],
            },
            ThreadEmails {
                id: "t1".into(),
                email_ids: vec!["e1".into()],
            },
        ];
        let extra = EmailRecord {
            id: "e2b".into(),
            thread_id: "t2".into(),
            mailbox_ids: vec!["in".into()],
            seen: false,
            from: vec![],
            to: vec![],
            cc: vec![],
            subject: "Re: Monografía".into(),
            preview: "antes".into(),
            received_at: "2026-11-19T10:00:00Z".into(),
            message_ids: vec![],
            in_reply_to: vec![],
            references: vec![],
            attachments: vec![],
            html: String::new(),
            text: String::new(),
        };
        let mut all = emails.clone();
        all.push(extra);
        let page = assemble_thread_page(&["e2".into(), "e1".into()], &emails, &threads, &all, 2);
        assert_eq!(page.threads.len(), 2);
        assert_eq!(page.threads[0].subject, "Monografía");
        assert_eq!(page.threads[0].raw_subject, "Re: Re: Monografía");
        assert!(page.threads[0].unread);
        assert_eq!(page.threads[0].count, 2);
        assert_eq!(page.threads[0].message_ids, vec!["e2", "e2b"]);
        assert_eq!(page.threads[1].subject, "Boletín");
        assert!(!page.threads[1].unread);
        assert!(page.cursor.is_some());
        let anchor = decode_cursor(page.cursor.as_deref().unwrap()).unwrap();
        assert_eq!(anchor, "e1");
    }

    #[test]
    fn parses_mailboxes_and_ignores_duplicate_sent_role() {
        let payload = json!({"list": [
            {"id": "in", "name": "Inbox", "role": "inbox", "totalEmails": 3, "unreadEmails": 1},
            {"id": "se", "name": "Sent Items", "role": "sent", "totalEmails": 4, "unreadEmails": 0},
            {"id": "dup", "name": "Sent Messages", "role": null, "totalEmails": 4, "unreadEmails": 0},
            {"id": "dr", "name": "Drafts", "role": "drafts", "totalEmails": 1, "unreadEmails": 0},
            {"id": "ju", "name": "Junk Mail", "role": "junk", "totalEmails": 2, "unreadEmails": 2},
            {"id": "tr", "name": "Deleted Items", "role": "trash", "totalEmails": 1, "unreadEmails": 0}
        ]});
        let boxes = parse_mailboxes(&payload).unwrap();
        assert_eq!(boxes.len(), 6);
        assert_eq!(boxes[0].folder.as_deref(), Some("inbox"));
        assert_eq!(boxes[1].folder.as_deref(), Some("sent"));
        assert!(boxes[2].folder.is_none());
        assert!(boxes[4].folder.is_none());
        assert_eq!(boxes[5].folder.as_deref(), Some("trash"));
    }

    #[test]
    fn thread_detail_sanitizes_html_and_keeps_reply_headers() {
        let thread = ThreadEmails {
            id: "t2".into(),
            email_ids: vec!["e2".into()],
        };
        let email = EmailRecord {
            id: "e2".into(),
            thread_id: "t2".into(),
            mailbox_ids: vec!["in".into()],
            seen: false,
            from: vec![Person {
                name: "Elena".into(),
                email: "elena@example.com".into(),
            }],
            to: vec![Person {
                name: "Dario".into(),
                email: "dario@example.com".into(),
            }],
            cc: vec![],
            subject: "Re: Nota".into(),
            preview: "Hola".into(),
            received_at: "2026-11-20T12:00:00Z".into(),
            message_ids: vec!["<m1@example.com>".into()],
            in_reply_to: vec!["<m0@example.com>".into()],
            references: vec!["<m0@example.com>".into()],
            attachments: vec![Attachment {
                name: "nota.pdf".into(),
                size: "12 KB".into(),
                kind: "pdf".into(),
                blob_id: "blob-1".into(),
            }],
            html: "<p>Hola</p><img src=\"https://x.test/a.png\"><script>x</script>".into(),
            text: "Hola".into(),
        };
        let detail =
            build_thread_detail(&thread, &[email], &std::collections::HashSet::new()).unwrap();
        assert_eq!(detail.subject, "Nota");
        assert_eq!(
            detail.messages[0].message_id_header.as_deref(),
            Some("<m1@example.com>")
        );
        assert!(!detail.messages[0].body_html.contains("script"));
        assert!(!detail.messages[0].body_html.contains("https://x.test"));
        assert!(detail.messages[0].remote_images_blocked);
        assert!(detail.messages[0].body_html.contains("Hola"));
        assert_eq!(detail.messages[0].attachments[0].blob_id, "blob-1");
    }

    #[test]
    fn clean_subject_strips_stacked_prefixes() {
        assert_eq!(clean_subject("  Re: Fwd: RV: Hola  "), "Hola");
        assert_eq!(clean_subject(""), "(Sin asunto)");
        assert_eq!(clean_subject("Re:"), "(Sin asunto)");
    }

    #[test]
    fn set_errors_surface_description() {
        let payload =
            json!({"notCreated": {"msg": {"type": "invalidEmail", "description": "falta From"}}});
        let err = ensure_set_ok(&payload).unwrap_err();
        assert!(err.to_string().contains("falta From"));
    }
}
