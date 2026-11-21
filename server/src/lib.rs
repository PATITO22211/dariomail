pub mod auth;
pub mod config;
pub mod error;
pub mod jmap;
pub mod routes;
pub mod sanitize;

use std::net::SocketAddr;
use std::sync::Arc;

use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::TraceLayer;
use tracing::info;

use crate::config::Config;
use crate::jmap::JmapClient;
use crate::routes::AppState;

pub fn router(state: AppState) -> axum::Router {
    routes::router(state)
        .layer(RequestBodyLimitLayer::new(20 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
}

pub async fn run() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    let mut args = std::env::args().skip(1);
    if args.next().as_deref() == Some("hash-password") {
        let password = std::io::read_to_string(std::io::stdin())?;
        let password = password.trim_end_matches(['\n', '\r']);
        if password.is_empty() {
            return Err("La clave llega vacía por la entrada estándar".into());
        }
        println!("{}", auth::hash_password(password)?);
        return Ok(());
    }

    let cfg = Config::from_env()?;
    let addr: SocketAddr = format!("{}:{}", cfg.bind, cfg.port).parse()?;
    let jmap = Arc::new(JmapClient::new(
        cfg.stalwart_base_url.clone(),
        cfg.user.clone(),
        cfg.stalwart_password.clone(),
    )?);
    let state = AppState {
        cfg: Arc::new(cfg),
        jmap,
        limiter: Arc::new(auth::LoginLimiter::default()),
    };

    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("DarioMail escuchando en http://{addr}");
    axum::serve(listener, router(state)).await?;
    Ok(())
}
