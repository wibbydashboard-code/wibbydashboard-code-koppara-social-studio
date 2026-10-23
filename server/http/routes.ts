import { Router, type Request } from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { config } from '../config.ts';
import { brandsRepo } from '../repositories/brands.ts';
import { accountsRepo } from '../repositories/accounts.ts';
import { mediaRepo } from '../repositories/media.ts';
import { postsRepo } from '../repositories/posts.ts';
import { creditsRepo, settingsRepo, usersRepo } from '../repositories/workspace.ts';
import { brandService } from '../services/brands.ts';
import { postIssues, postService } from '../services/posts.ts';
import { aiService } from '../services/ai.ts';
import { mediaService } from '../services/media.ts';
import { integrationStatuses, getAdapter } from '../integrations/registry.ts';
import { loadDemoData, removeDemoData } from '../db/seed.ts';
import { canStoreSecrets } from '../security/crypto.ts';
import { can, type PostAction } from '../../shared/workflow.ts';
import { NETWORKS, PLATFORMS } from '../../shared/platforms.ts';
import { conflict, forbidden, invalid, notFound } from './errors.ts';
import type { Network, Role, User } from '../../shared/types.ts';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMB * 1024 * 1024, files: 1 } });

/**
 * Sesión de demostración: la persona activa viaja en la cabecera x-user-id.
 * NO es autenticación. Ver docs/architecture.md → "Autenticación pendiente".
 */
function currentUser(req: Request): User {
  const id = req.header('x-user-id');
  const u = (id && usersRepo.get(id)) || usersRepo.list().find((x) => x.role === 'owner');
  if (!u) throw forbidden('No hay usuarios configurados.');
  return u;
}

const ROLES: Role[] = ['owner', 'admin', 'publisher', 'editor', 'viewer'];

export function apiRouter() {
  const r = Router();

  r.get('/session', (req, res) => {
    res.json({ user: currentUser(req), users: usersRepo.list(), settings: settingsRepo.get(), ai: aiService.info() });
  });

  r.get('/overview', (_req, res) => {
    const brands = brandsRepo.list();
    const accounts = accountsRepo.list();
    const posts = postsRepo.list();
    const counts: Record<string, number> = {};
    for (const p of posts) counts[p.status] = (counts[p.status] ?? 0) + 1;
    res.json({
      setup: {
        brand: brands.some((b) => b.status === 'active'),
        brandDraft: brands.length > 0,
        account: accounts.length > 0,
        accountAssigned: accounts.some((a) => a.brandId),
        post: posts.length > 0,
      },
      counts,
      recent: posts.slice(0, 5),
      brands,
      hasDemo: brands.some((b) => b.isDemo),
    });
  });

  // ---- Configuración del espacio
  r.patch('/settings', (req, res) => {
    const u = currentUser(req);
    if (!can(u.role, 'team.manage')) throw forbidden();
    const { timezone, name, requireDifferentApprover, monthlyCredits } = req.body ?? {};
    if (timezone !== undefined) {
      try {
        new Intl.DateTimeFormat('es', { timeZone: timezone });
      } catch {
        throw invalid('Zona horaria no válida.');
      }
    }
    if (monthlyCredits !== undefined && !can(u.role, 'plan.manage')) throw forbidden('Sólo el propietario cambia el plan.');
    settingsRepo.set({ timezone, name, requireDifferentApprover, monthlyCredits });
    res.json(settingsRepo.get());
  });

  // ---- Equipo
  r.post('/users', (req, res) => {
    const u = currentUser(req);
    if (!can(u.role, 'team.manage')) throw forbidden();
    const { name, email, role } = req.body ?? {};
    if (!String(name ?? '').trim()) throw invalid('Nombre obligatorio.', { name: 'Obligatorio.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? ''))) throw invalid('Correo no válido.', { email: 'Correo no válido.' });
    if (!ROLES.includes(role) || role === 'owner') throw invalid('Rol no válido.');
    if (usersRepo.list().some((x) => x.email === String(email).toLowerCase())) throw conflict('Ese correo ya está en el equipo.');
    res.status(201).json(usersRepo.create({ name: String(name).trim(), email: String(email), role, isDemo: false }));
  });
  r.patch('/users/:id', (req, res) => {
    const u = currentUser(req);
    if (!can(u.role, 'team.manage')) throw forbidden();
    const target = usersRepo.get(req.params.id);
    if (!target) throw notFound('La persona');
    const role = req.body?.role as Role;
    if (!ROLES.includes(role)) throw invalid('Rol no válido.');
    if ((role === 'owner' || target.role === 'owner') && u.role !== 'owner') throw forbidden('Sólo el propietario cambia la propiedad.');
    if (target.role === 'owner' && role !== 'owner' && usersRepo.countRole('owner') <= 1) throw conflict('Debe quedar al menos un propietario.');
    usersRepo.setRole(target.id, role);
    res.json(usersRepo.get(target.id));
  });

  // ---- Marcas
  r.get('/brands', (req, res) => res.json(brandsRepo.list(req.query.archived === '1')));
  r.get('/brands/:id', (req, res) => {
    const b = brandsRepo.get(req.params.id);
    if (!b) throw notFound('La marca');
    res.json(b);
  });
  r.post('/brands', (req, res) => res.status(201).json(brandService.save(currentUser(req), req.body, req.query.mode === 'activate' ? 'activate' : 'draft')));
  r.put('/brands/:id', (req, res) =>
    res.json(brandService.save(currentUser(req), req.body, req.query.mode === 'activate' ? 'activate' : 'draft', req.params.id)),
  );
  r.post('/brands/:id/archive', (req, res) => res.json(brandService.archive(currentUser(req), req.params.id, req.body?.archived !== false)));

  // ---- Cuentas e integraciones oficiales
  r.get('/accounts', (_req, res) => res.json(accountsRepo.list()));
  r.get('/integrations', (_req, res) =>
    res.json({
      adapters: integrationStatuses(),
      secretsStorage: canStoreSecrets(),
      configStatus: {
        metaConfigured: Boolean(config.metaAppId && config.metaAppSecret && canStoreSecrets()),
      },
    }),
  );

  // Endpoint de autenticación OAuth oficial (Meta / Facebook / Instagram)
  r.post('/integrations/:network/auth-url', async (req, res) => {
    const u = currentUser(req);
    if (!can(u.role, 'account.manage')) throw forbidden();
    const network = req.params.network as Network;
    if (!NETWORKS.includes(network)) throw invalid('Red no válida.');
    const adapter = getAdapter(network);
    const st = adapter.status();
    if (!st.configured) {
      throw conflict(st.reason, st);
    }
    const state = randomBytes(16).toString('hex');
    const url = await adapter.getAuthorizationUrl(state);
    res.json({ url, state });
  });

  // Callback de OAuth para Meta
  r.get('/integrations/meta/callback', async (req, res) => {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    if (!code) throw invalid('Código de autorización no recibido de Meta.');
    try {
      const adapter = getAdapter('facebook');
      await adapter.completeAuthorization(code, state);
      res.redirect('/cuentas?connected=meta');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al vincular con Meta.';
      res.redirect(`/cuentas?error=${encodeURIComponent(msg)}`);
    }
  });

  // Creación de cuenta demo (reservado para pruebas automatizadas)
  r.post('/accounts/demo', (req, res) => {
    const u = currentUser(req);
    if (!can(u.role, 'account.manage')) throw forbidden();
    const network = req.body?.network as Network;
    if (!NETWORKS.includes(network)) throw invalid('Red no válida.');
    const handle = String(req.body?.handle ?? '').trim() || `@demo.${network}`;
    const brandId = req.body?.brandId && brandsRepo.get(req.body.brandId) ? req.body.brandId : null;
    const types: Record<Network, string> = {
      instagram: 'Profesional (simulada)', facebook: 'Página (simulada)', tiktok: 'Empresa (simulada)', youtube: 'Canal (simulado)',
      x: 'Cuenta (simulada)', threads: 'Perfil (simulado)', linkedin: 'Página de empresa (simulada)',
    };
    res.status(201).json(
      accountsRepo.create({ network, handle: handle.slice(0, 60), displayName: `${PLATFORMS[network].label} demo`, accountType: types[network], brandId, mode: 'demo', isDemo: true }),
    );
  });

  r.patch('/accounts/:id', (req, res) => {
    const u = currentUser(req);
    if (!can(u.role, 'account.manage')) throw forbidden();
    const acc = accountsRepo.get(req.params.id);
    if (!acc) throw notFound('La cuenta');
    const brandId = req.body?.brandId || null;
    if (brandId && !brandsRepo.get(brandId)) throw invalid('Marca no válida.');
    accountsRepo.assignBrand(acc.id, brandId);
    res.json(accountsRepo.get(acc.id));
  });

  r.delete('/accounts/:id', (req, res) => {
    const u = currentUser(req);
    if (!can(u.role, 'account.manage')) throw forbidden();
    const acc = accountsRepo.get(req.params.id);
    if (!acc) throw notFound('La cuenta');
    if (accountsRepo.inUse(acc.id)) throw conflict('La cuenta se usa en publicaciones. Quítala de ellas primero.');
    accountsRepo.remove(acc.id);
    res.status(204).end();
  });

  // ---- Media
  r.get('/media', (req, res) => {
    const brandId = req.query.brandId ? String(req.query.brandId) : undefined;
    const all = mediaRepo.list();
    res.json(brandId ? all.filter((m) => m.brandId === brandId) : all);
  });
  r.post('/media', upload.single('file'), (req, res) => {
    if (!req.file) throw invalid('Adjunta un archivo.');
    const num = (v: unknown) => (v === undefined || v === '' ? null : Number(v));
    const m = mediaService.save(currentUser(req), req.file, {
      brandId: req.body.brandId || null,
      durationSec: num(req.body.durationSec),
      width: num(req.body.width),
      height: num(req.body.height),
      isMockup: req.body.isMockup === 'true',
      tags: typeof req.body.tags === 'string' ? req.body.tags.split(',') : [],
    });
    res.status(201).json(m);
  });
  r.delete('/media/:id', (req, res) => {
    mediaService.remove(currentUser(req), req.params.id);
    res.status(204).end();
  });

  // ---- Publicaciones
  r.get('/posts', (req, res) => {
    const brandId = req.query.brandId ? String(req.query.brandId) : undefined;
    const all = postsRepo.list();
    res.json(brandId ? all.filter((p) => p.brandId === brandId) : all);
  });
  r.get('/posts/:id', (req, res) => {
    const p = postsRepo.get(req.params.id);
    if (!p) throw notFound('La publicación');
    res.json({ post: p, events: postsRepo.events(p.id), issues: postIssues(p) });
  });
  r.post('/posts', (req, res) => res.status(201).json(postService.create(currentUser(req), req.body)));
  r.put('/posts/:id', (req, res) => res.json(postService.update(currentUser(req), req.params.id, req.body)));
  r.delete('/posts/:id', (req, res) => {
    postService.remove(currentUser(req), req.params.id);
    res.status(204).end();
  });
  r.post('/posts/:id/actions/:action', async (req, res) => {
    const post = await postService.transition(currentUser(req), req.params.id, req.params.action as PostAction, req.body ?? {});
    res.json(post);
  });
  r.post('/posts/:id/targets/:targetId/retry', async (req, res) => {
    res.json(await postService.retryTarget(currentUser(req), req.params.id, req.params.targetId));
  });

  // ---- IA y créditos
  r.post('/ai/estimate', (req, res) => res.json(aiService.estimate(req.body ?? {})));
  r.post('/ai/generate', async (req, res) => res.json(await aiService.generate(currentUser(req), req.body ?? {})));
  r.get('/credits', (_req, res) => res.json({ balance: creditsRepo.balance(), entries: creditsRepo.list() }));

  // ---- Datos de demostración (exclusivo para pruebas)
  r.post('/demo', (req, res) => {
    const u = currentUser(req);
    if (!can(u.role, 'team.manage')) throw forbidden();
    loadDemoData(u.id);
    res.status(201).json({ ok: true });
  });
  r.delete('/demo', (req, res) => {
    const u = currentUser(req);
    if (!can(u.role, 'team.manage')) throw forbidden();
    removeDemoData();
    res.status(204).end();
  });

  return r;
}
