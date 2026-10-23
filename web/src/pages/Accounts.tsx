import { useState } from 'react';
import { FlaskConical, Lock, Plus, Trash2, ExternalLink } from 'lucide-react';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { api, ApiError } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { Button, Confirm, DemoBadge, ErrorState, Field, Loading, Modal, NetIcon, Notice, PageHeader } from '../components/ui.tsx';
import { NETWORKS, PLATFORMS } from '../../../shared/platforms.ts';
import type { Brand, Network, SocialAccount } from '../../../shared/types.ts';

interface Integrations {
  adapters: { network: Network; enabled: boolean; implemented: boolean; configured: boolean; reason: string; requiredEnv: string[]; docsUrl: string }[];
  secretsStorage: boolean;
}

export function AccountsPage() {
  const s = useSession();
  const toast = useToast();
  const accounts = useApi<SocialAccount[]>('/accounts');
  const brands = useApi<Brand[]>('/brands');
  const integ = useApi<Integrations>('/integrations');
  const [adding, setAdding] = useState<Network | null>(null);
  const [handle, setHandle] = useState('');
  const [brandId, setBrandId] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<Network | null>(null);
  const [removing, setRemoving] = useState<SocialAccount | null>(null);
  const manage = s.can('account.manage');

  if ((accounts.loading && !accounts.data) || (integ.loading && !integ.data)) return <Loading />;
  if (accounts.error) return <ErrorState message={accounts.error.message} onRetry={accounts.reload} />;

  const byNet = (n: Network) => (accounts.data ?? []).filter((a) => a.network === n);
  const status = (n: Network) => integ.data?.adapters.find((a) => a.network === n);

  return (
    <>
      <PageHeader
        title="Cuentas"
        description="Destinos donde se preparan publicaciones. Por ahora sólo hay cuentas simuladas: ninguna integración real está activa."
      />
      <Notice kind="demo" title="Modo demostración.">
        Las cuentas que añadas aquí son simuladas. No se conectan a ninguna red, no reciben publicaciones y siempre llevan la etiqueta “Simulada”.
      </Notice>

      <div className="grid grid-auto">
        {NETWORKS.map((n) => {
          const p = PLATFORMS[n];
          const list = byNet(n);
          return (
            <article key={n} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card__body stack-sm" style={{ flex: 1 }}>
                <div className="row-between" style={{ flexWrap: 'nowrap' }}>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <NetIcon network={n} size="lg" />
                    <div>
                      <h3>{p.label}</h3>
                      <span className="xs muted">{p.formats.map((f) => f.label).join(' · ')}</span>
                    </div>
                  </div>
                  <span className="badge badge--plain" title={status(n)?.reason}>
                    <Lock size={11} aria-hidden /> No conectada
                  </span>
                </div>

                {list.length > 0 ? (
                  <ul className="stack-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {list.map((a) => (
                      <li key={a.id} className="card" style={{ padding: 10, boxShadow: 'none', background: 'var(--c-surface-2)' }}>
                        <div className="row-between" style={{ flexWrap: 'nowrap' }}>
                          <div style={{ minWidth: 0 }}>
                            <div className="truncate" style={{ fontWeight: 600 }}>{a.handle}</div>
                            <div className="xs muted truncate">{a.accountType}</div>
                          </div>
                          <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                            <DemoBadge label="Simulada" />
                            {manage && <Button size="sm" variant="ghost" aria-label={`Eliminar ${a.handle}`} icon={<Trash2 />} onClick={() => setRemoving(a)} />}
                          </div>
                        </div>
                        <label className="xs muted" htmlFor={`brand-${a.id}`} style={{ display: 'block', marginTop: 8 }}>
                          Marca asignada
                        </label>
                        <select
                          id={`brand-${a.id}`}
                          className="select"
                          style={{ minHeight: 34, paddingTop: 4, paddingBottom: 4, fontSize: 'var(--fs-sm)' }}
                          value={a.brandId ?? ''}
                          disabled={!manage}
                          onChange={async (e) => {
                            try {
                              await api.patch(`/accounts/${a.id}`, { brandId: e.target.value || null });
                              toast('Marca asignada.');
                              void accounts.reload();
                            } catch (err) {
                              toast(err instanceof ApiError ? err.message : 'Error', 'error');
                            }
                          }}
                        >
                          <option value="">Sin asignar</option>
                          {(brands.data ?? []).map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">Sin cuentas todavía.</p>
                )}
              </div>
              <div className="card__head" style={{ borderBottom: 0, borderTop: '1px solid var(--c-line)' }}>
                <Button size="sm" variant="ghost" onClick={() => setInfo(n)}>
                  Requisitos
                </Button>
                {manage && (
                  <Button size="sm" icon={<FlaskConical />} onClick={() => { setAdding(n); setHandle(''); setBrandId(brands.data?.[0]?.id ?? ''); }}>
                    Añadir simulada
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {adding && (
        <Modal
          title={`Cuenta simulada de ${PLATFORMS[adding].label}`}
          onClose={() => setAdding(null)}
          footer={
            <>
              <Button onClick={() => setAdding(null)}>Cancelar</Button>
              <Button
                variant="primary"
                icon={<Plus />}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.post('/accounts/demo', { network: adding, handle, brandId: brandId || null });
                    toast('Cuenta simulada añadida.');
                    setAdding(null);
                    void accounts.reload();
                  } catch (e) {
                    toast(e instanceof ApiError ? e.message : 'Error', 'error');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Añadir
              </Button>
            </>
          }
        >
          <Notice kind="demo">Sirve para practicar el flujo. No se pedirá ningún permiso a {PLATFORMS[adding].label} ni se enviará contenido.</Notice>
          <Field label="Nombre de usuario de prueba" hint="Sólo para identificarla dentro de la app.">
            {(fid, d) => <input id={fid} aria-describedby={d} className="input" value={handle} placeholder={`@demo.${adding}`} onChange={(e) => setHandle(e.target.value)} />}
          </Field>
          <Field label="Marca">
            {(fid) => (
              <select id={fid} className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">Sin asignar</option>
                {(brands.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </Field>
        </Modal>
      )}

      {info && (
        <Modal title={`Requisitos de ${PLATFORMS[info].label}`} onClose={() => setInfo(null)} footer={<Button onClick={() => setInfo(null)}>Cerrar</Button>}>
          <ul className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
            {PLATFORMS[info].requirements.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <div className="stack-sm">
            <strong className="small">Formatos y límites de referencia</strong>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Texto: hasta {PLATFORMS[info].textLimit.toLocaleString('es-MX')} caracteres{PLATFORMS[info].titleLimit ? `; título hasta ${PLATFORMS[info].titleLimit}` : ''}.</li>
              {PLATFORMS[info].formats.map((f) => (
                <li key={f.id}>
                  {f.label}: {f.minMedia === f.maxMedia ? f.maxMedia : `${f.minMedia}–${f.maxMedia}`} archivo(s)
                  {f.allowImages && f.allowVideo ? ', imagen o video' : f.allowVideo ? ', sólo video' : ', sólo imágenes'}
                  {f.maxVideoSec ? `, video ≤ ${f.maxVideoSec} s` : ''}.
                </li>
              ))}
            </ul>
            <span className="xs muted">Valores de referencia: verifícalos con la documentación oficial al activar la integración.</span>
          </div>
          <Notice kind="warn" title="Integración real pendiente.">
            {status(info)?.reason} Variables necesarias: <code>{status(info)?.requiredEnv.join(', ')}</code>.
          </Notice>
          {status(info)?.docsUrl && (
            <a href={status(info)!.docsUrl} target="_blank" rel="noreferrer noopener" className="small row" style={{ gap: 4 }}>
              Documentación oficial <ExternalLink size={13} aria-hidden />
            </a>
          )}
          <Button disabled icon={<Lock />} title="Desactivado hasta implementar y autorizar la integración">
            Conectar con {PLATFORMS[info].label} (no disponible)
          </Button>
        </Modal>
      )}

      {removing && (
        <Confirm title="Eliminar cuenta simulada" confirmLabel="Eliminar" danger onClose={() => setRemoving(null)} onConfirm={async () => {
          try {
            await api.del(`/accounts/${removing.id}`);
            toast('Cuenta eliminada.');
            void accounts.reload();
          } catch (e) {
            toast(e instanceof ApiError ? e.message : 'Error', 'error');
          }
        }}>
          Se eliminará {removing.handle}. No afecta a ninguna cuenta real.
        </Confirm>
      )}
    </>
  );
}
