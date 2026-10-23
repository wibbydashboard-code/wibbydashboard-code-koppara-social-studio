import fs from 'node:fs';
import path from 'node:path';

// Carga mínima de .env sin dependencias. Las variables ya definidas en el entorno tienen prioridad.
const envFile = path.resolve('.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export const config = {
  port: Number(process.env.PORT || 5173),
  production: process.env.NODE_ENV === 'production',
  databasePath: path.resolve(process.env.DATABASE_PATH || './data/koppara.db'),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './data/uploads'),
  maxUploadMB: 512,
  encryptionKey: process.env.APP_ENCRYPTION_KEY || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-opus-5-5',
};
