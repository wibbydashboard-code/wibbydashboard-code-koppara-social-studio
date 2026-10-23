import { describe, expect, it } from 'vitest';
import { checkCompliance } from '../../shared/compliance.ts';
import { effectiveText, emptyTikTokOptions, hasErrors, validateBrand, validateTarget, validateTikTok, youtubeParts } from '../../shared/validation.ts';
import { allowedActions, can } from '../../shared/workflow.ts';
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
