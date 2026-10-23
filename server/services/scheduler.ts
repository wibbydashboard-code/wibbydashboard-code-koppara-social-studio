import { postsRepo } from '../repositories/posts.ts';
import { accountsRepo } from '../repositories/accounts.ts';
import { mediaRepo } from '../repositories/media.ts';
import { usersRepo } from '../repositories/workspace.ts';
import { effectiveText } from '../../shared/validation.ts';
import { publishReal } from '../integrations/registry.ts';
import { IntegrationDisabledError } from '../integrations/types.ts';

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Procesa publicaciones que alcanzaron o superaron su fecha prevista en estado 'scheduled'.
 * Limita reintentos por destino (máximo 3) y registra el error específico por destino.
 */
export async function processDueScheduledPosts() {
  if (running) return;
  running = true;
  try {
    const duePosts = postsRepo.listDueScheduled();
    for (const post of duePosts) {
      const user =
        (post.approvedBy ? usersRepo.get(post.approvedBy) : null) ||
        usersRepo.get(post.createdBy) ||
        usersRepo.list()[0];
      if (!user) continue;

      if (post.targets.length === 0) {
        postsRepo.setStatus(post.id, 'failed', { simulated: post.simulated });
        postsRepo.addEvent(post.id, user.id, 'publish_failed', 'La publicación programada no tiene destinos seleccionados.');
        continue;
      }

      const allDemo = post.targets.every((t) => {
        const acc = accountsRepo.get(t.accountId);
        return acc?.mode === 'demo';
      });

      if (allDemo) {
        for (const t of post.targets) {
          postsRepo.setTargetStatus(t.id, 'published', null, true, true);
        }
        postsRepo.setStatus(post.id, 'published', { simulated: true });
        postsRepo.addEvent(post.id, user.id, 'published_demo', 'Publicación programada simulada completada a su hora prevista.');
        continue;
      }

      // Publicación en destinos reales
      const media = mediaRepo.getMany(post.mediaIds);

      for (const t of post.targets) {
        if (t.status === 'published') continue;
        const account = accountsRepo.get(t.accountId);
        if (!account) {
          postsRepo.setTargetStatus(t.id, 'failed', 'Cuenta asociada no encontrada.', false, true);
          continue;
        }

        if (t.attempts >= 3) {
          postsRepo.setTargetStatus(t.id, 'failed', t.error || 'Máximo de 3 reintentos alcanzado sin éxito.', false, false);
          continue;
        }

        try {
          const res = await publishReal({
            account,
            post,
            target: t,
            text: effectiveText(post, t),
            media,
          });
          if (res.ok) {
            postsRepo.setTargetStatus(t.id, 'published', null, false, true);
          } else {
            postsRepo.setTargetStatus(t.id, 'failed', res.error, false, true);
            }
        } catch (e) {
          const errMsg =
            e instanceof IntegrationDisabledError
              ? e.message
              : e instanceof Error
                ? e.message
                : 'Error desconocido';
          postsRepo.setTargetStatus(t.id, 'failed', errMsg, false, true);
        }
      }

      const fresh = postsRepo.get(post.id)!;
      const failed = fresh.targets.some((t) => t.status === 'failed');
      postsRepo.setStatus(post.id, failed ? 'failed' : 'published', { simulated: false });
      postsRepo.addEvent(
        post.id,
        user.id,
        failed ? 'publish_failed' : 'published',
        failed ? 'Fallo en uno o más destinos al publicar a la hora programada.' : 'Publicación enviada exitosamente a la hora programada.',
      );
    }
  } catch (err) {
    console.error('[scheduler] Error al procesar publicaciones programadas:', err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}

export function startScheduler(intervalMs = 30_000) {
  if (timer) return;
  void processDueScheduledPosts();
  timer = setInterval(() => {
    void processDueScheduledPosts();
  }, intervalMs);
  timer.unref();
}

export function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
