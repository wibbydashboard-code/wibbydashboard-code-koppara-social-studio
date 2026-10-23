# Flujos observados — Fresh2Wow y Koppara

> **Estado: no se pudo observar nada.** Este documento registra qué se intentó, por qué no fue posible y qué
> partes del producto se basan en supuestos. Ningún comportamiento de Fresh2Wow se presenta aquí como confirmado.

## 1. Qué se intentó (23 oct 2026)

| Intento | Resultado |
|---|---|
| Herramienta “REA” para capturar pantallas, DOM, árbol de accesibilidad y pasos | **No existe en esta sesión.** No hay ninguna herramienta, CLI ni servidor MCP con ese nombre. Como sustituto de solo lectura se preparó Chromium + Playwright (preinstalado). |
| `https://fresh2wow.com`, `https://www.fresh2wow.com` desde el contenedor | **Bloqueado**: el proxy de red del entorno respondió `403` al túnel CONNECT (política de red del entorno). |
| `https://koppara.com`, `koppara.com.mx`, `www.koppara.com.mx` desde el contenedor | **Bloqueado** (`403`, misma causa). |
| Mismos dominios mediante obtención web externa | `ENOTFOUND`: los nombres no resolvieron desde ese servicio. |
| Búsqueda web “Fresh2Wow” y “Koppara sitio oficial” | Sin resultados relevantes: no apareció ningún sitio oficial de ninguna de las dos marcas. |
| Documentación y capturas mencionadas en la solicitud | **No estaban en el entorno**: el directorio de trabajo estaba vacío y no se adjuntó ningún archivo. |
| Credenciales o sesiones | No se usaron ni se solicitaron. No se guardaron cookies, tokens ni contraseñas. |

No se publicó, programó, conectó ni desconectó nada. Ninguna acción llegó a pedir permisos, así que no hubo que detenerse ante ninguna.

**Para habilitar la observación real** hay que añadir `fresh2wow.com` y el dominio de Koppara a *Allowed domains* en la configuración de red del entorno (menú del entorno → Editar → Network access). Más información: <https://code.claude.com/docs/en/cloud-environments#network-access>. Con acceso, el script `tests/e2e/` puede adaptarse para capturar pantallas y el árbol de accesibilidad en modo de solo lectura.

## 2. Escenarios solicitados: qué se observó y qué se supuso

Leyenda: **Observado** = visto en el sitio real · **Supuesto** = decisión de diseño propia, sin confirmar.
En ningún escenario hay pasos observados.

### 2.1 Navegación y espacios de trabajo
- Observado: nada.
- Supuesto: un único espacio de trabajo (“Koppara”) con menú lateral en escritorio y navegación inferior en móvil. Secciones según la solicitud: Inicio, Marcas, Cuentas, Crear, Publicaciones, Calendario, Media; además Estudio y Equipo y plan.
- Supuesto: no hay varios espacios de trabajo ni cambio entre ellos.

### 2.2 Creación y edición de una marca
- Observado: nada.
- Supuesto: los campos son los de la solicitud (nombre, sitio web, descripción, audiencia, cliente más rentable, público no deseado, tono, personalidad, idioma, reglas de siempre/nunca, palabras prohibidas, pilares, kit y “Lo que la marca sabe” con 6,000 caracteres).
- Supuesto: dos modos de guardado: *borrador* (sólo exige nombre) y *activar* (exige descripción, audiencia, tono, idioma y al menos un pilar).
- Supuesto: archivar es reversible y no borra publicaciones.

### 2.3 Editor de publicaciones y variantes por red
- Observado: nada.
- Supuesto: pasos “Marca → Contenido → Destinos y variantes” con vista previa lateral.
- Supuesto: cada destino hereda el texto base salvo que se personalice; el título interno y las etiquetas nunca forman parte del texto enviado (requisito de la solicitud, aplicado en `shared/validation.ts → effectiveText`).
- Supuesto: editar una publicación en revisión o aprobada la devuelve a borrador.

### 2.4 Destinos, formatos y requisitos de TikTok
- Observado: nada en Fresh2Wow.
- Supuesto, basado en las pautas públicas de TikTok para Content Posting API según el conocimiento disponible: la privacidad no tiene valor por defecto; comentarios, dúo y stitch empiezan desmarcados; la divulgación comercial (Sí/No) es obligatoria; “Contenido de marca” no admite privacidad “Solo yo”. **Verificar** con la documentación oficial y con la respuesta de `creator_info` al implementar.
- Supuesto: los límites por red de `shared/platforms.ts` son valores de referencia, no confirmados contra las APIs en vivo.

### 2.5 Borradores, revisión, calendario y estados
- Observado: nada.
- Supuesto: estados borrador, en revisión, aprobado, programado, publicado, fallido y cancelado (de la solicitud). Transiciones en `shared/workflow.ts`.
- Supuesto: quien redacta no aprueba su propio contenido (configurable en Equipo y plan).
- Supuesto: los borradores pueden tener “fecha prevista” para aparecer en el calendario sin estar programados.

### 2.6 Biblioteca de medios
- Observado: nada.
- Supuesto: JPG, PNG, WebP, MP4, MOV y WebM; el tipo real se comprueba por los bytes del archivo. Cada archivo indica en qué redes cumple tipo, tamaño, proporción y duración.

### 2.7 Estudio de carruseles e imágenes
- Observado: nada.
- Supuesto: sin generación visual conectada, el estudio compone texto sobre la paleta de la marca y guarda PNG con marca de agua “MAQUETA”. No crea fotografías ni representa productos.

### 2.8 Equipo, roles y límites de créditos/planes
- Observado: nada.
- Supuesto: roles Propietario, Administrador, Publicador, Editor y Lector (de la solicitud) con la matriz de `shared/workflow.ts`.
- Supuesto: plan interno sin facturación con 200 créditos/mes; plantillas locales y maquetas cuestan 0; texto con IA, 1 crédito por opción. No se conocen los planes ni precios reales de Fresh2Wow.

## 3. Koppara: datos confirmados

| Dato | Estado |
|---|---|
| Nombre “Koppara” | Proporcionado en la solicitud. |
| Sitio web, descripción, productos, ingredientes, certificaciones, beneficios, precios | **Pendientes.** No se pudieron consultar fuentes públicas; la ficha los marca como “Por confirmar”. |
| Logotipo | No disponible; la app no dibuja ni imita logotipos. |
| Identidad visual (colores, tipografías) | No confirmada. La interfaz usa la **paleta provisional** pedida: marfil cálido, verde profundo, salvia y terracota (`web/src/styles/tokens.css`). |
