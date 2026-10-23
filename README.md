# Koppara Social Studio

Herramienta interna para preparar, revisar y organizar contenido de redes sociales de Koppara. Interfaz en español, adaptada a móvil.

> **Modo demostración.** No hay integraciones reales con redes sociales: las cuentas son simuladas y nada se publica fuera de la app. Tampoco hay inicio de sesión real (ver `docs/architecture.md`).

## Requisitos

- Node.js **22.13 o superior** (usa `node:sqlite`, integrado).
- npm.

## Instalar y arrancar

```bash
cd wibbydashboard-code-koppara-social-studio
npm install
npm run dev                 # http://localhost:5173
```

Opcional: copia `.env.example` a `.env` para ajustar puerto, rutas o claves (`cp` en Mac/Linux, `copy` en Windows).

Los scripts funcionan igual en Windows (PowerShell o CMD), macOS y Linux.

Producción local:

```bash
npm run build
npm start                   # sirve dist/ y la API en el mismo puerto
```

La base de datos (`data/koppara.db`) y los archivos (`data/uploads/`) se crean solos. Al primer arranque se crean:
- la ficha **Koppara** en borrador, con los datos no confirmados marcados “Por confirmar”;
- una persona Propietaria y cuatro personas de prueba (una por rol) para probar la revisión;
- 200 créditos internos.

Para practicar sin tocar la ficha real: **Inicio → Datos de demostración → Cargar demo** (marca ficticia, cuentas simuladas y publicaciones etiquetadas “Demo”; se quitan con un clic).

## Variables de entorno

| Variable | Uso |
|---|---|
| `PORT` | Puerto (5173). |
| `DATABASE_PATH`, `UPLOAD_DIR` | Ubicación de la base de datos y de los archivos. |
| `APP_ENCRYPTION_KEY` | 32 bytes en base64 para cifrar credenciales futuras: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | Opcional. Sin clave se usan plantillas locales (no es IA). |
| `META_*`, `TIKTOK_*`, `GOOGLE_*`, `X_*`, `LINKEDIN_*` | Reservadas para integraciones futuras; hoy no activan nada. |

Nunca subas `.env` al repositorio.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | API + interfaz con recarga. |
| `npm test` | Pruebas unitarias de reglas (Vitest). |
| `npm run e2e` | Con la app en marcha: recorre en Chromium el flujo crear marca → cuentas simuladas → redactar → destinos → borrador → Publicaciones y Calendario → revisión por roles → programación simulada → asistente. |
| `npm run screenshots` | Con la app en marcha: capturas de escritorio y móvil en `docs/screenshots/`. |
| `npm run typecheck` | Comprobación de tipos. |
| `npm run db:reset` | Borra la base de datos y los archivos locales. |

Las pruebas de navegador usan `CHROMIUM_PATH` si está definida; si no, el Chromium de Playwright (instálalo una vez con `npx playwright install chromium`).

## Documentación

- `docs/observed-flows.md`: qué se pudo observar de Fresh2Wow y Koppara (nada; todo está marcado como supuesto) y por qué.
- `docs/architecture.md`: capas, estados, integraciones pendientes, IA y créditos, seguridad y supuestos.
- `docs/screenshots/`: capturas finales (`*-completa.png` = página completa con barras fijas desactivadas solo para la imagen).
