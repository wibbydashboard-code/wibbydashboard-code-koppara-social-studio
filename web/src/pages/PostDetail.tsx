import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { api, ApiError } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { fmtDateTime } from '../lib/format.ts';
import { Button, Confirm, DemoBadge, ErrorState, IssueList, Loading, NetIcon, Notice, StatusBadge } from '../components/ui.tsx';
import { PostPreview } from '../components/PostPreview.tsx';
import { PostActions } from '../components/PostActions.tsx';
import { PLATFORMS, formatRule } from '../../../shared/platforms.ts';
import { TRANSITIONS } from '../../../shared/workflow.ts';
import type { Brand, Issue, MediaItem, Network, Post, PostEvent, SocialAccount, User } from '../../../shared/types.ts';

const EVENT_LABELS: Record<string, string> = {
  created: 'Creó el borrador', saved: 'Guardó cambios', returned_to_draft: 'Editó y volvió a borrador', submit: 'Envió a revisión',
  approve: 'Aprobó', reject: 'Devolvió a borrador', schedule: 'Programó', scheduled: 'Programó', scheduled_demo: 'Programó (simulado)',
  unschedule: 'Quitó la programación', published: 'Publicó', published_demo: 'Simuló la publicación', publish_failed: 'Publicación con errores',
  cancel: 'Canceló', reopen: 'Reabrió como borrador',
};
const TARGET_STATUS: Record<string, string> = { pending: 'Pendiente', scheduled: 'Programado', published: 'Publicado', failed: 'Fallido', cancelled: 'Cancelado' };

export function PostDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const s = useSession();
  const toast = useToast();
  const detail = useApi<{ post: Post; events: PostEvent[]; issues: { targetId: string; network: Network; issues: Issue[] }[] }>(`/posts/${id}`, [id]);
  const accounts = useApi<SocialAccount[]>('/accounts');
  const media = useApi<MediaItem[]>('/media');
  const brands = useApi<Brand[]>('/brands?archived=1');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error || !detail.data) return <ErrorState message={detail.error?.message ?? ''} onRetry={detail.reload} />;
  const { post, events, issues } = detail.data;
  const brand = brands.data?.find((b) => b.id === post.brandId);
  const postMedia = post.mediaIds.map((m) => media.data?.find((x) => x.id === m)).filter((m): m is MediaItem => Boolean(m));
  const userName = (uid: string | null) => s.users.find((u: User) => u.id === uid)?.name ?? '—';
  const editable = TRANSITIONS.save.from.includes(post.status) && s.can('post.edit');

  return (
    <>
      <div className="stack-sm">
        <Link to="/publicaciones" className="small row" style={{ gap: 4, textDecoration: 'none' }}>
          <ArrowLeft size={15} aria-hidden /> Publicaciones
        </Link>
        <div className="page-head">
          <div>
            <div className="eyebrow">{brand?.name ?? 'Marca'}</div>
            <h1>{post.internalTitle}</h1>
            <div className="row" style={{ marginTop: 8 }}>
              <StatusBadge status={post.status} simulated={post.simulated} />
              {post.isDemo && <DemoBadge />}
              {post.plannedAt && (
                <span className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {post.status === 'scheduled' ? (
                    <><strong>Programada para:</strong> {fmtDateTime(post.plannedAt, s.settings.timezone)}</>
                  ) : (
                    <>
                      <span>Fecha prevista:</span> {fmtDateTime(post.plannedAt, s.settings.timezone)}
                      <span className="badge badge--plain" style={{ fontSize: 'var(--fs-xs)', textTransform: 'none' }} title="Fecha tentativa para organizar el calendario. No es una programación activa ni se enviará automáticamente.">
                        Borrador sin programar
                      </span>
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="row">
            {editable && (
              <Link to={`/publicaciones/${post.id}/editar`} className="btn">
                <Pencil aria-hidden /> Editar
              </Link>
            )}
            {['draft', 'cancelled'].includes(post.status) && s.can('post.edit') && (
              <Button variant="ghost" icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>
                Eliminar
              </Button>
            )}
          </div>
        </div>
      </div>

      {post.status === 'draft' && post.plannedAt && (
        <Notice kind="info" title="Borrador con fecha prevista editorial.">
          Esta publicación tiene una fecha asignada sólo para organizar el calendario. <strong>No tiene una programación activa ni puede enviarse automáticamente</strong>. Toda publicación exige aprobación humana antes de programarse o emitirse.
        </Notice>
      )}

      {post.simulated && ['scheduled', 'published', 'failed'].includes(post.status) && (
        <Notice kind="demo" title="Estado simulado.">
          Los destinos son cuentas de demostración: nada se ha enviado ni se enviará a ninguna red social.
        </Notice>
      )}

      <div className="composer">
        <div className="stack">
          <section className="card">
            <div className="card__head">
              <h2>Destinos</h2>
            </div>
            <div className="list">
              {post.targets.length === 0 && <p className="card__body small muted">Sin destinos seleccionados.</p>}
              {post.targets.map((t) => {
                const acc = accounts.data?.find((a) => a.id === t.accountId);
                const ti = issues.find((x) => x.targetId === t.id)?.issues ?? [];
                return (
                  <div key={t.id} className="list-item" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
                    <div className="row" style={{ width: '100%' }}>
                      <NetIcon network={t.network} />
                      <div className="grow">
                        <div style={{ fontWeight: 600 }}>{acc?.handle ?? 'Cuenta eliminada'}</div>
                        <div className="xs muted">
                          {PLATFORMS[t.network].label} · {formatRule(t.network, t.format).label} · {t.text === null ? 'texto base' : 'texto propio'}
                          {t.attempts > 0 && ` · ${t.attempts} intento(s)`}
                        </div>
                      </div>
                      <span className={`badge badge--${t.status === 'pending' ? 'draft' : t.status}`}>{TARGET_STATUS[t.status]}</span>
                      {t.simulated && <DemoBadge label="Simulado" />}
                    </div>
                    {t.error && (
                      <div className="notice notice--danger" style={{ width: '100%' }}>
                        <div className="grow">
                          <strong>Causa: </strong>
                          {t.error}
                        </div>
                        <Button
                          size="sm"
                          icon={<RefreshCw />}
                          loading={retrying === t.id}
                          disabled={t.simulated || acc?.mode === 'demo' || !s.can('post.publish')}
                          title={t.simulated || acc?.mode === 'demo' ? 'Fallo de demostración: no hay integración real que reintentar' : undefined}
                          onClick={async () => {
                            setRetrying(t.id);
                            try {
                              await api.post(`/posts/${post.id}/targets/${t.id}/retry`);
                              await detail.reload();
                            } catch (e) {
                              toast(e instanceof ApiError ? e.message : 'Error', 'error');
                            } finally {
                              setRetrying(null);
                            }
                          }}
                        >
                          Reintentar
                        </Button>
                      </div>
                    )}
                    {['draft', 'in_review', 'approved'].includes(post.status) && <IssueList issues={ti} />}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="card__head">
              <h2>Historial y revisión</h2>
            </div>
            <div className="card__body">
              {post.approvedBy && <p className="small" style={{ marginBottom: 12 }}>Aprobada por <strong>{userName(post.approvedBy)}</strong>.</p>}
              <ol className="steps">
                {events.map((e) => (
                  <li key={e.id} className="step" style={{ alignItems: 'flex-start' }}>
                    <span className="step__dot" style={{ marginTop: 2 }} />
                    <div className="grow">
                      <div className="small">
                        <strong>{e.userName}</strong> · {EVENT_LABELS[e.action] ?? e.action}
                      </div>
                      {e.note && <div className="small" style={{ color: 'var(--c-ink-2)', marginTop: 2 }}>“{e.note}”</div>}
                      <div className="xs muted">{fmtDateTime(e.at, s.settings.timezone)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
        <aside className="composer__side">
          <PostPreview baseText={post.baseText} targets={post.targets} media={postMedia} accounts={accounts.data ?? []} />
          {post.tags.length > 0 && (
            <div className="card card__body row">
              <span className="xs muted">Etiquetas internas:</span>
              {post.tags.map((t) => <span key={t} className="badge badge--plain">#{t}</span>)}
            </div>
          )}
        </aside>
      </div>

      <div className="action-bar">
        <div className="action-bar__status">
          Creada por {userName(post.createdBy)}
        </div>
        <PostActions post={post} accounts={accounts.data ?? []} onChanged={() => void detail.reload()} />
      </div>

      {confirmDelete && (
        <Confirm title="Eliminar publicación" confirmLabel="Eliminar" danger onClose={() => setConfirmDelete(false)} onConfirm={async () => {
          await api.del(`/posts/${post.id}`);
          toast('Publicación eliminada.');
          nav('/publicaciones');
        }}>
          Se eliminará “{post.internalTitle}” y su historial. No se puede deshacer.
        </Confirm>
      )}
    </>
  );
}
