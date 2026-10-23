import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config.ts';

/**
 * Cifrado AES-256-GCM para credenciales de integraciones (tokens OAuth).
 * La clave proviene de APP_ENCRYPTION_KEY (32 bytes en base64). Sin clave, guardar
 * credenciales está deshabilitado: nunca se almacenan en texto plano.
 */
function key(): Buffer {
  if (!config.encryptionKey) throw new Error('APP_ENCRYPTION_KEY no está configurada; no se pueden guardar credenciales.');
  const k = Buffer.from(config.encryptionKey, 'base64');
  if (k.length !== 32) throw new Error('APP_ENCRYPTION_KEY debe decodificar a 32 bytes.');
  return k;
}

export function canStoreSecrets(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function decrypt(token: string): string {
  const [v, iv, tag, body] = token.split('.');
  if (v !== 'v1') throw new Error('Formato de credencial desconocido.');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8');
}
