import { db, newId, now } from '../db/database.ts';
import type { Network, SocialAccount } from '../../shared/types.ts';

function toAccount(r: Record<string, unknown>): SocialAccount {
  return {
    id: String(r.id),
    network: r.network as Network,
    handle: String(r.handle),
    displayName: String(r.display_name),
    accountType: String(r.account_type),
    brandId: (r.brand_id as string) ?? null,
    mode: r.mode as SocialAccount['mode'],
    isDemo: Boolean(r.is_demo),
    createdAt: String(r.created_at),
  };
}

export const accountsRepo = {
  list(): SocialAccount[] {
    return db.prepare('SELECT * FROM accounts ORDER BY network, handle').all().map((r) => toAccount(r as Record<string, unknown>));
  },
  get(id: string): SocialAccount | null {
    const r = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    return r ? toAccount(r as Record<string, unknown>) : null;
  },
  create(a: Omit<SocialAccount, 'id' | 'createdAt'>): SocialAccount {
    const id = newId();
    db.prepare(
      'INSERT INTO accounts (id, network, handle, display_name, account_type, brand_id, mode, is_demo, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(id, a.network, a.handle, a.displayName, a.accountType, a.brandId, a.mode, a.isDemo ? 1 : 0, now());
    return this.get(id)!;
  },
  assignBrand(id: string, brandId: string | null) {
    db.prepare('UPDATE accounts SET brand_id = ? WHERE id = ?').run(brandId, id);
  },
  inUse(id: string): boolean {
    return Boolean(db.prepare('SELECT 1 FROM post_targets WHERE account_id = ? LIMIT 1').get(id));
  },
  remove(id: string) {
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  },
};
