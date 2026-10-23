import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.ts';

const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );

  CREATE TABLE brands (
    id TEXT PRIMARY KEY, status TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );

  CREATE TABLE accounts (
    id TEXT PRIMARY KEY, network TEXT NOT NULL, handle TEXT NOT NULL, display_name TEXT NOT NULL,
    account_type TEXT NOT NULL, brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
    mode TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );

  -- Credenciales OAuth: sólo texto cifrado (AES-256-GCM). Vacía hasta que exista una integración real.
  CREATE TABLE account_credentials (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    ciphertext TEXT NOT NULL, expires_at TEXT, updated_at TEXT NOT NULL
  );

  CREATE TABLE media (
    id TEXT PRIMARY KEY, brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
    filename TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT NOT NULL, kind TEXT NOT NULL,
    size INTEGER NOT NULL, width INTEGER, height INTEGER, duration_sec REAL,
    tags TEXT NOT NULL DEFAULT '[]', is_mockup INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );

  CREATE TABLE posts (
    id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id),
    internal_title TEXT NOT NULL, tags TEXT NOT NULL, base_text TEXT NOT NULL, media_ids TEXT NOT NULL,
    status TEXT NOT NULL, planned_at TEXT, created_by TEXT NOT NULL, approved_by TEXT,
    simulated INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX posts_status ON posts(status);
  CREATE INDEX posts_planned ON posts(planned_at);

  CREATE TABLE post_targets (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id), network TEXT NOT NULL, format TEXT NOT NULL,
    text TEXT, tiktok TEXT, status TEXT NOT NULL, error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
    simulated INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL
  );

  CREATE TABLE post_events (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, action TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', at TEXT NOT NULL
  );

  CREATE TABLE credit_ledger (
    id TEXT PRIMARY KEY, at TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL,
    provider TEXT NOT NULL, credits REAL NOT NULL, description TEXT NOT NULL, balance_after REAL NOT NULL
  );
  `,
];

function open(): DatabaseSync {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const db = new DatabaseSync(config.databasePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[version]);
    version += 1;
    db.prepare('UPDATE schema_version SET version = ?').run(version);
    db.exec('COMMIT');
  }
  return db;
}

export const db = open();

export const newId = () => randomUUID();
export const now = () => new Date().toISOString();

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const json = {
  parse<T>(s: unknown, fallback: T): T {
    if (typeof s !== 'string') return fallback;
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  },
};
