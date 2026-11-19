import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initDatabase, uploadsDir } from './server/db.ts';
import authRoutes from './server/routes/auth.ts';
import studioRoutes from './server/routes/studio.ts';
import servicesRoutes from './server/routes/services.ts';
import clientsAndBoardsRoutes from './server/routes/clientsAndBoards.ts';
import financeAndSocietyRoutes from './server/routes/financeAndSociety.ts';
import copiesRoutes from './server/routes/copies.ts';

async function startServer() {
  initDatabase();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use('/uploads', express.static(uploadsDir));

  app.use('/api/auth', authRoutes);
  app.use('/api/services', servicesRoutes);
  app.use('/api/copies', copiesRoutes);
  app.use('/api', studioRoutes);
  app.use('/api', clientsAndBoardsRoutes);
  app.use('/api', financeAndSocietyRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'aumi-studio' });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aumi Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Aumi Studio server:', err);
  process.exit(1);
});
