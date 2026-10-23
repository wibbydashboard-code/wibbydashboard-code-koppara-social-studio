import type { Issue } from './types.ts';

/**
 * Detecta afirmaciones de salud, curas, resultados garantizados u otras promesas que
 * requieren respaldo. Es una salvaguarda, no una revisión legal: un texto sin avisos
 * todavía necesita aprobación humana.
 */
const RISKY_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bcur(a|an|ar|ará|ativo|ativa|ación)\b/i, label: 'promesa de cura' },
  { re: /\b(sana|sanar|sanación)\b/i, label: 'promesa de sanación' },
  { re: /\btrat(a|ar|amiento)\s+(el|la|los|las)?\s*(acné|dermatitis|psoriasis|enfermedad|infecci)/i, label: 'tratamiento de una condición' },
  { re: /\b(previene|prevenir|evita)\s+(el|la)?\s*(cáncer|enfermedad|envejecimiento|infecci)/i, label: 'prevención de enfermedad' },
  { re: /\bgarantizad[oa]s?\b|\bresultados?\s+garantizados?\b/i, label: 'resultado garantizado' },
  { re: /\b100\s?%\s*(efectiv|natural|segur|eficaz)/i, label: 'afirmación absoluta' },
  { re: /\bmilagros[oa]?\b/i, label: 'afirmación milagrosa' },
  { re: /\bclínicamente\s+(probad|comprobad)/i, label: 'aval clínico no confirmado' },
  { re: /\bdermatológicamente\s+probad/i, label: 'aval dermatológico no confirmado' },
  { re: /\b(elimina|desaparece)\s+(arrugas|manchas|celulitis|estrías|acné)/i, label: 'resultado estético absoluto' },
  { re: /\bsin\s+efectos\s+secundarios\b/i, label: 'afirmación de seguridad' },
  { re: /\b(aprobado|certificado)\s+por\b/i, label: 'certificación no confirmada' },
  { re: /\b(adelgaza|bajar?\s+de\s+peso|quema\s+grasa)\b/i, label: 'promesa de pérdida de peso' },
];

export function checkCompliance(text: string, bannedWords: string[] = []): Issue[] {
  const issues: Issue[] = [];
  if (!text) return issues;
  for (const { re, label } of RISKY_PATTERNS) {
    const m = text.match(re);
    if (m) {
      issues.push({
        level: 'error',
        code: 'claim',
        message: `Posible ${label}: “${m[0]}”. Elimínalo o respáldalo con datos confirmados.`,
      });
    }
  }
  const lower = text.toLocaleLowerCase('es');
  for (const w of bannedWords) {
    const word = w.trim();
    if (word && lower.includes(word.toLocaleLowerCase('es'))) {
      issues.push({ level: 'error', code: 'banned', message: `Contiene una palabra prohibida por la marca: “${word}”.` });
    }
  }
  return issues;
}
