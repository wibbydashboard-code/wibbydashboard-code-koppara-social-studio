import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, Check, ImagePlus, Plus, X } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { useToast } from '../lib/toast.tsx';
import { Button, Confirm, Counter, DemoBadge, ErrorState, Field, ListInput, Loading, Notice } from '../components/ui.tsx';
import { MediaPicker } from '../components/MediaPicker.tsx';
import { KNOWLEDGE_LIMIT, validateBrand } from '../../../shared/validation.ts';
import type { Brand, MediaItem } from '../../../shared/types.ts';

type Form = Omit<Brand, 'id' | 'status' | 'isDemo' | 'createdAt' | 'updatedAt'>;

const EMPTY: Form = {
  name: '', website: '', description: '', audience: '', bestCustomer: '', unwantedAudience: '', tone: '', personality: '',
  language: 'Español', alwaysRules: [], neverRules: [], bannedWords: [], pillars: [], knowledge: '', pendingFields: [],
  kit: { logoMediaId: null, primaryColor: '#1F4D3A', palette: [], fonts: [], referenceMediaIds: [] },
};

const LANGS = ['Español', 'Español (México)', 'Inglés', 'Portugués'];

function Section({ title, intro, pending, children }: { title: string; intro: string; pending?: boolean; children: ReactNode }) {
  return (
    <section className="form-section">
      <div className="form-section__intro">
        <h2>{title}</h2>
        <p>{intro}</p>
        {pending && (
          <span className="badge badge--pending" style={{ marginTop: 8 }}>
            Por confirmar
          </span>
        )}
      </div>
      <div className="stack">{children}</div>
    </section>
  );
}

export function BrandEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const s = useSession();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Brand>(id ? `/brands/${id}` : null, [id]);
  const media = useApi<MediaItem[]>('/media');
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<'draft' | 'activate' | null>(null);
  const [picker, setPicker] = useState<'logo' | 'refs' | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [newColor, setNewColor] = useState('#8FA58F');
  const [newFont, setNewFont] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (data) {
      const { id: _i, status: _s, isDemo: _d, createdAt: _c, updatedAt: _u, ...rest } = data;
      setForm({ ...EMPTY, ...rest, kit: { ...EMPTY.kit, ...rest.kit } });
      setDirty(false);
    }
  }, [data]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname);

  const readOnly = !s.can('brand.edit');
  const mediaById = useMemo(() => new Map((media.data ?? []).map((m) => [m.id, m])), [media.data]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value, pendingFields: f.pendingFields.filter((p) => p !== key) }));
    setErrors((e) => {
      const { [key as string]: _, ...rest } = e;
      return rest;
    });
    setDirty(true);
  }
  function setKit<K extends keyof Form['kit']>(key: K, value: Form['kit'][K]) {
    setForm((f) => ({ ...f, kit: { ...f.kit, [key]: value }, pendingFields: f.pendingFields.filter((p) => p !== 'kit') }));
    setDirty(true);
  }

  async function save(mode: 'draft' | 'activate') {
    const local = validateBrand(form, mode === 'activate');
    if (Object.keys(local).length) {
      setErrors(local);
      toast('Revisa los campos marcados.', 'error');
      formRef.current?.classList.remove('shake');
      void formRef.current?.offsetWidth;
      formRef.current?.classList.add('shake');
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('.field--invalid input, .field--invalid textarea, .field--invalid select')?.focus());
      return;
    }
    setSaving(mode);
    try {
      const saved = isNew
        ? await api.post<Brand>(`/brands?mode=${mode}`, form)
        : await api.put<Brand>(`/brands/${id}?mode=${mode}`, form);
      setDirty(false);
      toast(mode === 'activate' ? 'Marca guardada y activa.' : 'Borrador de marca guardado.');
      if (isNew) nav(`/marcas/${saved.id}`, { replace: true });
      else await reload();
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields);
        toast(e.message, 'error');
      }
    } finally {
      setSaving(null);
    }
  }

  if (!isNew && loading && !data) return <Loading />;
  if (!isNew && (error || !data)) return <ErrorState message={error?.message ?? 'No encontrada'} onRetry={reload} />;

  const pending = (k: string) => form.pendingFields.includes(k);
  const logo = form.kit.logoMediaId ? mediaById.get(form.kit.logoMediaId) : null;

  return (
    <>
      <div className="stack-sm">
        <Link to="/marcas" className="small row" style={{ gap: 4, textDecoration: 'none' }}>
          <ArrowLeft size={15} aria-hidden /> Marcas
        </Link>
        <div className="page-head">
          <div>
            <h1>{isNew ? 'Nueva marca' : form.name || 'Marca'}</h1>
            <div className="row" style={{ marginTop: 6 }}>
              {data && <span className={`badge badge--${data.status}`}>{{ draft: 'Borrador', active: 'Activa', archived: 'Archivada' }[data.status]}</span>}
              {data?.isDemo && <DemoBadge />}
              {dirty && <span className="small muted">Cambios sin guardar</span>}
            </div>
          </div>
          {!isNew && s.can('brand.archive') && data?.status !== 'archived' && (
            <Button variant="ghost" icon={<Archive />} onClick={() => setConfirmArchive(true)}>
              Archivar
            </Button>
          )}
        </div>
      </div>

      {form.pendingFields.length > 0 && (
        <Notice kind="warn" title="Ficha incompleta.">
          Hay {form.pendingFields.length} apartados sin datos confirmados. No se han inventado ingredientes, certificaciones, beneficios ni precios: complétalos sólo con información verificada.
        </Notice>
      )}
      {readOnly && <Notice>Tu rol sólo permite consultar esta marca.</Notice>}

      <form
        ref={formRef}
        className="card card__body"
        onSubmit={(e) => {
          e.preventDefault();
          void save('draft');
        }}
        noValidate
      >
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <Section title="Identidad" intro="Cómo se llama la marca y qué es, en pocas palabras." pending={pending('description') || pending('website')}>
            <div className="grid grid-2">
              <Field label="Nombre" required error={errors.name}>
                {(fid, d) => <input id={fid} aria-describedby={d} className="input" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} autoComplete="off" />}
              </Field>
              <Field label="Sitio web" error={errors.website} hint="URL completa, con https://">
                {(fid, d) => <input id={fid} aria-describedby={d} className="input" type="url" inputMode="url" value={form.website} placeholder="https://" onChange={(e) => set('website', e.target.value)} />}
              </Field>
            </div>
            <Field label="Descripción" error={errors.description} hint="Qué ofrece y a quién. Sólo hechos confirmados." counter={<Counter value={form.description.length} limit={2000} />}>
              {(fid, d) => <textarea id={fid} aria-describedby={d} className="textarea" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />}
            </Field>
            <Field label="Idioma" error={errors.language}>
              {(fid) => (
                <select id={fid} className="select" value={form.language} onChange={(e) => set('language', e.target.value)} style={{ maxWidth: 280 }}>
                  {LANGS.map((l) => <option key={l}>{l}</option>)}
                </select>
              )}
            </Field>
          </Section>

          <Section title="Audiencia" intro="A quién le hablas y a quién no." pending={pending('audience') || pending('bestCustomer') || pending('unwantedAudience')}>
            <Field label="Audiencia principal" error={errors.audience}>
              {(fid, d) => <textarea id={fid} aria-describedby={d} className="textarea" rows={2} value={form.audience} onChange={(e) => set('audience', e.target.value)} />}
            </Field>
            <div className="grid grid-2">
              <Field label="Cliente más rentable" hint="Perfil que más valor aporta.">
                {(fid, d) => <textarea id={fid} aria-describedby={d} className="textarea" rows={2} value={form.bestCustomer} onChange={(e) => set('bestCustomer', e.target.value)} />}
              </Field>
              <Field label="Público no deseado" hint="A quién no se dirige el contenido.">
                {(fid, d) => <textarea id={fid} aria-describedby={d} className="textarea" rows={2} value={form.unwantedAudience} onChange={(e) => set('unwantedAudience', e.target.value)} />}
              </Field>
            </div>
          </Section>

          <Section title="Voz y tono" intro="Cómo suena la marca al escribir." pending={pending('tone') || pending('personality')}>
            <div className="grid grid-2">
              <Field label="Tono" error={errors.tone} hint="Ej.: cercano, sereno, claro.">
                {(fid, d) => <input id={fid} aria-describedby={d} className="input" value={form.tone} onChange={(e) => set('tone', e.target.value)} />}
              </Field>
              <Field label="Personalidad" hint="Rasgos que la distinguen.">
                {(fid, d) => <input id={fid} aria-describedby={d} className="input" value={form.personality} onChange={(e) => set('personality', e.target.value)} />}
              </Field>
            </div>
          </Section>

          <Section title="Reglas" intro="Lo que siempre debe pasar y lo que nunca. Las palabras prohibidas bloquean el envío a revisión." pending={pending('alwaysRules') || pending('neverRules') || pending('bannedWords')}>
            <div className="grid grid-2">
              <Field label="Siempre">
                {(fid, d) => <ListInput id={fid} describedBy={d} value={form.alwaysRules} onChange={(v) => set('alwaysRules', v)} placeholder="Ej.: invitar a comentar" />}
              </Field>
              <Field label="Nunca">
                {(fid, d) => <ListInput id={fid} describedBy={d} value={form.neverRules} onChange={(v) => set('neverRules', v)} placeholder="Ej.: prometer resultados" />}
              </Field>
            </div>
            <Field label="Palabras prohibidas" hint="Separa con comas o pulsa Intro.">
              {(fid, d) => <ListInput id={fid} describedBy={d} value={form.bannedWords} onChange={(v) => set('bannedWords', v)} placeholder="Ej.: milagro" />}
            </Field>
          </Section>

          <Section title="Pilares de contenido" intro="Los grandes temas sobre los que publica la marca." pending={pending('pillars')}>
            <Field label="Pilares" error={errors.pillars}>
              {(fid, d) => <ListInput id={fid} describedBy={d} value={form.pillars} onChange={(v) => set('pillars', v)} placeholder="Ej.: rutinas, comunidad" max={12} />}
            </Field>
          </Section>

          <Section title="Kit visual" intro="Logo, colores, tipografías e imágenes de referencia. Se usan en el estudio de carruseles." pending={pending('kit')}>
            <div className="grid grid-2">
              <Field label="Logo" hint="Sube el archivo oficial; la app no dibuja logotipos.">
                {() => (
                  <div className="row">
                    <div className="thumb" style={{ width: 64, height: 64 }}>
                      {logo ? <img src={logo.url} alt="Logo" style={{ objectFit: 'contain' }} /> : <span className="xs muted" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Sin logo</span>}
                    </div>
                    <Button size="sm" icon={<ImagePlus />} onClick={() => setPicker('logo')}>
                      {logo ? 'Cambiar' : 'Elegir'}
                    </Button>
                    {logo && (
                      <Button size="sm" variant="ghost" onClick={() => setKit('logoMediaId', null)}>
                        Quitar
                      </Button>
                    )}
                  </div>
                )}
              </Field>
              <Field label="Color principal" error={errors.primaryColor}>
                {(fid) => (
                  <div className="swatch-input">
                    <input id={fid} type="color" value={form.kit.primaryColor} onChange={(e) => setKit('primaryColor', e.target.value.toUpperCase())} />
                    <input className="input mono" aria-label="Valor hexadecimal" value={form.kit.primaryColor} onChange={(e) => setKit('primaryColor', e.target.value)} style={{ maxWidth: 120 }} />
                  </div>
                )}
              </Field>
            </div>
            <Field label="Paleta" error={errors.palette} hint="Hasta 8 colores.">
              {() => (
                <div className="swatches">
                  {form.kit.palette.map((c) => (
                    <span key={c} className="chip" style={{ paddingLeft: 4 }}>
                      <span className="swatch" style={{ background: c, width: 20, height: 20 }} />
                      <span className="mono xs">{c}</span>
                      <button type="button" aria-label={`Quitar ${c}`} onClick={() => setKit('palette', form.kit.palette.filter((x) => x !== c))}>
                        <X aria-hidden />
                      </button>
                    </span>
                  ))}
                  {form.kit.palette.length < 8 && (
                    <span className="swatch-input">
                      <input type="color" aria-label="Nuevo color" value={newColor} onChange={(e) => setNewColor(e.target.value.toUpperCase())} />
                      <Button size="sm" icon={<Plus />} onClick={() => !form.kit.palette.includes(newColor) && setKit('palette', [...form.kit.palette, newColor])}>
                        Añadir
                      </Button>
                    </span>
                  )}
                </div>
              )}
            </Field>
            <Field label="Tipografías" hint="Nombres de las fuentes de la marca (hasta 4).">
              {(fid) => (
                <div className="stack-sm">
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input id={fid} className="input" value={newFont} placeholder="Ej.: Fraunces" onChange={(e) => setNewFont(e.target.value)} />
                    <Button aria-label="Añadir tipografía" icon={<Plus />} disabled={!newFont.trim() || form.kit.fonts.length >= 4} onClick={() => { setKit('fonts', [...new Set([...form.kit.fonts, newFont.trim()])]); setNewFont(''); }} />
                  </div>
                  <div className="chips">
                    {form.kit.fonts.map((f) => (
                      <span className="chip" key={f}>
                        {f}
                        <button type="button" aria-label={`Quitar ${f}`} onClick={() => setKit('fonts', form.kit.fonts.filter((x) => x !== f))}>
                          <X aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Field>
            <Field label="Imágenes de referencia" hint="Ejemplos de estilo visual. No se publican.">
              {() => (
                <div className="media-strip">
                  {form.kit.referenceMediaIds.map((mid) => {
                    const m = mediaById.get(mid);
                    return (
                      <div className="thumb" key={mid}>
                        {m && <img src={m.url} alt={m.filename} />}
                        <button type="button" className="thumb__remove" aria-label="Quitar referencia" onClick={() => setKit('referenceMediaIds', form.kit.referenceMediaIds.filter((x) => x !== mid))}>
                          <X />
                        </button>
                      </div>
                    );
                  })}
                  <button type="button" className="thumb" style={{ display: 'grid', placeItems: 'center', cursor: 'pointer', borderStyle: 'dashed' }} onClick={() => setPicker('refs')} aria-label="Añadir imágenes de referencia">
                    <ImagePlus size={20} aria-hidden />
                  </button>
                </div>
              )}
            </Field>
          </Section>

          <Section title="Lo que la marca sabe" intro="Datos verificados que pueden usarse al redactar: historia, productos confirmados, preguntas frecuentes." pending={pending('knowledge')}>
            <Field label="Conocimiento" error={errors.knowledge} counter={<Counter value={form.knowledge.length} limit={KNOWLEDGE_LIMIT} />} hint="No incluyas datos personales, contraseñas ni claves.">
              {(fid, d) => <textarea id={fid} aria-describedby={d} className="textarea" rows={8} value={form.knowledge} onChange={(e) => set('knowledge', e.target.value)} />}
            </Field>
          </Section>
        </fieldset>
      </form>

      {!readOnly && (
        <div className="action-bar">
          <div className="action-bar__status">{Object.keys(errors).length > 0 ? <span style={{ color: 'var(--c-danger)' }}>{Object.keys(errors).length} campo(s) por corregir</span> : dirty ? 'Cambios sin guardar' : 'Todo guardado'}</div>
          <Button onClick={() => void save('draft')} loading={saving === 'draft'} disabled={Boolean(saving)}>
            Guardar borrador
          </Button>
          <Button variant="primary" icon={<Check />} onClick={() => void save('activate')} loading={saving === 'activate'} disabled={Boolean(saving)}>
            Guardar y activar
          </Button>
        </div>
      )}

      {picker && (
        <MediaPicker
          onlyImages
          max={picker === 'logo' ? 1 : 12}
          brandId={id}
          selected={picker === 'logo' ? (form.kit.logoMediaId ? [form.kit.logoMediaId] : []) : form.kit.referenceMediaIds}
          onClose={() => setPicker(null)}
          onChange={(ids) => {
            if (picker === 'logo') setKit('logoMediaId', ids[0] ?? null);
            else setKit('referenceMediaIds', ids);
            void media.reload();
          }}
        />
      )}
      {confirmArchive && (
        <Confirm
          title="Archivar marca"
          confirmLabel="Archivar"
          danger
          onClose={() => setConfirmArchive(false)}
          onConfirm={async () => {
            await api.post(`/brands/${id}/archive`, { archived: true });
            toast('Marca archivada.');
            setDirty(false);
            nav('/marcas');
          }}
        >
          La marca dejará de aparecer al crear publicaciones. Sus publicaciones se conservan y puedes restaurarla después.
        </Confirm>
      )}
      {blocker.state === 'blocked' && (
        <Confirm title="Hay cambios sin guardar" confirmLabel="Salir sin guardar" danger closeAfterConfirm={false} onClose={() => blocker.reset()} onConfirm={() => blocker.proceed()}>
          Si sales ahora, se perderán los cambios de esta marca.
        </Confirm>
      )}
    </>
  );
}
