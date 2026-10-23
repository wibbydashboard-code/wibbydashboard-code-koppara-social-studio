// Borra la base de datos y los archivos subidos locales. Uso: npm run db:reset
import fs from 'node:fs';
import { config } from '../config.ts';

for (const f of [config.databasePath, `${config.databasePath}-wal`, `${config.databasePath}-shm`]) fs.rmSync(f, { force: true });
fs.rmSync(config.uploadDir, { recursive: true, force: true });
console.log('Base de datos y archivos locales eliminados. Se recrearán al arrancar.');
