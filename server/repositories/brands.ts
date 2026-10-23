import { db, json, newId, now } from '../db/database.ts';
import type { Brand, BrandStatus } from '../../shared/types.ts';

type BrandData = Omit<Brand, 'id' | 'status' | 'name' | 'isDemo' | 'createdAt' | 'updatedAt'>;

export function emptyBrandData(): BrandData {
  return {
    website: '',
    description: '',
    audience: '',
    bestCustomer: '',
    unwantedAudience: '',
    tone: '',
    personality: '',
    language: 'Español',
    alwaysRules: [],
    neverRules: [],
    bannedWords: [],
    pillars: [],
    knowledge: '',
    kit: { logoMediaId: null, primaryColor: '#1F4D3A', palette: [], fonts: [], referenceMediaIds: [] },
    pendingFields: [],
  };
}

function toBrand(r: Record<string, unknown>): Brand {
  const data = { ...emptyBrandData(), ...json.parse<Partial<BrandData>>(r.data, {}) };
  return {
    ...data,
    id: String(r.id),
    status: r.status as BrandStatus,
    name: String(r.name),
    isDemo: Boolean(r.is_demo),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function splitData(b: Partial<Brand>): BrandData {
  const base = emptyBrandData();
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(base) as (keyof BrandData)[]) out[k] = b[k] ?? base[k];
  return out as unknown as BrandData;
}

export const brandsRepo = {
  list(includeArchived = false): Brand[] {
    const rows = db
      .prepare(`SELECT * FROM brands ${includeArchived ? '' : "WHERE status != 'archived'"} ORDER BY is_demo, name COLLATE NOCASE`)
      .all();
    return rows.map((r) => toBrand(r as Record<string, unknown>));
  },
  get(id: string): Brand | null {
    const r = db.prepare('SELECT * FROM brands WHERE id = ?').get(id);
    return r ? toBrand(r as Record<string, unknown>) : null;
  },
  create(b: Partial<Brand> & { name: string }, status: BrandStatus, isDemo = false): Brand {
    const id = newId();
    const t = now();
    db.prepare('INSERT INTO brands (id, status, name, data, is_demo, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(
      id, status, b.name.trim(), JSON.stringify(splitData(b)), isDemo ? 1 : 0, t, t,
    );
    return this.get(id)!;
  },
  update(id: string, b: Partial<Brand>, status: BrandStatus): Brand {
    const cur = this.get(id);
    if (!cur) throw new Error('not_found');
    const merged = { ...cur, ...b };
    db.prepare('UPDATE brands SET status = ?, name = ?, data = ?, updated_at = ? WHERE id = ?').run(
      status, (merged.name ?? '').trim(), JSON.stringify(splitData(merged)), now(), id,
    );
    return this.get(id)!;
  },
  setStatus(id: string, status: BrandStatus) {
    db.prepare('UPDATE brands SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  },
};
