# Despliegue de DarioMail en sdd

DarioMail se publica solo por un túnel de Cloudflare. No abras puertos en el router y no uses certbot. El certificado lo termina Cloudflare. Nginx escucha en `127.0.0.1:8095` y el proceso Rust en `127.0.0.1:3001`.

Stalwart sigue en `https://mail.dariomsi.com`. El navegador nunca ve esa clave de aplicación. El servidor la usa para hablar JMAP y lee las URLs desde `/.well-known/jmap`.

## Qué necesitas

- Rust stable reciente (1.88 o posterior) y Node.js
- El código en `~/dariomail`
- Una clave de aplicación de Stalwart para `dario@dariomsi.com`
- `cloudflared` ya en marcha en sdd

## Construir

```bash
cd ~/dariomail
npm ci
npm run build
cd server
cargo build --release
```

El frontend queda en `~/dariomail/dist`. El binario queda en `~/dariomail/server/target/release/dariomail`.

## Variables

```bash
mkdir -p ~/.config/dariomail
cp ~/dariomail/.env.example ~/.config/dariomail/env
chmod 600 ~/.config/dariomail/env
```

Edita el archivo y rellena `STALWART_APP_PASSWORD`, `DARIOMAIL_SECRET` y `DARIOMAIL_LOGIN_PASSWORD_HASH`.

```bash
openssl rand -base64 32
printf '%s' 'tu clave de la web' | ~/dariomail/server/target/release/dariomail hash-password
```

Copia el hash completo a `DARIOMAIL_LOGIN_PASSWORD_HASH`. En sdd deja `DARIOMAIL_COOKIE_SECURE=true`. Si pruebas el Vite local por HTTP, ponlo en `false` solo en esa máquina.

## Servicio de usuario

```bash
mkdir -p ~/.config/systemd/user
cp ~/dariomail/deploy/dariomail.service ~/.config/systemd/user/dariomail.service
systemctl --user daemon-reload
systemctl --user enable --now dariomail.service
loginctl enable-linger "$USER"
```

`enable-linger` mantiene el servicio activo sin una sesión gráfica. Revisa el estado con `systemctl --user status dariomail.service`.

Ajusta `WorkingDirectory` y `ExecStart` si el repositorio no está en `~/dariomail`.

## Nginx

Copia `deploy/nginx-inbox.conf` al sitio de nginx de sdd. La raíz `root` debe apuntar al `dist` real. Recarga nginx.

`/api/events` lleva `proxy_buffering off` para que el canal SSE no se quede atrapado en el buffer.

## Túnel de Cloudflare

Añade el hostname al ingress del túnel que ya corre en sdd. Un ejemplo:

```yaml
ingress:
  - hostname: inbox.dariomsi.com
    service: http://127.0.0.1:8095
  - service: http_status:404
```

Reinicia `cloudflared` después del cambio. El registro DNS de `inbox.dariomsi.com` debe ser el del túnel, no una IP pública de casa.

## Comprobación

1. `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/auth/me` responde `401`.
2. Abre `https://inbox.dariomsi.com`, entra con la clave de la web y mira Recibidos.
3. En el panel de Cloudflare, el hostname debe enrutar a `http://127.0.0.1:8095`.

## Modo local sin correo

Para ver la interfaz sin Stalwart:

```bash
VITE_DARIOMAIL_MOCK=1 npm run dev
```

Con el servidor real, arranca el binario y en otra terminal `npm run dev`. Vite reenvía `/api` a `http://127.0.0.1:3001`.
