import { postsRepo, type PostInput } from '../repositories/posts.ts';
import { accountsRepo } from '../repositories/accounts.ts';
import { brandsRepo } from '../repositories/brands.ts';
import { mediaRepo } from '../repositories/media.ts';
import { settingsRepo } from '../repositories/workspace.ts';
import { tx } from '../db/database.ts';
import { PLATFORMS } from '../../shared/platforms.ts';
import { can, TRANSITIONS, type PostAction } from '../../shared/workflow.ts';
import { effectiveText, emptyTikTokOptions, hasErrors, validateTarget } from '../../shared/validation.ts';
import { conflict, forbidden, invalid, notFound } from '../http/errors.ts';
import { getAdapter, IntegrationDisabledError, publishReal } from '../integrations/registry.ts';
import type { Issue, Network, Post, User } from '../../shared/types.ts';

function normalize(raw: Partial<PostInput>): PostInput {
  const brand = raw.brandId ? brandsRepo.get(raw.brandId) : null;
  if (!brand) throw invalid('Elige una marca.', { brandId: 'Elige una marca.' });
  if (brand.status === 'archived') throw invalid('La marca está archivada.', { brandId: 'La marca está archivada.' });

  const seen = new Set<string>();
  const targets = (raw.targets ?? []).map((t) => {
    const acc = accountsRepo.get(String(t.accountId));
    if (!acc) throw invalid('Uno de los destinos ya no existe.');
    if (seen.has(acc.id)) throw invalid('Hay un destino repetido.');
    seen.add(acc.id);
    const p = PLATFORMS[acc.network];
    const format = p.formats.some((f) => f.id === t.format) ? t.format : p.formats[0].id;
    return {
      accountId: acc.id,
      network: acc.network,
      format,
      text: typeof t.text === 'string' ? t.text : null,
      tiktok: acc.network === 'tiktok' ? { ...emptyTikTokOptions(), ...(t.tiktok ?? {}) } : null,
    };
  });

  const mediaIds = (raw.mediaIds ?? []).map(String).filter((id) => mediaRepo.get(id));
  let plannedAt: string | null = null;
  if (raw.plannedAt) {
    const d = new Date(raw.plannedAt);
    if (Number.isNaN(d.getTime())) throw invalid('Fecha no válida.', { plannedAt: 'Fecha no válida.' });
    plannedAt = d.toISOString();
  }
  return {
    brandId: brand.id,
    internalTitle: String(raw.internalTitle ?? '').trim().slice(0, 120) || 'Sin título',
    tags: [...new Set((raw.tags ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20),
    baseText: String(raw.baseText ?? ''),
    mediaIds,
    plannedAt,
    targets,
  };
}

export function postIssues(post: Post): { targetId: string; network: Network; issues: Issue[] }[] {
  const brand = brandsRepo.get(post.brandId);
  const media = mediaRepo.getMany(post.mediaIds);
  return post.targets.map((t) => ({ targetId: t.id, network: t.network, issues: validateTarget(post, t, media, brand) }));
}

function assertPublishable(post: Post) {
  if (!post.targets.length) throw invalid('Selecciona al menos un destino.');
  const bad = postIssues(post).filter((r) => hasErrors(r.issues));
  if (bad.length) {
    throw invalid(
      `Hay errores en ${bad.map((b) => PLATFORMS[b.network].label).join(', ')}. Corrígelos antes de continuar.`,
      { targets: bad },
    );
  }
}

function accountsOf(post: Post) {
  return post.targets.map((t) => accountsRepo.get(t.accountId)!);
}

export const postService = {
  create(user: User, raw: Partial<PostInput>): Post {
    if (!can(user.role, 'post.edit')) throw forbidden();
    const input = normalize(raw);
    return tx(() => {
      const post = postsRepo.create(input, user.id);
      postsRepo.addEvent(post.id, user.id, 'created');
      return post;
    });
  },

  update(user: User, id: string, raw: Partial<PostInput>): Post {
    if (!can(user.role, 'post.edit')) throw forbidden();
    const post = postsRepo.get(id);
    if (!post) throw notFound('La publicación');
    if (!TRANSITIONS.save.from.includes(post.status))
      throw conflict('Esta publicación ya no se puede editar en su estado actual.');
    const input = normalize(raw);
    tx(() => {
      postsRepo.update(id, input);
      // Editar contenido aprobado o en revisión lo devuelve a borrador para una nueva revisión.
      if (post.status !== 'draft') {
        postsRepo.setStatus(id, 'draft', { approvedBy: null });
        postsRepo.addEvent(id, user.id, 'returned_to_draft', 'Se editó el contenido.');
      } else postsRepo.addEvent(id, user.id, 'saved');
    });
    return postsRepo.get(id)!;
  },

  async transition(user: User, id: string, action: PostAction, opts: { note?: string; plannedAt?: string } = {}): Promise<Post> {
    const post = postsRepo.get(id);
    if (!post) throw notFound('La publicación');
    const rule = TRANSITIONS[action];
    if (!rule) throw invalid('Acción desconocida.');
    if (!can(user.role, rule.perm)) throw forbidden();
    if (!rule.from.includes(post.status)) throw conflict('La acción no está disponible en el estado actual.');

    const note = (opts.note ?? '').trim().slice(0, 1000);
    const accounts = accountsOf(post);
    const allDemo = accounts.every((a) => a.mode === 'demo');
    const anyDemo = accounts.some((a) => a.mode === 'demo');

    switch (action) {
      case 'submit':
        assertPublishable(post);
        break;
      case 'approve': {
        assertPublishable(post);
        const s = settingsRepo.get();
        if (s.requireDifferentApprover && post.createdBy === user.id)
          throw forbidden('La aprobación debe hacerla una persona distinta a quien creó la publicación.');
        break;
      }
      case 'reject':
        if (!note) throw invalid('Explica qué hay que cambiar.', { note: 'Obligatorio al devolver.' });
        break;
      case 'schedule': {
        assertPublishable(post);
        const when = opts.plannedAt ? new Date(opts.plannedAt) : post.plannedAt ? new Date(post.plannedAt) : null;
        if (!when || Number.isNaN(when.getTime())) throw invalid('Indica fecha y hora de programación.');
        if (when.getTime() < Date.now() + 60_000) throw invalid('La fecha de programación debe ser futura.');
        if (anyDemo && !allDemo) throw invalid('No se pueden mezclar cuentas simuladas y reales en una misma publicación.');
        if (!allDemo) {
          const off = accounts.filter((a) => !getAdapter(a.network).status().enabled);
          if (off.length) throw conflict(`Integración no disponible para: ${off.map((a) => PLATFORMS[a.network].label).join(', ')}.`);
        }
        tx(() => {
          postsRepo.update(id, { ...post, plannedAt: when.toISOString() });
          postsRepo.setStatus(id, 'scheduled', { simulated: allDemo });
          postsRepo.setAllTargets(id, 'scheduled');
          postsRepo.addEvent(id, user.id, allDemo ? 'scheduled_demo' : 'scheduled', note);
        });
        return postsRepo.get(id)!;
      }
      case 'publish':
        assertPublishable(post);
        if (anyDemo && !allDemo) throw invalid('No se pueden mezclar cuentas simuladas y reales en una misma publicación.');
        if (allDemo) {
          tx(() => {
            for (const t of post.targets) postsRepo.setTargetStatus(t.id, 'published', null, true, true);
            postsRepo.setStatus(id, 'published', { simulated: true });
            postsRepo.addEvent(id, user.id, 'published_demo', 'Simulación: no se envió nada a ninguna red.');
          });
          return postsRepo.get(id)!;
        }
        return this.publishRealTargets(user, post);
    }

    tx(() => {
      postsRepo.setStatus(id, rule.to!, {
        approvedBy: action === 'approve' ? user.id : action === 'reject' || action === 'reopen' ? null : undefined,
        simulated: action === 'reopen' || action === 'unschedule' ? false : undefined,
      });
      if (action === 'cancel') postsRepo.setAllTargets(id, 'cancelled');
      if (action === 'reopen' || action === 'unschedule') postsRepo.setAllTargets(id, 'pending');
      postsRepo.addEvent(id, user.id, action, note);
    });
    return postsRepo.get(id)!;
  },

  /** Envío real por destino. Inalcanzable mientras todos los adaptadores estén desactivados. */
  async publishRealTargets(user: User, post: Post, only?: string): Promise<Post> {
    const media = mediaRepo.getMany(post.mediaIds);
    for (const t of post.targets) {
      if (only && t.id !== only) continue;
      if (t.status === 'published') continue;
      const account = accountsRepo.get(t.accountId)!;
      try {
        const r = await publishReal({ account, post, target: t, text: effectiveText(post, t), media });
        postsRepo.setTargetStatus(t.id, r.ok ? 'published' : 'failed', r.ok ? null : r.error, false, true);
      } catch (e) {
        if (e instanceof IntegrationDisabledError) throw conflict(e.message);
        postsRepo.setTargetStatus(t.id, 'failed', e instanceof Error ? e.message : 'Error desconocido', false, true);
      }
    }
    const fresh = postsRepo.get(post.id)!;
    const failed = fresh.targets.some((t) => t.status === 'failed');
    postsRepo.setStatus(post.id, failed ? 'failed' : 'published', { simulated: false });
    postsRepo.addEvent(post.id, user.id, failed ? 'publish_failed' : 'published');
    return postsRepo.get(post.id)!;
  },

  async retryTarget(user: User, postId: string, targetId: string): Promise<Post> {
    if (!can(user.role, 'post.publish')) throw forbidden();
    const post = postsRepo.get(postId);
    if (!post) throw notFound('La publicación');
    const t = post.targets.find((x) => x.id === targetId);
    if (!t) throw notFound('El destino');
    if (t.status !== 'failed') throw conflict('Sólo se reintentan destinos fallidos.');
    const account = accountsRepo.get(t.accountId)!;
    if (account.mode === 'demo' || t.simulated)
      throw conflict('Este fallo es de demostración: no hay una integración real que reintentar.');
    if (!getAdapter(account.network).status().enabled) throw conflict('La integración de esta red no está disponible.');
    return this.publishRealTargets(user, post, targetId);
  },

  remove(user: User, id: string) {
    if (!can(user.role, 'post.edit')) throw forbidden();
    const post = postsRepo.get(id);
    if (!post) throw notFound('La publicación');
    if (!['draft', 'cancelled'].includes(post.status)) throw conflict('Sólo se eliminan borradores o publicaciones canceladas.');
    postsRepo.remove(id);
  },
};
