# Despliegue de DarioMail

Guía genérica para un servidor Linux con systemd y nginx. Los ejemplos usan `inbox.example.com` para la web y `mail.example.com` para Stalwart. Cámbialos por tus dominios.

El proceso Rust escucha en `127.0.0.1:3001` y nginx en `127.0.0.1:8095`. Delante pon un proxy que termine HTTPS (Cloudflare Tunnel, Caddy, nginx con certbot, etc). No expongas el puerto 3001 directo.

El navegador nunca ve la clave de aplicación de Stalwart. El servidor la usa para hablar JMAP y lee las URLs desde `/.well-known/jmap`.

## Qué necesitas

- Rust stable (1.88 o superior) y Node.js 20 o superior
- El código clonado, por ejemplo en `~/dariomail`
- Una clave de aplicación de Stalwart para tu cuenta
- Un proxy HTTPS delante

## Construir

```bash
cd ~/dariomail
npm ci
npm run build
cd server
cargo build --release
```

El frontend queda en `dist/` y el binario en `server/target/release/dariomail`.

## Variables

```bash
mkdir -p ~/.config/dariomail
cp ~/dariomail/.env.example ~/.config/dariomail/env
chmod 600 ~/.config/dariomail/env
```

Rellena `STALWART_BASE_URL`, `DARIOMAIL_USER`, `STALWART_APP_PASSWORD`, `DARIOMAIL_SECRET` y `DARIOMAIL_LOGIN_PASSWORD_HASH`.

```bash
openssl rand -base64 32
printf '%s' 'tu clave de la web' | ~/dariomail/server/target/release/dariomail hash-password
```

Detrás de HTTPS deja `DARIOMAIL_COOKIE_SECURE=true`. Ponlo en `false` solo para pruebas locales por HTTP.

`DARIOMAIL_TRUSTED_SENDERS_PATH` apunta a un JSON con los remitentes que pueden mostrar imágenes remotas. Si no existe, el servidor lo crea al marcar uno.

## Servicio de usuario (systemd)

```bash
mkdir -p ~/.config/systemd/user
cp ~/dariomail/deploy/dariomail.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now dariomail.service
loginctl enable-linger "$USER"
```

`enable-linger` mantiene el servicio activo sin sesión abierta. Ajusta `WorkingDirectory` y `ExecStart` si el repo no está en `~/dariomail`.

## Nginx

Copia `deploy/nginx-inbox.conf`, cambia `server_name` y `root` a tus valores y recarga nginx. `/api/events` lleva `proxy_buffering off` para que el canal SSE no se quede en el buffer.

## Proxy HTTPS

Apunta tu dominio a `http://127.0.0.1:8095`. Ejemplo con Cloudflare Tunnel:

```yaml
ingress:
  - hostname: inbox.example.com
    service: http://127.0.0.1:8095
  - service: http_status:404
```

## Comprobación

1. `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/auth/me` responde `401`.
2. Abre `https://inbox.example.com`, entra con tu clave web y revisa Recibidos.

## Modo local sin correo

```bash
VITE_DARIOMAIL_MOCK=1 npm run dev
```
