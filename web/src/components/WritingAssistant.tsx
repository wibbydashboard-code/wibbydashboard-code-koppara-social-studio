import { useEffect, useState } from 'react';
import { Sparkles, FileText } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';
import { Button, Field, IssueList, Loading, Modal, Notice } from './ui.tsx';
import { NETWORKS, PLATFORMS } from '../../../shared/platforms.ts';
import type { Brand, Issue, Network } from '../../../shared/types.ts';

interface Estimate { provider: string; label: string; isAi: boolean; credits: number; balance: number }
interface Result { isAi: boolean; label: string; credits: number; suggestions: { text: string; issues: Issue[] }[] }

/**
 * Asistente de redacción desacoplado del proveedor. Sin clave de IA usa plantillas locales
 * y lo dice explícitamente. Todo resultado es editable y requiere aprobación humana.
 */
export function WritingAssistant({ brand, onUse, onClose }: { brand: Brand; onUse: (text: string) => void; onClose: () => void }) {
  const s = useSession();
  const [brief, setBrief] = useState('');
  const [pillar, setPillar] = useState('');
  const [network, setNetwork] = useState<Network | ''>('');
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setEstimate(null);
    if (brief.trim().length < 5) return;
    const t = setTimeout(async () => {
      try {
        setEstimate(await api.post<Estimate>('/ai/estimate', { brandId: brand.id, brief, pillar, network: network || undefined, variants: 3 }));
      } catch {
        setEstimate(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [brief, pillar, network, brand.id]);

  async function generate() {
    if (!estimate) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.post<Result>('/ai/generate', { brandId: brand.id, brief, pillar, network: network || undefined, variants: 3, confirmedCredits: estimate.credits });
      setResult(r);
      void s.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo generar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal wide title="Asistente de redacción" onClose={onClose}>
      {!s.ai.isAi && (
        <Notice kind="info" title="Sin IA configurada.">
          Se usarán plantillas locales que estructuran tu idea; no es generación con IA. Los huecos entre [corchetes] debes completarlos tú.
        </Notice>
      )}
      <Field label="¿Sobre qué quieres publicar?" hint="Describe la idea con tus palabras. No se añadirán datos de producto que no estén en la ficha.">
        {(fid, d) => <textarea id={fid} aria-describedby={d} className="textarea" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Ej.: cómo organizamos una rutina de cuidado por la mañana" />}
      </Field>
      <div className="grid grid-2">
        <Field label="Pilar">
          {(fid) => (
            <select id={fid} className="select" value={pillar} onChange={(e) => setPillar(e.target.value)}>
              <option value="">Sin pilar</option>
              {brand.pillars.map((p) => <option key={p}>{p}</option>)}
            </select>
          )}
        </Field>
        <Field label="Pensado para">
          {(fid) => (
            <select id={fid} className="select" value={network} onChange={(e) => setNetwork(e.target.value as Network | '')}>
              <option value="">General</option>
              {NETWORKS.map((n) => <option key={n} value={n}>{PLATFORMS[n].label}</option>)}
            </select>
          )}
        </Field>
      </div>

      <div className="card" style={{ padding: 12, boxShadow: 'none', background: 'var(--c-surface-2)' }}>
        <div className="row-between">
          <div className="small">
            <strong>Costo estimado: </strong>
            {estimate ? `${estimate.credits} crédito${estimate.credits === 1 ? '' : 's'}` : '—'}
            <span className="muted"> · Saldo: {estimate?.balance ?? s.ai.balance} · {estimate?.label ?? s.ai.label}</span>
          </div>
          <Button variant="primary" icon={s.ai.isAi ? <Sparkles /> : <FileText />} loading={busy} disabled={!estimate} onClick={generate}>
            {s.ai.isAi ? `Generar (${estimate?.credits ?? 0} créditos)` : 'Crear borradores con plantilla'}
          </Button>
        </div>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}
      {busy && !result && <Loading label="Preparando opciones…" />}
      {result && (
        <div className="stack-sm">
          <strong className="small">{result.isAi ? 'Opciones generadas con IA — revísalas antes de usarlas' : 'Borradores con plantilla local (sin IA)'}</strong>
          {result.suggestions.map((sug, i) => (
            <div key={i} className="card" style={{ padding: 12, boxShadow: 'none' }}>
              <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{sug.text}</p>
              <div style={{ marginTop: 8 }}>
                <IssueList issues={sug.issues} />
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <Button size="sm" onClick={() => { onUse(sug.text); onClose(); }}>
                  Usar como texto base
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
