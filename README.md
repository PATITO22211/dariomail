# DarioMail

Cliente de correo para inbox.dariomsi.com. La interfaz sigue en React. El proceso Rust en `server/` habla con Stalwart por JMAP y no entrega esas credenciales al navegador.

## Correr en local

Necesitas Node.js y Rust stable.

1. Copia `.env.example` a `server/.env` o expórtalo en el entorno. Rellena la clave de aplicación, el secreto de la cookie y el hash de acceso.
2. En `server/`, arranca con `cargo run`.
3. En la raíz, `npm ci` y `npm run dev`. Vite reenvía `/api` a `http://127.0.0.1:3001`.
4. Para ver la interfaz sin servidor usa `VITE_DARIOMAIL_MOCK=1 npm run dev`.

El despliegue en sdd está en `docs/DEPLOY.md`.

## Comprobaciones

```bash
cd server && cargo test && cargo clippy --all-targets -- -D warnings
npm run build
```
