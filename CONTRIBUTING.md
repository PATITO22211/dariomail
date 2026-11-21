# Contribuir

Gracias por querer ayudar. English contributions are welcome too.

1. Abre un issue antes de cambios grandes para platicarlo.
2. Haz fork y crea una rama desde `main`.
3. Antes del PR corre:
   ```bash
   cd server && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
   npm run lint && npm run build
   ```
4. No incluyas secretos, archivos `.env`, correos reales ni datos personales en código, tests o capturas. Usa `example.com` en fixtures.
5. Describe en el PR qué cambia y cómo lo probaste.

Al contribuir aceptas que tu aporte se publique bajo la licencia MIT del proyecto.
