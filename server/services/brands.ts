import { brandsRepo } from '../repositories/brands.ts';
import { can } from '../../shared/workflow.ts';
import { validateBrand } from '../../shared/validation.ts';
import { forbidden, invalid, notFound } from '../http/errors.ts';
import type { Brand, User } from '../../shared/types.ts';

const cleanList = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].slice(0, 50) : [];

function sanitize(input: Partial<Brand>): Partial<Brand> {
  const s = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    name: s(input.name, 120),
    website: s(input.website, 300),
    description: s(input.description),
    audience: s(input.audience),
    bestCustomer: s(input.bestCustomer),
    unwantedAudience: s(input.unwantedAudience),
    tone: s(input.tone, 500),
    personality: s(input.personality, 500),
    language: s(input.language, 40),
    alwaysRules: cleanList(input.alwaysRules),
    neverRules: cleanList(input.neverRules),
    bannedWords: cleanList(input.bannedWords),
    pillars: cleanList(input.pillars),
    knowledge: typeof input.knowledge === 'string' ? input.knowledge : '',
    pendingFields: cleanList(input.pendingFields),
    kit: {
      logoMediaId: input.kit?.logoMediaId ?? null,
      primaryColor: s(input.kit?.primaryColor, 7) || '#1F4D3A',
      palette: cleanList(input.kit?.palette).slice(0, 8),
      fonts: cleanList(input.kit?.fonts).slice(0, 4),
      referenceMediaIds: cleanList(input.kit?.referenceMediaIds).slice(0, 12),
    },
  };
}

export const brandService = {
  /** mode: 'draft' guarda aunque falten datos; 'activate' exige el perfil completo. */
  save(user: User, input: Partial<Brand>, mode: 'draft' | 'activate', id?: string): Brand {
    if (!can(user.role, 'brand.edit')) throw forbidden();
    const data = sanitize(input);
    const errors = validateBrand(data, mode === 'activate');
    if (Object.keys(errors).length) throw invalid('Revisa los campos marcados.', errors);
    if (id) {
      const cur = brandsRepo.get(id);
      if (!cur) throw notFound('La marca');
      const status = mode === 'activate' ? 'active' : cur.status === 'archived' ? 'archived' : cur.status;
      return brandsRepo.update(id, data, status);
    }
    return brandsRepo.create({ ...data, name: data.name! }, mode === 'activate' ? 'active' : 'draft');
  },
  archive(user: User, id: string, archived: boolean): Brand {
    if (!can(user.role, 'brand.archive')) throw forbidden();
    const b = brandsRepo.get(id);
    if (!b) throw notFound('La marca');
    brandsRepo.setStatus(id, archived ? 'archived' : 'draft');
    return brandsRepo.get(id)!;
  },
};
