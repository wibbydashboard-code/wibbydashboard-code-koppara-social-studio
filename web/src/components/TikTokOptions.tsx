import type { TikTokOptions as Opts } from '../../../shared/types.ts';
import { Field, Notice } from './ui.tsx';

const PRIVACY: { id: Opts['privacy']; label: string }[] = [
  { id: 'PUBLIC_TO_EVERYONE', label: 'Todo el mundo' },
  { id: 'MUTUAL_FOLLOW_FRIENDS', label: 'Amigos (seguimiento mutuo)' },
  { id: 'FOLLOWER_OF_CREATOR', label: 'Seguidores' },
  { id: 'SELF_ONLY', label: 'Solo yo' },
];

/**
 * Opciones obligatorias de TikTok. Ninguna viene marcada por defecto: la persona debe elegirlas.
 * Las opciones exactas disponibles dependen de la cuenta y se leerán de la API cuando exista la integración.
 */
export function TikTokOptions({ value, onChange, idPrefix }: { value: Opts; onChange: (v: Opts) => void; idPrefix: string }) {
  const set = (patch: Partial<Opts>) => onChange({ ...value, ...patch });
  return (
    <div className="stack" style={{ gap: 12 }}>
      <Field label="¿Quién puede verlo?" required error={!value.privacy ? 'Obligatorio: elige una opción.' : undefined}>
        {(fid, d) => (
          <select id={fid} aria-describedby={d} className="select" value={value.privacy} onChange={(e) => set({ privacy: e.target.value as Opts['privacy'] })}>
            <option value="" disabled>
              Elige…
            </option>
            {PRIVACY.map((p) => (
              <option key={p.id} value={p.id} disabled={p.id === 'SELF_ONLY' && value.brandedContent}>
                {p.label}
                {p.id === 'SELF_ONLY' && value.brandedContent ? ' (no disponible con contenido de marca)' : ''}
              </option>
            ))}
          </select>
        )}
      </Field>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label" style={{ marginBottom: 4 }}>Permitir a otros</legend>
        <div className="row" style={{ gap: 16 }}>
          {([
            ['allowComments', 'Comentar'],
            ['allowDuet', 'Dúo'],
            ['allowStitch', 'Pegar (Stitch)'],
          ] as const).map(([k, label]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={value[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<Opts>)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label" style={{ marginBottom: 4 }}>
          ¿Promociona una marca, producto o servicio? <span className="muted" aria-hidden>*</span>
        </legend>
        <div className="row" style={{ gap: 16 }}>
          <label className="check">
            <input type="radio" name={`${idPrefix}-cd`} checked={value.commercialDisclosure === false} onChange={() => set({ commercialDisclosure: false, yourBrand: false, brandedContent: false })} />
            <span>No</span>
          </label>
          <label className="check">
            <input type="radio" name={`${idPrefix}-cd`} checked={value.commercialDisclosure === true} onChange={() => set({ commercialDisclosure: true })} />
            <span>Sí</span>
          </label>
        </div>
        {value.commercialDisclosure === null && <div className="field__error">Obligatorio: responde Sí o No.</div>}
        {value.commercialDisclosure && (
          <div className="stack-sm" style={{ marginTop: 6, paddingLeft: 4 }}>
            <label className="check">
              <input type="checkbox" checked={value.yourBrand} onChange={(e) => set({ yourBrand: e.target.checked })} />
              <span className="check__text">
                Tu marca
                <span className="check__hint">Promocionas tu propio negocio. Se etiqueta como “Contenido promocional”.</span>
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={value.brandedContent}
                onChange={(e) => set({ brandedContent: e.target.checked, privacy: e.target.checked && value.privacy === 'SELF_ONLY' ? '' : value.privacy })}
              />
              <span className="check__text">
                Contenido de marca
                <span className="check__hint">Promocionas a un tercero. Se etiqueta como “Colaboración pagada”.</span>
              </span>
            </label>
            {!value.yourBrand && !value.brandedContent && <div className="field__error">Selecciona al menos una opción.</div>}
          </div>
        )}
      </fieldset>
      <Notice>Al publicar en TikTok se aceptan sus políticas de contenido de marca y de música. Estas opciones se confirmarán con la API cuando la integración exista.</Notice>
    </div>
  );
}
