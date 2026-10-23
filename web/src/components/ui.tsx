import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Info, Loader2, Plus, X, FlaskConical } from 'lucide-react';
import { PLATFORMS } from '../../../shared/platforms.ts';
import { STATUS_LABELS } from '../../../shared/workflow.ts';
import type { Issue, Network, PostStatus } from '../../../shared/types.ts';

type BtnVariant = 'primary' | 'accent' | 'ghost' | 'danger' | 'default';

export function Button({
  variant = 'default', size, block, loading, icon, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm'; block?: boolean; loading?: boolean; icon?: ReactNode }) {
  const cls = ['btn', variant !== 'default' && `btn--${variant}`, size && `btn--${size}`, block && 'btn--block', !children && 'btn--icon', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} aria-busy={loading || undefined} {...rest} disabled={rest.disabled || loading}>
      {loading ? <Loader2 className="spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Field({
  label, hint, error, children, counter, id, required,
}: { label: ReactNode; hint?: ReactNode; error?: string; children: (id: string, describedBy?: string) => ReactNode; counter?: ReactNode; id?: string; required?: boolean }) {
  const autoId = useId();
  const fid = id ?? autoId;
  const hintId = hint ? `${fid}-hint` : undefined;
  const errId = error ? `${fid}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${error ? 'field--invalid' : ''}`}>
      <label className="field__label" htmlFor={fid}>
        <span>
          {label}
          {required && <span aria-hidden className="muted"> *</span>}
        </span>
        {counter}
      </label>
      {children(fid, describedBy)}
      {hint && !error && (
        <div className="field__hint" id={hintId}>
          {hint}
        </div>
      )}
      {error && (
        <div className="field__error" id={errId} role="alert">
          <AlertCircle aria-hidden />
          {error}
        </div>
      )}
    </div>
  );
}

export function Counter({ value, limit }: { value: number; limit: number }) {
  const cls = value > limit ? 'counter counter--over' : value > limit * 0.9 ? 'counter counter--warn' : 'counter';
  return (
    <span className={cls} aria-label={`${value} de ${limit} caracteres`}>
      {value.toLocaleString('es-MX')} / {limit.toLocaleString('es-MX')}
    </span>
  );
}

export function StatusBadge({ status, simulated }: { status: PostStatus; simulated?: boolean }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      <span className={`badge badge--${status}`}>{STATUS_LABELS[status]}</span>
      {simulated && ['scheduled', 'published', 'failed'].includes(status) && <DemoBadge label="Simulado" />}
    </span>
  );
}

export function DemoBadge({ label = 'Demo' }: { label?: string }) {
  return (
    <span className="badge badge--demo badge--plain" title="Dato de demostración: no existe en ninguna red social.">
      <FlaskConical size={12} aria-hidden /> {label}
    </span>
  );
}

export function NetIcon({ network, size }: { network: Network; size?: 'sm' | 'lg' }) {
  return (
    <span className={`net ${size ? `net--${size}` : ''}`} aria-label={PLATFORMS[network].label} title={PLATFORMS[network].label}>
      {PLATFORMS[network].short}
    </span>
  );
}

export function Notice({ kind = 'info', children, title }: { kind?: 'info' | 'warn' | 'danger' | 'demo' | 'ok'; title?: string; children: ReactNode }) {
  const Icon = kind === 'danger' || kind === 'warn' ? AlertTriangle : kind === 'demo' ? FlaskConical : Info;
  return (
    <div className={`notice notice--${kind}`} role={kind === 'danger' ? 'alert' : undefined}>
      <Icon aria-hidden />
      <div>
        {title && <strong>{title} </strong>}
        {children}
      </div>
    </div>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="issues">
      {issues.map((i, n) => (
        <li key={n} className={i.level === 'error' ? 'is-error' : 'is-warning'}>
          {i.level === 'error' ? <AlertCircle aria-hidden /> : <AlertTriangle aria-hidden />}
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** Ilustración lineal original para estados vacíos (hoja + tarjeta). */
export function EmptyArt() {
  return (
    <svg className="empty__art" viewBox="0 0 120 88" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="22" y="14" width="64" height="58" rx="7" fill="var(--c-surface)" />
      <path d="M32 30h30M32 40h44M32 50h22" strokeLinecap="round" opacity=".6" />
      <path d="M78 74c0-17 12-30 30-30-2 17-13 30-30 30z" fill="var(--c-sage-100)" />
      <path d="M80 72c6-9 13-15 22-20" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({ title, children, action, compact }: { title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`empty ${compact ? 'empty--compact' : ''}`}>
      <EmptyArt />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <Loader2 aria-hidden size={18} /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card card__body stack-sm" role="alert">
      <Notice kind="danger" title="No se pudo cargar.">
        {message}
      </Notice>
      {onRetry && (
        <div>
          <Button size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      )}
    </div>
  );
}

export function Modal({
  title, children, footer, onClose, wide, labelledBy,
}: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const els = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
          (el) => !el.hasAttribute('disabled'),
        );
        if (!els.length) return;
        const [a, b] = [els[0], els[els.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? titleId} ref={ref} tabIndex={-1}>
        <div className="modal__head row-between">
          <h2 id={titleId}>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar" data-close icon={<X />} />
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmación explícita antes de acciones sensibles. */
export function Confirm({
  title, children, confirmLabel, danger, onConfirm, onClose, closeAfterConfirm = true,
}: { title: string; children: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void> | void; onClose: () => void; closeAfterConfirm?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                if (closeAfterConfirm) onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/** Editor de listas cortas (reglas, pilares, palabras). */
export function ListInput({
  value, onChange, placeholder, id, describedBy, max = 30,
}: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string; describedBy?: string; max?: number }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const items = draft.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    onChange([...new Set([...value, ...items])].slice(0, max));
    setDraft('');
  };
  return (
    <div className="stack-sm">
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          id={id}
          aria-describedby={describedBy}
          className="input"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add} aria-label="Añadir" icon={<Plus />} disabled={!draft.trim()} />
      </div>
      {value.length > 0 && (
        <div className="chips">
          {value.map((v) => (
            <span className="chip" key={v}>
              {v}
              <button type="button" aria-label={`Quitar ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
                <X aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
