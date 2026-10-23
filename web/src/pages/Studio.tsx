import { useEffect, useState } from 'react';
import { Plus, Trash2, Download, ArrowUp, ArrowDown } from 'lucide-react';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { useToast } from '../lib/toast.tsx';
import { ApiError } from '../lib/api.ts';
import { Button, EmptyState, Field, Loading, Notice, PageHeader, Segmented } from '../components/ui.tsx';
import { uploadFile } from '../components/MediaPicker.tsx';
import type { Brand } from '../../../shared/types.ts';

interface Slide { kicker: string; title: string; body: string }
type Style = 'light' | 'deep' | 'accent';

/** Paleta provisional si la marca aún no tiene colores confirmados. */
const FALLBACK = ['#1F4D3A', '#E3EADF', '#A8502F', '#F6F2EA'];

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const inkFor = (bg: string) => (luminance(bg) > 0.4 ? '#1C2520' : '#FBF8F2');

function colorsFor(palette: string[], style: Style) {
  const p = palette.length >= 2 ? palette : FALLBACK;
  const sorted = [...p].sort((a, b) => luminance(a) - luminance(b));
  const dark = sorted[0];
  const light = sorted[sorted.length - 1];
  const accent = p.find((c) => c !== dark && c !== light) ?? dark;
  const bg = style === 'light' ? light : style === 'deep' ? dark : accent;
  return { bg, fg: inkFor(bg), rule: style === 'light' ? accent : light };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

async function renderSlide(slide: Slide, i: number, total: number, c: ReturnType<typeof colorsFor>, square: boolean, brandName: string): Promise<Blob> {
  const W = 1080, H = square ? 1080 : 1350, pad = 96;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  await document.fonts.ready;
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.fg;
  ctx.globalAlpha = 0.8; ctx.font = '600 30px "Inter Variable", sans-serif';
  ctx.fillText(slide.kicker.toUpperCase(), pad, pad + 20);
  ctx.globalAlpha = 1; ctx.fillStyle = c.rule; ctx.fillRect(pad, pad + 48, 80, 5);
  ctx.fillStyle = c.fg; ctx.font = '600 76px "Fraunces Variable", Georgia, serif';
  let y = pad + 180;
  for (const l of wrap(ctx, slide.title, W - pad * 2)) { ctx.fillText(l, pad, y); y += 88; }
  ctx.globalAlpha = 0.9; ctx.font = '400 38px "Inter Variable", sans-serif'; y += 30;
  for (const l of wrap(ctx, slide.body, W - pad * 2)) { ctx.fillText(l, pad, y); y += 56; }
  ctx.globalAlpha = 0.7; ctx.font = '500 28px "Inter Variable", sans-serif';
  ctx.fillText(brandName, pad, H - pad);
  const pg = `${i + 1}/${total}`;
  ctx.fillText(pg, W - pad - ctx.measureText(pg).width, H - pad);
  // Marca de agua para que nunca se confunda con una pieza final aprobada.
  ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(W - 250, 40, 210, 52);
  ctx.fillStyle = '#fff'; ctx.font = '700 26px "Inter Variable", sans-serif'; ctx.fillText('MAQUETA', W - 222, 76);
  return new Promise((res) => cv.toBlob((b) => res(b!), 'image/png'));
}

export function StudioPage() {
  const s = useSession();
  const toast = useToast();
  const brands = useApi<Brand[]>('/brands');
  const [brandId, setBrandId] = useState('');
  const [style, setStyle] = useState<Style>('light');
  const [ratio, setRatio] = useState<'portrait' | 'square'>('portrait');
  const [slides, setSlides] = useState<Slide[]>([
    { kicker: 'Guía rápida', title: 'Título de la portada', body: 'Una frase que invite a deslizar.' },
    { kicker: 'Paso 1', title: 'Primer punto', body: 'Explica una idea concreta y verificable.' },
    { kicker: 'Cierre', title: '¿Te sirvió?', body: 'Guárdalo y cuéntanos en comentarios.' },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!brandId && brands.data?.length) setBrandId(brands.data[0].id);
  }, [brands.data, brandId]);

  if (brands.loading && !brands.data) return <Loading />;
  const brand = brands.data?.find((b) => b.id === brandId);
  const usingFallback = !brand || brand.kit.palette.length < 2;
  const c = colorsFor(brand?.kit.palette ?? [], style);
  const setSlide = (i: number, patch: Partial<Slide>) => setSlides((x) => x.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)));
  const moveSlide = (i: number, d: number) => setSlides((x) => { const n = [...x]; const [it] = n.splice(i, 1); n.splice(i + d, 0, it); return n; });

  return (
    <>
      <PageHeader eyebrow="Herramientas" title="Estudio de carruseles" description="Maqueta carruseles con la paleta y tipografía de la marca para revisar estructura y texto antes de diseñar la pieza final." />
      <Notice kind="demo" title="Vista previa de maqueta.">
        La generación visual con IA no está conectada. Esto compone texto sobre colores de la marca; no crea fotografías ni representa productos reales. Costo: 0 créditos.
      </Notice>
      {!brands.data?.length ? (
        <div className="card"><EmptyState title="Crea una marca primero">El estudio usa la paleta y el nombre de la marca.</EmptyState></div>
      ) : (
        <div className="studio">
          <div className="card card__body stack">
            <Field label="Marca">
              {(fid) => (
                <select id={fid} className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                  {brands.data!.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </Field>
            {usingFallback && <p className="xs muted">Esta marca no tiene paleta confirmada; se usa la paleta provisional de la app.</p>}
            <div className="row-between">
              <Segmented label="Estilo" value={style} onChange={setStyle} options={[{ id: 'light', label: 'Claro' }, { id: 'deep', label: 'Profundo' }, { id: 'accent', label: 'Acento' }]} />
              <Segmented label="Proporción" value={ratio} onChange={setRatio} options={[{ id: 'portrait', label: '4:5' }, { id: 'square', label: '1:1' }]} />
            </div>
            {slides.map((sl, i) => (
              <fieldset key={i} className="variant" style={{ margin: 0, padding: 0, minWidth: 0 }}>
                <legend className="sr-only">Diapositiva {i + 1}</legend>
                <div className="variant__head">
                  <strong className="small">Diapositiva {i + 1}</strong>
                  <span className="grow" />
                  <Button size="sm" variant="ghost" aria-label="Subir" icon={<ArrowUp />} disabled={i === 0} onClick={() => moveSlide(i, -1)} />
                  <Button size="sm" variant="ghost" aria-label="Bajar" icon={<ArrowDown />} disabled={i === slides.length - 1} onClick={() => moveSlide(i, 1)} />
                  <Button size="sm" variant="ghost" aria-label="Eliminar diapositiva" icon={<Trash2 />} disabled={slides.length === 1} onClick={() => setSlides((x) => x.filter((_, j) => j !== i))} />
                </div>
                <div className="variant__body" style={{ gap: 10 }}>
                  <input className="input" aria-label="Antetítulo" value={sl.kicker} maxLength={30} onChange={(e) => setSlide(i, { kicker: e.target.value })} />
                  <input className="input" aria-label="Título" value={sl.title} maxLength={70} onChange={(e) => setSlide(i, { title: e.target.value })} />
                  <textarea className="textarea" aria-label="Texto" rows={2} value={sl.body} maxLength={180} onChange={(e) => setSlide(i, { body: e.target.value })} />
                </div>
              </fieldset>
            ))}
            <Button icon={<Plus />} disabled={slides.length >= 10} onClick={() => setSlides((x) => [...x, { kicker: `Paso ${x.length}`, title: 'Nuevo punto', body: '' }])}>
              Añadir diapositiva
            </Button>
          </div>

          <div className="stack">
            <div className="slides" aria-label="Vista previa del carrusel">
              {slides.map((sl, i) => (
                <div key={i} className={`slide ${ratio === 'square' ? 'slide--square' : ''}`} style={{ background: c.bg, color: c.fg }}>
                  <span className="watermark">MAQUETA</span>
                  <div>
                    <div className="slide__kicker">{sl.kicker}</div>
                    <div style={{ width: 28, height: 3, background: c.rule, margin: '10px 0 18px' }} />
                    <div className="slide__title" style={{ fontFamily: 'var(--font-display)' }}>{sl.title}</div>
                    <p className="slide__body" style={{ marginTop: 12 }}>{sl.body}</p>
                  </div>
                  <div className="slide__foot"><span>{brand?.name}</span><span>{i + 1}/{slides.length}</span></div>
                </div>
              ))}
            </div>
            {s.can('media.edit') && (
              <div className="row">
                <Button
                  variant="primary"
                  icon={<Download />}
                  loading={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      for (let i = 0; i < slides.length; i++) {
                        const blob = await renderSlide(slides[i], i, slides.length, c, ratio === 'square', brand?.name ?? '');
                        await uploadFile(new File([blob], `maqueta-${i + 1}.png`, { type: 'image/png' }), { brandId, isMockup: 'true', tags: 'maqueta' });
                      }
                      toast(`${slides.length} maquetas guardadas en Media.`);
                    } catch (e) {
                      toast(e instanceof ApiError ? e.message : 'No se pudieron guardar.', 'error');
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Guardar en Media como maqueta
                </Button>
                <span className="small muted">Se guardan como PNG con marca de agua “MAQUETA”.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
