import { describe, expect, it } from 'vitest';
import { checkCompliance } from '../../shared/compliance.ts';
import { effectiveText, emptyTikTokOptions, hasErrors, validateBrand, validateTarget, validateTikTok, youtubeParts } from '../../shared/validation.ts';
import { allowedActions, can, TRANSITIONS } from '../../shared/workflow.ts';
import { NETWORKS } from '../../shared/platforms.ts';
import { getAdapter, publishReal, IntegrationDisabledError } from '../../server/integrations/registry.ts';
import { oauthStateManager } from '../../server/security/oauthState.ts';
import { MetaAdapter } from '../../server/integrations/meta.ts';
import { canStoreSecrets } from '../../server/security/crypto.ts';
import type { MediaItem } from '../../shared/types.ts';

const img = (w: number, h: number, extra: Partial<MediaItem> = {}): MediaItem => ({
  id: 'm', brandId: null, filename: 'a.jpg', mime: 'image/jpeg', kind: 'image', size: 1000, width: w, height: h,
  durationSec: null, url: '', tags: [], isMockup: false, isDemo: false, createdAt: '', ...extra,
});

describe('texto efectivo', () => {
  it('usa el texto base salvo variante y nunca incluye título interno', () => {
    expect(effectiveText({ baseText: 'hola' }, { text: null })).toBe('hola');
    expect(effectiveText({ baseText: 'hola' }, { text: 'propio' })).toBe('propio');
  });
  it('YouTube: primera línea es título y se conserva el texto completo', () => {
    const r = youtubeParts('Mi título\nDescripción larga');
    expect(r.title).toBe('Mi título');
    expect(r.description).toBe('Mi título\nDescripción larga');
  });
});

describe('TikTok', () => {
  it('sin opciones elegidas no es válido', () => {
    const issues = validateTikTok(emptyTikTokOptions());
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(['tiktok_privacy', 'tiktok_disclosure']));
  });
  it('contenido de marca no puede ser privado', () => {
    const o = { ...emptyTikTokOptions(), privacy: 'SELF_ONLY' as const, commercialDisclosure: true, brandedContent: true };
    expect(validateTikTok(o).some((i) => i.code === 'tiktok_branded_private')).toBe(true);
  });
  it('válido cuando la persona eligió todo', () => {
    const o = { ...emptyTikTokOptions(), privacy: 'PUBLIC_TO_EVERYONE' as const, commercialDisclosure: false };
    expect(validateTikTok(o)).toEqual([]);
  });
});

describe('validación por red', () => {
  it('X limita a 280 caracteres', () => {
    const issues = validateTarget({ baseText: 'a'.repeat(281) }, { network: 'x', format: 'post', text: null, tiktok: null }, []);
    expect(issues.some((i) => i.code === 'text_len')).toBe(true);
  });
  it('Instagram feed exige medios y proporción válida', () => {
    const t = { network: 'instagram' as const, format: 'feed', text: null, tiktok: null };
    expect(validateTarget({ baseText: 'hola' }, t, []).some((i) => i.code === 'media_min')).toBe(true);
    expect(validateTarget({ baseText: 'hola' }, t, [img(1080, 1920)]).some((i) => i.code === 'media_aspect')).toBe(true);
    expect(hasErrors(validateTarget({ baseText: 'hola' }, t, [img(1080, 1350)]))).toBe(false);
  });
  it('Reel no admite imágenes', () => {
    const issues = validateTarget({ baseText: 'x' }, { network: 'instagram', format: 'reel', text: null, tiktok: null }, [img(1080, 1920)]);
    expect(issues.some((i) => i.code === 'media_type')).toBe(true);
  });
  it('tamaño máximo por red', () => {
    const big = img(1000, 1000, { size: 6 * 1024 * 1024 });
    expect(validateTarget({ baseText: 'x' }, { network: 'x', format: 'post', text: null, tiktok: null }, [big]).some((i) => i.code === 'media_size')).toBe(true);
  });
});

describe('afirmaciones de riesgo', () => {
  it('detecta curas y resultados garantizados', () => {
    expect(checkCompliance('Esta crema cura el acné').length).toBeGreaterThan(0);
    expect(checkCompliance('Resultados garantizados en 7 días').length).toBeGreaterThan(0);
  });
  it('respeta palabras prohibidas de la marca', () => {
    expect(checkCompliance('Un producto milagro', ['milagro']).some((i) => i.code === 'banned')).toBe(true);
  });
  it('no marca texto neutral', () => {
    expect(checkCompliance('¿Cuál es tu rutina favorita por la mañana?')).toEqual([]);
  });
});

describe('marca', () => {
  it('borrador sólo exige nombre; activar exige perfil', () => {
    expect(validateBrand({ name: 'X' }, false)).toEqual({});
    expect(Object.keys(validateBrand({ name: 'X' }, true))).toEqual(expect.arrayContaining(['description', 'audience', 'tone', 'pillars']));
    expect(validateBrand({ name: 'X', knowledge: 'a'.repeat(6001) }, false).knowledge).toBeDefined();
  });
});

describe('roles y estados', () => {
  it('editor redacta y envía pero no aprueba ni publica', () => {
    expect(allowedActions('draft', 'editor')).toContain('submit');
    expect(allowedActions('in_review', 'editor')).not.toContain('approve');
    expect(can('editor', 'post.publish')).toBe(false);
  });
  it('lector no tiene acciones', () => {
    expect(allowedActions('draft', 'viewer')).toEqual([]);
  });
  it('programar exige estado aprobado', () => {
    expect(allowedActions('draft', 'owner')).not.toContain('schedule');
    expect(allowedActions('approved', 'publisher')).toContain('schedule');
  });
});

describe('seguridad: bloqueo en servidor de redes externas', () => {
  it('todos los adaptadores de red están inhabilitados por defecto', async () => {
    for (const net of NETWORKS) {
      const adapter = getAdapter(net);
      // Sin credenciales configuradas en entorno, ningún adaptador está habilitado
      expect(adapter.status().enabled).toBe(false);
      if (net === 'facebook' || net === 'instagram') {
        expect(adapter.status().implemented).toBe(true);
      } else {
        expect(adapter.status().implemented).toBe(false);
      }
      await expect(adapter.publish({} as any)).rejects.toThrow(IntegrationDisabledError);
    }
  });

  it('publishReal rechaza inmediatamente llamadas con IntegrationDisabledError impidiendo tráfico externo', async () => {
    const fakeReq = { account: { network: 'facebook' }, post: {}, target: {}, text: '', media: [] } as any;
    await expect(publishReal(fakeReq)).rejects.toThrow(IntegrationDisabledError);
  });
});

describe('flujo de rechazo y revisión de estados', () => {
  it('permite rechazar directamente desde in_review hacia draft de forma independiente de la aprobación', () => {
    expect(TRANSITIONS.reject.from).toContain('in_review');
    expect(TRANSITIONS.reject.to).toBe('draft');
    expect(allowedActions('in_review', 'publisher')).toContain('reject');
    expect(allowedActions('in_review', 'owner')).toContain('reject');
    expect(allowedActions('in_review', 'editor')).not.toContain('reject');
  });

  it('permite intencionalmente rechazar desde approved hacia draft para revocar aprobación ante cambios de último momento', () => {
    expect(TRANSITIONS.reject.from).toContain('approved');
    expect(TRANSITIONS.reject.to).toBe('draft');
    expect(allowedActions('approved', 'publisher')).toContain('reject');
    expect(allowedActions('approved', 'owner')).toContain('reject');
  });
});

describe('seguridad OAuth Meta y protección de credenciales', () => {
  it('rechazo del callback con un state inválido, ausente o manipulado', () => {
    // 1. State ausente
    const missing = oauthStateManager.verifyAndConsume('');
    expect(missing.valid).toBe(false);
    expect(missing.reason).toContain('ausente o inválido');

    // 2. State no existente / manipulado
    const invalid = oauthStateManager.verifyAndConsume('state_falso_manipulado_123');
    expect(invalid.valid).toBe(false);
    expect(invalid.reason).toContain('no coincide o ya fue utilizado');

    // 3. State expirado (> 10 minutos)
    const expiredState = oauthStateManager.create('user_123', 'facebook', -1000); // ttl negativo = expirado
    const expiredCheck = oauthStateManager.verifyAndConsume(expiredState);
    expect(expiredCheck.valid).toBe(false);
    expect(expiredCheck.reason).toContain('caducado');

    // 4. State de un solo uso (anti-replay)
    const validState = oauthStateManager.create('user_123', 'facebook', 10 * 60 * 1000);
    const firstCheck = oauthStateManager.verifyAndConsume(validState);
    expect(firstCheck.valid).toBe(true);
    expect(firstCheck.entry?.userId).toBe('user_123');
    expect(firstCheck.entry?.network).toBe('facebook');

    // Segundo intento con el mismo state debe ser rechazado
    const secondCheck = oauthStateManager.verifyAndConsume(validState);
    expect(secondCheck.valid).toBe(false);
    expect(secondCheck.reason).toContain('no coincide o ya fue utilizado');
  });

  it('rechazo cuando falta APP_ENCRYPTION_KEY impidiendo guardar tokens en texto plano', async () => {
    // Si no hay APP_ENCRYPTION_KEY configurada, canStoreSecrets() debe ser false
    // (en entorno de test por defecto no hay clave)
    if (!canStoreSecrets()) {
      const fbAdapter = new MetaAdapter('facebook');
      await expect(fbAdapter.completeAuthorization('fake_code', 'fake_state')).rejects.toThrow(
        /No se pueden almacenar las credenciales de Meta porque falta la variable APP_ENCRYPTION_KEY en el entorno. No se guardará nada en texto plano./,
      );

      const igAdapter = new MetaAdapter('instagram');
      await expect(igAdapter.completeAuthorization('fake_code', 'fake_state')).rejects.toThrow(
        /No se pueden almacenar las credenciales de Meta porque falta la variable APP_ENCRYPTION_KEY en el entorno. No se guardará nada en texto plano./,
      );
    }
  });

  it('bloqueo de publicación en servidor si no hay credenciales activas', async () => {
    const fbAdapter = new MetaAdapter('facebook');
    expect(fbAdapter.status().enabled).toBe(false);
    await expect(fbAdapter.publish({
      account: { id: 'acc_1', network: 'facebook' } as any,
      post: {} as any,
      target: {} as any,
      text: 'Prueba',
      media: [],
    })).rejects.toThrow(IntegrationDisabledError);
  });
});
