import type { MediaItem, Network, Post, PostTarget, SocialAccount } from '../../shared/types.ts';

export interface PublishRequest {
  account: SocialAccount;
  post: Post;
  target: PostTarget;
  /** Texto final del destino (sin título interno ni etiquetas). */
  text: string;
  media: MediaItem[];
}

export type PublishResult = { ok: true; externalId: string } | { ok: false; error: string; retryable: boolean };

/**
 * Contrato que cada integración real (OAuth + API oficial) debe implementar.
 * Ningún adaptador real está activo en el MVP.
 */
export interface SocialAdapter {
  network: Network;
  /** Activo sólo si está implementado, configurado y autorizado explícitamente. */
  status(): AdapterStatus;
  /** URL de autorización OAuth (flujo de servidor, con state y PKCE cuando aplique). */
  getAuthorizationUrl(state: string): Promise<string>;
  /** Intercambia el código por tokens y devuelve la cuenta; los tokens se guardan cifrados. */
  completeAuthorization(code: string, state: string): Promise<SocialAccount>;
  publish(req: PublishRequest): Promise<PublishResult>;
}

export interface AdapterStatus {
  network: Network;
  enabled: boolean;
  implemented: boolean;
  configured: boolean;
  reason: string;
  requiredEnv: string[];
  docsUrl: string;
}
