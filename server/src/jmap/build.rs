use serde_json::{json, Value};

pub const CORE: &str = "urn:ietf:params:jmap:core";
pub const MAIL: &str = "urn:ietf:params:jmap:mail";
pub const SUBMISSION: &str = "urn:ietf:params:jmap:submission";

const SUMMARY_PROPS: &[&str] = &[
    "id",
    "threadId",
    "mailboxIds",
    "keywords",
    "from",
    "to",
    "cc",
    "subject",
    "preview",
    "receivedAt",
    "sentAt",
    "messageId",
    "inReplyTo",
    "references",
    "attachments",
];

const DETAIL_PROPS: &[&str] = &[
    "id",
    "threadId",
    "mailboxIds",
    "keywords",
    "from",
    "to",
    "cc",
    "bcc",
    "subject",
    "preview",
    "receivedAt",
    "sentAt",
    "messageId",
    "inReplyTo",
    "references",
    "attachments",
    "htmlBody",
    "textBody",
    "bodyValues",
];

#[derive(Debug, Clone)]
pub struct OutboundAttachment {
    pub blob_id: String,
    pub name: String,
    pub content_type: String,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct OutboundMail {
    pub from_email: String,
    pub from_name: String,
    pub to: Vec<(String, String)>,
    pub cc: Vec<(String, String)>,
    pub bcc: Vec<(String, String)>,
    pub subject: String,
    pub html: String,
    pub text: String,
    pub sent_mailbox_id: String,
    pub in_reply_to: Vec<String>,
    pub references: Vec<String>,
    pub attachments: Vec<OutboundAttachment>,
    pub draft_id: Option<String>,
    pub identity_id: String,
}

pub fn build_mailbox_get(account: &str) -> Value {
    json!({
        "using": [CORE, MAIL],
        "methodCalls": [
            ["Mailbox/get", {"accountId": account}, "mb"]
        ]
    })
}

pub fn build_mailbox_create_archive(account: &str) -> Value {
    json!({
        "using": [CORE, MAIL],
        "methodCalls": [
            ["Mailbox/set", {
                "accountId": account,
                "create": {
                    "archive": {"name": "Archive", "role": "archive"}
                }
            }, "c"]
        ]
    })
}

pub fn build_thread_query(
    account: &str,
    mailbox_id: &str,
    limit: u64,
    anchor: Option<&str>,
) -> Value {
    let mut query = json!({
        "accountId": account,
        "filter": {"inMailbox": mailbox_id},
        "sort": [{"property": "receivedAt", "isAscending": false}],
        "collapseThreads": true,
        "limit": limit
    });
    if let Some(anchor) = anchor {
        query["anchor"] = json!(anchor);
        query["anchorOffset"] = json!(1);
    }
    json!({
        "using": [CORE, MAIL],
        "methodCalls": [
            ["Email/query", query, "q"],
            ["Email/get", {
                "accountId": account,
                "#ids": {"resultOf": "q", "name": "Email/query", "path": "/ids"},
                "properties": SUMMARY_PROPS
            }, "e"]
        ]
    })
}

pub fn build_email_query(account: &str, filter: Value, limit: u64, anchor: Option<&str>) -> Value {
    let mut query = json!({
        "accountId": account,
        "filter": filter,
        "sort": [{"property": "receivedAt", "isAscending": false}],
        "collapseThreads": true,
        "limit": limit
    });
    if let Some(anchor) = anchor {
        query["anchor"] = json!(anchor);
        query["anchorOffset"] = json!(1);
    }
    json!({
        "using": [CORE, MAIL],
        "methodCalls": [
            ["Email/query", query, "q"],
            ["Email/get", {
                "accountId": account,
                "#ids": {"resultOf": "q", "name": "Email/query", "path": "/ids"},
                "properties": SUMMARY_PROPS
            }, "e"]
        ]
    })
}

pub fn build_thread_get(account: &str, thread_ids: &[String]) -> Value {
    json!({
        "using": [CORE, MAIL],
        "methodCalls": [
            ["Thread/get", {"accountId": account, "ids": thread_ids}, "t"]
        ]
    })
}

pub fn build_email_get(account: &str, ids: &[String], with_body: bool) -> Value {
    let mut call = json!({
        "accountId": account,
        "ids": ids,
        "properties": if with_body { DETAIL_PROPS } else { SUMMARY_PROPS }
    });
    if with_body {
        call["fetchHTMLBodyValues"] = json!(true);
        call["fetchTextBodyValues"] = json!(true);
        call["maxBodyValueBytes"] = json!(1_048_576);
    }
    json!({
        "using": [CORE, MAIL],
        "methodCalls": [
            ["Email/get", call, "e"]
        ]
    })
}

pub fn build_keyword_update(account: &str, email_id: &str, seen: bool) -> Value {
    json!({
        "using": [CORE, MAIL],
        "methodCalls": [
            ["Email/set", {
                "accountId": account,
                "update": {
                    email_id: {"keywords/$seen": seen}
                }
            }, "u"]
        ]
    })
}

pub fn build_move(
    account: &str,
    email_id: &str,
    remove: &[String],
    add: &str,
    mark_seen: bool,
) -> Value {
    let mut patch = serde_json::Map::new();
    for id in remove {
        if id != add {
            patch.insert(format!("mailboxIds/{id}"), Value::Null);
        }
    }
    patch.insert(format!("mailboxIds/{add}"), json!(true));
    if mark_seen {
        patch.insert("keywords/$seen".into(), json!(true));
    }
    json!({
        "using": [CORE, MAIL],
        "methodCalls": [
            ["Email/set", {
                "accountId": account,
                "update": { email_id: Value::Object(patch) }
            }, "u"]
        ]
    })
}

pub fn build_destroy(account: &str, email_id: &str) -> Value {
    json!({
        "using": [CORE, MAIL],
        "methodCalls": [
            ["Email/set", {"accountId": account, "destroy": [email_id]}, "d"]
        ]
    })
}

pub fn build_empty_trash(account: &str, trash_id: &str) -> Value {
    json!({
        "using": [CORE, MAIL],
        "methodCalls": [
            ["Email/query", {
                "accountId": account,
                "filter": {"inMailbox": trash_id},
                "limit": 500
            }, "q"],
            ["Email/set", {
                "accountId": account,
                "#destroy": {"resultOf": "q", "name": "Email/query", "path": "/ids"}
            }, "d"]
        ]
    })
}

pub fn build_identity_get(account: &str) -> Value {
    json!({
        "using": [CORE, SUBMISSION],
        "methodCalls": [
            ["Identity/get", {"accountId": account}, "id"]
        ]
    })
}

pub fn build_send(account: &str, mail: &OutboundMail) -> Value {
    let mut email = json!({
        "mailboxIds": { mail.sent_mailbox_id.clone(): true },
        "keywords": {"$seen": true},
        "from": [{"name": mail.from_name, "email": mail.from_email}],
        "to": addresses(&mail.to),
        "subject": mail.subject,
        "htmlBody": [{"partId": "html", "type": "text/html", "charset": "utf-8"}],
        "textBody": [{"partId": "text", "type": "text/plain", "charset": "utf-8"}],
        "bodyValues": {
            "html": {"value": mail.html, "isEncodingProblem": false, "isTruncated": false},
            "text": {"value": mail.text, "isEncodingProblem": false, "isTruncated": false}
        }
    });
    if !mail.cc.is_empty() {
        email["cc"] = addresses(&mail.cc);
    }
    if !mail.bcc.is_empty() {
        email["bcc"] = addresses(&mail.bcc);
    }
    if !mail.in_reply_to.is_empty() {
        email["inReplyTo"] = json!(mail.in_reply_to);
    }
    if !mail.references.is_empty() {
        email["references"] = json!(mail.references);
    }
    if !mail.attachments.is_empty() {
        email["attachments"] = json!(mail
            .attachments
            .iter()
            .map(|att| json!({
                "blobId": att.blob_id,
                "name": att.name,
                "type": att.content_type,
                "size": att.size,
                "disposition": "attachment"
            }))
            .collect::<Vec<_>>());
    }

    let mut recipients = Vec::new();
    for list in [&mail.to, &mail.cc, &mail.bcc] {
        for (_, email_addr) in list {
            recipients.push(json!({"email": email_addr}));
        }
    }

    let mut set = json!({
        "accountId": account,
        "create": {"msg": email}
    });
    if let Some(draft_id) = &mail.draft_id {
        set["destroy"] = json!([draft_id]);
    }

    json!({
        "using": [CORE, MAIL, SUBMISSION],
        "methodCalls": [
            ["Email/set", set, "em"],
            ["EmailSubmission/set", {
                "accountId": account,
                "create": {
                    "sub": {
                        "#emailId": {"resultOf": "em", "name": "Email/set", "path": "/created/msg/id"},
                        "identityId": mail.identity_id,
                        "envelope": {
                            "mailFrom": {"email": mail.from_email},
                            "rcptTo": recipients
                        }
                    }
                }
            }, "sub"]
        ]
    })
}

pub fn build_draft(
    account: &str,
    drafts_id: &str,
    existing_id: Option<&str>,
    mail: &DraftInput,
) -> Value {
    let email = json!({
        "mailboxIds": { drafts_id: true },
        "keywords": {"$draft": true, "$seen": true},
        "from": [{"name": mail.from_name, "email": mail.from_email}],
        "to": addresses(&mail.to),
        "subject": mail.subject,
        "htmlBody": [{"partId": "html", "type": "text/html", "charset": "utf-8"}],
        "textBody": [{"partId": "text", "type": "text/plain", "charset": "utf-8"}],
        "bodyValues": {
            "html": {"value": mail.html},
            "text": {"value": mail.text}
        }
    });
    let mut set = json!({"accountId": account});
    if let Some(id) = existing_id {
        set["update"] = json!({ id: email });
    } else {
        set["create"] = json!({ "draft": email });
    }
    json!({
        "using": [CORE, MAIL],
        "methodCalls": [
            ["Email/set", set, "d"]
        ]
    })
}

pub struct DraftInput {
    pub from_email: String,
    pub from_name: String,
    pub to: Vec<(String, String)>,
    pub subject: String,
    pub html: String,
    pub text: String,
}

fn addresses(list: &[(String, String)]) -> Value {
    json!(list
        .iter()
        .map(|(name, email)| json!({"name": name, "email": email}))
        .collect::<Vec<_>>())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thread_query_uses_back_reference_and_anchor() {
        let body = build_thread_query("c", "mb-inbox", 40, Some("email-9"));
        let calls = body["methodCalls"].as_array().unwrap();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0][0], "Email/query");
        assert_eq!(calls[0][1]["filter"]["inMailbox"], "mb-inbox");
        assert_eq!(calls[0][1]["collapseThreads"], true);
        assert_eq!(calls[0][1]["anchor"], "email-9");
        assert_eq!(calls[0][1]["anchorOffset"], 1);
        assert_eq!(calls[1][0], "Email/get");
        assert_eq!(calls[1][1]["#ids"]["resultOf"], "q");
        assert_eq!(calls[1][1]["#ids"]["path"], "/ids");
        assert_eq!(calls[1][1]["#ids"]["name"], "Email/query");
    }

    #[test]
    fn send_links_submission_to_created_email_and_reply_headers() {
        let mail = OutboundMail {
            from_email: "dario@dariomsi.com".into(),
            from_name: "Dario".into(),
            to: vec![("Elena".into(), "elena@example.com".into())],
            cc: vec![],
            bcc: vec![("Oculto".into(), "bcc@example.com".into())],
            subject: "Re: Propuesta".into(),
            html: "<p>Hola</p>".into(),
            text: "Hola".into(),
            sent_mailbox_id: "sent-1".into(),
            in_reply_to: vec!["<m1@example.com>".into()],
            references: vec!["<m0@example.com>".into(), "<m1@example.com>".into()],
            attachments: vec![OutboundAttachment {
                blob_id: "blob-1".into(),
                name: "nota.pdf".into(),
                content_type: "application/pdf".into(),
                size: 12,
            }],
            draft_id: Some("draft-1".into()),
            identity_id: "ident-1".into(),
        };
        let body = build_send("c", &mail);
        let calls = body["methodCalls"].as_array().unwrap();
        assert_eq!(calls[0][0], "Email/set");
        assert_eq!(calls[0][1]["create"]["msg"]["mailboxIds"]["sent-1"], true);
        assert_eq!(
            calls[0][1]["create"]["msg"]["inReplyTo"][0],
            "<m1@example.com>"
        );
        assert_eq!(
            calls[0][1]["create"]["msg"]["references"][1],
            "<m1@example.com>"
        );
        assert_eq!(
            calls[0][1]["create"]["msg"]["attachments"][0]["blobId"],
            "blob-1"
        );
        assert_eq!(calls[0][1]["destroy"][0], "draft-1");
        assert_eq!(calls[1][0], "EmailSubmission/set");
        assert_eq!(calls[1][1]["create"]["sub"]["identityId"], "ident-1");
        assert_eq!(calls[1][1]["create"]["sub"]["#emailId"]["resultOf"], "em");
        assert_eq!(
            calls[1][1]["create"]["sub"]["#emailId"]["path"],
            "/created/msg/id"
        );
        assert_eq!(
            calls[1][1]["create"]["sub"]["envelope"]["rcptTo"][1]["email"],
            "bcc@example.com"
        );
    }

    #[test]
    fn empty_trash_destroys_via_back_reference() {
        let body = build_empty_trash("c", "trash-1");
        let calls = body["methodCalls"].as_array().unwrap();
        assert_eq!(calls[1][1]["#destroy"]["path"], "/ids");
        assert_eq!(calls[0][1]["filter"]["inMailbox"], "trash-1");
    }
}
