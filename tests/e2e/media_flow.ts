import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium, expect } from './browser.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';

// Función para generar PNG válido en memoria
function createPng(width: number, height: number): Buffer {
  const lineSize = 1 + width * 3;
  const raw = Buffer.alloc(lineSize * height);
  // Color verde Koppara: R=31, G=77, B=58
  for (let y = 0; y < height; y++) {
    const rowOffset = y * lineSize;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 3;
      raw[pxOffset] = 31;
      raw[pxOffset + 1] = 77;
      raw[pxOffset + 2] = 58;
    }
  }
  const idatData = zlib.deflateSync(raw);

  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const full = Buffer.concat([typeBuf, data]);
    let c = 0xffffffff;
    for (let i = 0; i < full.length; i++) {
      c ^= full[i];
      for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (-(c & 1) & 0xedb88320);
    }
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))]);
}

const tempDir = path.resolve('data/temp_test');
fs.mkdirSync(tempDir, { recursive: true });

const validPngPath = path.join(tempDir, 'koppara_cuadrada_1080.png');
fs.writeFileSync(validPngPath, createPng(1080, 1080));

const fakeImagePath = path.join(tempDir, 'falso_archivo.png');
fs.writeFileSync(fakeImagePath, Buffer.from('Esto no es una imagen real, es texto plano.'));

const browser = await chromium();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

const step = (msg: string) => console.log(`[PASS] ${msg}`);

try {
  // 1. Ir a la biblioteca de Media
  await page.goto(`${BASE}/media`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Media');
  step('Página de Media cargada correctamente');

  // 2. Probar rechazo de archivo inválido (falsificación de tipo sniffMime)
  const fileChooserPromiseFake = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Elegir archivos' }).click();
  const fileChooserFake = await fileChooserPromiseFake;
  await fileChooserFake.setFiles(fakeImagePath);

  await expect(page.getByText('Formato no admitido. Usa JPG, PNG, WebP, MP4, MOV o WebM.')).toBeVisible();
  step('Validación de tipo real confirmada: el servidor rechaza archivos que no sean imágenes o videos auténticos');

  // 3. Subir archivo válido (PNG 1080x1080)
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Elegir archivos' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(validPngPath);

  await expect(page.getByText('koppara_cuadrada_1080.png')).toBeVisible();
  await expect(page.getByText('1080×1080')).toBeVisible();
  step('Archivo válido subido con éxito, visualizado con dimensiones 1080×1080 y tamaño real');

  // Verificar que la miniatura carga correctamente la imagen
  const imgElement = page.locator('article.media-card img[alt="koppara_cuadrada_1080.png"]');
  await expect(imgElement).toBeVisible();
  const naturalWidth = await imgElement.evaluate((el: HTMLImageElement) => el.naturalWidth);
  expect(naturalWidth).toBe(1080);
  step('Vista previa de la imagen renderizada y verificada en el navegador');

  // 4. Asociación con publicación y validación de formatos (Instagram feed vs reel)
  await page.goto(`${BASE}/crear`);
  await page.getByLabel('Título interno').fill('Publicación con foto para Instagram');
  await page.getByLabel('Texto base').fill('Compartiendo un momento de calma y desconexión en nuestro espacio.');

  // Seleccionar Instagram
  const igDest = page.locator('button.dest', { hasText: 'koppara.bienestar' });
  await igDest.click();
  await expect(igDest).toHaveAttribute('aria-pressed', 'true');

  // Inicialmente Instagram Feed exige medios -> debe mostrar aviso de error
  await expect(page.getByText('Feed requiere al menos 1 archivo')).toBeVisible();
  step('Validación de formato visible: Instagram Feed exige al menos un medio antes de adjuntar');

  // Abrir MediaPicker y seleccionar la imagen subida
  await page.getByRole('button', { name: 'Añadir medios' }).click();
  const mediaModal = page.getByRole('dialog');
  await expect(mediaModal).toBeVisible();

  const selectableThumb = mediaModal.locator('.media-card', { hasText: 'koppara_cuadrada_1080.png' });
  await selectableThumb.click();
  await mediaModal.getByRole('button', { name: 'Usar selección' }).click();
  await expect(mediaModal).toBeHidden();

  // Ahora Instagram Feed ya no tiene error porque la imagen cumple dimensiones y requisitos
  await expect(page.getByText('Feed requiere al menos 1 archivo')).toHaveCount(0);
  step('Medio asociado a la publicación: la advertencia de Instagram Feed se resuelve');

  // Comprobar validación de formato: cambiar a Reel (Reel no admite fotos estáticas)
  await page.getByRole('button', { name: 'Reel', exact: true }).click();
  await expect(page.getByText(/Reel no admite imágenes/)).toBeVisible();
  step('Validación de incompatibilidad confirmada: Reel advierte que no admite imágenes fijas');

  // Regresar a Feed y guardar borrador
  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.getByText(/Reel no admite imágenes/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page).toHaveURL(/\/publicaciones\/[0-9a-f-]{36}\/editar$/);
  const postId = page.url().split('/')[4];
  step(`Publicación con medio guardada como borrador (${postId})`);

  // 5. Verificar protección de eliminación en Media
  await page.goto(`${BASE}/media`);
  const mediaCard = page.locator('article.media-card', { hasText: 'koppara_cuadrada_1080.png' });
  await mediaCard.getByRole('button', { name: 'Eliminar' }).click();

  const confirmDlg = page.getByRole('dialog');
  await confirmDlg.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText(/Se usa en 1 publicación\. Quítalo de ahí primero/)).toBeVisible();
  step('Seguridad de eliminación confirmada: el servidor y la interfaz impiden borrar medios en uso');

  // Desvincular de la publicación
  await page.goto(`${BASE}/publicaciones/${postId}/editar`);
  await page.getByRole('button', { name: /Quitar koppara_cuadrada_1080\.png/ }).click();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  step('Medio desvinculado de la publicación');

  // Eliminar la publicación de prueba
  await page.goto(`${BASE}/publicaciones/${postId}`);
  await page.getByRole('button', { name: 'Eliminar' }).click();
  const deletePostDlg = page.getByRole('dialog');
  await deletePostDlg.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page).toHaveURL(`${BASE}/publicaciones`);
  step('Publicación de prueba eliminada');

  // Ahora en Media, eliminar el archivo sin bloqueos
  await page.goto(`${BASE}/media`);
  const mediaCardNow = page.locator('article.media-card', { hasText: 'koppara_cuadrada_1080.png' });
  await mediaCardNow.getByRole('button', { name: 'Eliminar' }).click();
  const confirmDeleteDlg = page.getByRole('dialog');
  await confirmDeleteDlg.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Archivo eliminado.')).toBeVisible();
  await expect(page.getByText('koppara_cuadrada_1080.png')).toHaveCount(0);
  step('Archivo eliminado de forma segura una vez liberado de publicaciones');

  console.log('\n==========================================');
  console.log('TODAS LAS PRUEBAS DE MEDIA COMPLETADAS CON ÉXITO');
  console.log('==========================================\n');
} catch (err) {
  console.error('Error durante la verificación de Media:', err);
  if (errors.length) console.error('Errores en navegador:', errors);
  process.exit(1);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
  await browser.close();
}
