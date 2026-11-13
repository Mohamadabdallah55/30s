import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './db';
import { inspectPdfBuffer } from './lessonStudio';
import { seedDatabase } from './seed';
import { GameSessionHub } from './wsHub';
import { buildQuestionHash, validateAndDeduplicateImport } from '../shared/questionSchema';

test('Audience view strictly omits hostSecret and unrevealed answers until reveal', () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const hub = new GameSessionHub(db);

  const session = hub.createSession({
    hostProfileId: 'prof-teacher-1',
    title: 'اختبار أمان الشاشة',
    bankId: 'bank-general-mosque',
    ageGroup: 'family',
    difficulty: 'mixed',
    category: 'الكل',
    teams: [
      { name: 'فريق أ', color: '#38BDF8', participantIds: ['prof-player-1'], participantNames: ['عمر'] },
      { name: 'فريق ب', color: '#F59E0B', participantIds: ['prof-player-2'], participantNames: ['سارة'] },
    ],
    roundTypes: ['multiple_choice', 'buzzer'],
    skipVs: true,
  });

  const audienceView = hub.getSessionView(session.code, false)!;
  assert.equal(audienceView.hostSecret, undefined);
  assert.equal(audienceView.currentQuestion?.revealedAnswerText, undefined);
  assert.equal(audienceView.currentQuestion?.revealedCorrectIndex, undefined);

  const hostView = hub.getSessionView(session.code, true)!;
  assert.ok(hostView.hostSecret);
  assert.ok(hostView.hostSecret.acceptableAnswers.length > 0);

  // Reveal answer via host action -> now audience sees answer
  hub.handleHostAction(session.code, 'reveal_answer');
  const audienceAfterReveal = hub.getSessionView(session.code, false)!;
  assert.ok(audienceAfterReveal.currentQuestion?.revealedAnswerText);

  hub.stop();
  db.close();
});

test('Host can correct accidental points and undo actions cleanly', () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const hub = new GameSessionHub(db);

  const session = hub.createSession({
    hostProfileId: 'prof-teacher-1',
    title: 'اختبار التراجع والتصحيح',
    bankId: 'bank-general-mosque',
    ageGroup: 'family',
    difficulty: 'mixed',
    category: 'الكل',
    teams: [
      { name: 'أ', color: '#38BDF8' },
      { name: 'ب', color: '#F59E0B' },
    ],
    roundTypes: ['multiple_choice'],
    skipVs: true,
  });

  // Host awards wrong team by accident
  hub.handleHostAction(session.code, 'award_team', { teamIndex: 1 });
  let hostView = hub.getSessionView(session.code, true)!;
  assert.equal(hostView.teams[1].points, 1);

  // Undo restores 0 points
  hub.handleHostAction(session.code, 'undo');
  hostView = hub.getSessionView(session.code, true)!;
  assert.equal(hostView.teams[1].points, 0);

  // Manual +/- adjustment
  hub.handleHostAction(session.code, 'adjust_points', { teamIndex: 0, delta: 10 });
  hub.handleHostAction(session.code, 'adjust_points', { teamIndex: 0, delta: -5 });
  hostView = hub.getSessionView(session.code, true)!;
  assert.equal(hostView.teams[0].points, 5);

  hub.stop();
  db.close();
});

test('SQLite inserts 5000 imported questions in a single transaction smoothly', () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);

  const batch = Array.from({ length: 5000 }, (_, i) => ({
    externalId: `SQL-${i + 1}`,
    roundType: 'rapid_fire',
    category: 'الثقافة العربية',
    ageGroup: 'family',
    difficulty: 'medium',
    prompt: `سؤال بنكي رقم ${i + 1} لقياس الأداء واستيعاب خمسة آلاف سؤال؟`,
    acceptableAnswers: [`جواب ${i + 1}`],
  }));

  const report = validateAndDeduplicateImport(batch, new Set(), new Set());
  assert.equal(report.validCount, 5000);

  const insertQ = db.prepare(`
    INSERT INTO questions (
      id, bank_id, external_id, round_type, category, age_group, difficulty,
      prompt, acceptable_answers_json, status, normalized_hash
    ) VALUES (?, 'bank-general-mosque', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const t0 = Date.now();
  db.transaction(() => {
    for (let i = 0; i < report.accepted.length; i++) {
      const q = report.accepted[i];
      insertQ.run(
        `qb-${i}`,
        q.externalId,
        q.roundType,
        q.category,
        q.ageGroup,
        q.difficulty,
        q.prompt,
        JSON.stringify(q.acceptableAnswers),
        q.status,
        buildQuestionHash(q.prompt, q.acceptableAnswers)
      );
    }
  })();
  const elapsed = Date.now() - t0;
  const total = (db.prepare(`SELECT COUNT(*) as c FROM questions`).get() as { c: number }).c;
  assert.ok(total >= 5000);
  assert.ok(elapsed < 2000, `SQLite 5000-row transaction took ${elapsed}ms`);

  db.close();
});

test('inspectPdfBuffer validates PDF headers and detects scanned vs text PDFs', () => {
  const notPdf = Buffer.from('Hello plain text', 'utf8');
  assert.equal(inspectPdfBuffer(notPdf).isValidPdf, false);

  const textPdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page /Font << >> >> endobj\nBT (Hello) Tj ET', 'latin1');
  const textCheck = inspectPdfBuffer(textPdf);
  assert.equal(textCheck.isValidPdf, true);
  assert.equal(textCheck.hasTextStreams, true);

  const scannedPdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page /XObject << /Im1 2 0 R >> >> endobj', 'latin1');
  const scanCheck = inspectPdfBuffer(scannedPdf);
  assert.equal(scanCheck.isValidPdf, true);
  assert.equal(scanCheck.hasTextStreams, false);
});
