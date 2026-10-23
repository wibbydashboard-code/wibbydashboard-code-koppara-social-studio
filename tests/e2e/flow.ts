/**
 * Verificación en navegador del flujo principal:
 * crear marca → cuenta simulada → redactar → destinos → borrador → Publicaciones y Calendario,
 * más revisión/aprobación por roles y programación simulada.
 * Uso: con la app en marcha (npm run dev), ejecutar `npm run e2e`.
 */
import { chromium, expect } from './browser.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const stamp = Date.now().toString().slice(-5);
const BRAND = `Marca E2E ${stamp}`;
const TITLE = `Borrador E2E ${stamp}`;

const browser = await chromium();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
const step = (s: string) => console.log(`✓ ${s}`);

try {
  await page.goto(BASE);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Responsable');
  step('Inicio carga con saludo y avance de configuración');

  // 1. Marca: validación y creación
  await page.goto(`${BASE}/marcas/nueva`);
  await page.getByRole('button', { name: 'Guardar y activar' }).click();
  await expect(page.getByText('El nombre es obligatorio.')).toBeVisible();
  step('Validación visible al activar marca vacía');
  await page.getByLabel('Nombre', { exact: false }).first().fill(BRAND);
  await page.getByRole('button', { name: 'Guardar y activar' }).click();
  await expect(page.getByText('Describe la marca antes de activarla.')).toBeVisible();
  step('Activar exige perfil completo (errores por campo)');
  await page.getByLabel('Descripción').fill('Marca creada por la prueba automática.');
  await page.getByLabel('Audiencia principal').fill('Equipo interno de pruebas.');
  await page.getByLabel('Tono').fill('Claro y cercano');
  const pillar = page.getByLabel('Pilares');
  await pillar.fill('Consejos');
  await pillar.press('Enter');
  await page.getByLabel('Palabras prohibidas').fill('milagro');
  await page.getByLabel('Palabras prohibidas').press('Enter');
  await page.getByLabel('Conocimiento').fill('Dato de prueba.');
  await expect(page.getByText('15 / 6,000')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar y activar' }).click();
  await expect(page).toHaveURL(/\/marcas\/[0-9a-f-]{36}$/);
  await expect(page.locator('.badge--active').first()).toBeVisible();
  step(`Marca “${BRAND}” creada y activa`);

  // 2. Cuentas simuladas asignadas a la marca
  await page.goto(`${BASE}/cuentas`);
  for (const net of ['Facebook', 'Instagram']) {
    const card = page.locator('article.card', { has: page.getByRole('heading', { name: net, exact: true }) });
    await card.getByRole('button', { name: 'Añadir simulada' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre de usuario de prueba').fill(`@e2e.${net.toLowerCase()}.${stamp}`);
    await dialog.getByLabel('Marca').selectOption({ label: BRAND });
    await dialog.getByRole('button', { name: 'Añadir' }).click();
    await expect(dialog).toBeHidden();
    await expect(card.getByText(`@e2e.${net.toLowerCase()}.${stamp}`)).toBeVisible();
  }
  await expect(page.getByText('Simulada').first()).toBeVisible();
  step('Cuentas simuladas de Facebook e Instagram creadas y etiquetadas');

  // 3. Redactar publicación
  await page.goto(`${BASE}/crear`);
  await page.getByRole('combobox', { name: /^Marca/ }).selectOption({ label: BRAND });
  await page.getByLabel('Título interno').fill(TITLE);
  const tags = page.getByLabel('Etiquetas internas');
  await tags.fill('prueba');
  await tags.press('Enter');
  await page.getByLabel('Texto base').fill('Este producto es un milagro y cura todo');
  await expect(page.getByText(/Posible promesa de cura/).first()).toBeVisible();
  await expect(page.getByText(/palabra prohibida/).first()).toBeVisible();
  step('Avisos de afirmaciones de salud y palabras prohibidas en vivo');
  await page.getByLabel('Texto base').fill('¿Cuál es tu momento favorito para cuidarte? Te leemos en comentarios.');
  const tomorrow = new Date(Date.now() + 86400000);
  const z = (n: number) => String(n).padStart(2, '0');
  await page.getByLabel(/Fecha prevista/).fill(`${tomorrow.getFullYear()}-${z(tomorrow.getMonth() + 1)}-${z(tomorrow.getDate())}T10:30`);
  await page.getByRole('button', { name: new RegExp(`@e2e.facebook.${stamp}`) }).click();
  await page.getByRole('button', { name: new RegExp(`@e2e.instagram.${stamp}`) }).click();
  await expect(page.getByText('Feed requiere al menos 1 archivo.')).toBeVisible();
  step('Destinos simulados seleccionados; Instagram exige medios');
  // Quitar Instagram para dejar un destino válido
  await page.getByRole('button', { name: new RegExp(`@e2e.instagram.${stamp}`) }).click();
  await expect(page.locator('.variant .badge--published', { hasText: 'Listo' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Feed/ })).toBeVisible();
  await expect(page.locator('.phone__text')).toContainText('momento favorito');
  await expect(page.locator('.phone__text')).not.toContainText(TITLE);
  step('Vista previa por destino sin título interno');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Borrador guardado.')).toBeVisible();
  await expect(page).toHaveURL(/\/publicaciones\/[0-9a-f-]{36}\/editar$/);
  const postUrl = page.url().replace(/\/editar$/, '');
  step('Borrador guardado');

  // 4. Publicaciones y calendario
  await page.goto(`${BASE}/publicaciones`);
  const row = page.getByRole('link', { name: new RegExp(TITLE) });
  await expect(row).toBeVisible();
  await expect(row.locator('.badge--draft')).toHaveText('Borrador');
  await page.getByLabel('Estado').selectOption('draft');
  await expect(row).toBeVisible();
  await page.getByLabel('Etiqueta').selectOption('prueba');
  await expect(row).toBeVisible();
  step('Aparece en Publicaciones y los filtros funcionan');
  await page.goto(`${BASE}/calendario`);
  if (tomorrow.getMonth() !== new Date().getMonth()) await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await expect(page.locator('.cal__event', { hasText: TITLE })).toBeVisible();
  await expect(page.locator('.cal__event', { hasText: TITLE })).toContainText('10:30');
  step('Aparece en el Calendario a las 10:30 de la zona configurada');

  // 5. Revisión por roles
  await page.goto(postUrl);
  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(page.locator('.badge--in_review').first()).toBeVisible();
  step('Enviada a revisión (Propietario)');
  await page.getByLabel('Actuando como').selectOption({ label: 'Editor de prueba · Editor' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Aprobar' })).toHaveCount(0);
  step('Editor no ve “Aprobar”');
  await page.getByLabel('Actuando como').selectOption({ label: 'Publicador de prueba · Publicador' });
  await page.reload();
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.locator('.badge--approved').first()).toBeVisible();
  step('Publicador aprueba');
  await page.getByRole('button', { name: 'Programar' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByText('Simulación.')).toBeVisible();
  const later = new Date(Date.now() + 2 * 86400000);
  await dlg.getByLabel(/Fecha y hora/).fill(`${later.getFullYear()}-${z(later.getMonth() + 1)}-${z(later.getDate())}T09:00`);
  await dlg.getByRole('button', { name: 'Programar (simulado)' }).click();
  await expect(page.locator('.badge--scheduled').first()).toBeVisible();
  await expect(page.getByText('Estado simulado.')).toBeVisible();
  step('Programación simulada, claramente etiquetada');
  await page.getByLabel('Actuando como').selectOption({ label: 'Responsable Koppara · Propietario' });

  // 6. Asistente sin IA: muestra costo y no finge IA
  await page.goto(`${BASE}/crear`);
  await page.getByRole('combobox', { name: /^Marca/ }).selectOption({ label: BRAND });
  await page.getByRole('button', { name: /Asistente/ }).click();
  await expect(page.getByText('Sin IA configurada.')).toBeVisible();
  await page.getByLabel('¿Sobre qué quieres publicar?').fill('ideas para una rutina de mañana');
  await expect(page.getByText(/Costo estimado:\s*0 créditos/)).toBeVisible();
  await page.getByRole('button', { name: 'Crear borradores con plantilla' }).click();
  await expect(page.getByText('Borradores con plantilla local (sin IA)')).toBeVisible();
  await page.getByRole('button', { name: 'Usar como texto base' }).first().click();
  await expect(page.getByLabel('Texto base')).toHaveValue(/rutina de mañana/i);
  step('Asistente con plantillas: costo previo, sin fingir IA, texto editable');

  if (errors.length) throw new Error(`Errores en consola:\n${errors.join('\n')}`);
  console.log('\nFlujo completo verificado sin errores de consola.');
} catch (e) {
  await page.screenshot({ path: 'docs/screenshots/e2e-failure.png', fullPage: true });
  console.error(errors.join('\n'));
  throw e;
} finally {
  await browser.close();
}
