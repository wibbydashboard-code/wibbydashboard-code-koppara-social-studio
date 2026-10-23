import { useRef, useState } from 'react';
import { Check, Upload, Film } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import { useToast } from '../lib/toast.tsx';
import { bytes } from '../lib/format.ts';
import { Button, EmptyState, Loading, Modal } from './ui.tsx';
import type { MediaItem } from '../../../shared/types.ts';

const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';

/** Lee dimensiones/duración en el navegador antes de subir (el servidor vuelve a validar el tipo real). */
export async function readMediaMeta(file: File): Promise<{ width?: number; height?: number; durationSec?: number }> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith('video/')) {
      return await new Promise((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight, durationSec: Math.round(v.duration * 10) / 10 });
        v.onerror = () => resolve({});
        v.src = url;
      });
    }
    return await new Promise((resolve) => {
      const i = new window.Image();
      i.onload = () => resolve({ width: i.naturalWidth, height: i.naturalHeight });
      i.onerror = () => resolve({});
      i.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function uploadFile(file: File, extra: Record<string, string> = {}): Promise<MediaItem> {
  const meta = await readMediaMeta(file);
  const fd = new FormData();
  fd.append('file', file);
  for (const [k, v] of Object.entries({ ...extra, ...meta })) if (v !== undefined) fd.append(k, String(v));
  return api.upload<MediaItem>('/media', fd);
}

export function MediaThumb({ m }: { m: MediaItem }) {
  return m.kind === 'image' ? (
    <img src={m.url} alt={m.filename} loading="lazy" />
  ) : (
    <video src={m.url} muted preload="metadata" aria-label={m.filename} />
  );
}

export function MediaPicker({
  selected, onChange, onClose, onlyImages, max, brandId,
}: { selected: string[]; onChange: (ids: string[], items: MediaItem[]) => void; onClose: () => void; onlyImages?: boolean; max?: number; brandId?: string }) {
  const { data, loading, reload } = useApi<MediaItem[]>('/media');
  const [sel, setSel] = useState<string[]>(selected);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const items = (data ?? []).filter((m) => (!onlyImages || m.kind === 'image') && (!brandId || m.brandId === brandId));

  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : max === 1 ? [id] : max && s.length >= max ? s : [...s, id]));

  return (
    <Modal
      wide
      title="Elegir de Media"
      onClose={onClose}
      footer={
        <>
          <span className="small muted grow">{sel.length} seleccionado(s)</span>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={() => {
              onChange(sel, sel.map((id) => items.find((m) => m.id === id)).filter((m): m is MediaItem => Boolean(m)));
              onClose();
            }}
          >
            Usar selección
          </Button>
        </>
      }
    >
      <div className="row-between">
        <span className="small muted">JPG, PNG, WebP, MP4, MOV o WebM. Se valida el tipo real del archivo.</span>
        <input
          ref={input}
          type="file"
          accept={onlyImages ? 'image/jpeg,image/png,image/webp' : ACCEPT}
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy(true);
            try {
              const m = await uploadFile(f, brandId ? { brandId } : {});
              await reload();
              setSel((s) => (max === 1 ? [m.id] : [...s, m.id]));
              toast('Archivo subido.');
            } catch (err) {
              toast(err instanceof ApiError ? err.message : 'No se pudo subir.', 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button size="sm" icon={<Upload />} loading={busy} onClick={() => input.current?.click()}>
          Subir archivo
        </Button>
      </div>
      {loading && !data ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState compact title="La biblioteca está vacía">
          Sube una imagen o video para usarlo aquí.
        </EmptyState>
      ) : (
        <div className="media-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
          {items.map((m) => {
            const on = sel.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className="card media-card"
                aria-pressed={on}
                onClick={() => toggle(m.id)}
                style={{ padding: 0, cursor: 'pointer', textAlign: 'left', borderColor: on ? 'var(--c-green-700)' : undefined, boxShadow: on ? 'inset 0 0 0 2px var(--c-green-700)' : undefined }}
              >
                <div className="media-card__img">
                  <MediaThumb m={m} />
                  {m.kind === 'video' && <span className="thumb__tag"><Film size={10} aria-hidden /> video</span>}
                  {on && (
                    <span className="thumb__remove" style={{ background: 'var(--c-green-700)' }} aria-hidden>
                      <Check />
                    </span>
                  )}
                </div>
                <div className="media-card__body">
                  <span className="xs truncate">{m.filename}</span>
                  <span className="xs muted">
                    {m.width && m.height ? `${m.width}×${m.height} · ` : ''}
                    {bytes(m.size)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
