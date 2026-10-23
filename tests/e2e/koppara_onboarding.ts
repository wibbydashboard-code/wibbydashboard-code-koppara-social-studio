import { chromium, expect } from './browser.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';

const browser = await chromium();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

const step = (msg: string) => console.log(`[PASS] ${msg}`);

try {
  // 1. Inicio inicial
  await page.goto(BASE);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Responsable');
  step('Inicio carga correctamente con saludo y avance');

  // 2. Ir a Marcas y abrir Koppara
  await page.goto(`${BASE}/marcas`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Marcas');
  const kopparaCard = page.locator('a.card', { has: page.getByRole('heading', { name: 'Koppara', exact: true }) });
  await kopparaCard.click();
  await expect(page).toHaveURL(/\/marcas\/[0-9a-f-]{36}$/);
  step('Ficha de Koppara abierta');

  // 3. Completar voz, pilares y kit visual sin inventar productos, precios, ingredientes, certificaciones ni beneficios
  await page.getByRole('textbox', { name: 'Descripción' }).fill('Estudio de contenidos y presencia digital de Koppara.');
  await page.getByRole('textbox', { name: 'Audiencia principal' }).fill('Comunidad interesada en bienestar, autocuidado y vida consciente.');
  await page.getByRole('textbox', { name: 'Tono' }).fill('Cercano, reflexivo, claro y profesional');
  await page.getByRole('textbox', { name: 'Personalidad' }).fill('Auténtica, consciente y sobria');

  // Pilares
  const pillarInput = page.getByLabel('Pilares', { exact: true });
  for (const pillar of ['Comunidad y conversación', 'Detrás de escena', 'Cuidado cotidiano', 'Filosofía de marca']) {
    await pillarInput.fill(pillar);
    await pillarInput.press('Enter');
  }

  // Reglas siempre y nunca
  const alwaysInput = page.getByLabel('Siempre', { exact: true });
  await alwaysInput.fill('Revisar ortografía y tono antes de publicar');
  await alwaysInput.press('Enter');
  await alwaysInput.fill('Fomentar el diálogo respetuoso');
  await alwaysInput.press('Enter');

  const neverInput = page.getByLabel('Nunca', { exact: true });
  await neverInput.fill('No hacer promesas ni afirmaciones médicas');
  await neverInput.press('Enter');
  await neverInput.fill('No inventar productos, precios ni ingredientes');
  await neverInput.press('Enter');

  // Palabras prohibidas
  const bannedInput = page.getByLabel('Palabras prohibidas', { exact: true });
  for (const w of ['milagro', 'curativo', 'garantizado']) {
    await bannedInput.fill(w);
    await bannedInput.press('Enter');
  }

  // Kit visual: Paleta de colores
  const colorInput = page.locator('input[aria-label="Nuevo color"]');
  const addColorBtn = page.locator('.swatch-input').getByRole('button', { name: 'Añadir' });
  for (const c of ['#2E6F54', '#8FA58F', '#C86D51', '#FBF9F4']) {
    await colorInput.evaluate((el: HTMLInputElement, val) => {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, c);
    await addColorBtn.click();
  }

  // Tipografías
  const fontInput = page.getByPlaceholder('Ej.: Fraunces');
  const addFontBtn = page.getByRole('button', { name: 'Añadir tipografía' });
  for (const f of ['Fraunces', 'Inter']) {
    await fontInput.fill(f);
    await addFontBtn.click();
  }

  // Guardar y activar
  await page.getByRole('button', { name: 'Guardar y activar' }).click();
  await expect(page.locator('.badge--active').first()).toBeVisible();
  step('Marca Koppara completada y activada con éxito');

  // 4. Crear cuenta simulada de Instagram y asignarla a Koppara
  await page.goto(`${BASE}/cuentas`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Cuentas');

  const igCard = page.locator('article.card', { has: page.getByRole('heading', { name: 'Instagram', exact: true }) });
  await igCard.getByRole('button', { name: 'Añadir simulada' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre de usuario de prueba').fill('@koppara.bienestar');
  await dialog.getByLabel('Marca').selectOption({ label: 'Koppara' });
  await dialog.getByRole('button', { name: 'Añadir' }).click();

  await expect(dialog).toBeHidden();
  await expect(igCard.getByText('@koppara.bienestar')).toBeVisible();
  await expect(igCard.getByText('Simulada', { exact: true }).first()).toBeVisible();
  step('Cuenta simulada @koppara.bienestar creada y asignada a Koppara');

  // También creamos una cuenta simulada de Facebook para Koppara
  const fbCard = page.locator('article.card', { has: page.getByRole('heading', { name: 'Facebook', exact: true }) });
  await fbCard.getByRole('button', { name: 'Añadir simulada' }).click();
  await dialog.getByLabel('Nombre de usuario de prueba').fill('koppara.oficial');
  await dialog.getByLabel('Marca').selectOption({ label: 'Koppara' });
  await dialog.getByRole('button', { name: 'Añadir' }).click();
  await expect(dialog).toBeHidden();
  await expect(fbCard.getByText('koppara.oficial')).toBeVisible();
  step('Cuenta simulada koppara.oficial de Facebook creada y asignada a Koppara');

  // 5. Redactar una publicación y guardarla como borrador
  await page.goto(`${BASE}/crear`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Nueva publicación');

  await page.getByLabel('Título interno').fill('Bienvenida a la comunidad Koppara');
  const tagInput = page.getByLabel('Etiquetas');
  await tagInput.fill('bienvenida');
  await tagInput.press('Enter');

  // Fecha prevista para que aparezca en el calendario (dentro del mes actual)
  const today = new Date();
  const plannedYear = today.getFullYear();
  const plannedMonth = String(today.getMonth() + 1).padStart(2, '0');
  const plannedDay = String(Math.min(today.getDate() + 2, 28)).padStart(2, '0');
  await page.getByLabel(/^Fecha prevista/).fill(`${plannedYear}-${plannedMonth}-${plannedDay}T11:00`);

  // Texto base (sin inventar afirmaciones de salud, ni ingredientes, etc.)
  const baseText = 'Bienvenidos a Koppara. Un espacio dedicado al cuidado cotidiano, el bienestar consciente y la serenidad. Cuéntanos en comentarios: ¿cuál es tu pausa favorita del día?';
  await page.getByLabel('Texto base').fill(baseText);

  // Seleccionar destino Facebook (que no exige medios para feed de texto)
  const fbDestButton = page.locator('button.dest', { hasText: 'koppara.oficial' });
  await fbDestButton.click();
  await expect(fbDestButton).toHaveAttribute('aria-pressed', 'true');

  // Guardar como borrador
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page).toHaveURL(/\/publicaciones\/[0-9a-f-]{36}\/editar$/);
  step('Publicación creada y guardada como borrador');

  // 6. Confirmar que aparece en Publicaciones
  await page.goto(`${BASE}/publicaciones`);
  await expect(page.getByText('Bienvenida a la comunidad Koppara')).toBeVisible();
  await expect(page.getByText('Borrador').first()).toBeVisible();
  step('Publicación confirmada en la lista de Publicaciones');

  // 7. Confirmar que aparece en Calendario
  await page.goto(`${BASE}/calendario`);
  await expect(page.getByText('Bienvenida a la comunidad Koppara').first()).toBeVisible();
  step('Publicación confirmada en el Calendario');

  // 8. Confirmar que el progreso de configuración en Inicio se actualizó a 5/5
  await page.goto(BASE);
  await expect(page.getByText('5 de 5')).toBeVisible();
  step('Asistente de configuración muestra 5 de 5 (100% completado)');

  console.log('\n==========================================');
  console.log('TODO EL FLUJO PRINCIPAL COMPLETADO Y VERIFICADO CON ÉXITO');
  console.log('==========================================\n');
} catch (err) {
  console.error('Error durante la verificación:', err);
  if (errors.length) {
    console.error('Errores en navegador:', errors);
  }
  process.exit(1);
} finally {
  await browser.close();
}
