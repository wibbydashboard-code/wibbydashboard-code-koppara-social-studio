import { db, newId, now } from '../db/database.ts';
import type { CreditEntry, Role, User, WorkspaceSettings } from '../../shared/types.ts';

const DEFAULT_SETTINGS: WorkspaceSettings = {
  name: 'Koppara',
  timezone: 'America/Mexico_City',
  planName: 'Interno (sin facturación)',
  monthlyCredits: 200,
  requireDifferentApprover: true,
};

export const settingsRepo = {
  get(): WorkspaceSettings {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) s[r.key] = JSON.parse(r.value);
    return s as unknown as WorkspaceSettings;
  },
  set(patch: Partial<WorkspaceSettings>) {
    const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [k, v] of Object.entries(patch)) if (k in DEFAULT_SETTINGS && v !== undefined) up.run(k, JSON.stringify(v));
  },
};

function toUser(r: Record<string, unknown>): User {
  return { id: String(r.id), name: String(r.name), email: String(r.email), role: r.role as Role, isDemo: Boolean(r.is_demo) };
}

export const usersRepo = {
  list(): User[] {
    return db
      .prepare("SELECT * FROM users ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'publisher' THEN 2 WHEN 'editor' THEN 3 ELSE 4 END, name")
      .all()
      .map((r) => toUser(r as Record<string, unknown>));
  },
  get(id: string): User | null {
    const r = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return r ? toUser(r as Record<string, unknown>) : null;
  },
  create(u: Omit<User, 'id'>): User {
    const id = newId();
    db.prepare('INSERT INTO users (id, name, email, role, is_demo, created_at) VALUES (?,?,?,?,?,?)').run(
      id, u.name, u.email.toLowerCase(), u.role, u.isDemo ? 1 : 0, now(),
    );
    return this.get(id)!;
  },
  setRole(id: string, role: Role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  },
  countRole(role: Role): number {
    return Number((db.prepare('SELECT COUNT(*) c FROM users WHERE role = ?').get(role) as { c: number }).c);
  },
};

function toEntry(r: Record<string, unknown>): CreditEntry {
  return {
    id: String(r.id),
    at: String(r.at),
    userId: String(r.user_id),
    kind: r.kind as CreditEntry['kind'],
    provider: String(r.provider),
    credits: Number(r.credits),
    description: String(r.description),
    balanceAfter: Number(r.balance_after),
  };
}

export const creditsRepo = {
  balance(): number {
    const r = db.prepare('SELECT balance_after FROM credit_ledger ORDER BY at DESC, rowid DESC LIMIT 1').get() as
      | { balance_after: number }
      | undefined;
    return r?.balance_after ?? 0;
  },
  list(limit = 100): CreditEntry[] {
    return db
      .prepare('SELECT * FROM credit_ledger ORDER BY at DESC, rowid DESC LIMIT ?')
      .all(limit)
      .map((r) => toEntry(r as Record<string, unknown>));
  },
  /** credits > 0 abona, < 0 consume. */
  record(e: Omit<CreditEntry, 'id' | 'at' | 'balanceAfter'>): CreditEntry {
    const balanceAfter = this.balance() + e.credits;
    const id = newId();
    db.prepare(
      'INSERT INTO credit_ledger (id, at, user_id, kind, provider, credits, description, balance_after) VALUES (?,?,?,?,?,?,?,?)',
    ).run(id, now(), e.userId, e.kind, e.provider, e.credits, e.description, balanceAfter);
    return toEntry(db.prepare('SELECT * FROM credit_ledger WHERE id = ?').get(id) as Record<string, unknown>);
  },
};
