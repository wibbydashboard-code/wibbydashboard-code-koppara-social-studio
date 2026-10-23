import { chromium, expect } from './browser.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';

const browser = await chromium();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

const step = (msg: string) => console.log(`[PASS] ${msg}`);

try {
  // 1. Verificar estado actual de "Bienvenida a la comunidad Koppara"
  await page.goto(`${BASE}/publicaciones`);
  const welcomeLink = page.getByRole('link', { name: /Bienvenida a la comunidad Koppara/i });
  await expect(welcomeLink).toBeVisible();
  await expect(page.getByText('borrador sin programar', { exact: false })).toBeVisible();
  step('Listado de publicaciones muestra "Bienvenida a la comunidad Koppara" como borrador con fecha tentativa');

  await welcomeLink.click();
  await expect(page).toHaveURL(/\/publicaciones\/[0-9a-f-]{36}$/);
  await expect(page.locator('.badge--draft').first()).toHaveText('Borrador');
  await expect(page.getByText('Borrador sin programar')).toBeVisible();
  await expect(page.getByText('No tiene una programación activa ni puede enviarse automáticamente')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Programar' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  step('Detalle de "Bienvenida" confirma que es borrador, sin programación activa y botones deshabilitados');

  // ==========================================
  // FLUJO INDEPENDIENTE 1: RECHAZO DIRECTO DESDE IN_REVIEW
  // ==========================================
  await page.getByLabel('Actuando como').selectOption({ label: 'Editor de prueba · Editor' });
  await page.goto(`${BASE}/crear`);
  await page.getByLabel('Título interno').fill('Post para prueba de rechazo directo');
  await page.getByLabel('Texto base').fill('Texto que necesita ajustes editoriales antes de poder considerarse.');
  const fbDest1 = page.locator('button.dest', { hasText: 'koppara.oficial' });
  await fbDest1.click();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page).toHaveURL(/\/publicaciones\/[0-9a-f-]{36}\/editar$/);
  const post1Id = page.url().split('/')[4];

  // Editor lo envía a revisión
  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(page.locator('.badge--in_review').first()).toBeVisible();
  step('Flujo 1: Editor creó borrador y lo envió a revisión (estado: in_review, NUNCA aprobado)');

  // Publicador revisa y rechaza directamente desde in_review (sin aprobar)
  await page.getByLabel('Actuando como').selectOption({ label: 'Publicador de prueba · Publicador' });
  await page.goto(`${BASE}/publicaciones/${post1Id}`);
  await expect(page.locator('.badge--in_review').first()).toBeVisible();
  await page.getByRole('button', { name: 'Devolver' }).click();

  const rejectDlg1 = page.getByRole('dialog');
  await expect(rejectDlg1).toBeVisible();
  const returnBtn1 = rejectDlg1.getByRole('button', { name: 'Devolver con comentario' });
  await expect(returnBtn1).toBeDisabled();

  await rejectDlg1.getByLabel('¿Qué hay que cambiar?').fill('El enfoque no cumple con las pautas editoriales de Koppara. Por favor reescribir.');
  await expect(returnBtn1).toBeEnabled();
  await returnBtn1.click();
  await expect(rejectDlg1).toBeHidden();

  // Verificar que pasó directamente in_review -> draft sin pasar por approved
  await expect(page.locator('.badge--draft').first()).toBeVisible();
  await expect(page.getByText('El enfoque no cumple con las pautas editoriales de Koppara. Por favor reescribir.')).toBeVisible();
  step('Flujo 1: Rechazo directo in_review -> draft verificado con éxito (completamente independiente de aprobación)');

  // ==========================================
  // FLUJO 2: APROBACIÓN, PROGRAMACIÓN SIMULADA Y REVOCACIÓN (APPROVED -> DRAFT)
  // ==========================================
  await page.getByLabel('Actuando como').selectOption({ label: 'Editor de prueba · Editor' });
  await page.goto(`${BASE}/crear`);
  const draftTitle = 'Rutina nocturna y pausa consciente';
  await page.getByLabel('Título interno').fill(draftTitle);
  const tagInput = page.getByLabel('Etiquetas');
  await tagInput.fill('rutina');
  await tagInput.press('Enter');

  const today = new Date();
  const plannedYear = today.getFullYear();
  const plannedMonth = String(today.getMonth() + 1).padStart(2, '0');
  const plannedDay = String(Math.min(today.getDate() + 3, 28)).padStart(2, '0');
  await page.getByLabel(/^Fecha prevista/).fill(`${plannedYear}-${plannedMonth}-${plannedDay}T20:30`);
  await page.getByLabel('Texto base').fill('Una pausa al final del día para desconectar y recuperar la calma. ¿Cómo terminas tu jornada? Comparte tus hábitos con la comunidad.');

  const fbDest2 = page.locator('button.dest', { hasText: 'koppara.oficial' });
  await fbDest2.click();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page).toHaveURL(/\/publicaciones\/[0-9a-f-]{36}\/editar$/);
  const post2Id = page.url().split('/')[4];
  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(page.locator('.badge--in_review').first()).toBeVisible();
  step(`Flujo 2: Editor creó "${draftTitle}" y envió a revisión`);

  // Confirmar que el Editor NO puede aprobar ni publicar
  await expect(page.getByRole('button', { name: 'Aprobar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Programar' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Publicar' })).toBeDisabled();

  const apiCheck = await page.evaluate(async (pid) => {
    const uid = localStorage.getItem('kss.user') || '';
    const headers = { 'Content-Type': 'application/json', 'x-user-id': uid };
    const resApprove = await fetch(`/api/posts/${pid}/actions/approve`, { method: 'POST', headers });
    const resPublish = await fetch(`/api/posts/${pid}/actions/publish`, { method: 'POST', headers });
    const resSchedule = await fetch(`/api/posts/${pid}/actions/schedule`, { method: 'POST', headers });
    return { approveStatus: resApprove.status, publishStatus: resPublish.status, scheduleStatus: resSchedule.status };
  }, post2Id);
  expect(apiCheck.approveStatus).toBe(403);
  expect(apiCheck.publishStatus).toBe(403);
  expect(apiCheck.scheduleStatus).toBe(403);
  step('Flujo 2: Bloqueo de permisos en Editor confirmado en UI y con 403 Forbidden en API');

  // Publicador revisa y aprueba
  await page.getByLabel('Actuando como').selectOption({ label: 'Publicador de prueba · Publicador' });
  await page.goto(`${BASE}/publicaciones/${post2Id}`);
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.locator('.badge--approved').first()).toBeVisible();
  await expect(page.getByText('Aprobada por Publicador de prueba')).toBeVisible();
  step('Flujo 2: Publicador aprobó la publicación');

  // Programación simulada
  await page.getByRole('button', { name: 'Programar' }).click();
  const scheduleDlg = page.getByRole('dialog');
  await expect(scheduleDlg.getByText('Simulación.')).toBeVisible();
  await scheduleDlg.getByRole('button', { name: 'Programar (simulado)' }).click();
  await expect(scheduleDlg).toBeHidden();
  await expect(page.locator('.badge--scheduled').first()).toBeVisible();
  step('Flujo 2: Programación simulada completada y etiquetada');

  // Revocación: retirar programación -> approved -> devolver a borrador
  await page.getByRole('button', { name: 'Quitar programación' }).click();
  await expect(page.locator('.badge--approved').first()).toBeVisible();

  await page.getByRole('button', { name: 'Devolver' }).click();
  const rejectDlg2 = page.getByRole('dialog');
  await rejectDlg2.getByLabel('¿Qué hay que cambiar?').fill('Se cancela la aprobación temporalmente para ajustar el texto.');
  await rejectDlg2.getByRole('button', { name: 'Devolver con comentario' }).click();
  await expect(rejectDlg2).toBeHidden();
  await expect(page.locator('.badge--draft').first()).toBeVisible();
  step('Flujo 2: Transición approved -> draft (revocación de aprobación) verificada con éxito');

  // Comprobar aislamiento y bloqueo de servidor en cuentas demo y adaptadores
  const securityCheck = await page.evaluate(async (pid) => {
    const integ = await (await fetch('/api/integrations')).json();
    const allDisabled = integ.adapters.every((a: { enabled: boolean }) => a.enabled === false);
    const postRes = await (await fetch(`/api/posts/${pid}`)).json();
    const targets = postRes.post.targets;
    const allTargetsSimulated = targets.every((t: { simulated: boolean }) => t.simulated === true);
    return { allDisabled, allTargetsSimulated, count: targets.length };
  }, post2Id);
  expect(securityCheck.allDisabled).toBe(true);
  expect(securityCheck.allTargetsSimulated).toBe(true);
  step(`Confirmado: 0 adaptadores externos activos, post_targets.simulated = true en todas las cuentas simuladas.`);

  // Dejar la sesión en Propietario para continuar
  await page.getByLabel('Actuando como').selectOption({ label: 'Responsable Koppara · Propietario' });

  console.log('\n==========================================');
  console.log('TODAS LAS VERIFICACIONES COMPLETADAS CON ÉXITO');
  console.log('==========================================\n');
} catch (err) {
  console.error('Error durante la verificación:', err);
  if (errors.length) console.error('Errores en navegador:', errors);
  process.exit(1);
} finally {
  await browser.close();
}
