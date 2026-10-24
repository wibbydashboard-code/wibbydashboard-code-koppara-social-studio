import { randomBytes } from 'node:crypto';

export interface MetaCandidatePage {
  id: string;
  name: string;
  accessToken: string;
  instagram?: {
    id: string;
    username: string;
    name?: string;
  };
}

export interface PendingOAuthSession {
  sessionId: string;
  userId: string;
  network: 'facebook' | 'instagram';
  pages: MetaCandidatePage[];
  expiresAt: number;
}

const pendingSessions = new Map<string, PendingOAuthSession>();

export const pendingOAuthManager = {
  create(userId: string, network: 'facebook' | 'instagram', pages: MetaCandidatePage[], ttlMs = 10 * 60 * 1000): string {
    const sessionId = randomBytes(24).toString('hex');
    pendingSessions.set(sessionId, {
      sessionId,
      userId,
      network,
      pages,
      expiresAt: Date.now() + ttlMs,
    });
    return sessionId;
  },

  get(sessionId: string): PendingOAuthSession | undefined {
    if (!sessionId) return undefined;
    const s = pendingSessions.get(sessionId);
    if (!s || Date.now() > s.expiresAt) {
      if (s) pendingSessions.delete(sessionId);
      return undefined;
    }
    return s;
  },

  consume(sessionId: string): PendingOAuthSession | undefined {
    const s = this.get(sessionId);
    if (s) pendingSessions.delete(sessionId);
    return s;
  },

  _clear() {
    pendingSessions.clear();
  },
};
