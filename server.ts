import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createAppAndHub } from './src/server/appFactory';
import { checkBudgetStorage } from './src/server/paidAi';
import { createDatabase } from './src/server/db';
import { seedDatabase } from './src/server/seed';
import { importGeminiBank } from './src/server/importGeminiBank';
import { importFullBank } from './src/server/importFullBank';
import { readBundledBank } from './src/server/bundledBankData';
import { approveFootballAuctions } from './src/server/approveFootballAuctions';
import geminiBank from './data/imports/questions_bank_5000.json';

const PORT = Number(process.env.DEFAULT_APP_PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

const db = createDatabase(process.env.T30_DB_PATH || undefined);
seedDatabase(db);
const importReport = importGeminiBank(db, geminiBank);
if (importReport.accepted || importReport.rejected) {
  console.log(`Gemini bank: ${importReport.accepted} imported, ${importReport.duplicateCount} existing, ${importReport.rejected} rejected.`);
}

for (const [label, dataset] of [
  ['Variety bank', 'thirty_seconds_question_bank'],
  ['Sports & religion add-on', 'thirty_30s_sports_religion_addon'],
  ['Gap fill add-on', 'thirty_30s_gap_fill_addon'],
  ['Football player auction add-on', 'football_player_auction'],
] as const) {
  const report = importFullBank(db, readBundledBank(dataset));
  if (report.published || report.needsReview || report.invalid.length) {
    console.log(`${label}: ${report.published} ready, ${report.needsReview} pending review, ${report.duplicates} existing, ${report.invalid.length} rejected.`);
  }
}

const approvedFootballAuctions = approveFootballAuctions(db);
if (approvedFootballAuctions) console.log(`Football player auction add-on: ${approvedFootballAuctions} approved.`);

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
    if (process.env.YAZAN_SUPABASE_URL && process.env.YAZAN_SUPABASE_SECRET_KEY) {
      void checkBudgetStorage().then(
        () => console.log('Yazan budget storage: connected'),
        () => console.warn('Yazan budget storage: unavailable; paid requests remain blocked')
      );
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
