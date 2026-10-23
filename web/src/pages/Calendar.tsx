import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { api, ApiError } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { dayKey, fmtTime, partsInTz } from '../lib/format.ts';
import { Button, EmptyState, ErrorState, Loading, NetIcon, PageHeader, StatusBadge } from '../components/ui.tsx';
import { STATUS_LABELS } from '../../../shared/workflow.ts';
import type { Post, PostStatus } from '../../../shared/types.ts';

const ZONES = ['America/Mexico_City', 'America/Monterrey', 'America/Cancun', 'America/Tijuana', 'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/New_York', 'America/Los_Angeles', 'Europe/Madrid', 'UTC'];
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function CalendarPage() {
  const s = useSession();
  const toast = useToast();
  const tz = s.settings.timezone;
  const today = partsInTz(new Date(), tz);
  const [ym, setYm] = useState({ y: today.y, m: today.m });
  const [hidden, setHidden] = useState<PostStatus[]>(['cancelled']);
  const posts = useApi<Post[]>('/posts');

  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts.data ?? []) {
      if (!p.plannedAt || hidden.includes(p.status)) continue;
      const k = dayKey(p.plannedAt, tz);
      map.set(k, [...(map.get(k) ?? []), p].sort((a, b) => a.plannedAt!.localeCompare(b.plannedAt!)));
    }
    return map;
  }, [posts.data, tz, hidden]);

  const first = new Date(Date.UTC(ym.y, ym.m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const days = Array.from({ length: cells }, (_, i) => {
    const d = new Date(Date.UTC(ym.y, ym.m - 1, 1 - lead + i));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  });
  const key = (x: { y: number; m: number; d: number }) => `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
  const monthLabel = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
  const move = (delta: number) => setYm(({ y, m }) => { const d = new Date(Date.UTC(y, m - 1 + delta, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }; });
  const monthDays = days.filter((x) => x.m === ym.m && byDay.has(key(x)));
  const noDate = (posts.data ?? []).filter((p) => !p.plannedAt && !hidden.includes(p.status)).length;

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Fechas previstas y programadas. Los borradores con fecha prevista también aparecen aquí."
        actions={
          <div className="row">
            <label className="small muted" htmlFor="tz">Zona horaria</label>
            <select
              id="tz"
              className="select"
              style={{ width: 'auto' }}
              value={tz}
              disabled={!s.can('team.manage')}
              title={!s.can('team.manage') ? 'Sólo administración puede cambiarla' : undefined}
              onChange={async (e) => {
                try {
                  await api.patch('/settings', { timezone: e.target.value });
                  await s.refresh();
                  toast('Zona horaria actualizada.');
                } catch (err) {
                  toast(err instanceof ApiError ? err.message : 'Error', 'error');
                }
              }}
            >
              {[...new Set([tz, ...ZONES])].map((z) => <option key={z}>{z}</option>)}
            </select>
          </div>
        }
      />

      <div className="card cal-wrap">
        <div className="card__head">
          <div className="row">
            <Button size="sm" variant="ghost" aria-label="Mes anterior" icon={<ChevronLeft />} onClick={() => move(-1)} />
            <h2 style={{ textTransform: 'capitalize', minWidth: 170, textAlign: 'center' }} aria-live="polite">{monthLabel}</h2>
            <Button size="sm" variant="ghost" aria-label="Mes siguiente" icon={<ChevronRight />} onClick={() => move(1)} />
            <Button size="sm" onClick={() => setYm({ y: today.y, m: today.m })}>Hoy</Button>
          </div>
          <div className="row" role="group" aria-label="Mostrar estados">
            {(['draft', 'in_review', 'approved', 'scheduled', 'published', 'failed', 'cancelled'] as PostStatus[]).map((st) => (
              <label key={st} className="check small" style={{ padding: 0 }}>
                <input type="checkbox" checked={!hidden.includes(st)} onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((x) => x !== st) : [...h, st]))} />
                <span>{STATUS_LABELS[st]}</span>
              </label>
            ))}
          </div>
        </div>

        {posts.loading && !posts.data ? (
          <Loading />
        ) : posts.error ? (
          <ErrorState message={posts.error.message} onRetry={posts.reload} />
        ) : (
          <>
            <div className="cal" role="grid" aria-label={`Calendario de ${monthLabel}`}>
              {DOW.map((d) => <div key={d} className="cal__dow" role="columnheader">{d}</div>)}
              {days.map((x) => {
                const k = key(x);
                const items = byDay.get(k) ?? [];
                const isToday = x.y === today.y && x.m === today.m && x.d === today.d;
                return (
                  <div key={k} role="gridcell" className={`cal__day ${x.m !== ym.m ? 'cal__day--out' : ''} ${isToday ? 'cal__day--today' : ''}`}>
                    <span className="cal__num">{x.d}</span>
                    {items.slice(0, 3).map((p) => (
                      <Link key={p.id} to={`/publicaciones/${p.id}`} className={`cal__event cal__event--${p.status}`} title={`${p.internalTitle} · ${STATUS_LABELS[p.status]}`}>
                        <span className="cal__time">{fmtTime(p.plannedAt!, tz)}</span>
                        <span>{p.internalTitle}</span>
                      </Link>
                    ))}
                    {items.length > 3 && <span className="xs muted">+{items.length - 3} más</span>}
                  </div>
                );
              })}
            </div>
            <div className="agenda list">
              {monthDays.length === 0 ? (
                <EmptyState compact title="Nada previsto este mes">Asigna una fecha prevista al redactar para verla aquí.</EmptyState>
              ) : (
                monthDays.map((x) => (
                  <div key={key(x)}>
                    <div className="list-item small" style={{ minHeight: 36, background: 'var(--c-surface-2)', fontWeight: 600, textTransform: 'capitalize' }}>
                      {new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(x.y, x.m - 1, x.d)))}
                    </div>
                    {byDay.get(key(x))!.map((p) => (
                      <Link key={p.id} to={`/publicaciones/${p.id}`} className="list-item">
                        <span className="mono small muted">{fmtTime(p.plannedAt!, tz)}</span>
                        <div className="grow">
                          <div className="list-item__title truncate">{p.internalTitle}</div>
                          <div className="row" style={{ gap: 3, marginTop: 4 }}>{p.targets.map((t) => <NetIcon key={t.id} network={t.network} size="sm" />)}</div>
                        </div>
                        <StatusBadge status={p.status} simulated={p.simulated} />
                      </Link>
                    ))}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
      {noDate > 0 && (
        <p className="small muted">
          {noDate} publicación(es) sin fecha no aparecen en el calendario. <Link to="/publicaciones">Ver en Publicaciones</Link>
        </p>
      )}
    </>
  );
}
