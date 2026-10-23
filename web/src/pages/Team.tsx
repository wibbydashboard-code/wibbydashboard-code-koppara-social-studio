import { useState } from 'react';
import { Check, Minus, UserPlus } from 'lucide-react';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { api, ApiError } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { fmtDateTime } from '../lib/format.ts';
import { Button, DemoBadge, Field, Modal, Notice, PageHeader } from '../components/ui.tsx';
import { can, ROLE_DESCRIPTIONS, ROLE_LABELS, type Permission } from '../../../shared/workflow.ts';
import type { CreditEntry, Role } from '../../../shared/types.ts';

const ROLES: Role[] = ['owner', 'admin', 'publisher', 'editor', 'viewer'];
const PERMS: [Permission, string][] = [
  ['post.edit', 'Redactar y editar'], ['post.submit', 'Enviar a revisión'], ['post.approve', 'Aprobar o devolver'],
  ['post.schedule', 'Programar'], ['post.publish', 'Publicar'], ['brand.edit', 'Editar marcas'], ['account.manage', 'Gestionar cuentas'],
  ['team.manage', 'Gestionar equipo'], ['plan.manage', 'Plan y créditos'],
];

export function TeamPage() {
  const s = useSession();
  const toast = useToast();
  const credits = useApi<{ balance: number; entries: CreditEntry[] }>('/credits');
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'editor' as Role });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const manage = s.can('team.manage');
  const userName = (id: string) => s.users.find((u) => u.id === id)?.name ?? '—';

  return (
    <>
      <PageHeader eyebrow="Espacio de trabajo" title="Equipo y plan" description="Roles, permisos de aprobación y libro de créditos." />

      <section className="card">
        <div className="card__head">
          <h2>Equipo</h2>
          {manage && <Button size="sm" icon={<UserPlus />} onClick={() => { setForm({ name: '', email: '', role: 'editor' }); setErrors({}); setInviting(true); }}>Añadir persona</Button>}
        </div>
        <div className="list">
          {s.users.map((u) => (
            <div key={u.id} className="list-item">
              <span className="phone__avatar" aria-hidden>{u.name.slice(0, 1)}</span>
              <div className="grow">
                <div className="list-item__title row" style={{ gap: 6 }}>{u.name} {u.isDemo && <DemoBadge label="Prueba" />}</div>
                <div className="list-item__meta truncate">{u.email}</div>
              </div>
              <label className="sr-only" htmlFor={`role-${u.id}`}>Rol de {u.name}</label>
              <select
                id={`role-${u.id}`}
                className="select"
                style={{ width: 'auto' }}
                value={u.role}
                disabled={!manage || (u.role === 'owner' && s.user.role !== 'owner')}
                onChange={async (e) => {
                  try {
                    await api.patch(`/users/${u.id}`, { role: e.target.value });
                    await s.refresh();
                    toast('Rol actualizado.');
                  } catch (err) {
                    toast(err instanceof ApiError ? err.message : 'Error', 'error');
                  }
                }}
              >
                {ROLES.map((r) => <option key={r} value={r} disabled={r === 'owner' && s.user.role !== 'owner'}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card__head"><h2>Permisos por rol</h2></div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)', minWidth: 620 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 20px', fontWeight: 600 }}>Acción</th>
                {ROLES.map((r) => <th key={r} style={{ padding: 10, fontWeight: 600 }} title={ROLE_DESCRIPTIONS[r]}>{ROLE_LABELS[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERMS.map(([p, label]) => (
                <tr key={p} style={{ borderTop: '1px solid var(--c-line)' }}>
                  <td style={{ padding: '8px 20px' }}>{label}</td>
                  {ROLES.map((r) => (
                    <td key={r} style={{ textAlign: 'center', padding: 8 }}>
                      {can(r, p) ? <Check size={16} aria-label="Sí" style={{ color: 'var(--c-ok)' }} /> : <Minus size={16} aria-label="No" style={{ color: '#a6aca7' }} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card__body" style={{ borderTop: '1px solid var(--c-line)' }}>
          <label className="check">
            <input
              type="checkbox"
              checked={s.settings.requireDifferentApprover}
              disabled={!manage}
              onChange={async (e) => {
                await api.patch('/settings', { requireDifferentApprover: e.target.checked });
                await s.refresh();
                toast('Regla de aprobación actualizada.');
              }}
            />
            <span className="check__text">
              Exigir que apruebe una persona distinta a quien redactó
              <span className="check__hint">Recomendado. Evita que una misma persona redacte y apruebe su propio contenido.</span>
            </span>
          </label>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card card__body stack-sm">
          <h2 style={{ fontSize: 'var(--fs-xl)' }}>Plan</h2>
          <p className="small muted">{s.settings.planName}</p>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <span className="stat__value mono">{credits.data?.balance ?? '—'}</span>
            <span className="small muted">créditos disponibles · {s.settings.monthlyCredits}/mes asignados</span>
          </div>
          <Notice>Sin facturación ni compras: los créditos son un control interno de uso. Proveedor de texto actual: <strong>{s.ai.label}</strong>.</Notice>
        </div>
        <div className="card card__body stack-sm">
          <h2 style={{ fontSize: 'var(--fs-xl)' }}>Costos de referencia</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Plantillas locales (sin IA): 0 créditos.</li>
            <li>Texto con IA: 1 crédito por opción generada.</li>
            <li>Maquetas del estudio: 0 créditos (no usan IA).</li>
          </ul>
          <span className="xs muted">El costo exacto se muestra antes de cada generación.</span>
        </div>
      </section>

      <section className="card">
        <div className="card__head"><h2>Libro de créditos</h2></div>
        <div className="list">
          {(credits.data?.entries ?? []).map((e) => (
            <div key={e.id} className="list-item">
              <div className="grow">
                <div className="small" style={{ fontWeight: 550 }}>{e.description}</div>
                <div className="xs muted">{fmtDateTime(e.at, s.settings.timezone)} · {userName(e.userId)} · {e.provider}</div>
              </div>
              <span className="mono small" style={{ color: e.credits < 0 ? 'var(--c-danger)' : e.credits > 0 ? 'var(--c-ok)' : 'var(--c-ink-3)' }}>
                {e.credits > 0 ? '+' : ''}{e.credits}
              </span>
              <span className="mono xs muted" style={{ minWidth: 60, textAlign: 'right' }}>= {e.balanceAfter}</span>
            </div>
          ))}
        </div>
      </section>

      {inviting && (
        <Modal
          title="Añadir persona al equipo"
          onClose={() => setInviting(false)}
          footer={
            <>
              <Button onClick={() => setInviting(false)}>Cancelar</Button>
              <Button variant="primary" loading={busy} onClick={async () => {
                setBusy(true);
                try {
                  await api.post('/users', form);
                  await s.refresh();
                  toast('Persona añadida.');
                  setInviting(false);
                } catch (e) {
                  if (e instanceof ApiError) { setErrors(e.fields); toast(e.message, 'error'); }
                } finally { setBusy(false); }
              }}>Añadir</Button>
            </>
          }
        >
          <Notice>No se envía ninguna invitación por correo: el inicio de sesión real aún no existe.</Notice>
          <Field label="Nombre" error={errors.name} required>{(fid) => <input id={fid} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="Correo" error={errors.email} required>{(fid) => <input id={fid} className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
          <Field label="Rol" hint={ROLE_DESCRIPTIONS[form.role]}>
            {(fid, d) => (
              <select id={fid} aria-describedby={d} className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            )}
          </Field>
        </Modal>
      )}
    </>
  );
}
