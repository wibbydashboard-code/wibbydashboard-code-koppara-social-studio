import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { config } from './config.ts';
import { seedIfEmpty } from './db/seed.ts';
import { apiRouter } from './http/routes.ts';
import { AppError } from './http/errors.ts';

seedIfEmpty();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use('/uploads', express.static(config.uploadDir, { fallthrough: false, maxAge: '1h' }));
app.use('/api', apiRouter());
app.use('/api', (_req, res) => res.status(404).json({ code: 'not_found', message: 'Ruta no encontrada.' }));

// Manejo de errores: mensajes claros para la UI, sin filtrar trazas ni datos sensibles.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) return res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? `El archivo supera ${config.maxUploadMB} MB.` : 'No se pudo recibir el archivo.';
    return res.status(413).json({ code: 'upload', message: msg });
  }
  if (err instanceof SyntaxError) return res.status(400).json({ code: 'bad_json', message: 'Solicitud mal formada.' });
  console.error('[error]', err instanceof Error ? err.message : 'desconocido');
  res.status(500).json({ code: 'server', message: 'Ocurrió un error inesperado. Intenta de nuevo.' });
});

if (config.production) {
  const dist = path.resolve('dist');
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(config.port, () => {
  console.log(`Koppara Social Studio en http://localhost:${config.port}`);
});
