import { db, json, newId, now } from '../db/database.ts';
import { accountsRepo } from './accounts.ts';
import type { Network, Post, PostEvent, PostStatus, PostTarget, TargetStatus, TikTokOptions } from '../../shared/types.ts';

function toTarget(r: Record<string, unknown>): PostTarget {
  return {
    id: String(r.id),
    accountId: String(r.account_id),
    network: r.network as Network,
    format: String(r.format),
    text: (r.text as string) ?? null,
    tiktok: json.parse<TikTokOptions | null>(r.tiktok, null),
    status: r.status as TargetStatus,
    error: (r.error as string) ?? null,
    attempts: Number(r.attempts),
    simulated: Boolean(r.simulated),
  };
}

function toPost(r: Record<string, unknown>, targets: PostTarget[]): Post {
  return {
    id: String(r.id),
    brandId: String(r.brand_id),
    internalTitle: String(r.internal_title),
    tags: json.parse<string[]>(r.tags, []),
    baseText: String(r.base_text),
    mediaIds: json.parse<string[]>(r.media_ids, []),
    status: r.status as PostStatus,
    plannedAt: (r.planned_at as string) ?? null,
    targets,
    createdBy: String(r.created_by),
    approvedBy: (r.approved_by as string) ?? null,
    simulated: Boolean(r.simulated),
    isDemo: Boolean(r.is_demo),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export type PostInput = Pick<Post, 'brandId' | 'internalTitle' | 'tags' | 'baseText' | 'mediaIds' | 'plannedAt'> & {
  targets: Pick<PostTarget, 'accountId' | 'network' | 'format' | 'text' | 'tiktok'>[];
};

function targetsFor(postId: string): PostTarget[] {
  return db
    .prepare('SELECT * FROM post_targets WHERE post_id = ? ORDER BY position')
    .all(postId)
    .map((r) => toTarget(r as Record<string, unknown>));
}

function writeTargets(postId: string, targets: PostInput['targets']) {
  db.prepare('DELETE FROM post_targets WHERE post_id = ?').run(postId);
  const ins = db.prepare(
    'INSERT INTO post_targets (id, post_id, account_id, network, format, text, tiktok, status, position, simulated) VALUES (?,?,?,?,?,?,?,?,?,?)',
  );
  targets.forEach((t, i) => {
    const acc = accountsRepo.get(t.accountId);
    const isSimulated = acc?.mode === 'demo' ? 1 : 0;
    ins.run(newId(), postId, t.accountId, t.network, t.format, t.text, t.tiktok ? JSON.stringify(t.tiktok) : null, 'pending', i, isSimulated);
  });
}

export const postsRepo = {
  list(): Post[] {
    const rows = db.prepare('SELECT * FROM posts ORDER BY updated_at DESC').all() as Record<string, unknown>[];
    return rows.map((r) => toPost(r, targetsFor(String(r.id))));
  },
  listDueScheduled(): Post[] {
    const rows = db
      .prepare("SELECT * FROM posts WHERE status = 'scheduled' AND planned_at IS NOT NULL AND planned_at <= ? ORDER BY planned_at ASC")
      .all(now()) as Record<string, unknown>[];
    return rows.map((r) => toPost(r, targetsFor(String(r.id))));
  },
  get(id: string): Post | null {
    const r = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? toPost(r, targetsFor(id)) : null;
  },
  create(input: PostInput, userId: string, isDemo = false): Post {
    const id = newId();
    const t = now();
    db.prepare(
      `INSERT INTO posts (id, brand_id, internal_title, tags, base_text, media_ids, status, planned_at, created_by, is_demo, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, input.brandId, input.internalTitle, JSON.stringify(input.tags), input.baseText, JSON.stringify(input.mediaIds),
      'draft', input.plannedAt, userId, isDemo ? 1 : 0, t, t);
    writeTargets(id, input.targets);
    return this.get(id)!;
  },
  update(id: string, input: PostInput) {
    db.prepare(
      'UPDATE posts SET brand_id=?, internal_title=?, tags=?, base_text=?, media_ids=?, planned_at=?, updated_at=? WHERE id=?',
    ).run(input.brandId, input.internalTitle, JSON.stringify(input.tags), input.baseText, JSON.stringify(input.mediaIds),
      input.plannedAt, now(), id);
    writeTargets(id, input.targets);
  },
  setStatus(id: string, status: PostStatus, extra: { approvedBy?: string | null; simulated?: boolean } = {}) {
    db.prepare(
      `UPDATE posts SET status = ?, updated_at = ?,
        approved_by = CASE WHEN ? THEN ? ELSE approved_by END,
        simulated = CASE WHEN ? THEN ? ELSE simulated END
       WHERE id = ?`,
    ).run(status, now(), extra.approvedBy !== undefined ? 1 : 0, extra.approvedBy ?? null,
      extra.simulated !== undefined ? 1 : 0, extra.simulated ? 1 : 0, id);
  },
  setTargetStatus(targetId: string, status: TargetStatus, error: string | null, simulated: boolean, bumpAttempt: boolean) {
    db.prepare('UPDATE post_targets SET status = ?, error = ?, simulated = ?, attempts = attempts + ? WHERE id = ?').run(
      status, error, simulated ? 1 : 0, bumpAttempt ? 1 : 0, targetId,
    );
  },
  setAllTargets(postId: string, status: TargetStatus) {
    db.prepare('UPDATE post_targets SET status = ?, error = NULL WHERE post_id = ?').run(status, postId);
  },
  /** Destinos y eventos se eliminan por ON DELETE CASCADE. */
  remove(id: string) {
    db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  },
  addEvent(postId: string, userId: string, action: string, note = '') {
    db.prepare('INSERT INTO post_events (id, post_id, user_id, action, note, at) VALUES (?,?,?,?,?,?)').run(
      newId(), postId, userId, action, note, now(),
    );
  },
  events(postId: string): PostEvent[] {
    return (
      db
        .prepare(
          `SELECT e.*, COALESCE(u.name, 'Usuario eliminado') AS user_name FROM post_events e
           LEFT JOIN users u ON u.id = e.user_id WHERE post_id = ? ORDER BY at DESC`,
        )
        .all(postId) as Record<string, unknown>[]
    ).map((r) => ({
      id: String(r.id),
      postId: String(r.post_id),
      userId: String(r.user_id),
      userName: String(r.user_name),
      action: String(r.action),
      note: String(r.note),
      at: String(r.at),
    }));
  },
};
