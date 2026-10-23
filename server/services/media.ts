import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { imageSize } from 'image-size';
import { config } from '../config.ts';
import { mediaRepo, type StoredMedia } from '../repositories/media.ts';
import { brandsRepo } from '../repositories/brands.ts';
import { can } from '../../shared/workflow.ts';
import { conflict, forbidden, invalid, notFound } from '../http/errors.ts';
import type { User } from '../../shared/types.ts';

fs.mkdirSync(config.uploadDir, { recursive: true });

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};

/** Identifica el tipo real por los primeros bytes; no se confía en la extensión ni en el MIME del navegador. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp') return buf.toString('ascii', 8, 10) === 'qt' ? 'video/quicktime' : 'video/mp4';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  return null;
}

export interface UploadMeta {
  brandId?: string | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  isMockup?: boolean;
  tags?: string[];
}

export const mediaService = {
  save(user: User, file: { originalname: string; buffer: Buffer }, meta: UploadMeta): StoredMedia {
    if (!can(user.role, 'media.edit')) throw forbidden();
    const mime = sniffMime(file.buffer);
    if (!mime) throw invalid('Formato no admitido. Usa JPG, PNG, WebP, MP4, MOV o WebM.');
    const kind = mime.startsWith('image/') ? 'image' : 'video';
    let width = meta.width ?? null;
    let height = meta.height ?? null;
    if (kind === 'image') {
      try {
        const d = imageSize(file.buffer);
        width = d.width ?? null;
        height = d.height ?? null;
      } catch {
        throw invalid('No se pudo leer la imagen; el archivo puede estar dañado.');
      }
    }
    const brandId = meta.brandId && brandsRepo.get(meta.brandId) ? meta.brandId : null;
    const storedName = `${randomUUID()}.${EXT[mime]}`;
    fs.writeFileSync(path.join(config.uploadDir, storedName), file.buffer);
    const name = path.basename(file.originalname).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || storedName;
    return mediaRepo.create({
      brandId, filename: name, storedName, mime, kind, size: file.buffer.length,
      width, height, durationSec: kind === 'video' && meta.durationSec ? Number(meta.durationSec) : null,
      tags: (meta.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10),
      isMockup: Boolean(meta.isMockup), isDemo: false,
    });
  },
  remove(user: User, id: string) {
    if (!can(user.role, 'media.edit')) throw forbidden();
    const m = mediaRepo.get(id);
    if (!m) throw notFound('El archivo');
    const uses = mediaRepo.usedBy(id);
    if (uses) throw conflict(`Se usa en ${uses} publicación${uses > 1 ? 'es' : ''}. Quítalo de ahí primero.`);
    mediaRepo.remove(id);
    fs.rmSync(path.join(config.uploadDir, m.storedName), { force: true });
  },
};
