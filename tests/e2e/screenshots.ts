/** Capturas de revisión visual. Uso: con la app en marcha, `npm run screenshots`. */
import { chromium } from './browser.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = 'docs/screenshots';
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;

const browser = await chromium();
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: name === 'mobile' ? 2 : 1, reducedMotion: 'reduce', locale: 'es-MX', timezoneId: 'America/Mexico_City' });
  const page = await ctx.newPage();
  const shot = async (file: string) => {
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    // Pantalla visible tal como se usa (barras fijas reales).
    await page.screenshot({ path: `${OUT}/${name}-${file}.png` });
    // Página completa: las barras fijas se vuelven estáticas para que no tapen el contenido en la imagen.
    const style = await page.addStyleTag({ content: '.sidebar,.topbar,.composer__side,.action-bar{position:static!important}.bottom-nav{position:static!important}.sidebar{height:auto!important}' });
    await page.screenshot({ path: `${OUT}/${name}-${file}-completa.png`, fullPage: true });
    await style.evaluate((el) => (el as Element).remove());
    console.log(`  ${name}-${file}(.png|-completa.png)`);
  };

  await page.goto(`${BASE}/`);
  await shot('inicio');
  await page.goto(`${BASE}/marcas`);
  await shot('marcas');
  await page.locator('a.card', { hasText: 'Koppara' }).first().click();
  await page.waitForURL(/\/marcas\/.+/);
  await shot('marca-koppara');

  await page.goto(`${BASE}/crear`);
  const brand = page.getByRole('combobox', { name: /^Marca/ });
  const demo = await brand.locator('option', { hasText: 'Marca de ejemplo' }).count();
  if (demo) await brand.selectOption({ label: 'Marca de ejemplo (demo)' });
  await page.getByLabel('Título interno').fill('Pregunta de la semana');
  await page.getByLabel('Texto base').fill('¿Cuál es tu momento favorito del día para cuidarte?\n\nCuéntanos en comentarios y comparte tu rutina.');
  const dests = page.locator('button.dest');
  if ((await dests.count()) > 0) await dests.first().click();
  const tiktok = page.locator('button.dest', { hasText: 'TikTok' });
  if (await tiktok.count()) await tiktok.first().click();
  await shot('crear');
  await ctx.close();
}
await browser.close();
