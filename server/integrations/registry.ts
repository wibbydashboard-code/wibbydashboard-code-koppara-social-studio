import type { Network } from '../../shared/types.ts';
import { NETWORKS } from '../../shared/platforms.ts';
import type { AdapterStatus, PublishRequest, PublishResult, SocialAdapter } from './types.ts';

/** Documentación oficial de referencia para implementar cada adaptador. */
const SPEC: Record<Network, { env: string[]; docs: string }> = {
  instagram: { env: ['META_APP_ID', 'META_APP_SECRET'], docs: 'https://developers.facebook.com/docs/instagram-platform/content-publishing' },
  facebook: { env: ['META_APP_ID', 'META_APP_SECRET'], docs: 'https://developers.facebook.com/docs/pages-api/posts' },
  tiktok: { env: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'], docs: 'https://developers.tiktok.com/doc/content-posting-api-get-started' },
  youtube: { env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], docs: 'https://developers.google.com/youtube/v3/guides/uploading_a_video' },
  x: { env: ['X_CLIENT_ID', 'X_CLIENT_SECRET'], docs: 'https://docs.x.com/x-api/posts/creation-of-a-post' },
  threads: { env: ['META_APP_ID', 'META_APP_SECRET'], docs: 'https://developers.facebook.com/docs/threads/posts' },
  linkedin: { env: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'], docs: 'https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api' },
};

class NotImplementedAdapter implements SocialAdapter {
  constructor(public network: Network) {}
  status(): AdapterStatus {
    const spec = SPEC[this.network];
    const configured = spec.env.every((k) => Boolean(process.env[k]));
    return {
      network: this.network,
      enabled: false,
      implemented: false,
      configured,
      reason: 'Integración no implementada. Requiere app aprobada por la plataforma y autorización explícita de Koppara.',
      requiredEnv: spec.env,
      docsUrl: spec.docs,
    };
  }
  async getAuthorizationUrl(): Promise<string> {
    throw new IntegrationDisabledError(this.network);
  }
  async completeAuthorization(): Promise<never> {
    throw new IntegrationDisabledError(this.network);
  }
  async publish(): Promise<PublishResult> {
    throw new IntegrationDisabledError(this.network);
  }
}

export class IntegrationDisabledError extends Error {
  constructor(public network: Network) {
    super(`La integración con ${network} está desactivada.`);
  }
}

const adapters = new Map<Network, SocialAdapter>(NETWORKS.map((n) => [n, new NotImplementedAdapter(n)]));

export function getAdapter(network: Network): SocialAdapter {
  return adapters.get(network)!;
}

export function integrationStatuses(): AdapterStatus[] {
  return NETWORKS.map((n) => getAdapter(n).status());
}

/**
 * Publica en una cuenta real. Sólo se invoca si el adaptador está habilitado;
 * las cuentas de demostración nunca pasan por aquí.
 */
export async function publishReal(req: PublishRequest): Promise<PublishResult> {
  const adapter = getAdapter(req.account.network);
  if (!adapter.status().enabled) throw new IntegrationDisabledError(req.account.network);
  return adapter.publish(req);
}
