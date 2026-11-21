use std::sync::{Arc, Mutex};

use argon2::password_hash::{PasswordHasher, SaltString};
use argon2::Argon2;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use dariomail::auth::LoginLimiter;
use dariomail::config::Config;
use dariomail::jmap::JmapClient;
use dariomail::routes::AppState;
use dariomail::trust::TrustedSenders;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, Request as WireRequest, ResponseTemplate};

#[tokio::test]
async fn session_urls_threads_html_and_send() {
    let stalwart = MockServer::start().await;
    let uri = stalwart.uri();
    let auth = format!("Basic {}", STANDARD.encode("dario@dariomsi.com:app-secret"));

    Mock::given(method("GET"))
        .and(path("/.well-known/jmap"))
        .and(header("authorization", auth.as_str()))
        .respond_with(ResponseTemplate::new(200).set_body_json(session_body(&uri)))
        .expect(1..)
        .mount(&stalwart)
        .await;

    let seen: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let record = seen.clone();
    Mock::given(method("POST"))
        .and(path("/jmap/custom"))
        .respond_with(move |req: &WireRequest| {
            let text = String::from_utf8_lossy(&req.body).to_string();
            record.lock().expect("registro").push(text.clone());
            ResponseTemplate::new(200).set_body_json(dispatch(&text))
        })
        .mount(&stalwart)
        .await;

    let hash = hash_password("clave-de-prueba");
    let cfg = Config {
        port: 0,
        bind: "127.0.0.1".into(),
        stalwart_base_url: uri.clone(),
        user: "dario@dariomsi.com".into(),
        stalwart_password: "app-secret".into(),
        secret: "secreto-de-prueba-muy-largo".into(),
        password_hash: hash,
        cookie_secure: false,
        trusted_senders_path: std::env::temp_dir()
            .join(format!("dariomail-trust-test-{}.json", std::process::id()))
            .display()
            .to_string(),
    };
    let state = AppState {
        jmap: std::sync::Arc::new(
            JmapClient::new(
                cfg.stalwart_base_url.clone(),
                cfg.user.clone(),
                cfg.stalwart_password.clone(),
            )
            .unwrap(),
        ),
        cfg: std::sync::Arc::new(cfg.clone()),
        limiter: std::sync::Arc::new(LoginLimiter::default()),
        trust: std::sync::Arc::new(TrustedSenders::load(&cfg.trusted_senders_path).unwrap()),
    };
    let app = dariomail::router(state);

    let anon = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/mailboxes")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(anon.status(), StatusCode::UNAUTHORIZED);

    let login = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"password":"clave-de-prueba"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(login.status(), StatusCode::OK);
    let set_cookie = login
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(set_cookie.contains("HttpOnly"));
    assert!(set_cookie.contains("SameSite=Lax"));
    assert!(!set_cookie.contains("Secure"));
    let cookie = set_cookie.split(';').next().unwrap().to_string();

    let boxes = app
        .clone()
        .oneshot(authed("GET", "/api/mailboxes", None, &cookie))
        .await
        .unwrap();
    assert_eq!(boxes.status(), StatusCode::OK);
    let boxes_json = read_json(boxes).await;
    let mailboxes = boxes_json["mailboxes"].as_array().unwrap();
    assert!(mailboxes
        .iter()
        .any(|mb| mb["role"] == "inbox" && mb["folder"] == "inbox"));
    assert!(mailboxes
        .iter()
        .any(|mb| mb["name"] == "Sent Messages" && mb["folder"].is_null()));
    let inbox = mailboxes.iter().find(|mb| mb["role"] == "inbox").unwrap()["id"]
        .as_str()
        .unwrap();

    let threads = app
        .clone()
        .oneshot(authed(
            "GET",
            &format!("/api/threads?mailboxId={inbox}&limit=20"),
            None,
            &cookie,
        ))
        .await
        .unwrap();
    assert_eq!(threads.status(), StatusCode::OK);
    let threads_json = read_json(threads).await;
    assert_eq!(threads_json["threads"][0]["subject"], "Monografía");
    assert_eq!(threads_json["threads"][0]["rawSubject"], "Re: Monografía");
    assert_eq!(threads_json["threads"][0]["unread"], true);
    assert_eq!(threads_json["threads"][0]["count"], 2);
    assert_eq!(
        threads_json["threads"][0]["sender"]["email"],
        "elena@example.com"
    );
    assert!(threads_json["threads"][0]["cursor"].is_null() || threads_json["cursor"].is_null());

    let html = app
        .clone()
        .oneshot(authed("GET", "/api/messages/e1/html", None, &cookie))
        .await
        .unwrap();
    assert_eq!(html.status(), StatusCode::OK);
    let html_bytes = html.into_body().collect().await.unwrap().to_bytes();
    let html_text = String::from_utf8(html_bytes.to_vec()).unwrap();
    assert!(html_text.contains("Hola"));
    assert!(!html_text.to_lowercase().contains("<script"));
    assert!(!html_text.contains("https://evil.test"));

    let html_images = app
        .clone()
        .oneshot(authed(
            "GET",
            "/api/messages/e1/html?allowImages=1",
            None,
            &cookie,
        ))
        .await
        .unwrap();
    let html_images_text = String::from_utf8(
        html_images
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .to_vec(),
    )
    .unwrap();
    assert!(html_images_text.contains("https://evil.test/a.png"));

    let found = app
        .clone()
        .oneshot(authed("GET", "/api/search?q=prensa", None, &cookie))
        .await
        .unwrap();
    assert_eq!(found.status(), StatusCode::OK);
    let found_json = read_json(found).await;
    assert_eq!(found_json["threads"][0]["subject"], "Monografía");
    assert_eq!(found_json["threads"][0]["folder"], "inbox");

    let send = app
        .clone()
        .oneshot(authed(
            "POST",
            "/api/messages/send",
            Some(
                r#"{"to":["elena@example.com"],"subject":"Re: Monografía","html":"<p>Va</p>","text":"Va","inReplyTo":["<m1@example.com>"],"references":["<m0@example.com>","<m1@example.com>"]}"#,
            ),
            &cookie,
        ))
        .await
        .unwrap();
    assert_eq!(send.status(), StatusCode::OK, "{:?}", read_json(send).await);

    let recorded = seen.lock().expect("registro").clone();
    let submission = recorded
        .iter()
        .find(|body| body.contains("EmailSubmission/set"))
        .expect("envío");
    assert!(submission.contains("\"#emailId\""));
    assert!(submission.contains("\"resultOf\":\"em\""));
    assert!(submission.contains("\"path\":\"/created/msg/id\""));
    assert!(submission.contains("<m1@example.com>"));
    assert!(submission.contains("ident-dario"));
    assert!(recorded.iter().all(|body| !body.contains("app-secret")));
    let search_body = recorded
        .iter()
        .find(|body| body.contains("prensa"))
        .expect("búsqueda");
    for field in ["\"text\"", "\"from\"", "\"to\"", "\"subject\"", "\"body\""] {
        assert!(
            search_body.contains(field),
            "{field} ausente en {search_body}"
        );
    }
}

fn authed(method: &str, uri: &str, body: Option<&str>, cookie: &str) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("cookie", cookie);
    if body.is_some() {
        builder = builder.header("content-type", "application/json");
    }
    builder
        .body(Body::from(body.unwrap_or("").to_string()))
        .unwrap()
}

async fn read_json(response: axum::response::Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap_or(json!({ "raw": String::from_utf8_lossy(&bytes) }))
}

fn hash_password(password: &str) -> String {
    let salt = SaltString::encode_b64(b"0123456789abcdef").unwrap();
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .unwrap()
        .to_string()
}

fn session_body(uri: &str) -> Value {
    json!({
        "capabilities": {
            "urn:ietf:params:jmap:core": {},
            "urn:ietf:params:jmap:mail": {},
            "urn:ietf:params:jmap:submission": {}
        },
        "accounts": {"c": {"name": "dario@dariomsi.com", "isPersonal": true, "isReadOnly": false, "accountCapabilities": {}}},
        "primaryAccounts": {
            "urn:ietf:params:jmap:mail": "c",
            "urn:ietf:params:jmap:submission": "c"
        },
        "username": "dario@dariomsi.com",
        "apiUrl": format!("{uri}/jmap/custom"),
        "downloadUrl": format!("{uri}/jmap/download/{{accountId}}/{{blobId}}/{{name}}"),
        "uploadUrl": format!("{uri}/jmap/upload/{{accountId}}/"),
        "eventSourceUrl": format!("{uri}/jmap/eventsource/?types={{types}}&closeafter={{closeafter}}&ping={{ping}}"),
        "state": "s1"
    })
}

fn dispatch(body: &str) -> Value {
    if body.contains("Mailbox/get") {
        json!({
            "methodResponses": [[
                "Mailbox/get",
                {"accountId": "c", "state": "mb", "list": [
                    {"id": "in", "name": "Inbox", "role": "inbox", "totalEmails": 2, "unreadEmails": 1},
                    {"id": "se", "name": "Sent Items", "role": "sent", "totalEmails": 1, "unreadEmails": 0},
                    {"id": "dup", "name": "Sent Messages", "role": null, "totalEmails": 1, "unreadEmails": 0},
                    {"id": "dr", "name": "Drafts", "role": "drafts", "totalEmails": 0, "unreadEmails": 0},
                    {"id": "ju", "name": "Junk Mail", "role": "junk", "totalEmails": 0, "unreadEmails": 0},
                    {"id": "tr", "name": "Deleted Items", "role": "trash", "totalEmails": 0, "unreadEmails": 0},
                    {"id": "ar", "name": "Archive", "role": "archive", "totalEmails": 0, "unreadEmails": 0}
                ]},
                "mb"
            ]],
            "sessionState": "s1"
        })
    } else if body.contains("Email/query") {
        json!({
            "methodResponses": [
                ["Email/query", {"accountId": "c", "ids": ["e1"], "position": 0}, "q"],
                ["Email/get", {"accountId": "c", "list": [summary_email()]}, "e"]
            ],
            "sessionState": "s1"
        })
    } else if body.contains("Thread/get") {
        json!({
            "methodResponses": [[
                "Thread/get",
                {"accountId": "c", "list": [{"id": "t1", "emailIds": ["e0", "e1"]}]},
                "t"
            ]],
            "sessionState": "s1"
        })
    } else if body.contains("Identity/get") {
        json!({
            "methodResponses": [[
                "Identity/get",
                {"accountId": "c", "list": [
                    {"id": "ident-other", "email": "otro@example.com", "name": "Otro"},
                    {"id": "ident-dario", "email": "dario@dariomsi.com", "name": "Dario"}
                ]},
                "id"
            ]],
            "sessionState": "s1"
        })
    } else if body.contains("EmailSubmission/set") {
        json!({
            "methodResponses": [
                ["Email/set", {"accountId": "c", "created": {"msg": {"id": "sent-1"}}}, "em"],
                ["EmailSubmission/set", {"accountId": "c", "created": {"sub": {"id": "sub-1"}}}, "sub"]
            ],
            "sessionState": "s1"
        })
    } else if body.contains("fetchHTMLBodyValues") {
        json!({
            "methodResponses": [[
                "Email/get",
                {"accountId": "c", "list": [html_email()]},
                "e"
            ]],
            "sessionState": "s1"
        })
    } else {
        json!({
            "methodResponses": [[
                "Email/get",
                {"accountId": "c", "list": [
                    summary_email(),
                    {
                        "id": "e0",
                        "threadId": "t1",
                        "mailboxIds": {"in": true},
                        "keywords": {"$seen": true},
                        "from": [{"name": "Elena Vance", "email": "elena@example.com"}],
                        "to": [{"email": "dario@dariomsi.com"}],
                        "subject": "Monografía",
                        "preview": "Primer mensaje",
                        "receivedAt": "2026-11-18T09:00:00Z",
                        "messageId": ["<m0@example.com>"]
                    }
                ]},
                "e"
            ]],
            "sessionState": "s1"
        })
    }
}

fn summary_email() -> Value {
    json!({
        "id": "e1",
        "threadId": "t1",
        "mailboxIds": {"in": true},
        "keywords": {},
        "from": [{"name": "Elena Vance", "email": "elena@example.com"}],
        "to": [{"email": "dario@dariomsi.com"}],
        "subject": "Re: Monografía",
        "preview": "La prensa cierra el viernes",
        "receivedAt": "2026-11-20T12:00:00Z",
        "messageId": ["<m1@example.com>"],
        "inReplyTo": ["<m0@example.com>"],
        "references": ["<m0@example.com>"]
    })
}

fn html_email() -> Value {
    let mut email = summary_email();
    email["htmlBody"] = json!([{"partId": "html", "type": "text/html"}]);
    email["textBody"] = json!([{"partId": "text", "type": "text/plain"}]);
    email["bodyValues"] = json!({
        "html": {"value": "<p>Hola</p><img src=\"https://evil.test/a.png\" alt=\"x\"><script>evil()</script>"},
        "text": {"value": "Hola"}
    });
    email
}
