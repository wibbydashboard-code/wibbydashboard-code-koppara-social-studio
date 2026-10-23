import fs from 'node:fs';
import { chromium as pw } from '@playwright/test';

/** Chromium preinstalado (o CHROMIUM_PATH). No descarga navegadores. */
export async function chromium() {
  const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean) as string[];
  const executablePath = candidates.find((p) => fs.existsSync(p));
  return pw.launch({ executablePath, headless: true });
}

export { expect } from '@playwright/test';
