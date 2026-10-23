import { Link, useSearchParams } from 'react-router-dom';
import { PenLine, Search } from 'lucide-react';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { fmtDateTime } from '../lib/format.ts';
import { DemoBadge, EmptyState, ErrorState, Loading, NetIcon, PageHeader, StatusBadge } from '../components/ui.tsx';
import { STATUS_LABELS } from '../../../shared/workflow.ts';
import type { Brand, Post, PostStatus } from '../../../shared/types.ts';

export function PostsPage() {
  const s = useSession();
  const [q, setQ] = useSearchParams();
  const posts = useApi<Post[]>('/posts');
  const brands = useApi<Brand[]>('/brands?archived=1');

  const status = q.get('estado') ?? '';
  const brandId = q.get('marca') ?? '';
  const tag = q.get('etiqueta') ?? '';
  const text = q.get('q') ?? '';
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(q);
    if (v) n.set(k, v);
    else n.delete(k);
    setQ(n, { replace: true });
  };

  const all = posts.data ?? [];
  const tags = [...new Set(all.flatMap((p) => p.tags))].sort();
  const list = all.filter(
    (p) =>
      (!status || p.status === status) &&
      (!brandId || p.brandId === brandId) &&
      (!tag || p.tags.includes(tag)) &&
      (!text || `${p.internalTitle} ${p.baseText}`.toLowerCase().includes(text.toLowerCase())),
  );
  const brandName = (id: string) => brands.data?.find((b) => b.id === id)?.name ?? '—';
  const filtered = Boolean(status || brandId || tag || text);

  return (
    <>
      <PageHeader
        title="Publicaciones"
        description="Todo el contenido, de borrador a publicado. Filtra por estado, marca o etiqueta."
        actions={
          s.can('post.edit') && (
            <Link to="/crear" className="btn btn--primary">
              <PenLine aria-hidden /> Nueva
            </Link>
          )
        }
      />
      <div className="toolbar" role="search">
        <label className="sr-only" htmlFor="f-q">Buscar</label>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={16} aria-hidden style={{ position: 'absolute', left: 12, top: 12, color: 'var(--c-ink-3)' }} />
          <input id="f-q" className="input" style={{ paddingLeft: 36, width: '100%' }} placeholder="Buscar por título o texto" value={text} onChange={(e) => setParam('q', e.target.value)} />
        </div>
        <label className="sr-only" htmlFor="f-status">Estado</label>
        <select id="f-status" className="select" value={status} onChange={(e) => setParam('estado', e.target.value)}>
          <option value="">Todos los estados</option>
          {(Object.keys(STATUS_LABELS) as PostStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABELS[k]}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-brand">Marca</label>
        <select id="f-brand" className="select" value={brandId} onChange={(e) => setParam('marca', e.target.value)}>
          <option value="">Todas las marcas</option>
          {(brands.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-tag">Etiqueta</label>
        <select id="f-tag" className="select" value={tag} onChange={(e) => setParam('etiqueta', e.target.value)}>
          <option value="">Todas las etiquetas</option>
          {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
      </div>

      {posts.loading && !posts.data ? (
        <Loading />
      ) : posts.error ? (
        <ErrorState message={posts.error.message} onRetry={posts.reload} />
      ) : (
        <div className="card">
          {list.length === 0 ? (
            <EmptyState
              title={filtered ? 'Nada coincide con los filtros' : 'Aún no hay publicaciones'}
              action={filtered ? <button className="btn" onClick={() => setQ(new URLSearchParams(), { replace: true })}>Quitar filtros</button> : s.can('post.edit') && <Link to="/crear" className="btn btn--primary">Crear publicación</Link>}
            >
              {filtered ? 'Prueba con otro estado, marca o etiqueta.' : 'Los borradores que guardes aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="list">
              <div className="list-item small muted" style={{ minHeight: 40 }} aria-hidden>
                <span className="grow">{list.length} publicación(es)</span>
              </div>
              {list.map((p) => (
                <Link key={p.id} to={`/publicaciones/${p.id}`} className="list-item">
                  <div className="grow">
                    <div className="list-item__title truncate">{p.internalTitle}</div>
                    <div className="list-item__meta truncate">{p.baseText || <em>Sin texto base</em>}</div>
                    <div className="row xs muted" style={{ marginTop: 4, gap: 6 }}>
                      <span>{brandName(p.brandId)}</span>
                      <span aria-hidden>·</span>
                      <span>{fmtDateTime(p.plannedAt, s.settings.timezone)}</span>
                      {p.tags.map((t) => <span key={t} className="badge badge--plain">#{t}</span>)}
                    </div>
                  </div>
                  <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
                    <div className="row" style={{ gap: 4 }}>
                      <StatusBadge status={p.status} simulated={p.simulated} />
                      {p.isDemo && <DemoBadge />}
                    </div>
                    <div className="row" style={{ gap: 3 }}>
                      {p.targets.map((t) => <NetIcon key={t.id} network={t.network} size="sm" />)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
