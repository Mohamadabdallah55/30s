import assert from 'node:assert/strict';
import test from 'node:test';
import { readBundledBank } from './bundledBankData';

import { createDatabase } from './db';
import { seedDatabase } from './seed';
import { importFullBank, FULL_BANK_ID } from './importFullBank';
import { getBankAvailability, rowToQuestionRecord, selectNextQuestionTx } from './questionSelection';
import { evaluateAnswerMatch } from '../shared/gameRules';
import { GameSessionHub } from './wsHub';
import type { RoundType } from '../shared/types';

const raw = readBundledBank('thirty_seconds_question_bank');
const addon = readBundledBank('thirty_30s_sports_religion_addon');

test('real 1262-row bank imports once into SQLite, keeps review gates, age bands and round formats', () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const hub = new GameSessionHub(db);
  const num = () => (db.prepare('SELECT COUNT(*) AS total FROM questions').get() as {total: number}).total;
  const filter = { bankId: FULL_BANK_ID, ageGroup: 'family' as const, difficulty: 'mixed' as const, participantProfileIds: [], exactRounds: true };
  try {
    const before = num();
    const report = importFullBank(db, raw);
    assert.deepEqual(report, { received: 1262, published: 1148, needsReview: 114, duplicates: 0, invalid: [] });
    assert.equal(num(), before + 1262);
    assert.deepEqual(importFullBank(db, raw), { received: 1262, published: 0, needsReview: 0, duplicates: 1262, invalid: [] });
    assert.equal(num(), before + 1262);
    const availability = getBankAvailability(db, filter);
    assert.equal(availability.totalPublishedInFilter, 1148);
    const kids = getBankAvailability(db, { ...filter, ageGroup: 'kids_7_10' });
    assert.ok(kids.totalPublishedInFilter < 1148);
    assert.equal(getBankAvailability(db, { ...filter, ageGroup: 'adults_18_plus' }).totalPublishedInFilter, 1148);
    const options = { ...filter, category: 'الكل', title: 'ملف الأسئلة الأول', teams: [], hostProfileId: 'prof-teacher-1',
      settings: { showMode: true }, roundTypes: ['rapid_fire', 'multiple_choice', 'bid_challenge', 'buzzer', 'golden'] as RoundType[],
      roundOverrides: { rapid_fire: { questionsPerRound: 1 }, multiple_choice: { questionsPerRound: 1 },
        bid_challenge: { questionsPerRound: 1 }, buzzer: { questionsPerRound: 1 }, golden: { questionsPerRound: 1 } },
    };
    const { code } = hub.createSession(options);
    const act = (action: string) => hub.handleHostAction(code, action)!;
    act('start_match');
    const seen = new Set<string>();
    for (const [i, type] of options.roundTypes.entries()) {
      const r = act('skip_intro');
      const q = hub.getSessionInternal(code)?.currentQuestion;
      assert.ok(q?.conceptId);
      assert.ok(!seen.has(q.conceptId));
      seen.add(q.conceptId);
      assert.equal(q.roundType, type === 'golden' ? 'multiple_choice' : type);
      if (r.bidState) {
        assert.equal(r.bidState.currentBid, q.bidMinimum);
        assert.equal(r.bidState.maxPossible, q.bidMaximum);
        hub.handleBidAction(code, 'bid_challenge', {}, true);
        const completed = hub.handleBidAction(code, 'bid_complete', {}, true);
        assert.equal(completed?.view.lastFeedback?.pointsDelta, 2);
      }
      if (type === "rapid_fire") act("next_question");

      assert.equal(act('next_question').phase, i < options.roundTypes.length - 1 ? 'round_summary' : 'finished');
      if (i < options.roundTypes.length - 1) act('next_round');
    }
    assert.equal(getBankAvailability(db, { ...filter, participantProfileIds: ['prof-teacher-1'] }).unseenInFilter, 1143);

    const onlyJordanCapital = db.prepare("SELECT id FROM questions WHERE bank_id=? AND concept_id='F0001' AND round_type='rapid_fire'").get(FULL_BANK_ID) as { id: string };
    const draw = selectNextQuestionTx(db, { ...filter, roundType: 'multiple_choice', excludeQuestionIds: [onlyJordanCapital.id] });
    assert.notEqual(draw.question?.conceptId, 'F0001');
    const sequence = rowToQuestionRecord(db.prepare(`SELECT * FROM questions
      WHERE bank_id = ? AND memory_require_order = 1 AND status = 'published' LIMIT 1`).get(FULL_BANK_ID) as Parameters<typeof rowToQuestionRecord>[0]);
    assert.equal(evaluateAnswerMatch(sequence, [...sequence.memoryItems].reverse()).isCorrect, false);
    assert.equal(evaluateAnswerMatch(sequence, sequence.memoryItems).isCorrect, true);
  } finally { hub.stop(); db.close(); }
});

test('sports and religion add-on extends the existing bank and keeps two-item challenges and references', () => {
  const db = createDatabase(':memory:');
  const hub = new GameSessionHub(db);
  const filter = { bankId: FULL_BANK_ID, ageGroup: 'family' as const, difficulty: 'mixed' as const, participantProfileIds: [], exactRounds: true };
  try {
    importFullBank(db, raw);
    const report = importFullBank(db, addon);
    assert.deepEqual(report, { received: 957, published: 702, needsReview: 255, duplicates: 0, invalid: [] });
    assert.equal(getBankAvailability(db, filter).totalPublishedInFilter, 1850);
    assert.equal(getBankAvailability(db, { ...filter, category: 'دينيات | قرآن وسيرة' }).totalPublishedInFilter, 0);
    assert.equal(getBankAvailability(db, { ...filter, category: 'رياضة | كرة القدم' }).totalPublishedInFilter, 451);
    assert.deepEqual(importFullBank(db, addon), { received: 957, published: 0, needsReview: 0, duplicates: 957, invalid: [] });
    const inspect = db.prepare('SELECT status, source_excerpt, required_count FROM questions WHERE external_id = ?');
    assert.deepEqual(inspect.get('EX00001'), { status: 'published', source_excerpt: 'https://www.fifa.com/en/tournaments/mens/worldcup', required_count: null });
    assert.equal((inspect.get('EX00759') as { required_count: number }).required_count, 2);
    assert.equal((inspect.get('EX00772') as { required_count: number }).required_count, 2);
    const { code } = hub.createSession({ ...filter, title: 'ملحق الرياضة', category: 'رياضة | كرة القدم',
      roundTypes: ['buzzer', 'multiple_choice'], teams: [], hostProfileId: null, settings: { showMode: true } });
    hub.handleHostAction(code, 'start_match');
    const live = hub.handleHostAction(code, 'skip_intro');
    assert.equal(live?.currentQuestion?.category, 'رياضة | كرة القدم');
    assert.equal(live?.currentQuestion?.roundType, 'buzzer');
    assert.equal(hub.getSessionView(code, false)?.hostSecret, undefined);
  } finally { hub.stop(); db.close(); }
});

test('gap fill supplements the active variety bank and leaves religious draft questions unavailable for play', () => {
  const db = createDatabase(':memory:');
  try {
    importFullBank(db, raw);
    importFullBank(db, addon);
    const gap = readBundledBank('thirty_30s_gap_fill_addon');
    assert.deepEqual(importFullBank(db, gap), { received: 429, published: 385, needsReview: 44, duplicates: 0, invalid: [] });
    assert.deepEqual(importFullBank(db, gap), { received: 429, published: 0, needsReview: 0, duplicates: 429, invalid: [] });
    const filter = { bankId: FULL_BANK_ID, ageGroup: 'family' as const, difficulty: 'mixed' as const, exactRounds: true };
    assert.equal(getBankAvailability(db, filter).totalPublishedInFilter, 2235);
    assert.equal(getBankAvailability(db, { ...filter, category: 'المسجد والآداب' }).totalPublishedInFilter, 0);
    const list = db.prepare("SELECT accepts_other_answers FROM questions WHERE external_id = 'GAP00300'").get();
    assert.deepEqual(list, { accepts_other_answers: 1 });
  } finally {
    db.close();
  }
});
