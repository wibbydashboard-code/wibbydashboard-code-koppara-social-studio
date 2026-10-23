import { createAnthropicProvider } from '../ai/anthropic.ts';
import { localTemplateProvider } from '../ai/localTemplates.ts';
import type { AiProvider, TextRequest } from '../ai/types.ts';
import { brandsRepo } from '../repositories/brands.ts';
import { creditsRepo } from '../repositories/workspace.ts';
import { checkCompliance } from '../../shared/compliance.ts';
import { can } from '../../shared/workflow.ts';
import { conflict, forbidden, invalid, notFound } from '../http/errors.ts';
import type { Network, User } from '../../shared/types.ts';
import { NETWORKS } from '../../shared/platforms.ts';

const remote = createAnthropicProvider();

export function activeProvider(): AiProvider {
  return remote ?? localTemplateProvider;
}

interface RawRequest {
  brandId?: string;
  brief?: string;
  pillar?: string;
  network?: string;
  variants?: number;
}

function buildRequest(raw: RawRequest): TextRequest {
  const brand = raw.brandId ? brandsRepo.get(raw.brandId) : null;
  if (!brand) throw notFound('La marca');
  const brief = String(raw.brief ?? '').trim();
  if (brief.length < 5) throw invalid('Describe la idea en al menos 5 caracteres.', { brief: 'Demasiado corta.' });
  const network = NETWORKS.includes(raw.network as Network) ? (raw.network as Network) : undefined;
  return { brand, brief: brief.slice(0, 600), pillar: raw.pillar?.slice(0, 120), network, variants: Math.min(Math.max(Number(raw.variants) || 3, 1), 3) };
}

export const aiService = {
  info() {
    const p = activeProvider();
    return { provider: p.id, label: p.label, isAi: p.isAi, balance: creditsRepo.balance() };
  },
  estimate(raw: RawRequest) {
    const p = activeProvider();
    const req = buildRequest(raw);
    return { provider: p.id, label: p.label, isAi: p.isAi, credits: p.estimateCredits(req), balance: creditsRepo.balance() };
  },
  async generate(user: User, raw: RawRequest & { confirmedCredits?: number }) {
    if (!can(user.role, 'ai.generate')) throw forbidden();
    const p = activeProvider();
    const req = buildRequest(raw);
    const cost = p.estimateCredits(req);
    // La persona debe haber visto el costo: si cambió, se pide confirmar de nuevo.
    if (raw.confirmedCredits !== cost) throw conflict('El costo estimado cambió. Revísalo y confirma de nuevo.', { credits: cost });
    if (cost > creditsRepo.balance()) throw conflict('No hay créditos suficientes para esta generación.');
    const suggestions = await p.generateText(req);
    creditsRepo.record({
      userId: user.id,
      kind: 'text',
      provider: p.id,
      credits: -cost,
      description: `${p.isAi ? 'Generación de texto' : 'Plantillas locales (sin IA)'} · ${req.brand.name} · ${suggestions.length} opciones`,
    });
    return {
      provider: p.id,
      label: p.label,
      isAi: p.isAi,
      credits: cost,
      suggestions: suggestions.map((s) => ({ text: s.text, issues: checkCompliance(s.text, req.brand.bannedWords) })),
    };
  },
};
