import type { PostStatus, Role } from './types.ts';

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  publisher: 'Publicador',
  editor: 'Editor',
  viewer: 'Lector',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Control total, incluido plan, créditos y equipo.',
  admin: 'Gestiona marcas, cuentas, equipo y todo el contenido.',
  publisher: 'Aprueba, programa y publica. También redacta.',
  editor: 'Redacta borradores y los envía a revisión.',
  viewer: 'Sólo lectura.',
};

export type Permission =
  | 'brand.edit'
  | 'brand.archive'
  | 'account.manage'
  | 'post.edit'
  | 'post.submit'
  | 'post.approve'
  | 'post.schedule'
  | 'post.publish'
  | 'media.edit'
  | 'ai.generate'
  | 'team.manage'
  | 'plan.manage';

const MATRIX: Record<Role, Permission[]> = {
  owner: ['brand.edit', 'brand.archive', 'account.manage', 'post.edit', 'post.submit', 'post.approve', 'post.schedule', 'post.publish', 'media.edit', 'ai.generate', 'team.manage', 'plan.manage'],
  admin: ['brand.edit', 'brand.archive', 'account.manage', 'post.edit', 'post.submit', 'post.approve', 'post.schedule', 'post.publish', 'media.edit', 'ai.generate', 'team.manage'],
  publisher: ['post.edit', 'post.submit', 'post.approve', 'post.schedule', 'post.publish', 'media.edit', 'ai.generate'],
  editor: ['brand.edit', 'post.edit', 'post.submit', 'media.edit', 'ai.generate'],
  viewer: [],
};

export function can(role: Role, p: Permission): boolean {
  return MATRIX[role].includes(p);
}

export const STATUS_LABELS: Record<PostStatus, string> = {
  draft: 'Borrador',
  in_review: 'En revisión',
  approved: 'Aprobado',
  scheduled: 'Programado',
  published: 'Publicado',
  failed: 'Fallido',
  cancelled: 'Cancelado',
};

export type PostAction = 'save' | 'submit' | 'approve' | 'reject' | 'schedule' | 'unschedule' | 'publish' | 'cancel' | 'reopen';

/** Transiciones válidas: acción → [estados de origen, estado destino, permiso]. */
export const TRANSITIONS: Record<PostAction, { from: PostStatus[]; to: PostStatus | null; perm: Permission }> = {
  save: { from: ['draft', 'in_review', 'approved'], to: null, perm: 'post.edit' },
  submit: { from: ['draft'], to: 'in_review', perm: 'post.submit' },
  approve: { from: ['in_review'], to: 'approved', perm: 'post.approve' },
  reject: { from: ['in_review', 'approved'], to: 'draft', perm: 'post.approve' },
  schedule: { from: ['approved'], to: 'scheduled', perm: 'post.schedule' },
  unschedule: { from: ['scheduled'], to: 'approved', perm: 'post.schedule' },
  publish: { from: ['approved', 'scheduled'], to: 'published', perm: 'post.publish' },
  cancel: { from: ['draft', 'in_review', 'approved', 'scheduled', 'failed'], to: 'cancelled', perm: 'post.edit' },
  reopen: { from: ['cancelled', 'failed'], to: 'draft', perm: 'post.edit' },
};

export function allowedActions(status: PostStatus, role: Role): PostAction[] {
  return (Object.keys(TRANSITIONS) as PostAction[]).filter(
    (a) => TRANSITIONS[a].from.includes(status) && can(role, TRANSITIONS[a].perm),
  );
}
