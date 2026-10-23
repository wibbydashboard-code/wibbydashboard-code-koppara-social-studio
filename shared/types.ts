// Tipos de dominio compartidos entre API y UI.

export type Network = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'x' | 'threads' | 'linkedin';

export type Role = 'owner' | 'admin' | 'publisher' | 'editor' | 'viewer';

export type PostStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'failed'
  | 'cancelled';

export type TargetStatus = 'pending' | 'scheduled' | 'published' | 'failed' | 'cancelled';

export type BrandStatus = 'draft' | 'active' | 'archived';

export type MediaKind = 'image' | 'video';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isDemo: boolean;
}

export interface BrandKit {
  logoMediaId: string | null;
  primaryColor: string;
  palette: string[];
  fonts: string[];
  referenceMediaIds: string[];
}

export interface Brand {
  id: string;
  status: BrandStatus;
  name: string;
  website: string;
  description: string;
  audience: string;
  bestCustomer: string;
  unwantedAudience: string;
  tone: string;
  personality: string;
  language: string;
  alwaysRules: string[];
  neverRules: string[];
  bannedWords: string[];
  pillars: string[];
  knowledge: string;
  kit: BrandKit;
  /** Campos que aún requieren confirmación de una fuente real. */
  pendingFields: string[];
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AccountMode = 'demo' | 'real';

export interface SocialAccount {
  id: string;
  network: Network;
  handle: string;
  displayName: string;
  accountType: string;
  brandId: string | null;
  /** demo = simulada; real = vinculada vía OAuth (aún no disponible). */
  mode: AccountMode;
  isDemo: boolean;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  brandId: string | null;
  filename: string;
  mime: string;
  kind: MediaKind;
  size: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  url: string;
  tags: string[];
  /** Maqueta generada en el estudio (no es una foto real de producto). */
  isMockup: boolean;
  isDemo: boolean;
  createdAt: string;
}

export interface TikTokOptions {
  privacy: '' | 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
  /** null = el usuario aún no ha respondido. */
  commercialDisclosure: null | boolean;
  yourBrand: boolean;
  brandedContent: boolean;
  allowComments: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
}

export interface PostTarget {
  id: string;
  accountId: string;
  network: Network;
  format: string;
  /** Texto propio del destino. null = usa el texto base. */
  text: string | null;
  tiktok: TikTokOptions | null;
  status: TargetStatus;
  error: string | null;
  attempts: number;
  simulated: boolean;
}

export interface Post {
  id: string;
  brandId: string;
  internalTitle: string;
  tags: string[];
  baseText: string;
  mediaIds: string[];
  status: PostStatus;
  /** Fecha prevista (borradores) o programada, en ISO UTC. */
  plannedAt: string | null;
  targets: PostTarget[];
  createdBy: string;
  approvedBy: string | null;
  simulated: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PostEvent {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  action: string;
  note: string;
  at: string;
}

export interface CreditEntry {
  id: string;
  at: string;
  userId: string;
  kind: 'text' | 'image' | 'carousel' | 'grant' | 'adjust';
  provider: string;
  credits: number;
  description: string;
  balanceAfter: number;
}

export interface WorkspaceSettings {
  name: string;
  timezone: string;
  planName: string;
  monthlyCredits: number;
  requireDifferentApprover: boolean;
}

export interface Issue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}
