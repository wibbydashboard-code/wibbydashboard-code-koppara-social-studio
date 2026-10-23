import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Plus, ArchiveRestore } from 'lucide-react';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { api } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { Button, DemoBadge, EmptyState, ErrorState, Loading, PageHeader, Segmented } from '../components/ui.tsx';
import type { Brand } from '../../../shared/types.ts';

const STATUS_TEXT = { draft: 'Borrador', active: 'Activa', archived: 'Archivada' } as const;

export function BrandCard({ b }: { b: Brand }) {
  const colors = b.kit.palette.length ? b.kit.palette : [];
  return (
    <Link to={`/marcas/${b.id}`} className="card card--interactive" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}>
      <div className="card__body stack-sm" style={{ flex: 1 }}>
        <div className="row-between">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xl)', fontWeight: 560 }}>{b.name}</h3>
          <span className={`badge badge--${b.status}`}>{STATUS_TEXT[b.status]}</span>
        </div>
        <p className="small muted" style={{ minHeight: 40 }}>
          {b.description || 'Sin descripción todavía.'}
        </p>
        <div className="row">
          {b.pendingFields.length > 0 && <span className="badge badge--pending">{b.pendingFields.length} datos por confirmar</span>}
          {b.isDemo && <DemoBadge />}
        </div>
      </div>
      <div className="card__head" style={{ borderBottom: 0, borderTop: '1px solid var(--c-line)' }}>
        <div className="swatches" aria-label="Paleta">
          {colors.length ? colors.slice(0, 6).map((c) => <span key={c} className="swatch" style={{ background: c, width: 20, height: 20 }} />) : <span className="xs muted">Sin paleta</span>}
        </div>
        <span className="xs muted">{b.pillars.length === 1 ? '1 pilar' : `${b.pillars.length} pilares`}</span>
      </div>
    </Link>
  );
}

export function BrandsPage() {
  const s = useSession();
  const toast = useToast();
  const [view, setView] = useState<'current' | 'archived'>('current');
  const { data, error, loading, reload } = useApi<Brand[]>('/brands?archived=1');

  const list = (data ?? []).filter((b) => (view === 'archived' ? b.status === 'archived' : b.status !== 'archived'));

  return (
    <>
      <PageHeader
        title="Marcas"
        description="Cada marca guarda su voz, reglas, pilares y kit visual. Las publicaciones se redactan dentro de una marca."
        actions={
          s.can('brand.edit') && (
            <Link to="/marcas/nueva" className="btn btn--primary">
              <Plus aria-hidden /> Nueva marca
            </Link>
          )
        }
      />
      <Segmented
        label="Filtrar marcas"
        value={view}
        onChange={setView}
        options={[
          { id: 'current', label: 'Activas y borradores' },
          { id: 'archived', label: 'Archivadas' },
        ]}
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState
            title={view === 'archived' ? 'No hay marcas archivadas' : 'Todavía no hay marcas'}
            action={
              view === 'current' &&
              s.can('brand.edit') && (
                <Link to="/marcas/nueva" className="btn btn--primary">
                  <Plus aria-hidden /> Crear marca
                </Link>
              )
            }
          >
            {view === 'archived' ? 'Las marcas archivadas aparecerán aquí y podrás restaurarlas.' : 'Crea un perfil con su voz, audiencia y reglas para redactar con coherencia.'}
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-auto">
          {list.map((b) =>
            b.status === 'archived' ? (
              <div key={b.id} className="stack-sm">
                <BrandCard b={b} />
                {s.can('brand.archive') && (
                  <Button
                    size="sm"
                    icon={<ArchiveRestore />}
                    onClick={async () => {
                      await api.post(`/brands/${b.id}/archive`, { archived: false });
                      toast('Marca restaurada como borrador.');
                      void reload();
                    }}
                  >
                    Restaurar
                  </Button>
                )}
              </div>
            ) : (
              <BrandCard key={b.id} b={b} />
            ),
          )}
        </div>
      )}
    </>
  );
}
