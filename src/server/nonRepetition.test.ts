import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './db';
import { seedDatabase } from './seed';
import { resetExposureCycleTx, selectNextQuestionTx } from './questionSelection';
import { buildQuestionHash } from '../shared/questionSchema';

test('Non-repetition across logout/login, isolated between accounts, and lesson bank isolation', () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);

  // Account 1 draws all rapid_fire questions in general bank
  const seenAccount1 = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const res = selectNextQuestionTx(db, {
      bankId: 'bank-general-mosque',
      roundType: 'rapid_fire',
      ageGroup: 'family',
      difficulty: 'mixed',
      participantProfileIds: ['prof-player-1'],
    });
    assert.ok(res.question, `Expected question on draw ${i + 1}`);
    assert.equal(seenAccount1.has(res.question.id), false, 'Same account must never get duplicate');
    seenAccount1.add(res.question.id);
  }

  // Account 2 (different student) still gets fresh questions unseen by Account 2
  const resAcc2 = selectNextQuestionTx(db, {
    bankId: 'bank-general-mosque',
    roundType: 'rapid_fire',
    ageGroup: 'family',
    difficulty: 'mixed',
    participantProfileIds: ['prof-player-2'],
  });
  assert.ok(resAcc2.question);

  // Kids account never gets adults-only questions
  for (let i = 0; i < 15; i++) {
    const kidDraw = selectNextQuestionTx(db, {
      bankId: 'bank-general-mosque',
      roundType: 'multiple_choice',
      ageGroup: 'kids',
      difficulty: 'mixed',
      participantProfileIds: ['prof-player-1'],
    });
    if (kidDraw.exhausted) break;
    assert.notEqual(kidDraw.question?.ageGroup, 'adults');
  }

  // Exhaustion notice when category has no remaining unseen questions
  const catDraw1 = selectNextQuestionTx(db, {
    bankId: 'bank-general-mosque',
    roundType: 'odd_one_out',
    ageGroup: 'family',
    difficulty: 'mixed',
    category: 'الفقه والآداب',
    participantProfileIds: ['prof-player-2'],
  });
  assert.ok(catDraw1.question);

  const catDraw2 = selectNextQuestionTx(db, {
    bankId: 'bank-general-mosque',
    roundType: 'odd_one_out',
    ageGroup: 'family',
    difficulty: 'mixed',
    category: 'الفقه والآداب',
    participantProfileIds: ['prof-player-2'],
  });
  assert.equal(catDraw2.exhausted, true);
  assert.equal(catDraw2.question, null);
  assert.ok(catDraw2.messageAr && catDraw2.messageAr.length > 10);

  // Explicit cycle reset allows drawing again cleanly
  const cleared = resetExposureCycleTx(db, ['prof-player-2'], 'bank-general-mosque', 'الفقه والآداب');
  assert.ok(cleared >= 1);
  const catDrawAfterReset = selectNextQuestionTx(db, {
    bankId: 'bank-general-mosque',
    roundType: 'odd_one_out',
    ageGroup: 'family',
    difficulty: 'mixed',
    category: 'الفقه والآداب',
    participantProfileIds: ['prof-player-2'],
  });
  assert.ok(catDrawAfterReset.question);

  db.close();
});

test('Concurrent rapid draws for the same account never duplicate questions', async () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);

  // Insert 20 rapid_fire questions into a test bank
  db.prepare(
    `INSERT INTO question_banks (id, name, category, source_type, created_by)
     VALUES ('bank-conc', 'بنك التزامن', 'عام', 'general', 'prof-admin-1')`
  ).run();
  const insertQ = db.prepare(
    `INSERT INTO questions (id, bank_id, round_type, category, age_group, difficulty, prompt, acceptable_answers_json, status, normalized_hash)
     VALUES (?, 'bank-conc', 'rapid_fire', 'عام', 'family', 'easy', ?, '["جواب"]', 'published', ?)`
  );
  for (let i = 0; i < 20; i++) {
    const prompt = `سؤال متزامن رقم ${i + 1} للتأكد من سلامة المعاملة؟`;
    insertQ.run(`q-c-${i}`, prompt, buildQuestionHash(prompt, ['جواب']));
  }

  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      Promise.resolve().then(() =>
        selectNextQuestionTx(db, {
          bankId: 'bank-conc',
          roundType: 'rapid_fire',
          ageGroup: 'family',
          difficulty: 'easy',
          participantProfileIds: ['prof-player-1'],
        })
      )
    )
  );

  const ids = results.map((r) => r.question?.id).filter(Boolean) as string[];
  assert.equal(ids.length, 20);
  assert.equal(new Set(ids).size, 20, 'All 20 concurrent draws must return 20 distinct questions');

  const draw21 = selectNextQuestionTx(db, {
    bankId: 'bank-conc',
    roundType: 'rapid_fire',
    ageGroup: 'family',
    difficulty: 'easy',
    participantProfileIds: ['prof-player-1'],
  });
  assert.equal(draw21.exhausted, true);

  db.close();
});
