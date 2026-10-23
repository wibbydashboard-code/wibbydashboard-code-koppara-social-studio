import type { AiProvider, TextRequest, TextSuggestion } from './types.ts';

/**
 * Proveedor sin IA: arma borradores a partir de estructuras fijas y los datos de la marca.
 * Sólo reutiliza lo que la persona escribió (idea, pilar, reglas); no añade afirmaciones
 * sobre productos. Los huecos quedan marcados con [corchetes] para completarse a mano.
 */
const STRUCTURES: ((r: TextRequest) => string)[] = [
  (r) => `${cap(r.brief)}.\n\n[Contexto o detalle concreto que puedas confirmar]\n\n[Pregunta abierta para tu comunidad]`,
  (r) => `${r.pillar ? `${cap(r.pillar)} · ` : ''}${cap(r.brief)}\n\n1. [Primer punto]\n2. [Segundo punto]\n3. [Tercer punto]\n\nGuarda esta publicación para tenerla a mano.`,
  (r) => `Hoy queremos hablar de ${lowerFirst(r.brief)}.\n\n[Cuenta una experiencia real o una pregunta frecuente]\n\n[Llamada a la acción sin promesas de resultados]`,
];

export const localTemplateProvider: AiProvider = {
  id: 'local-templates',
  label: 'Plantillas locales (sin IA)',
  isAi: false,
  estimateCredits: () => 0,
  async generateText(r: TextRequest): Promise<TextSuggestion[]> {
    const out: TextSuggestion[] = [];
    for (let i = 0; i < Math.min(r.variants, STRUCTURES.length); i++) {
      let text = STRUCTURES[i](r);
      if (r.network === 'youtube') text = `${cap(r.brief).slice(0, 90)}\n\n${text}`;
      out.push({ text });
    }
    return out;
  },
};

function cap(s: string) {
  const t = s.trim().replace(/[.\s]+$/, '');
  return t.charAt(0).toLocaleUpperCase('es') + t.slice(1);
}
function lowerFirst(s: string) {
  const t = s.trim().replace(/[.\s]+$/, '');
  return t.charAt(0).toLocaleLowerCase('es') + t.slice(1);
}
