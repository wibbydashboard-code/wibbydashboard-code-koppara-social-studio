import { randomBytes } from 'node:crypto';

export interface OAuthStateEntry {
  state: string;
  userId: string;
  network: string;
  createdAt: number;
  expiresAt: number;
}

const states = new Map<string, OAuthStateEntry>();

export const oauthStateManager = {
  create(userId: string, network: string, ttlMs = 10 * 60 * 1000): string {
    const now = Date.now();
    // Limpieza de estados expirados
    for (const [k, v] of states.entries()) {
      if (now > v.expiresAt) states.delete(k);
    }
    const state = randomBytes(24).toString('hex');
    states.set(state, {
      state,
      userId,
      network,
      createdAt: now,
      expiresAt: now + ttlMs,
    });
    return state;
  },

  verifyAndConsume(state: string): { valid: boolean; entry?: OAuthStateEntry; reason?: string } {
    if (!state || typeof state !== 'string') {
      return { valid: false, reason: 'Parámetro state ausente o inválido.' };
    }
    const entry = states.get(state);
    if (!entry) {
      return { valid: false, reason: 'Parámetro state no coincide o ya fue utilizado.' };
    }
    // Consumir inmediatamente para evitar ataques de repetición (one-time use)
    states.delete(state);
    if (Date.now() > entry.expiresAt) {
      return { valid: false, reason: 'El state de autorización ha caducado (límite de 10 minutos superado).' };
    }
    return { valid: true, entry };
  },

  _clear() {
    states.clear();
  },
};
