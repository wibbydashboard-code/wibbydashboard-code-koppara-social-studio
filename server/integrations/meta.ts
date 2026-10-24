import { config } from '../config.ts';
import { canStoreSecrets, decrypt, encrypt } from '../security/crypto.ts';
import { accountsRepo } from '../repositories/accounts.ts';
import type { MetaCandidatePage } from '../security/pendingOAuth.ts';
import { IntegrationDisabledError, type AdapterStatus, type PublishRequest, type PublishResult, type SocialAdapter } from './types.ts';
import type { SocialAccount } from '../../shared/types.ts';

export type { MetaCandidatePage };

/**
 * Adaptador oficial de Meta (Facebook Pages e Instagram Business Content Publishing API).
 * Requiere aplicación aprobada en Meta for Developers y credenciales en .env.
 */
export class MetaAdapter implements SocialAdapter {
  constructor(public network: 'facebook' | 'instagram') {}

  status(): AdapterStatus {
    const configured = Boolean(config.metaAppId && config.metaAppSecret && canStoreSecrets());
    const accounts = accountsRepo.list().filter((a) => a.network === this.network && a.mode === 'real');
    const enabled = configured && accounts.length > 0;

    let reason = '';
    if (!config.metaAppId || !config.metaAppSecret) {
      reason = 'Faltan META_APP_ID y META_APP_SECRET en el archivo .env.';
    } else if (!canStoreSecrets()) {
      reason = 'Falta APP_ENCRYPTION_KEY en .env para almacenar credenciales OAuth cifradas con AES-256-GCM.';
    } else if (accounts.length === 0) {
      reason = 'Credenciales de Meta configuradas en .env. Pendiente de conectar la cuenta oficial.';
    } else {
      reason = 'Cuenta conectada y lista para publicar.';
    }

    return {
      network: this.network,
      enabled,
      implemented: true,
      configured,
      reason,
      requiredEnv: ['META_APP_ID', 'META_APP_SECRET', 'APP_ENCRYPTION_KEY'],
      docsUrl:
        this.network === 'facebook'
          ? 'https://developers.facebook.com/docs/pages-api/posts'
          : 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
    };
  }

  async getAuthorizationUrl(state: string): Promise<string> {
    if (!config.metaAppId) {
      throw new Error('META_APP_ID no está configurada en las variables de entorno.');
    }
    const redirectUri = config.metaRedirectUri;
    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish',
    ].join(',');
    return `https://www.facebook.com/${config.metaGraphVersion}/dialog/oauth?client_id=${config.metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scopes)}&response_type=code`;
  }

  async fetchCandidatePages(code: string): Promise<MetaCandidatePage[]> {
    if (!canStoreSecrets()) {
      throw new Error(
        'No se pueden almacenar las credenciales de Meta porque falta la variable APP_ENCRYPTION_KEY en el entorno. No se guardará nada en texto plano.',
      );
    }
    if (!config.metaAppId || !config.metaAppSecret) {
      throw new Error('Faltan META_APP_ID o META_APP_SECRET en .env.');
    }

    const redirectUri = config.metaRedirectUri;
    const tokenUrl = `https://graph.facebook.com/${config.metaGraphVersion}/oauth/access_token?client_id=${config.metaAppId}&client_secret=${config.metaAppSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: { message: string } };
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(`Error de Meta al obtener token: ${tokenData.error?.message || 'Token no recibido'}`);
    }

    const longTokenUrl = `https://graph.facebook.com/${config.metaGraphVersion}/oauth/access_token?grant_type=fb_exchange_token&client_id=${config.metaAppId}&client_secret=${config.metaAppSecret}&fb_exchange_token=${tokenData.access_token}`;
    const longRes = await fetch(longTokenUrl);
    const longData = (await longRes.json()) as { access_token?: string };
    const userToken = longData.access_token || tokenData.access_token;

    const pagesUrl = `https://graph.facebook.com/${config.metaGraphVersion}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${userToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = (await pagesRes.json()) as {
      data?: {
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username: string; name?: string };
      }[];
    };
    if (!pagesRes.ok || !pagesData.data?.length) {
      throw new Error('No se encontraron páginas de Facebook administradas por este usuario.');
    }

    return pagesData.data.map((p) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
      instagram: p.instagram_business_account
        ? {
            id: p.instagram_business_account.id,
            username: p.instagram_business_account.username,
            name: p.instagram_business_account.name,
          }
        : undefined,
    }));
  }

  createAccountFromPage(
    network: 'facebook' | 'instagram',
    page: MetaCandidatePage,
    brandId: string | null = null,
  ): SocialAccount {
    if (!canStoreSecrets()) {
      throw new Error(
        'No se pueden almacenar las credenciales de Meta porque falta la variable APP_ENCRYPTION_KEY en el entorno. No se guardará nada en texto plano.',
      );
    }

    if (network === 'facebook') {
      const account = accountsRepo.create({
        network: 'facebook',
        handle: page.name,
        displayName: page.name,
        accountType: 'Página oficial de Facebook',
        brandId,
        mode: 'real',
        isDemo: false,
      });
      accountsRepo.saveCredentials(account.id, encrypt(page.accessToken));
      return account;
    } else {
      const ig = page.instagram;
      if (!ig) {
        throw new Error(`La página "${page.name}" no tiene vinculada una cuenta profesional de Instagram.`);
      }
      const account = accountsRepo.create({
        network: 'instagram',
        handle: `@${ig.username}`,
        displayName: ig.name || ig.username,
        accountType: 'Instagram Business oficial',
        brandId,
        mode: 'real',
        isDemo: false,
      });
      accountsRepo.saveCredentials(account.id, encrypt(page.accessToken));
      return account;
    }
  }

  async completeAuthorization(code: string, _state: string): Promise<SocialAccount> {
    const pages = await this.fetchCandidatePages(code);
    return this.createAccountFromPage(this.network, pages[0]);
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    if (!this.status().enabled) {
      throw new IntegrationDisabledError(this.network);
    }
    const creds = accountsRepo.getCredentials(req.account.id);
    if (!creds) {
      return { ok: false, error: 'Credenciales de Meta no encontradas para esta cuenta. Vuelve a conectarla.', retryable: false };
    }
    let accessToken: string;
    try {
      accessToken = decrypt(creds.ciphertext);
    } catch {
      return { ok: false, error: 'No se pudieron descifrar las credenciales de Meta.', retryable: false };
    }

    try {
      if (req.account.network === 'facebook') {
        if (req.media.length > 0) {
          const photoUrl = `https://graph.facebook.com/${config.metaGraphVersion}/${req.account.handle}/photos`;
          const res = await fetch(photoUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: `${config.appUrl}${req.media[0].url}`,
              caption: req.text,
              access_token: accessToken,
            }),
          });
          const data = (await res.json()) as { id?: string; post_id?: string; error?: { message: string; is_transient?: boolean } };
          if (!res.ok) return { ok: false, error: data.error?.message || 'Error al publicar foto en Facebook', retryable: Boolean(data.error?.is_transient) };
          return { ok: true, externalId: (data.id || data.post_id)! };
        } else {
          const feedUrl = `https://graph.facebook.com/${config.metaGraphVersion}/${req.account.handle}/feed`;
          const res = await fetch(feedUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: req.text,
              access_token: accessToken,
            }),
          });
          const data = (await res.json()) as { id?: string; error?: { message: string; is_transient?: boolean } };
          if (!res.ok) return { ok: false, error: data.error?.message || 'Error al publicar en Facebook', retryable: Boolean(data.error?.is_transient) };
          return { ok: true, externalId: data.id! };
        }
      } else {
        if (req.media.length === 0) {
          return { ok: false, error: 'Instagram exige al menos una imagen o video para publicar.', retryable: false };
        }
        const containerUrl = `https://graph.facebook.com/${config.metaGraphVersion}/${req.account.handle.replace('@', '')}/media`;
        const containerRes = await fetch(containerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: `${config.appUrl}${req.media[0].url}`,
            caption: req.text,
            access_token: accessToken,
          }),
        });
        const containerData = (await containerRes.json()) as { id?: string; error?: { message: string; is_transient?: boolean } };
        if (!containerRes.ok || !containerData.id) {
          return { ok: false, error: containerData.error?.message || 'Error al crear contenedor en Instagram', retryable: Boolean(containerData.error?.is_transient) };
        }

        const publishUrl = `https://graph.facebook.com/${config.metaGraphVersion}/${req.account.handle.replace('@', '')}/media_publish`;
        const publishRes = await fetch(publishUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: containerData.id,
            access_token: accessToken,
          }),
        });
        const publishData = (await publishRes.json()) as { id?: string; error?: { message: string; is_transient?: boolean } };
        if (!publishRes.ok || !publishData.id) {
          return { ok: false, error: publishData.error?.message || 'Error al publicar contenedor en Instagram', retryable: Boolean(publishData.error?.is_transient) };
        }
        return { ok: true, externalId: publishData.id };
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido al comunicar con Meta', retryable: true };
    }
  }
}
