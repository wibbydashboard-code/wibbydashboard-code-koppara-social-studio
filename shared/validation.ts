import { PLATFORMS, formatRule } from './platforms.ts';
import { checkCompliance } from './compliance.ts';
import type { Brand, Issue, MediaItem, Network, Post, PostTarget, TikTokOptions } from './types.ts';

export const KNOWLEDGE_LIMIT = 6000;

export function emptyTikTokOptions(): TikTokOptions {
  return {
    privacy: '',
    commercialDisclosure: null,
    yourBrand: false,
    brandedContent: false,
    allowComments: false,
    allowDuet: false,
    allowStitch: false,
  };
}

/** Texto efectivo que se enviaría al destino. Título interno y etiquetas nunca se incluyen. */
export function effectiveText(post: Pick<Post, 'baseText'>, target: Pick<PostTarget, 'text'>): string {
  return target.text ?? post.baseText;
}

/** YouTube: la primera línea es el título; el texto completo se conserva como descripción. */
export function youtubeParts(text: string): { title: string; description: string } {
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? '';
  return { title: firstLine, description: text };
}

export function validateTikTok(o: TikTokOptions | null): Issue[] {
  const issues: Issue[] = [];
  if (!o) return [{ level: 'error', code: 'tiktok_missing', message: 'Faltan las opciones de TikTok.' }];
  if (!o.privacy) issues.push({ level: 'error', code: 'tiktok_privacy', message: 'Elige quién puede ver la publicación en TikTok.' });
  if (o.commercialDisclosure === null)
    issues.push({ level: 'error', code: 'tiktok_disclosure', message: 'Indica si el contenido promociona una marca, producto o servicio.' });
  if (o.commercialDisclosure === true && !o.yourBrand && !o.brandedContent)
    issues.push({ level: 'error', code: 'tiktok_disclosure_type', message: 'Selecciona “Tu marca”, “Contenido de marca” o ambos.' });
  if (o.brandedContent && o.privacy === 'SELF_ONLY')
    issues.push({ level: 'error', code: 'tiktok_branded_private', message: 'El contenido de marca no puede ser privado (“Solo yo”).' });
  return issues;
}

export function validateTarget(
  post: Pick<Post, 'baseText'>,
  target: Pick<PostTarget, 'network' | 'format' | 'text' | 'tiktok'>,
  media: MediaItem[],
  brand?: Pick<Brand, 'bannedWords'> | null,
): Issue[] {
  const p = PLATFORMS[target.network as Network];
  const f = formatRule(target.network, target.format);
  const text = effectiveText(post, target);
  const issues: Issue[] = [];

  if (target.network === 'youtube') {
    const { title } = youtubeParts(text);
    if (!title) issues.push({ level: 'error', code: 'yt_title', message: 'La primera línea se usa como título de YouTube y está vacía.' });
    else if (title.length > (p.titleLimit ?? 100))
      issues.push({ level: 'error', code: 'yt_title_len', message: `El título (primera línea) supera ${p.titleLimit} caracteres.` });
  }

  if (!text.trim() && media.length === 0) issues.push({ level: 'error', code: 'empty', message: 'Añade texto o medios.' });
  if (text.length > p.textLimit)
    issues.push({ level: 'error', code: 'text_len', message: `El texto supera el límite de ${p.textLimit.toLocaleString('es-MX')} caracteres (${text.length.toLocaleString('es-MX')}).` });

  if (p.hashtagLimit) {
    const tags = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
    if (tags.length > p.hashtagLimit)
      issues.push({ level: 'error', code: 'hashtags', message: `Máximo ${p.hashtagLimit} hashtags (${tags.length}).` });
  }

  if (media.length < f.minMedia)
    issues.push({ level: 'error', code: 'media_min', message: `${f.label} requiere al menos ${f.minMedia} archivo${f.minMedia > 1 ? 's' : ''}.` });
  if (media.length > f.maxMedia)
    issues.push({ level: 'error', code: 'media_max', message: `${f.label} admite como máximo ${f.maxMedia} archivo${f.maxMedia > 1 ? 's' : ''}.` });

  const hasImg = media.some((m) => m.kind === 'image');
  const hasVid = media.some((m) => m.kind === 'video');
  if (f.noMix && hasImg && hasVid)
    issues.push({ level: 'error', code: 'media_mix', message: 'No se pueden combinar imágenes y video en este formato.' });

  for (const m of media) {
    const name = `“${m.filename}”`;
    if (m.kind === 'image') {
      if (!f.allowImages) issues.push({ level: 'error', code: 'media_type', message: `${f.label} no admite imágenes (${name}).` });
      else if (!p.imageMimes.includes(m.mime))
        issues.push({ level: 'error', code: 'media_mime', message: `${p.label} no acepta ${m.mime} (${name}).` });
      if (m.size > p.maxImageMB * 1024 * 1024)
        issues.push({ level: 'error', code: 'media_size', message: `${name} supera ${p.maxImageMB} MB.` });
    } else {
      if (!f.allowVideo) issues.push({ level: 'error', code: 'media_type', message: `${f.label} no admite video (${name}).` });
      else if (!p.videoMimes.includes(m.mime))
        issues.push({ level: 'error', code: 'media_mime', message: `${p.label} no acepta ${m.mime} (${name}).` });
      if (m.size > p.maxVideoMB * 1024 * 1024)
        issues.push({ level: 'error', code: 'media_size', message: `${name} supera ${p.maxVideoMB} MB.` });
      if (f.maxVideoSec && m.durationSec && m.durationSec > f.maxVideoSec)
        issues.push({ level: 'error', code: 'media_duration', message: `${name} dura más de ${f.maxVideoSec} s.` });
      if (m.kind === 'video' && m.durationSec == null)
        issues.push({ level: 'warning', code: 'media_duration_unknown', message: `No se pudo leer la duración de ${name}.` });
    }
    if (f.aspect && m.width && m.height) {
      const r = m.width / m.height;
      if (r < f.aspect[0] - 0.01 || r > f.aspect[1] + 0.01)
        issues.push({
          level: 'error',
          code: 'media_aspect',
          message: `${name} tiene proporción ${m.width}×${m.height}; ${f.label} espera ${describeAspect(f.aspect)}.`,
        });
    }
  }

  if (target.network === 'tiktok') issues.push(...validateTikTok(target.tiktok));
  issues.push(...checkCompliance(text, brand?.bannedWords ?? []));
  return issues;
}

function describeAspect([min, max]: [number, number]): string {
  if (max <= 0.6) return 'vertical 9:16';
  if (min >= 0.8 && max >= 1.9) return 'entre 4:5 y 1.91:1';
  return `entre ${min.toFixed(2)} y ${max.toFixed(2)}`;
}

export function hasErrors(issues: Issue[]) {
  return issues.some((i) => i.level === 'error');
}

/** Validación del perfil de marca. strict = al activar; si no, sólo lo mínimo para un borrador. */
export function validateBrand(b: Partial<Brand>, strict: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!b.name?.trim()) e.name = 'El nombre es obligatorio.';
  else if (b.name.length > 80) e.name = 'Máximo 80 caracteres.';
  if (b.website && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(b.website)) e.website = 'Usa una URL completa, p. ej. https://ejemplo.com';
  if ((b.knowledge ?? '').length > KNOWLEDGE_LIMIT) e.knowledge = `Máximo ${KNOWLEDGE_LIMIT.toLocaleString('es-MX')} caracteres.`;
  const hex = /^#[0-9a-f]{6}$/i;
  if (b.kit?.primaryColor && !hex.test(b.kit.primaryColor)) e.primaryColor = 'Color en formato #RRGGBB.';
  if (b.kit?.palette?.some((c) => !hex.test(c))) e.palette = 'Todos los colores deben tener formato #RRGGBB.';
  if (strict) {
    if (!b.description?.trim()) e.description = 'Describe la marca antes de activarla.';
    if (!b.audience?.trim()) e.audience = 'Define la audiencia antes de activarla.';
    if (!b.tone?.trim()) e.tone = 'Define el tono antes de activarla.';
    if (!b.language?.trim()) e.language = 'Elige un idioma.';
    if (!b.pillars?.length) e.pillars = 'Añade al menos un pilar de contenido.';
  }
  return e;
}
