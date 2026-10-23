import type { Network } from './types.ts';

/**
 * Reglas por red. Los valores son referencias tomadas de documentación pública de cada
 * plataforma según el conocimiento disponible al construir el MVP. NO se han verificado
 * contra las APIs en vivo: revisarlos al implementar cada integración (ver docs/architecture.md).
 */
export interface FormatRule {
  id: string;
  label: string;
  /** Proporciones aceptadas (ancho/alto) como [min, max]. */
  aspect?: [number, number];
  minMedia: number;
  maxMedia: number;
  allowImages: boolean;
  allowVideo: boolean;
  maxVideoSec?: number;
  /** Si no admite mezclar imagen y video en el mismo envío. */
  noMix?: boolean;
}

export interface PlatformRule {
  id: Network;
  label: string;
  short: string;
  textLimit: number;
  titleLimit?: number;
  maxImageMB: number;
  maxVideoMB: number;
  imageMimes: string[];
  videoMimes: string[];
  formats: FormatRule[];
  requirements: string[];
  hashtagLimit?: number;
}

const IMG = ['image/jpeg', 'image/png', 'image/webp'];
const VID = ['video/mp4', 'video/quicktime'];

export const PLATFORMS: Record<Network, PlatformRule> = {
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    short: 'IG',
    textLimit: 2200,
    hashtagLimit: 30,
    maxImageMB: 8,
    maxVideoMB: 300,
    imageMimes: ['image/jpeg', 'image/png'],
    videoMimes: VID,
    formats: [
      { id: 'feed', label: 'Feed', aspect: [0.8, 1.91], minMedia: 1, maxMedia: 10, allowImages: true, allowVideo: true },
      { id: 'reel', label: 'Reel', aspect: [0.5, 0.6], minMedia: 1, maxMedia: 1, allowImages: false, allowVideo: true, maxVideoSec: 900 },
      { id: 'story', label: 'Historia', aspect: [0.5, 0.6], minMedia: 1, maxMedia: 1, allowImages: true, allowVideo: true, maxVideoSec: 60 },
    ],
    requirements: [
      'Cuenta profesional (Empresa o Creador).',
      'Vinculada a una página de Facebook.',
      'Permisos de publicación aprobados por Meta para la app.',
    ],
  },
  facebook: {
    id: 'facebook',
    label: 'Facebook',
    short: 'FB',
    textLimit: 63206,
    maxImageMB: 10,
    maxVideoMB: 1024,
    imageMimes: IMG,
    videoMimes: VID,
    formats: [
      { id: 'feed', label: 'Feed', minMedia: 0, maxMedia: 10, allowImages: true, allowVideo: true, noMix: true },
      { id: 'reel', label: 'Reel', aspect: [0.5, 0.6], minMedia: 1, maxMedia: 1, allowImages: false, allowVideo: true, maxVideoSec: 90 },
      { id: 'story', label: 'Historia', aspect: [0.5, 0.6], minMedia: 1, maxMedia: 1, allowImages: true, allowVideo: true, maxVideoSec: 60 },
    ],
    requirements: [
      'Página de Facebook (no perfil personal).',
      'Rol de administración o tarea de contenido en la página.',
    ],
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    short: 'TT',
    textLimit: 2200,
    maxImageMB: 20,
    maxVideoMB: 4096,
    imageMimes: ['image/jpeg', 'image/webp'],
    videoMimes: ['video/mp4', 'video/quicktime', 'video/webm'],
    formats: [
      { id: 'video', label: 'Video', aspect: [0.5, 0.6], minMedia: 1, maxMedia: 1, allowImages: false, allowVideo: true, maxVideoSec: 600 },
      { id: 'photo', label: 'Fotos', minMedia: 1, maxMedia: 35, allowImages: true, allowVideo: false },
    ],
    requirements: [
      'Cuenta de TikTok autorizada mediante Login Kit.',
      'App aprobada para Content Posting API.',
      'Privacidad y divulgación comercial elegidas por una persona en cada publicación.',
    ],
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    short: 'YT',
    textLimit: 5000,
    titleLimit: 100,
    maxImageMB: 2,
    maxVideoMB: 4096,
    imageMimes: [],
    videoMimes: VID,
    formats: [
      { id: 'video', label: 'Video', minMedia: 1, maxMedia: 1, allowImages: false, allowVideo: true },
      { id: 'short', label: 'Short', aspect: [0.5, 1], minMedia: 1, maxMedia: 1, allowImages: false, allowVideo: true, maxVideoSec: 180 },
    ],
    requirements: ['Canal de YouTube verificado.', 'Proyecto de Google Cloud con YouTube Data API habilitada.'],
  },
  x: {
    id: 'x',
    label: 'X',
    short: 'X',
    textLimit: 280,
    maxImageMB: 5,
    maxVideoMB: 512,
    imageMimes: IMG,
    videoMimes: ['video/mp4'],
    formats: [{ id: 'post', label: 'Post', minMedia: 0, maxMedia: 4, allowImages: true, allowVideo: true, noMix: true }],
    requirements: ['Proyecto en el portal de desarrolladores de X con nivel de acceso que permita publicar.'],
  },
  threads: {
    id: 'threads',
    label: 'Threads',
    short: 'TH',
    textLimit: 500,
    maxImageMB: 8,
    maxVideoMB: 1024,
    imageMimes: ['image/jpeg', 'image/png'],
    videoMimes: VID,
    formats: [{ id: 'post', label: 'Post', minMedia: 0, maxMedia: 10, allowImages: true, allowVideo: true }],
    requirements: ['Perfil de Threads asociado a una cuenta de Instagram.', 'Permisos de Threads API aprobados.'],
  },
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    short: 'IN',
    textLimit: 3000,
    maxImageMB: 8,
    maxVideoMB: 200,
    imageMimes: IMG,
    videoMimes: ['video/mp4'],
    formats: [{ id: 'post', label: 'Post', minMedia: 0, maxMedia: 9, allowImages: true, allowVideo: true, noMix: true }],
    requirements: ['Página de empresa con rol de administración.', 'Producto “Community Management API” aprobado.'],
  },
};

export const NETWORKS = Object.keys(PLATFORMS) as Network[];

export function defaultFormat(network: Network): string {
  return PLATFORMS[network].formats[0].id;
}

export function formatRule(network: Network, format: string) {
  const p = PLATFORMS[network];
  return p.formats.find((f) => f.id === format) ?? p.formats[0];
}
