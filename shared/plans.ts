export interface WorkspacePlan {
  id: 'starter' | 'pro' | 'agency' | 'enterprise';
  name: string;
  maxBrands: number; // -1 = ilimitado
  maxAccountsPerBrand: number;
  maxScheduledPostsPerMonth: number;
  features: string[];
}

export const WORKSPACE_PLANS: Record<string, WorkspacePlan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    maxBrands: 3,
    maxAccountsPerBrand: 5,
    maxScheduledPostsPerMonth: 50,
    features: ['multi_brand', 'media_library', 'approval_workflow'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    maxBrands: 10,
    maxAccountsPerBrand: 10,
    maxScheduledPostsPerMonth: 250,
    features: ['multi_brand', 'media_library', 'approval_workflow', 'ai_assistant', 'analytics'],
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    maxBrands: -1, // Ilimitado
    maxAccountsPerBrand: 25,
    maxScheduledPostsPerMonth: -1,
    features: ['multi_brand', 'media_library', 'approval_workflow', 'ai_assistant', 'analytics', 'audit_logs'],
  },
};

/**
 * Validador de capacidad de marcas preparado para cuando se activen suscripciones.
 * En el MVP actual no bloquea la adición de nuevas marcas, pero proporciona el punto
 * de enganche centralizado para consultar cuotas.
 */
export function canAddBrand(currentActiveBrands: number, planId = 'agency'): { allowed: boolean; reason?: string } {
  const plan = WORKSPACE_PLANS[planId] ?? WORKSPACE_PLANS.agency;
  if (plan.maxBrands === -1 || currentActiveBrands < plan.maxBrands) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Has alcanzado el límite de ${plan.maxBrands} marcas permitidas en tu plan actual (${plan.name}).`,
  };
}
