import { db, json, newId, now } from '../db/database.ts';
import type { MediaItem, MediaKind } from '../../shared/types.ts';

export interface StoredMedia extends MediaItem {
  storedName: string;
}

function toMedia(r: Record<string, unknown>): StoredMedia {
  return {
    id: String(r.id),
    brandId: (r.brand_id as string) ?? null,
    filename: String(r.filename),
    storedName: String(r.stored_name),
    mime: String(r.mime),
    kind: r.kind as MediaKind,
    size: Number(r.size),
    width: (r.width as number) ?? null,
    height: (r.height as number) ?? null,
    durationSec: (r.duration_sec as number) ?? null,
    url: `/uploads/${r.stored_name}`,
    tags: json.parse<string[]>(r.tags, []),
    isMockup: Boolean(r.is_mockup),
    isDemo: Boolean(r.is_demo),
    createdAt: String(r.created_at),
  };
}

export const mediaRepo = {
  list(): StoredMedia[] {
    return db.prepare('SELECT * FROM media ORDER BY created_at DESC').all().map((r) => toMedia(r as Record<string, unknown>));
  },
  get(id: string): StoredMedia | null {
    const r = db.prepare('SELECT * FROM media WHERE id = ?').get(id);
    return r ? toMedia(r as Record<string, unknown>) : null;
  },
  getMany(ids: string[]): StoredMedia[] {
    return ids.map((id) => this.get(id)).filter((m): m is StoredMedia => Boolean(m));
  },
  create(m: Omit<StoredMedia, 'id' | 'createdAt' | 'url'>): StoredMedia {
    const id = newId();
    db.prepare(
      `INSERT INTO media (id, brand_id, filename, stored_name, mime, kind, size, width, height, duration_sec, tags, is_mockup, is_demo, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, m.brandId, m.filename, m.storedName, m.mime, m.kind, m.size, m.width, m.height, m.durationSec,
      JSON.stringify(m.tags), m.isMockup ? 1 : 0, m.isDemo ? 1 : 0, now());
    return this.get(id)!;
  },
  remove(id: string) {
    db.prepare('DELETE FROM media WHERE id = ?').run(id);
  },
  usedBy(id: string): number {
    const rows = db.prepare("SELECT media_ids FROM posts WHERE status NOT IN ('cancelled')").all() as { media_ids: string }[];
    return rows.filter((r) => json.parse<string[]>(r.media_ids, []).includes(id)).length;
  },
};
