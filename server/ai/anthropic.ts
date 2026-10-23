import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.ts';
import type { AiProvider, TextRequest, TextSuggestion } from './types.ts';
import { PLATFORMS } from '../../shared/platforms.ts';

/** Proveedor opcional. Sólo se activa si ANTHROPIC_API_KEY está definida. */
export function createAnthropicProvider(): AiProvider | null {
  if (!config.anthropicKey) return null;
  const client = new Anthropic({ apiKey: config.anthropicKey });

  return {
    id: 'anthropic',
    label: `Claude (${config.aiModel})`,
    isAi: true,
    estimateCredits: (r) => r.variants,
    async generateText(r: TextRequest): Promise<TextSuggestion[]> {
      const b = r.brand;
      const limit = r.network ? PLATFORMS[r.network].textLimit : 2200;
      const system = [
        'Redactas borradores de publicaciones para redes sociales que una persona revisará y aprobará.',
        'Usa sólo la información de la marca que se te da. No inventes ingredientes, certificaciones, precios, beneficios, resultados ni testimonios.',
        'Nunca hagas afirmaciones de salud, curas, tratamientos, prevención de enfermedades ni resultados garantizados.',
        'Si falta un dato, deja un marcador entre corchetes, por ejemplo [dato por confirmar].',
        `Responde sólo con JSON: {"variants": ["texto 1", ...]} con exactamente ${r.variants} textos de máximo ${limit} caracteres.`,
      ].join('\n');
      const brandInfo = {
        nombre: b.name, descripcion: b.description, audiencia: b.audience, tono: b.tone, personalidad: b.personality,
        idioma: b.language, siempre: b.alwaysRules, nunca: b.neverRules, palabrasProhibidas: b.bannedWords,
        conocimiento: b.knowledge,
      };
      const response = await client.beta.messages.create({
        model: config.aiModel,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system,
        messages: [
          {
            role: 'user',
            content: `Marca: ${JSON.stringify(brandInfo)}\nRed: ${r.network ?? 'general'}\nPilar: ${r.pillar ?? '-'}\nIdea: ${r.brief}`,
          },
        ],
      } as Anthropic.Beta.MessageCreateParamsNonStreaming);
      if (response.stop_reason === 'refusal') throw new Error('El proveedor de IA rechazó la solicitud.');
      const text = response.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? (JSON.parse(match[0]) as { variants?: unknown }) : {};
      const variants = Array.isArray(parsed.variants) ? parsed.variants.filter((v): v is string => typeof v === 'string') : [];
      if (!variants.length) throw new Error('La respuesta de IA no tuvo el formato esperado.');
      return variants.map((t) => ({ text: t }));
    },
  };
}
