import { useRef, useState } from 'react';
import { Upload, Trash2, Film } from 'lucide-react';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { api, ApiError } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { bytes } from '../lib/format.ts';
import { Button, Confirm, EmptyState, ErrorState, NetIcon, PageHeader, Segmented } from '../components/ui.tsx';
import { MediaThumb, uploadFile } from '../components/MediaPicker.tsx';
import { NETWORKS, PLATFORMS } from '../../../shared/platforms.ts';
import type { MediaItem, Network } from '../../../shared/types.ts';

/** Redes y formatos donde un archivo cumple tipo, tamaño, proporción y duración. */
function fits(m: MediaItem): Network[] {
  return NETWORKS.filter((n) => {
    const p = PLATFORMS[n];
    const mimes = m.kind === 'image' ? p.imageMimes : p.videoMimes;
    const maxMB = m.kind === 'image' ? p.maxImageMB : p.maxVideoMB;
    if (!mimes.includes(m.mime) || m.size > maxMB * 1024 * 1024) return false;
    return p.formats.some((f) => {
      if (m.kind === 'image' ? !f.allowImages : !f.allowVideo) return false;
      if (f.maxVideoSec && m.durationSec && m.durationSec > f.maxVideoSec) return false;
      if (f.aspect && m.width && m.height) {
        const r = m.width / m.height;
        if (r < f.aspect[0] - 0.01 || r > f.aspect[1] + 0.01) return false;
      }
      return true;
    });
  });
}

export function MediaPage() {
  const s = useSession();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<MediaItem[]>('/media');
  const [kind, setKind] = useState<'all' | 'image' | 'video' | 'mockup'>('all');
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [removing, setRemoving] = useState<MediaItem | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const canEdit = s.can('media.edit');

  async function handle(files: FileList | File[]) {
    const arr = [...files];
    setBusy(arr.length);
    let ok = 0;
    for (const f of arr) {
      try {
        await uploadFile(f);
        ok++;
      } catch (e) {
        toast(`${f.name}: ${e instanceof ApiError ? e.message : 'no se pudo subir'}`, 'error');
      } finally {
        setBusy((b) => b - 1);
      }
    }
    if (ok) toast(`${ok} archivo(s) subido(s).`);
    void reload();
  }

  const list = (data ?? []).filter((m) => (kind === 'all' ? true : kind === 'mockup' ? m.isMockup : m.kind === kind));

  return (
    <>
      <PageHeader title="Media" description="Imágenes y videos para tus publicaciones. Cada archivo indica en qué redes cumple los requisitos." />
      {canEdit && (
        <div
          className={`dropzone ${over ? 'dropzone--over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void handle(e.dataTransfer.files); }}
        >
          <div className="stack-sm" style={{ alignItems: 'center' }}>
            <Upload aria-hidden style={{ color: 'var(--c-sage-500)' }} />
            <strong>Arrastra archivos aquí</strong>
            <span className="small muted">JPG, PNG, WebP, MP4, MOV o WebM · hasta 512 MB. Se comprueba el tipo real del archivo.</span>
            <input ref={input} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={(e) => { if (e.target.files) void handle(e.target.files); e.target.value = ''; }} />
            <Button variant="primary" icon={<Upload />} loading={busy > 0} onClick={() => input.current?.click()}>
              {busy > 0 ? `Subiendo ${busy}…` : 'Elegir archivos'}
            </Button>
          </div>
        </div>
      )}

      <Segmented label="Tipo" value={kind} onChange={setKind} options={[{ id: 'all', label: 'Todo' }, { id: 'image', label: 'Imágenes' }, { id: 'video', label: 'Videos' }, { id: 'mockup', label: 'Maquetas' }]} />

      {loading && !data ? (
        <div className="media-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ aspectRatio: '1' }} />)}</div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState title="Sin archivos todavía">Sube fotos o videos reales de la marca. Evita imágenes genéricas que puedan confundirse con productos de Koppara.</EmptyState>
        </div>
      ) : (
        <div className="media-grid">
          {list.map((m) => {
            const ok = fits(m);
            return (
              <article key={m.id} className="card media-card">
                <div className="media-card__img">
                  <MediaThumb m={m} />
                  {m.kind === 'video' && <span className="thumb__tag"><Film size={10} aria-hidden /> {m.durationSec ? `${Math.round(m.durationSec)} s` : 'video'}</span>}
                  {m.isMockup && <span className="watermark">MAQUETA</span>}
                </div>
                <div className="media-card__body">
                  <span className="small truncate" style={{ fontWeight: 600 }} title={m.filename}>{m.filename}</span>
                  <span className="xs muted">{m.width && m.height ? `${m.width}×${m.height} · ` : ''}{bytes(m.size)}</span>
                  <div className="row" style={{ gap: 3 }} aria-label="Redes compatibles">
                    {ok.length ? ok.map((n) => <NetIcon key={n} network={n} size="sm" />) : <span className="xs" style={{ color: 'var(--c-warn)' }}>No cumple ninguna red</span>}
                  </div>
                  {canEdit && (
                    <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setRemoving(m)} style={{ alignSelf: 'flex-start', marginLeft: -8 }}>
                      Eliminar
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {removing && (
        <Confirm title="Eliminar archivo" confirmLabel="Eliminar" danger onClose={() => setRemoving(null)} onConfirm={async () => {
          try {
            await api.del(`/media/${removing.id}`);
            toast('Archivo eliminado.');
            void reload();
          } catch (e) {
            toast(e instanceof ApiError ? e.message : 'Error', 'error');
          }
        }}>
          Se eliminará “{removing.filename}”. Si se usa en alguna publicación, no se podrá borrar.
        </Confirm>
      )}
    </>
  );
}
