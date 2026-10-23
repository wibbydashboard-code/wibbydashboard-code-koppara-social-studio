import { useState } from 'react';
import { formatRule, PLATFORMS } from '../../../shared/platforms.ts';
import { effectiveText, youtubeParts } from '../../../shared/validation.ts';
import type { MediaItem, PostTarget, SocialAccount } from '../../../shared/types.ts';
import { NetIcon } from './ui.tsx';
import { MediaThumb } from './MediaPicker.tsx';

type T = Pick<PostTarget, 'accountId' | 'network' | 'format' | 'text' | 'tiktok'>;

export function PostPreview({ baseText, targets, media, accounts }: { baseText: string; targets: T[]; media: MediaItem[]; accounts: SocialAccount[] }) {
  const [active, setActive] = useState(0);
  if (!targets.length)
    return (
      <div className="preview">
        <div className="empty empty--compact">
          <p className="small">Selecciona al menos un destino para ver la vista previa.</p>
        </div>
      </div>
    );
  const idx = Math.min(active, targets.length - 1);
  const t = targets[idx];
  const acc = accounts.find((a) => a.id === t.accountId);
  const f = formatRule(t.network, t.format);
  const text = effectiveText({ baseText }, t);
  const vertical = f.aspect && f.aspect[1] <= 0.6;
  const wide = t.network === 'youtube' && t.format === 'video';
  const yt = t.network === 'youtube' ? youtubeParts(text) : null;
  const first = media[0];

  return (
    <div className="preview" aria-label="Vista previa por destino">
      <div className="preview__tabs" role="tablist">
        {targets.map((x, i) => (
          <button key={x.accountId} role="tab" aria-selected={i === idx} onClick={() => setActive(i)}>
            <NetIcon network={x.network} size="sm" />
            {formatRule(x.network, x.format).label}
          </button>
        ))}
      </div>
      <div className="phone" role="tabpanel">
        <div className="phone__head">
          <span className="phone__avatar">{PLATFORMS[t.network].short}</span>
          <div style={{ minWidth: 0 }}>
            <div className="small truncate" style={{ fontWeight: 600 }}>{acc?.handle ?? 'cuenta'}</div>
            <div className="xs muted">Vista previa aproximada · {acc?.mode === 'demo' ? 'cuenta simulada' : PLATFORMS[t.network].label}</div>
          </div>
        </div>
        {yt && <div className="phone__title">{yt.title || <span className="muted">Título (primera línea)</span>}</div>}
        {(first || !['x', 'threads', 'linkedin', 'facebook'].includes(t.network)) && (
          <div className={`phone__media ${vertical ? 'phone__media--vertical' : wide ? 'phone__media--wide' : ''}`}>
            {first ? <MediaThumb m={first} /> : <span>Sin medios</span>}
            {media.length > 1 && <span className="phone__count">1/{media.length}</span>}
          </div>
        )}
        <div className="phone__text">{(yt ? yt.description : text) || <span className="muted">El texto aparecerá aquí.</span>}</div>
      </div>
      <p className="xs muted" style={{ padding: '0 16px 14px' }}>
        El título interno y las etiquetas no se incluyen en el texto publicado.
      </p>
    </div>
  );
}
