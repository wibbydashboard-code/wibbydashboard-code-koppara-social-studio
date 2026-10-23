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

## Integraciones reales pendientes

Todas desactivadas (`server/integrations/registry.ts`). Rellenar las variables de entorno **no** las activa: cada una requiere implementación, revisión de la app por la plataforma y autorización explícita de Koppara.

| Red | Qué falta | Variables |
|---|---|---|
| Instagram | OAuth de Meta, cuenta profesional vinculada a página, publicación por contenedores (Feed/Reel/Historia), revisión de permisos de la app | `META_APP_ID`, `META_APP_SECRET` |
| Facebook | Token de página, Pages API (feed, reels, historias) | `META_APP_ID`, `META_APP_SECRET` |
| TikTok | Login Kit, Content Posting API, `creator_info` para opciones de privacidad reales, auditoría de la app | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| YouTube | OAuth de Google, subida reanudable con YouTube Data API, cuota | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| X | OAuth 2.0 con PKCE, nivel de acceso que permita publicar, subida de medios | `X_CLIENT_ID`, `X_CLIENT_SECRET` |
| Threads | Threads API (contenedores) | `META_APP_ID`, `META_APP_SECRET` |
| LinkedIn | Community Management API, página de empresa | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |

Para implementar una red:
1. Crear una clase que cumpla `SocialAdapter` (`server/integrations/types.ts`) y registrarla.
2. `getAuthorizationUrl` / `completeAuthorization`: flujo de servidor con `state` (y PKCE donde aplique); guardar tokens **sólo** cifrados con `security/crypto.ts` en `account_credentials`.
3. `publish`: devolver `{ ok: false, error, retryable }` con la causa legible; la UI ya muestra el error por destino y el botón **Reintentar**.
4. Añadir un **planificador** (no existe todavía) que tome las publicaciones `scheduled` vencidas y llame a `postService.publishRealTargets`.
5. Revisar los límites de `shared/platforms.ts` contra la documentación oficial vigente.

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
