import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createAppAndHub } from './src/server/appFactory';
import { createDatabase } from './src/server/db';
import { seedDatabase } from './src/server/seed';
import { importGeminiBank } from './src/server/importGeminiBank';
import geminiBank from './data/imports/questions_bank_5000.json';

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

const db = createDatabase();
seedDatabase(db);
const importReport = importGeminiBank(db, geminiBank);
if (importReport.accepted || importReport.rejected) {
  console.log(`Gemini bank: ${importReport.accepted} imported, ${importReport.duplicateCount} existing, ${importReport.rejected} rejected.`);
}

const { app, hub } = createAppAndHub(db);

async function startServer() {
  const server = http.createServer(app);
  hub.attach(server);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`T30 Mosque Challenge server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
