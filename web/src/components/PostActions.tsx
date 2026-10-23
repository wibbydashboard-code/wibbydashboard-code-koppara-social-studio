import { useState } from 'react';
import { CalendarClock, Check, Send, Undo2, Ban, RotateCcw, Rocket } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';
import { useToast } from '../lib/toast.tsx';
import { isoToLocalInput, localInputToIso } from '../lib/format.ts';
import { allowedActions, type PostAction } from '../../../shared/workflow.ts';
import { Button, Field, Modal, Notice } from './ui.tsx';
import type { Post, SocialAccount } from '../../../shared/types.ts';

interface Props {
  post: Pick<Post, 'id' | 'status' | 'plannedAt' | 'createdBy' | 'targets'> | null;
  accounts: SocialAccount[];
  onChanged: (p: Post) => void;
  /** Guarda cambios pendientes antes de ejecutar la acción y devuelve el id del post. */
  beforeAction?: () => Promise<string | null>;
  compact?: boolean;
}

export function PostActions({ post, accounts, onChanged, beforeAction, compact }: Props) {
  const s = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState<PostAction | null>(null);
  const [modal, setModal] = useState<'schedule' | 'publish' | 'reject' | 'cancel' | null>(null);
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [modalError, setModalError] = useState('');

  const status = post?.status ?? 'draft';
  const actions = allowedActions(status, s.user.role);
  const targetAccounts = (post?.targets ?? []).map((t) => accounts.find((a) => a.id === t.accountId)).filter(Boolean) as SocialAccount[];
  const allDemo = targetAccounts.length > 0 && targetAccounts.every((a) => a.mode === 'demo');
  const sizeProps = compact ? { size: 'sm' as const } : {};

  async function run(action: PostAction, body: Record<string, unknown> = {}) {
    setBusy(action);
    setModalError('');
    try {
      const id = beforeAction ? await beforeAction() : post?.id;
      if (!id) return;
      const p = await api.post<Post>(`/posts/${id}/actions/${action}`, body);
      onChanged(p);
      setModal(null);
      const msg: Partial<Record<PostAction, string>> = {
        submit: 'Enviada a revisión.', approve: 'Publicación aprobada.', reject: 'Devuelta a borrador.',
        schedule: allDemo ? 'Programación simulada guardada.' : 'Publicación programada.',
        unschedule: 'Programación retirada.', publish: allDemo ? 'Publicación simulada: no se envió nada.' : 'Publicación enviada.',
        cancel: 'Publicación cancelada.', reopen: 'Reabierta como borrador.',
      };
      toast(msg[action] ?? 'Hecho.');
    } catch (e) {
      const m = e instanceof ApiError ? e.message : 'No se pudo completar.';
      if (modal) setModalError(m);
      toast(m, 'error');
    } finally {
      setBusy(null);
    }
  }

  const needsApproval = ['draft', 'in_review'].includes(status);
  const scheduleReason = needsApproval ? 'Requiere aprobación previa' : !actions.includes('schedule') ? 'Tu rol no permite programar' : undefined;
  const publishReason = needsApproval ? 'Requiere aprobación previa' : !actions.includes('publish') ? 'Tu rol no permite publicar' : undefined;
  const showSchedulePublish = ['draft', 'in_review', 'approved', 'scheduled'].includes(status);

  return (
    <>
      {actions.includes('submit') && (
        <Button {...sizeProps} icon={<Send />} loading={busy === 'submit'} onClick={() => run('submit')}>
          Enviar a revisión
        </Button>
      )}
      {actions.includes('reject') && (
        <Button {...sizeProps} icon={<Undo2 />} onClick={() => { setNote(''); setModalError(''); setModal('reject'); }}>
          Devolver
        </Button>
      )}
      {actions.includes('approve') && (
        <Button {...sizeProps} variant="primary" icon={<Check />} loading={busy === 'approve'} onClick={() => run('approve')}>
          Aprobar
        </Button>
      )}
      {actions.includes('unschedule') && (
        <Button {...sizeProps} icon={<Undo2 />} loading={busy === 'unschedule'} onClick={() => run('unschedule')}>
          Quitar programación
        </Button>
      )}
      {showSchedulePublish && status !== 'scheduled' && (
        <Button
          {...sizeProps}
          icon={<CalendarClock />}
          disabled={Boolean(scheduleReason)}
          title={scheduleReason}
          onClick={() => { setWhen(isoToLocalInput(post?.plannedAt ?? null, s.settings.timezone)); setModalError(''); setModal('schedule'); }}
        >
          Programar
        </Button>
      )}
      {showSchedulePublish && (
        <Button {...sizeProps} variant="accent" icon={<Rocket />} disabled={Boolean(publishReason)} title={publishReason} onClick={() => { setModalError(''); setModal('publish'); }}>
          Publicar
        </Button>
      )}
      {actions.includes('reopen') && (
        <Button {...sizeProps} icon={<RotateCcw />} loading={busy === 'reopen'} onClick={() => run('reopen')}>
          Reabrir como borrador
        </Button>
      )}
      {actions.includes('cancel') && status !== 'draft' && (
        <Button {...sizeProps} variant="ghost" icon={<Ban />} onClick={() => { setModalError(''); setModal('cancel'); }}>
          Cancelar publicación
        </Button>
      )}

      {modal === 'schedule' && (
        <Modal
          title="Programar publicación"
          onClose={() => setModal(null)}
          footer={
            <>
              <Button onClick={() => setModal(null)}>Volver</Button>
              <Button
                variant="primary"
                loading={busy === 'schedule'}
                disabled={!when}
                onClick={() => run('schedule', { plannedAt: localInputToIso(when, s.settings.timezone) })}
              >
                {allDemo ? 'Programar (simulado)' : 'Confirmar programación'}
              </Button>
            </>
          }
        >
          {allDemo ? (
            <Notice kind="demo" title="Simulación.">
              Todos los destinos son cuentas simuladas: la publicación quedará marcada como programada en la app, pero nada se enviará a ninguna red.
            </Notice>
          ) : (
            <Notice kind="warn">La publicación se enviará a las redes seleccionadas en la fecha indicada.</Notice>
          )}
          <Field label={`Fecha y hora (${s.settings.timezone})`}>
            {(fid) => <input id={fid} type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />}
          </Field>
          {modalError && <Notice kind="danger">{modalError}</Notice>}
        </Modal>
      )}
      {modal === 'publish' && (
        <Modal
          title={allDemo ? 'Simular publicación' : 'Publicar ahora'}
          onClose={() => setModal(null)}
          footer={
            <>
              <Button onClick={() => setModal(null)}>Volver</Button>
              <Button variant="accent" loading={busy === 'publish'} onClick={() => run('publish')}>
                {allDemo ? 'Simular publicación' : 'Publicar ahora'}
              </Button>
            </>
          }
        >
          {allDemo ? (
            <Notice kind="demo" title="Nada saldrá de esta app.">
              Todos los destinos son simulados. La publicación se marcará como “Publicado · Simulado” sólo para practicar el flujo.
            </Notice>
          ) : (
            <Notice kind="warn" title="Acción pública.">
              Se compartirá contenido en {targetAccounts.map((a) => a.handle).join(', ')}. Esta acción no se puede deshacer desde aquí.
            </Notice>
          )}
          {modalError && <Notice kind="danger">{modalError}</Notice>}
        </Modal>
      )}
      {modal === 'reject' && (
        <Modal
          title="Devolver a borrador"
          onClose={() => setModal(null)}
          footer={
            <>
              <Button onClick={() => setModal(null)}>Volver</Button>
              <Button variant="primary" loading={busy === 'reject'} disabled={!note.trim()} onClick={() => run('reject', { note })}>
                Devolver con comentario
              </Button>
            </>
          }
        >
          <Field label="¿Qué hay que cambiar?" required>
            {(fid) => <textarea id={fid} className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          {modalError && <Notice kind="danger">{modalError}</Notice>}
        </Modal>
      )}
      {modal === 'cancel' && (
        <Modal
          title="Cancelar publicación"
          onClose={() => setModal(null)}
          footer={
            <>
              <Button onClick={() => setModal(null)}>Volver</Button>
              <Button variant="danger" loading={busy === 'cancel'} onClick={() => run('cancel')}>
                Cancelar publicación
              </Button>
            </>
          }
        >
          <p>La publicación quedará cancelada y fuera del calendario. Podrás reabrirla como borrador.</p>
          {modalError && <Notice kind="danger">{modalError}</Notice>}
        </Modal>
      )}
    </>
  );
}
