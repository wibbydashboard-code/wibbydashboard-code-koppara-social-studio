import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ImagePlus, Save, Sparkles, X, Film, FileText } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { useToast } from '../lib/toast.tsx';
import { isoToLocalInput, localInputToIso } from '../lib/format.ts';
import {
  Button, Confirm, Counter, DemoBadge, EmptyState, ErrorState, Field, IssueList, ListInput, Loading, NetIcon, Notice, Segmented, StatusBadge,
} from '../components/ui.tsx';
import { MediaPicker, MediaThumb } from '../components/MediaPicker.tsx';
import { PostPreview } from '../components/PostPreview.tsx';
import { TikTokOptions } from '../components/TikTokOptions.tsx';
import { WritingAssistant } from '../components/WritingAssistant.tsx';
import { PostActions } from '../components/PostActions.tsx';
import { PLATFORMS, defaultFormat } from '../../../shared/platforms.ts';
import { checkCompliance } from '../../../shared/compliance.ts';
import { emptyTikTokOptions, effectiveText, hasErrors, validateTarget, youtubeParts } from '../../../shared/validation.ts';
import { TRANSITIONS } from '../../../shared/workflow.ts';
import type { Brand, MediaItem, Post, PostTarget, SocialAccount } from '../../../shared/types.ts';

type Target = Pick<PostTarget, 'accountId' | 'network' | 'format' | 'text' | 'tiktok'>;

interface Draft {
  brandId: string;
  internalTitle: string;
  tags: string[];
  baseText: string;
  mediaIds: string[];
  plannedLocal: string;
  targets: Target[];
}

const EMPTY: Draft = { brandId: '', internalTitle: '', tags: [], baseText: '', mediaIds: [], plannedLocal: '', targets: [] };

export function PostEditorPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const s = useSession();
  const toast = useToast();
  const tz = s.settings.timezone;

  const brands = useApi<Brand[]>('/brands');
  const accounts = useApi<SocialAccount[]>('/accounts');
  const media = useApi<MediaItem[]>('/media');
  const existing = useApi<{ post: Post }>(id ? `/posts/${id}` : null, [id]);

  const [d, setD] = useState<Draft>(EMPTY);
  const [post, setPost] = useState<Post | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedPulse, setSavedPulse] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const loaded = useRef(false);

  // Carga inicial (edición) o marca por defecto (nueva).
  useEffect(() => {
    if (id && existing.data && !loaded.current) {
      const p = existing.data.post;
      loaded.current = true;
      setPost(p);
      setD({
        brandId: p.brandId, internalTitle: p.internalTitle === 'Sin título' ? '' : p.internalTitle, tags: p.tags, baseText: p.baseText,
        mediaIds: p.mediaIds, plannedLocal: isoToLocalInput(p.plannedAt, tz),
        targets: p.targets.map(({ accountId, network, format, text, tiktok }) => ({ accountId, network, format, text, tiktok })),
      });
    }
  }, [id, existing.data, tz]);
  useEffect(() => {
    if (!id && brands.data && !d.brandId) {
      const first = brands.data.find((b) => b.status === 'active') ?? brands.data[0];
      if (first) setD((x) => ({ ...x, brandId: first.id }));
    }
  }, [id, brands.data, d.brandId]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname);

  const brand = brands.data?.find((b) => b.id === d.brandId) ?? null;
  const mediaById = useMemo(() => new Map((media.data ?? []).map((m) => [m.id, m])), [media.data]);
  const selectedMedia = d.mediaIds.map((m) => mediaById.get(m)).filter((m): m is MediaItem => Boolean(m));
  const brandAccounts = (accounts.data ?? []).filter((a) => a.brandId === d.brandId);
  const otherAccounts = (accounts.data ?? []).filter((a) => !a.brandId);
  const editable = !post || TRANSITIONS.save.from.includes(post.status);
  const canEdit = s.can('post.edit') && editable;

  const targetIssues = d.targets.map((t) => validateTarget({ baseText: d.baseText }, t, selectedMedia, brand));
  const baseIssues = checkCompliance(d.baseText, brand?.bannedWords ?? []);
  const minLimit = d.targets.length ? Math.min(...d.targets.filter((t) => t.text === null).map((t) => PLATFORMS[t.network].textLimit).concat([Infinity])) : 2200;
  const totalErrors = targetIssues.filter(hasErrors).length;

  function update(patch: Partial<Draft>) {
    setD((x) => ({ ...x, ...patch }));
    setDirty(true);
  }
  function updateTarget(accountId: string, patch: Partial<Target>) {
    setD((x) => ({ ...x, targets: x.targets.map((t) => (t.accountId === accountId ? { ...t, ...patch } : t)) }));
    setDirty(true);
  }
  function toggleAccount(a: SocialAccount) {
    setD((x) => ({
      ...x,
      targets: x.targets.some((t) => t.accountId === a.id)
        ? x.targets.filter((t) => t.accountId !== a.id)
        : [...x.targets, { accountId: a.id, network: a.network, format: defaultFormat(a.network), text: null, tiktok: a.network === 'tiktok' ? emptyTikTokOptions() : null }],
    }));
    setDirty(true);
  }

  /** Guarda el borrador. Devuelve el id o null si falló. */
  async function save(silent = false): Promise<string | null> {
    if (!d.brandId) {
      setFieldErrors({ brandId: 'Elige una marca.' });
      toast('Elige una marca antes de guardar.', 'error');
      return null;
    }
    if (post && !dirty) return post.id;
    setSaving(true);
    try {
      const body = { ...d, plannedAt: d.plannedLocal ? localInputToIso(d.plannedLocal, tz) : null };
      const p = post ? await api.put<Post>(`/posts/${post.id}`, body) : await api.post<Post>('/posts', body);
      setPost(p);
      setDirty(false);
      setFieldErrors({});
      setSavedPulse(true);
      setTimeout(() => setSavedPulse(false), 900);
      if (!silent) toast(post && post.status !== 'draft' ? 'Guardado. Volvió a borrador para una nueva revisión.' : 'Borrador guardado.');
      // Al guardar desde una acción (silent) la navegación la hace onChanged.
      if (!id && !silent) nav(`/publicaciones/${p.id}/editar`, { replace: true });
      return p.id;
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(e.fields);
        toast(e.message, 'error');
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  if (brands.loading && !brands.data) return <Loading />;
  if (id && existing.loading && !existing.data) return <Loading />;
  if (id && existing.error) return <ErrorState message={existing.error.message} onRetry={existing.reload} />;
  if (brands.data && brands.data.length === 0)
    return (
      <div className="card">
        <EmptyState title="Primero crea una marca" action={<Link to="/marcas/nueva" className="btn btn--primary">Crear marca</Link>}>
          Las publicaciones se redactan dentro de una marca para aplicar su voz y sus reglas.
        </EmptyState>
      </div>
    );

  return (
    <>
      <div className="stack-sm">
        <Link to={post ? `/publicaciones/${post.id}` : '/publicaciones'} className="small row" style={{ gap: 4, textDecoration: 'none' }}>
          <ArrowLeft size={15} aria-hidden /> {post ? 'Detalle' : 'Publicaciones'}
        </Link>
        <div className="page-head">
          <div>
            <div className="eyebrow">{post ? 'Editar publicación' : 'Crear'}</div>
            <h1>{d.internalTitle || 'Nueva publicación'}</h1>
          </div>
          {post && (
            <div className="row">
              <StatusBadge status={post.status} simulated={post.simulated} />
              {post.isDemo && <DemoBadge />}
            </div>
          )}
        </div>
      </div>

      {post && post.status !== 'draft' && editable && (
        <Notice kind="warn">Si guardas cambios, la publicación volverá a “Borrador” y necesitará una nueva revisión.</Notice>
      )}
      {!editable && <Notice>Esta publicación está en “{post?.status}” y ya no se puede editar. Cancélala o reábrela para modificarla.</Notice>}
      {!s.can('post.edit') && <Notice>Tu rol sólo permite consultar.</Notice>}

      <div className="composer">
        <div className="stack">
          {/* 1. Marca */}
          <section className="card step-card" aria-labelledby="st1">
            <div className="card__head">
              <h2 id="st1" className="step-card__title"><span className="step-card__num">1</span> Marca</h2>
            </div>
            <div className="card__body stack-sm">
              <Field label="Marca" error={fieldErrors.brandId} required>
                {(fid, desc) => (
                  <select id={fid} aria-describedby={desc} className="select" value={d.brandId} disabled={!canEdit} onChange={(e) => update({ brandId: e.target.value, targets: [] })}>
                    <option value="" disabled>Elige una marca…</option>
                    {(brands.data ?? []).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}{b.status === 'draft' ? ' (borrador)' : ''}</option>
                    ))}
                  </select>
                )}
              </Field>
              {brand && (
                <p className="small muted">
                  {brand.tone ? <>Tono: <strong style={{ color: 'var(--c-ink-2)' }}>{brand.tone}</strong>. </> : 'Sin tono definido. '}
                  {brand.bannedWords.length === 1 ? '1 palabra prohibida activa.' : brand.bannedWords.length ? `${brand.bannedWords.length} palabras prohibidas activas.` : ''}
                  {brand.pendingFields.length > 0 && <> <Link to={`/marcas/${brand.id}`}>Completar ficha</Link></>}
                </p>
              )}
            </div>
          </section>

          {/* 2. Contenido */}
          <section className="card step-card" aria-labelledby="st2">
            <div className="card__head">
              <h2 id="st2" className="step-card__title"><span className="step-card__num">2</span> Contenido</h2>
              {brand && canEdit && (
                <Button size="sm" icon={s.ai.isAi ? <Sparkles /> : <FileText />} onClick={() => setAssistant(true)}>
                  {s.ai.isAi ? 'Asistente IA' : 'Asistente (plantillas)'}
                </Button>
              )}
            </div>
            <fieldset className="card__body stack" disabled={!canEdit} style={{ border: 0, margin: 0, minWidth: 0 }}>
              <div className="grid grid-2">
                <Field label="Título interno" hint="Sólo para el equipo; nunca se publica.">
                  {(fid, desc) => <input id={fid} aria-describedby={desc} className="input" value={d.internalTitle} maxLength={120} placeholder="Ej.: Rutina de mañana · semana 12" onChange={(e) => update({ internalTitle: e.target.value })} />}
                </Field>
                <Field label="Etiquetas internas" hint="Para filtrar; nunca se publican.">
                  {(fid, desc) => <ListInput id={fid} describedBy={desc} value={d.tags} onChange={(v) => update({ tags: v.map((t) => t.toLowerCase()) })} placeholder="Ej.: campaña-otoño" max={20} />}
                </Field>
              </div>
              <Field
                label="Texto base"
                hint="Se usa en todos los destinos salvo los que personalices."
                counter={Number.isFinite(minLimit) ? <Counter value={d.baseText.length} limit={minLimit} /> : undefined}
              >
                {(fid, desc) => <textarea id={fid} aria-describedby={desc} className="textarea" rows={7} value={d.baseText} onChange={(e) => update({ baseText: e.target.value })} placeholder="Escribe el mensaje principal…" />}
              </Field>
              <IssueList issues={baseIssues} />

              <div className="field">
                <span className="field__label">Medios</span>
                <div className="media-strip">
                  {selectedMedia.map((m) => (
                    <div className="thumb" key={m.id}>
                      <MediaThumb m={m} />
                      {m.kind === 'video' && <span className="thumb__tag"><Film size={10} aria-hidden /></span>}
                      {m.isMockup && <span className="thumb__tag">maqueta</span>}
                      {canEdit && (
                        <button type="button" className="thumb__remove" aria-label={`Quitar ${m.filename}`} onClick={() => update({ mediaIds: d.mediaIds.filter((x) => x !== m.id) })}>
                          <X />
                        </button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <button type="button" className="thumb" style={{ display: 'grid', placeItems: 'center', cursor: 'pointer', borderStyle: 'dashed' }} onClick={() => setPicker(true)} aria-label="Añadir medios">
                      <ImagePlus size={20} aria-hidden />
                    </button>
                  )}
                </div>
              </div>

              <Field label={`Fecha prevista (${tz})`} hint="Fecha editorial para organizar el calendario. Los borradores no tienen programación activa ni se envían automáticamente. Programar exige aprobación previa.">
                {(fid, desc) => <input id={fid} aria-describedby={desc} type="datetime-local" className="input" style={{ maxWidth: 280 }} value={d.plannedLocal} onChange={(e) => update({ plannedLocal: e.target.value })} />}
              </Field>
            </fieldset>
          </section>

          {/* 3. Destinos */}
          <section className="card step-card" aria-labelledby="st3">
            <div className="card__head">
              <h2 id="st3" className="step-card__title"><span className="step-card__num">3</span> Destinos</h2>
              <span className="small muted">{d.targets.length} seleccionados</span>
            </div>
            <div className="card__body stack">
              {brandAccounts.length + otherAccounts.length === 0 ? (
                <EmptyState compact title="No hay cuentas conectadas" action={<Link to="/cuentas" className="btn btn--primary">Conectar cuenta oficial</Link>}>
                  Conecta una cuenta oficial de Instagram o Facebook para seleccionar destinos de publicación.
                </EmptyState>
              ) : (
                <>
                  {[{ label: brand ? `Cuentas de ${brand.name}` : 'Cuentas de la marca', list: brandAccounts }, { label: 'Sin marca asignada', list: otherAccounts }]
                    .filter((g) => g.list.length)
                    .map((g) => (
                      <div key={g.label} className="stack-sm">
                        <span className="xs muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{g.label}</span>
                        <div className="dest-grid">
                          {g.list.map((a) => {
                            const on = d.targets.some((t) => t.accountId === a.id);
                            return (
                              <button key={a.id} type="button" className="dest" aria-pressed={on} disabled={!canEdit} onClick={() => toggleAccount(a)}>
                                <NetIcon network={a.network} />
                                <span style={{ minWidth: 0 }}>
                                  <span className="small truncate" style={{ display: 'block', fontWeight: 600 }}>{a.handle}</span>
                                  <span className="xs muted">{PLATFORMS[a.network].label}{a.mode === 'demo' ? ' · simulada' : ''}</span>
                                </span>
                                <span className="dest__check">{on && <Check aria-hidden />}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </>
              )}

              {d.targets.map((t, i) => {
                const acc = accounts.data?.find((a) => a.id === t.accountId);
                const p = PLATFORMS[t.network];
                const text = effectiveText({ baseText: d.baseText }, t);
                const issues = targetIssues[i];
                return (
                  <div key={t.accountId} className="variant">
                    <div className="variant__head">
                      <NetIcon network={t.network} size="sm" />
                      <strong className="small">{p.label}</strong>
                      <span className="xs muted truncate">{acc?.handle}</span>
                      <span className="grow" />
                      {issues.some((x) => x.level === 'error') ? (
                        <span className="badge badge--failed">{issues.filter((x) => x.level === 'error').length} por corregir</span>
                      ) : (
                        <span className="badge badge--published">Listo</span>
                      )}
                    </div>
                    <fieldset className="variant__body" disabled={!canEdit} style={{ border: 0, margin: 0, minWidth: 0 }}>
                      {p.formats.length > 1 && (
                        <div className="row">
                          <span className="small" style={{ fontWeight: 550 }}>Formato</span>
                          <Segmented label={`Formato para ${p.label}`} value={t.format} onChange={(v) => updateTarget(t.accountId, { format: v })} options={p.formats.map((f) => ({ id: f.id, label: f.label }))} />
                        </div>
                      )}
                      <label className="check">
                        <input type="checkbox" checked={t.text !== null} onChange={(e) => updateTarget(t.accountId, { text: e.target.checked ? d.baseText : null })} />
                        <span className="check__text">
                          Personalizar texto para {p.label}
                          <span className="check__hint">Si no, se usa el texto base.</span>
                        </span>
                      </label>
                      {t.text !== null && (
                        <Field label={`Texto para ${p.label}`} counter={<Counter value={t.text.length} limit={p.textLimit} />}>
                          {(fid) => <textarea id={fid} className="textarea" rows={5} value={t.text ?? ''} onChange={(e) => updateTarget(t.accountId, { text: e.target.value })} />}
                        </Field>
                      )}
                      {t.network === 'youtube' && (
                        <div className="notice notice--info" style={{ display: 'block' }}>
                          <div><strong>Título:</strong> {youtubeParts(text).title || <em>vacío</em>} <span className="muted">({youtubeParts(text).title.length}/{p.titleLimit})</span></div>
                          <div className="xs" style={{ marginTop: 4 }}>La primera línea es el título; el texto completo se conserva como descripción.</div>
                        </div>
                      )}
                      {t.network === 'tiktok' && t.tiktok && (
                        <TikTokOptions idPrefix={t.accountId} value={t.tiktok} onChange={(v) => updateTarget(t.accountId, { tiktok: v })} />
                      )}
                      <IssueList issues={issues} />
                    </fieldset>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="composer__side" aria-label="Vista previa">
          <PostPreview baseText={d.baseText} targets={d.targets} media={selectedMedia} accounts={accounts.data ?? []} />
          <div className="card card__body stack-sm">
            <strong className="small">Antes de enviar</strong>
            <ul className="issues">
              {[
                [Boolean(d.brandId), 'Marca elegida'],
                [d.baseText.trim().length > 0 || d.targets.some((t) => t.text?.trim()), 'Texto escrito'],
                [d.targets.length > 0, 'Al menos un destino'],
                [d.targets.length > 0 && totalErrors === 0, 'Destinos sin errores'],
              ].map(([ok, label]) => (
                <li key={label as string} style={{ color: ok ? 'var(--c-ok)' : 'var(--c-ink-3)' }}>
                  {ok ? <Check aria-hidden /> : <span style={{ width: 15, display: 'inline-block' }} aria-hidden>○</span>}
                  <span>{label as string}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {s.can('post.edit') && (
        <div className="action-bar" aria-label="Acciones">
          <div className="action-bar__status" aria-live="polite">
            {saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : post ? 'Guardado' : 'Sin guardar'}
            {totalErrors > 0 && <span style={{ color: 'var(--c-danger)' }}>· {totalErrors} destino(s) con errores</span>}
          </div>
          {editable && (
            <Button icon={<Save />} loading={saving} onClick={() => void save()} className={savedPulse ? 'saved-pulse' : ''}>
              Guardar borrador
            </Button>
          )}
          <PostActions
            post={post ? { ...post, targets: d.targets.map((t, i) => ({ ...t, id: String(i), status: 'pending', error: null, attempts: 0, simulated: false })) } : { id: '', status: 'draft', plannedAt: null, createdBy: s.user.id, targets: d.targets.map((t, i) => ({ ...t, id: String(i), status: 'pending', error: null, attempts: 0, simulated: false })) }}
            accounts={accounts.data ?? []}
            beforeAction={() => save(true)}
            onChanged={(p) => {
              setPost(p);
              setDirty(false);
              nav(`/publicaciones/${p.id}`);
            }}
          />
        </div>
      )}

      {picker && (
        <MediaPicker
          selected={d.mediaIds}
          brandId={d.brandId || undefined}
          onClose={() => setPicker(false)}
          onChange={(ids) => {
            update({ mediaIds: ids });
            void media.reload();
          }}
        />
      )}
      {assistant && brand && <WritingAssistant brand={brand} onClose={() => setAssistant(false)} onUse={(text) => update({ baseText: text })} />}
      {blocker.state === 'blocked' && (
        <Confirm title="Hay cambios sin guardar" confirmLabel="Salir sin guardar" danger closeAfterConfirm={false} onClose={() => blocker.reset()} onConfirm={() => blocker.proceed()}>
          Si sales ahora, se perderán los cambios de esta publicación.
        </Confirm>
      )}
    </>
  );
}
