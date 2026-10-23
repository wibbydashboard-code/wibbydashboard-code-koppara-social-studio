import { useState } from 'react';
import { Lock, Trash2, ExternalLink, Link2, CheckCircle2 } from 'lucide-react';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { api, ApiError } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { Button, Confirm, ErrorState, Loading, Modal, NetIcon, Notice, PageHeader } from '../components/ui.tsx';
import { NETWORKS, PLATFORMS } from '../../../shared/platforms.ts';
import type { Brand, Network, SocialAccount } from '../../../shared/types.ts';

interface Integrations {
  adapters: { network: Network; enabled: boolean; implemented: boolean; configured: boolean; reason: string; requiredEnv: string[]; docsUrl: string }[];
  secretsStorage: boolean;
  configStatus?: { metaConfigured: boolean };
}

export function AccountsPage() {
  const s = useSession();
  const toast = useToast();
  const accounts = useApi<SocialAccount[]>('/accounts');
  const brands = useApi<Brand[]>('/brands');
  const integ = useApi<Integrations>('/integrations');
  const [connecting, setConnecting] = useState(false);
  const [info, setInfo] = useState<Network | null>(null);
  const [removing, setRemoving] = useState<SocialAccount | null>(null);
  const manage = s.can('account.manage');

  if ((accounts.loading && !accounts.data) || (integ.loading && !integ.data)) return <Loading />;
  if (accounts.error) return <ErrorState message={accounts.error.message} onRetry={accounts.reload} />;

  const byNet = (n: Network) => (accounts.data ?? []).filter((a) => a.network === n);
  const status = (n: Network) => integ.data?.adapters.find((a) => a.network === n);

  async function handleConnectMeta() {
    setConnecting(true);
    try {
      const res = await api.post<{ url: string }>('/integrations/facebook/auth-url');
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'No se pudo iniciar la conexión con Meta.', 'error');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Cuentas oficiales"
        description="Destinos de publicación para Koppara. Conecta las cuentas oficiales mediante Meta Graph API para publicar y programar directamente."
      />

      <Notice kind="info" title="Conexión oficial de redes sociales.">
        Para publicar en redes reales, cada plataforma requiere permisos y credenciales de aplicación oficiales. Las cuentas de Instagram y Facebook se conectan a través de Meta for Developers mediante OAuth seguro con cifrado AES-256-GCM. Si faltan credenciales en el entorno, la red permanece como <strong>Pendiente de conectar</strong>.
      </Notice>

      <div className="grid grid-auto">
        {NETWORKS.map((n) => {
          const p = PLATFORMS[n];
          const list = byNet(n);
          const st = status(n);
          const isMeta = n === 'facebook' || n === 'instagram';

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
                  {list.length > 0 ? (
                    <span className="badge badge--active" title="Cuenta conectada">
                      <CheckCircle2 size={11} aria-hidden /> Conectada
                    </span>
                  ) : st?.configured ? (
                    <span className="badge badge--pending" title={st.reason}>
                      Pendiente de conectar
                    </span>
                  ) : (
                    <span className="badge badge--plain" title={st?.reason}>
                      <Lock size={11} aria-hidden /> Pendiente de configurar
                    </span>
                  )}
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
                            <span className="badge badge--active">Oficial</span>
                            {manage && <Button size="sm" variant="ghost" aria-label={`Desconectar ${a.handle}`} icon={<Trash2 />} onClick={() => setRemoving(a)} />}
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
                  <p className="small muted">
                    {isMeta
                      ? st?.configured
                        ? 'Credenciales de Meta configuradas. Pendiente de iniciar sesión con Meta para conectar la cuenta oficial.'
                        : 'Faltan credenciales de Meta en el archivo .env.'
                      : `Integración oficial con ${p.label} pendiente de credenciales en .env.`}
                  </p>
                )}
              </div>

              <div className="card__head" style={{ borderBottom: 0, borderTop: '1px solid var(--c-line)' }}>
                <Button size="sm" variant="ghost" onClick={() => setInfo(n)}>
                  Requisitos
                </Button>
                {manage && list.length === 0 && (
                  isMeta ? (
                    st?.configured ? (
                      <Button size="sm" variant="primary" icon={<Link2 />} loading={connecting} onClick={handleConnectMeta}>
                        Conectar con Meta
                      </Button>
                    ) : (
                      <Button size="sm" icon={<Lock />} onClick={() => setInfo(n)}>
                        Configurar en .env
                      </Button>
                    )
                  ) : (
                    <Button size="sm" disabled icon={<Lock />} title={st?.reason}>
                      No configurada
                    </Button>
                  )
                )}
              </div>
            </article>
          );
        })}
      </div>

      {info && (
        <Modal
          title={`Requisitos oficiales: ${PLATFORMS[info].label}`}
          onClose={() => setInfo(null)}
          footer={<Button onClick={() => setInfo(null)}>Entendido</Button>}
        >
          <div className="stack">
            <p className="small">
              Para vincular <strong>{PLATFORMS[info].label}</strong> con Koppara Social Studio y publicar contenido real, se requiere configurar las credenciales oficiales de la plataforma:
            </p>

            <div className="card card__body" style={{ background: 'var(--c-surface-2)' }}>
              <strong>Variables en archivo .env:</strong>
              <ul style={{ margin: '8px 0 0 16px', fontSize: 'var(--fs-sm)' }}>
                {status(info)?.requiredEnv.map((v) => (
                  <li key={v}><code>{v}</code></li>
                ))}
              </ul>
            </div>

            <p className="small muted">
              {status(info)?.reason}
            </p>

            {status(info)?.docsUrl && (
              <a
                href={status(info)!.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn--ghost small row"
                style={{ alignSelf: 'flex-start', textDecoration: 'none', gap: 6 }}
              >
                <span>Documentación oficial de {PLATFORMS[info].label}</span>
                <ExternalLink size={14} aria-hidden />
              </a>
            )}
          </div>
        </Modal>
      )}

      {removing && (
        <Confirm
          title="Desconectar cuenta"
          confirmLabel="Desconectar"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await api.del(`/accounts/${removing.id}`);
              toast('Cuenta desconectada.');
              void accounts.reload();
            } catch (e) {
              toast(e instanceof ApiError ? e.message : 'Error al desconectar', 'error');
            }
          }}
        >
          Se desconectará la cuenta <strong>{removing.handle}</strong> de Koppara Social Studio. Para volver a publicar en ella, deberás realizar nuevamente el flujo de conexión.
        </Confirm>
      )}
    </>
  );
}
