# DarioMail

Cliente de correo web minimalista para servidores [Stalwart](https://stalw.art) vía JMAP. La interfaz es React + Vite y el backend en Rust (`server/`) habla con Stalwart por JMAP. Las credenciales del buzón nunca llegan al navegador: la web usa su propia clave y una cookie firmada.

## Qué hace

- Bandeja, hilos, búsqueda, adjuntos y borradores por JMAP
- Responder y redactar con editor enriquecido (TipTap)
- Imágenes remotas bloqueadas salvo remitentes de confianza, HTML saneado en el servidor
- PWA con gestos en móvil: deslizar para archivar o borrar, deshacer y restaurar desde la papelera
- Actualizaciones en vivo por SSE

## Requisitos

- Node.js 20 o superior
- Rust stable (1.88 o superior)
- Un servidor Stalwart con JMAP y una clave de aplicación para tu cuenta

## Correr en local

1. Copia `.env.example` a `server/.env` y rellena `STALWART_BASE_URL`, `DARIOMAIL_USER`, `STALWART_APP_PASSWORD`, `DARIOMAIL_SECRET` y `DARIOMAIL_LOGIN_PASSWORD_HASH`. En local pon `DARIOMAIL_COOKIE_SECURE=false`.
2. Genera el hash de tu clave web: `cd server && printf '%s' 'tu clave' | cargo run --release -- hash-password`
3. Arranca el backend: `cd server && cargo run`
4. En otra terminal, en la raíz: `npm ci && npm run dev`. Vite reenvía `/api` a `http://127.0.0.1:3001`.

Opcional: `VITE_DARIOMAIL_LABEL=inbox.example.com npm run build` muestra ese texto junto al nombre en la barra superior.

Para ver solo la interfaz con datos de ejemplo, sin servidor: `VITE_DARIOMAIL_MOCK=1 npm run dev`.

## Despliegue

Guía genérica con systemd, nginx y un proxy HTTPS en [docs/DEPLOY.md](docs/DEPLOY.md).

## Comprobaciones

```bash
cd server && cargo test && cargo clippy --all-targets -- -D warnings
npm run lint && npm run build
```

## Contribuir y seguridad

Lee [CONTRIBUTING.md](CONTRIBUTING.md). Para reportar vulnerabilidades sigue [SECURITY.md](SECURITY.md), no abras un issue público.

## Licencia

[MIT](LICENSE)

---

## English

DarioMail is a minimal web mail client for [Stalwart](https://stalw.art) servers over JMAP. React + Vite frontend, Rust backend in `server/` that keeps your mailbox credentials server side.

**Quick start**

1. Copy `.env.example` to `server/.env` and fill in your Stalwart URL, account, app password, a cookie secret (`openssl rand -base64 32`) and an argon2 hash of your web password (`printf '%s' 'pass' | cargo run --release -- hash-password`). Use `DARIOMAIL_COOKIE_SECURE=false` for local HTTP.
2. `cd server && cargo run`
3. `npm ci && npm run dev` and open http://localhost:3000

UI only demo: `VITE_DARIOMAIL_MOCK=1 npm run dev`. Deployment guide: [docs/DEPLOY.md](docs/DEPLOY.md) (Spanish). Security reports: see [SECURITY.md](SECURITY.md). License: MIT.
