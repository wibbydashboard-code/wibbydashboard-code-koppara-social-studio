# Arquitectura — Koppara Social Studio

## Pila y por qué

| Capa | Elección | Motivo |
|---|---|---|
| UI | React 19 + React Router 7, Vite 8, CSS con tokens propios | SPA rápida y responsive, sin plantillas de panel administrativo; los tokens centralizan color, tipografía, espaciado, radios y botones. |
| API | Node 22 + Express 5 (TypeScript ejecutado con `tsx`) | Mismo lenguaje que la UI y reglas compartidas sin duplicarlas. |
| Persistencia | SQLite mediante `node:sqlite` (integrado en Node 22) | Persistencia real en disco sin dependencias nativas ni servicios externos. Migraciones versionadas en `server/db/database.ts`. Puede cambiarse por PostgreSQL reemplazando los repositorios. |
| Archivos | Disco local (`UPLOAD_DIR`) | Suficiente para el MVP; migrable a almacenamiento de objetos. |
| Tipografía | Fraunces (títulos) e Inter (interfaz), autoalojadas vía `@fontsource` | Estética editorial y legible, sin peticiones a terceros. |

El repositorio estaba vacío; no había convenciones previas que conservar.

## Capas

```
shared/        Reglas de negocio puras (sin E/S), usadas por API y UI
  types.ts       Modelo de dominio
  platforms.ts   Límites y formatos por red (valores de referencia)
  validation.ts  Validación por destino, TikTok, YouTube, marca
  compliance.ts  Detector de afirmaciones de salud / palabras prohibidas
  workflow.ts    Roles, permisos y transiciones de estado
server/
  db/            Conexión, migraciones, semilla y datos demo
  repositories/  Acceso a datos (SQL) por entidad
  services/      Casos de uso: permisos, transiciones, validación en servidor
  integrations/  Contrato SocialAdapter + registro (todo desactivado)
  ai/            Contrato AiProvider + plantillas locales + adaptador opcional de Claude
  security/      Cifrado AES-256-GCM para credenciales
  http/          Rutas REST y errores
web/src/
  lib/           Cliente API, sesión, notificaciones, fechas con zona horaria
  components/    UI reutilizable (botones, campos, modales, vista previa…)
  pages/         Pantallas
tests/unit       Reglas de negocio (Vitest)
tests/e2e        Flujo principal en navegador y capturas (Playwright + Chromium local)
```

El servidor vuelve a validar todo lo que valida la UI: permisos por rol, transiciones, límites por red, opciones de TikTok, afirmaciones de riesgo y tipo real de los archivos.

## Flujo de estados

```
borrador ──enviar──▶ en revisión ──aprobar──▶ aprobado ──programar──▶ programado ──(integración)──▶ publicado / fallido
   ▲                    │  devolver (con nota)    │ publicar ahora ───────────────────────────────▶ publicado / fallido
   └────────────────────┴─────────────────────────┘
cualquier estado activo ──cancelar──▶ cancelado ──reabrir──▶ borrador
```

- Enviar, aprobar, programar y publicar exigen destinos sin errores.
- La aprobación la hace una persona distinta a quien creó la publicación (configurable).
- Editar contenido en revisión o aprobado lo devuelve a borrador.
- **Cuentas simuladas**: programar o publicar sólo cambia el estado dentro de la app, con `simulated = true` y etiqueta visible “Simulado”. No se mezclan cuentas simuladas y reales en una publicación.
- **Cuentas reales**: programar o publicar exige que el adaptador de esa red esté habilitado; hoy ninguno lo está, así que la API responde `409`.

## Integraciones oficiales

La arquitectura de integraciones oficiales conecta con las APIs de las plataformas mediante adaptadores de servidor (`SocialAdapter` en `server/integrations/types.ts`).

### Estado de la integración oficial con Meta (Facebook e Instagram)
- **Versión de Graph API**:
  Centralizada en `config.metaGraphVersion` (`META_GRAPH_VERSION`, por defecto **v26.0**, versión vigente según el changelog oficial de Meta).
- **Flujo y Seguridad OAuth**:
  1. **Protección CSRF con `state`**: Cada intento genera un token criptográfico único con caducidad corta de 10 minutos (`server/security/oauthState.ts`). En `/api/integrations/meta/callback`, la solicitud se rechaza inmediatamente si el state falta, no coincide, expiró o ya fue usado (consumo de un solo uso para prevenir ataques de repetición), antes de intercambiar el código.
  2. **URI de Redirección (`META_REDIRECT_URI`)**: Debe coincidir exactamente con la configurada en la consola de Meta for Developers. Fuera del entorno de desarrollo local (`localhost`), **Meta exige obligatoriamente HTTPS**.
  3. **Control de acceso**: El callback y la generación del enlace exigen estrictamente el permiso `account.manage` en el rol del usuario que inició la conexión.
  4. **Protección de secretos y tokens**:
     - Se prohíbe registrar en consola o logs tokens de acceso, códigos OAuth o secretos.
     - Si falta `APP_ENCRYPTION_KEY`, la vinculación falla inmediatamente con un error claro y **nunca guarda credenciales en texto plano**.
- **Permisos requeridos y Meta App Review**:
  Para publicar en Facebook e Instagram, la aplicación solicita el mínimo de permisos necesarios:
  - `pages_show_list` (Páginas): Lista las páginas que administra el usuario. *(Requiere App Review en modo Live)*.
  - `pages_read_engagement` (Páginas): Lectura de metadatos e interacciones para verificación de páginas. *(Requiere App Review en modo Live)*.
  - `pages_manage_posts` (Páginas): Permiso para publicar contenido y fotos en las páginas. *(Requiere App Review en modo Live)*.
  - `instagram_basic` (Instagram): Obtiene el identificador y nombre de la cuenta profesional vinculada a la página. *(Requiere App Review en modo Live)*.
  - `instagram_content_publish` (Instagram): Crea contenedores de medios y publica imágenes y videos. *(Requiere App Review en modo Live)*.
  - *Nota*: En modo Desarrollo (*Development Mode*), los roles administradores y testers de la app de Meta pueden vincular y probar sin pasar por App Review. Para usuarios externos en producción (*Live Mode*), Meta exige la aprobación de revisión.
- **Publicación oficial mediante Graph API**:
  - Facebook: Publicación en feed (`/feed` con mensaje de texto) o fotos (`/photos` con URL de imagen y pie).
  - Instagram: Publicación por contenedores oficiales (`/media` con tipo IMAGE/VIDEO, validación de contenedor y `/media_publish`).
- **Estado de conexión**:
  - En ausencia de credenciales (`META_APP_ID`, `META_APP_SECRET`, `APP_ENCRYPTION_KEY`), la aplicación muestra explícitamente **"Pendiente de conectar"** y bloquea cualquier intento de publicación externa con `IntegrationDisabledError`. No se simulan conexiones ni resultados exitosos.

### Publicación programada (Planificador en segundo plano)
- **Implementación**: Se implementó `server/services/scheduler.ts` que se inicia automáticamente con el servidor (`startScheduler()`).
- **Comportamiento**:
  - Sondea periódicamente (cada 30 segundos) las publicaciones en estado `scheduled` cuya fecha prevista (`planned_at`) haya vencido (`planned_at <= datetime('now')`).
  - **Publicaciones simuladas**: Las publica internamente con `simulated = true` y registra el evento de auditoría `published_demo`.
  - **Publicaciones con destinos reales**: Invoca `publishReal` para cada destino.
  - **Límite de reintentos**: Máximo 3 intentos por destino (`attempts >= 3`).
  - **Error por destino**: Registra la causa detallada del fallo en `post_targets.error`, marca el destino como `failed` y, si algún destino falla, marca la publicación como `failed` y añade el evento `publish_failed`.
  - Si todos los destinos se publican correctamente, la publicación transiciona a `published` con el evento `published`.

| Red | Estado de Implementación | Qué falta para producción | Variables requeridas |
|---|---|---|---|
| Instagram | Implementado (`MetaAdapter`) | Credenciales en `.env`, app aprobada en Meta App Review, permisos de Instagram Content Publishing | `META_APP_ID`, `META_APP_SECRET`, `APP_ENCRYPTION_KEY` |
| Facebook | Implementado (`MetaAdapter`) | Credenciales en `.env`, app aprobada en Meta App Review, permisos `pages_manage_posts` y `pages_show_list` | `META_APP_ID`, `META_APP_SECRET`, `APP_ENCRYPTION_KEY` |
| TikTok | Pendiente | Login Kit, Content Posting API, `creator_info` para opciones de privacidad reales, auditoría de la app | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| YouTube | Pendiente | OAuth de Google, subida reanudable con YouTube Data API, cuota | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| X | Pendiente | OAuth 2.0 con PKCE, nivel de acceso que permita publicar, subida de medios | `X_CLIENT_ID`, `X_CLIENT_SECRET` |
| Threads | Pendiente | Threads API (contenedores) | `META_APP_ID`, `META_APP_SECRET` |
| LinkedIn | Pendiente | Community Management API, página de empresa | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |

## IA y créditos

- `AiProvider` desacopla el proveedor. Sin `ANTHROPIC_API_KEY` se usa `localTemplateProvider`, que **no es IA** y se etiqueta así en la UI y en el libro de créditos.
- Con clave, `server/ai/anthropic.ts` usa el SDK oficial (`claude-opus-5-5` por defecto, configurable con `AI_MODEL`), esfuerzo bajo y respaldo automático del servidor si el modelo rechaza la solicitud. La instrucción de sistema prohíbe inventar datos y hacer afirmaciones de salud. **No probado con una clave real en este entorno.**
- Antes de generar, la UI pide `/ai/estimate` y muestra el costo; `/ai/generate` exige que el costo confirmado coincida y registra el consumo en `credit_ledger`.
- Todo resultado pasa por `checkCompliance` y se inserta como texto editable; sigue necesitando revisión y aprobación.

## Seguridad y secretos

- Secretos sólo por variables de entorno (`.env`, ignorado por git). Ver `.env.example`.
- Credenciales de integraciones: AES-256-GCM con `APP_ENCRYPTION_KEY`; sin clave, guardarlas está deshabilitado.
- Los errores devueltos no incluyen trazas; los logs sólo registran el mensaje.
- Subidas: tipo real por bytes, nombre de archivo saneado y nombre almacenado aleatorio.

## Autenticación pendiente (importante)

El MVP **no tiene inicio de sesión**. El selector “Actuando como” envía la cabecera `x-user-id` para probar roles; cualquiera con acceso a la URL puede elegir cualquier persona. Antes de usarlo fuera de un equipo local hay que añadir autenticación real (p. ej. OIDC/SSO) y derivar el usuario de la sesión en `server/http/routes.ts → currentUser`. No exponer el servidor a Internet tal como está.

## Supuestos

- Ver `docs/observed-flows.md`: ningún flujo de Fresh2Wow pudo observarse; todo el comportamiento es diseño propio a partir de la solicitud.
- Los límites por red son valores de referencia sin verificar en vivo.
- Zona horaria por defecto: `America/Mexico_City` (supuesto; configurable en Calendario).
- Un único espacio de trabajo.
- Los datos de la ficha de Koppara están pendientes de confirmar, salvo el nombre.
