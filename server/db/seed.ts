import { db, tx } from './database.ts';
import { brandsRepo, emptyBrandData } from '../repositories/brands.ts';
import { accountsRepo } from '../repositories/accounts.ts';
import { postsRepo } from '../repositories/posts.ts';
import { creditsRepo, settingsRepo, usersRepo } from '../repositories/workspace.ts';

/** Campos de la ficha de Koppara que necesitan una fuente confirmada. */
export const KOPPARA_PENDING = [
  'website', 'description', 'audience', 'bestCustomer', 'unwantedAudience', 'tone', 'personality',
  'alwaysRules', 'neverRules', 'bannedWords', 'pillars', 'knowledge', 'kit',
];

/** Datos iniciales mínimos. Idempotente: sólo actúa sobre una base vacía. */
export function seedIfEmpty() {
  const hasUsers = (db.prepare('SELECT COUNT(*) c FROM users').get() as { c: number }).c > 0;
  if (hasUsers) return;
  tx(() => {
    settingsRepo.set({});
    const owner = usersRepo.create({ name: 'Responsable Koppara', email: 'propietario@koppara.local', role: 'owner', isDemo: false });
    // Personas de demostración para probar el flujo de aprobación por roles.
    usersRepo.create({ name: 'Admin de prueba', email: 'admin@demo.local', role: 'admin', isDemo: true });
    usersRepo.create({ name: 'Publicador de prueba', email: 'publicador@demo.local', role: 'publisher', isDemo: true });
    usersRepo.create({ name: 'Editor de prueba', email: 'editor@demo.local', role: 'editor', isDemo: true });
    usersRepo.create({ name: 'Lector de prueba', email: 'lector@demo.local', role: 'viewer', isDemo: true });

    brandsRepo.create(
      {
        ...emptyBrandData(),
        name: 'Koppara',
        language: 'Español',
        // Sin paleta: los colores reales de Koppara no se pudieron confirmar.
        pendingFields: KOPPARA_PENDING,
      },
      'draft',
    );

    creditsRepo.record({ userId: owner.id, kind: 'grant', provider: 'sistema', credits: settingsRepo.get().monthlyCredits, description: 'Asignación inicial del plan interno' });
  });
}

const DEMO_TAG = 'demo';

export function loadDemoData(userId: string) {
  if (brandsRepo.list(true).some((b) => b.isDemo)) return;
  tx(() => {
    const brand = brandsRepo.create(
      {
        ...emptyBrandData(),
        name: 'Marca de ejemplo (demo)',
        website: 'https://ejemplo.invalid',
        description: 'Marca ficticia para practicar el flujo. No representa a ninguna empresa real.',
        audience: 'Personas que prueban la herramienta.',
        tone: 'Cercano y claro',
        personality: 'Práctica, amable',
        pillars: ['Consejos', 'Detrás de escena', 'Comunidad'],
        alwaysRules: ['Invitar a comentar'],
        neverRules: ['Prometer resultados'],
        bannedWords: ['milagro'],
        kit: { logoMediaId: null, primaryColor: '#3E6B57', palette: ['#3E6B57', '#C9D6C3', '#B4583A', '#F4EFE6'], fonts: ['Fraunces', 'Inter'], referenceMediaIds: [] },
      },
      'active',
      true,
    );
    const fb = accountsRepo.create({ network: 'facebook', handle: 'ejemplo.demo', displayName: 'Página de ejemplo', accountType: 'Página', brandId: brand.id, mode: 'demo', isDemo: true });
    accountsRepo.create({ network: 'instagram', handle: '@ejemplo.demo', displayName: 'Ejemplo IG', accountType: 'Profesional (Empresa)', brandId: brand.id, mode: 'demo', isDemo: true });
    accountsRepo.create({ network: 'tiktok', handle: '@ejemplo.demo', displayName: 'Ejemplo TikTok', accountType: 'Cuenta de empresa', brandId: brand.id, mode: 'demo', isDemo: true });

    const day = (n: number, h: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      d.setHours(h, 0, 0, 0);
      return d.toISOString();
    };
    const mk = (title: string, text: string, plannedAt: string) =>
      postsRepo.create(
        { brandId: brand.id, internalTitle: title, tags: [DEMO_TAG], baseText: text, mediaIds: [], plannedAt, targets: [{ accountId: fb.id, network: 'facebook', format: 'feed', text: null, tiktok: null }] },
        userId,
        true,
      );
    const review = mk('Ejemplo · pregunta a la comunidad', '¿Qué tema te gustaría que tratemos la próxima semana? Te leemos en comentarios.', day(2, 10));
    postsRepo.setStatus(review.id, 'in_review');
    postsRepo.addEvent(review.id, userId, 'submit', 'Datos de demostración');

    const sched = mk('Ejemplo · detrás de escena', 'Así preparamos el contenido de esta semana. [Añade un detalle real]', day(5, 18));
    postsRepo.setStatus(sched.id, 'scheduled', { simulated: true });
    postsRepo.setAllTargets(sched.id, 'scheduled');

    const failed = mk('Ejemplo · error simulado', 'Publicación de ejemplo para ver cómo se muestra un error por destino.', day(-2, 12));
    postsRepo.setStatus(failed.id, 'failed', { simulated: true });
    const t = postsRepo.get(failed.id)!.targets[0];
    postsRepo.setTargetStatus(t.id, 'failed', 'Simulación de error (demo): la sesión de la cuenta expiró. En una integración real habría que volver a autorizar la cuenta.', true, true);
  });
}

export function removeDemoData() {
  tx(() => {
    db.exec(`
      DELETE FROM posts WHERE is_demo = 1 OR brand_id IN (SELECT id FROM brands WHERE is_demo = 1);
      DELETE FROM post_targets WHERE account_id IN (SELECT id FROM accounts WHERE is_demo = 1);
      DELETE FROM accounts WHERE is_demo = 1;
      DELETE FROM brands WHERE is_demo = 1;
    `);
  });
}
