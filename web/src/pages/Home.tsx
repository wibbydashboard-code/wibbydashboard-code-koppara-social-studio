import { Link } from 'react-router-dom';
import { CalendarDays, Check, Image, Leaf, Link2, PenLine, FlaskConical, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { api } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { fmtRelative } from '../lib/format.ts';
import { Button, Confirm, DemoBadge, EmptyState, ErrorState, Loading, NetIcon, StatusBadge } from '../components/ui.tsx';
import type { Brand, Post, PostStatus } from '../../../shared/types.ts';

interface Overview {
  setup: { brand: boolean; brandDraft: boolean; account: boolean; accountAssigned: boolean; post: boolean };
  counts: Partial<Record<PostStatus, number>>;
  recent: Post[];
  brands: Brand[];
  hasDemo: boolean;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function HomePage() {
  const s = useSession();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Overview>('/overview');
  const [confirmDemo, setConfirmDemo] = useState<'load' | 'remove' | null>(null);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error?.message ?? ''} onRetry={reload} />;

  const steps = [
    { done: data.setup.brandDraft, label: 'Crear el perfil de marca', to: '/marcas' },
    { done: data.setup.brand, label: 'Completar y activar la marca', to: '/marcas' },
    { done: data.setup.account, label: 'Añadir una cuenta (simulada por ahora)', to: '/cuentas' },
    { done: data.setup.accountAssigned, label: 'Asignar la cuenta a una marca', to: '/cuentas' },
    { done: data.setup.post, label: 'Redactar la primera publicación', to: '/crear' },
  ];
  const done = steps.filter((x) => x.done).length;
  const brandName = (id: string) => data.brands.find((b) => b.id === id)?.name ?? 'Marca archivada';
  const firstName = s.user.name.split(' ')[0];

  return (
    <>
      <section className="hello">
        <div className="hello__intro">
          <div className="eyebrow">{s.settings.name}</div>
          <h1>
            {greeting()}, {firstName}.
          </h1>
          <p>Prepara, revisa y organiza el contenido de tus redes en un solo lugar. Nada se publica sin aprobación humana.</p>
          <div className="stat-row" style={{ marginTop: 20 }}>
            {(['draft', 'in_review', 'approved', 'scheduled'] as PostStatus[]).map((k) => (
              <Link key={k} to={`/publicaciones?estado=${k}`} className="card card--interactive stat" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="stat__value mono">{data.counts[k] ?? 0}</div>
                <div className="stat__label">{{ draft: 'Borradores', in_review: 'En revisión', approved: 'Aprobadas', scheduled: 'Programadas' }[k as string]}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card__head">
            <h2>Configuración</h2>
            <span className="small muted mono">
              {done} de {steps.length}
            </span>
          </div>
          <div className="card__body stack-sm">
            <div className="progress" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length} aria-label="Avance de configuración">
              <span style={{ width: `${(done / steps.length) * 100}%` }} />
            </div>
            <ol className="steps">
              {steps.map((st) => (
                <li key={st.label} className={`step ${st.done ? 'step--done' : ''}`}>
                  <span className="step__dot">{st.done && <Check aria-hidden />}</span>
                  <span className="step__label grow">{st.label}</span>
                  {!st.done && (
                    <Link to={st.to} className="small">
                      Ir
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section aria-labelledby="quick-title" className="stack-sm">
        <h2 id="quick-title" className="sr-only">
          Acciones rápidas
        </h2>
        <div className="quick">
          {[
            { to: '/crear', icon: PenLine, title: 'Nueva publicación', text: 'Redacta y adapta por red.' },
            { to: '/marcas', icon: Leaf, title: 'Perfil de marca', text: 'Voz, reglas y kit visual.' },
            { to: '/calendario', icon: CalendarDays, title: 'Calendario', text: 'Lo previsto del mes.' },
            { to: '/media', icon: Image, title: 'Media', text: 'Imágenes y videos.' },
          ].map(({ to, icon: Icon, title, text }) => (
            <Link key={to} to={to} className="card card--interactive">
              <span className="quick__icon">
                <Icon aria-hidden />
              </span>
              <strong>{title}</strong>
              <span className="small muted">{text}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="recent-title">
        <div className="card__head">
          <h2 id="recent-title">Publicaciones recientes</h2>
          <Link to="/publicaciones" className="small">
            Ver todas
          </Link>
        </div>
        {data.recent.length === 0 ? (
          <EmptyState
            compact
            title="Aún no hay publicaciones"
            action={
              <Link to="/crear" className="btn btn--primary">
                <PenLine aria-hidden /> Redactar la primera
              </Link>
            }
          >
            Empieza con un borrador: puedes guardarlo aunque falten destinos o medios.
          </EmptyState>
        ) : (
          <div className="list">
            {data.recent.map((p) => (
              <Link key={p.id} to={`/publicaciones/${p.id}`} className="list-item">
                <div className="grow">
                  <div className="list-item__title truncate">{p.internalTitle}</div>
                  <div className="list-item__meta truncate">
                    {brandName(p.brandId)} · actualizada {fmtRelative(p.updatedAt)}
                  </div>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  {p.targets.slice(0, 4).map((t) => (
                    <NetIcon key={t.id} network={t.network} size="sm" />
                  ))}
                </div>
                <StatusBadge status={p.status} simulated={p.simulated} />
                {p.isDemo && <DemoBadge />}
              </Link>
            ))}
          </div>
        )}
      </section>

      {s.can('team.manage') && (
        <section className="card card__body row-between">
          <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <FlaskConical aria-hidden size={20} style={{ color: 'var(--c-demo)', flex: 'none', marginTop: 2 }} />
            <div>
              <strong>Datos de demostración</strong>
              <p className="small muted">
                Una marca ficticia, cuentas simuladas y publicaciones de ejemplo, todo etiquetado como “Demo”. No toca la ficha de Koppara.
              </p>
            </div>
          </div>
          {data.hasDemo ? (
            <Button variant="danger" size="sm" icon={<Trash2 />} onClick={() => setConfirmDemo('remove')}>
              Quitar demo
            </Button>
          ) : (
            <Button size="sm" icon={<FlaskConical />} onClick={() => setConfirmDemo('load')}>
              Cargar demo
            </Button>
          )}
        </section>
      )}

      {!data.setup.account && (
        <p className="small muted row">
          <Link2 size={14} aria-hidden /> Las integraciones reales con redes sociales todavía no están activas.
        </p>
      )}

      {confirmDemo && (
        <Confirm
          title={confirmDemo === 'load' ? 'Cargar datos de demostración' : 'Quitar datos de demostración'}
          confirmLabel={confirmDemo === 'load' ? 'Cargar' : 'Quitar'}
          danger={confirmDemo === 'remove'}
          onClose={() => setConfirmDemo(null)}
          onConfirm={async () => {
            try {
              if (confirmDemo === 'load') await api.post('/demo');
              else await api.del('/demo');
              toast(confirmDemo === 'load' ? 'Datos de demostración cargados.' : 'Datos de demostración eliminados.');
              await reload();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Error', 'error');
            }
          }}
        >
          {confirmDemo === 'load'
            ? 'Se crearán una marca ficticia, tres cuentas simuladas y tres publicaciones de ejemplo. Nada se enviará a redes sociales.'
            : 'Se eliminarán la marca ficticia, sus cuentas simuladas y sus publicaciones. Tus datos reales no se modifican.'}
        </Confirm>
      )}
    </>
  );
}
