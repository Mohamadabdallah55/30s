import assert from 'node:assert/strict';
import test from 'node:test';
import bankRows from '../../data/imports/questions_bank_5000.json';
import { createDatabase } from './db';
import { importGeminiBank } from './importGeminiBank';
import { getBankAvailability } from './questionSelection';
import { seedDatabase } from './seed';
import { GameSessionHub } from './wsHub';
import type { RoundType } from '../shared/types';

test('the imported bank plays nine rounds from the referee phone and preserves account history', () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const hub = new GameSessionHub(db);
  try {
    const before = db.prepare('SELECT COUNT(*) AS n FROM questions').get() as { n: number };
    const first = importGeminiBank(db, bankRows);
    assert.equal(first.received, 9);
    assert.equal(first.accepted, 9);
    assert.equal(first.rejected, 0);
    assert.equal(importGeminiBank(db, bankRows).duplicateCount, 9);
    assert.deepEqual(db.prepare('SELECT COUNT(*) AS n FROM questions').get(), { n: before.n + 9 });

    const { id: bankId } = db.prepare("SELECT id FROM question_banks WHERE source_type = 'imported'").get() as { id: string };
    const filters = { bankId, ageGroup: 'family' as const, difficulty: 'mixed' as const, exactRounds: true };
    const available = getBankAvailability(db, filters);
    assert.equal(available.totalPublishedInFilter, 9);
    assert.equal(available.byCategory['ديني'].total, 7);
    assert.equal(available.byCategory['عام'].total, 2);
    assert.equal(available.byRoundType.bid_challenge.total, 0);
    assert.equal(getBankAvailability(db, { ...filters, ageGroup: 'kids_7_10', difficulty: 'easy' }).totalPublishedInFilter, 2);

    const types: RoundType[] = ['rapid_fire', 'list_multiple', 'true_false', 'multiple_choice',
      'fill_blank', 'who_am_i', 'odd_one_out', 'order_items', 'memory'];
    const setup = {
      ...filters, hostProfileId: 'prof-teacher-1', title: 'اختبار التحكم', category: 'الكل',
      roundTypes: types, teams: [], settings: { hostControlled: true },
    };
    assert.throws(() => hub.createSession({ ...setup, hostProfileId: null }), /سجّل الدخول/);
    const session = hub.createSession(setup);
    assert.equal(session.phase, 'vs');
    assert.ok(session.rounds.every((round) => round.questionsPerRound === 1));
    const start = hub.handleHostAction(session.code, 'start_match')!;
    assert.equal(start.phase, 'playing');
    assert.equal(start.timerRunning, false);
    assert.equal(hub.handleHostAction(session.code, 'start_match')?.currentQuestion?.id, start.currentQuestion?.id);
    assert.equal(hub.handleHostAction(session.code, 'start_timer')?.timerRunning, true);
    assert.equal(hub.handleHostAction(session.code, 'pause_timer')?.timerRunning, false);
    assert.equal(hub.submitPlayerAnswer(session.code, 0, 'آية الكرسي'), null);
    assert.equal(hub.handleHostAction(session.code, 'award_team', { teamIndex: 0 })?.teams[0].points, 1);
    for (const [index, type] of types.entries()) {
      const view = hub.getSessionView(session.code, false)!;
      assert.equal(view.currentQuestion?.roundType, type);
      assert.equal(view.hostSecret, undefined);
      if (index > 0) assert.equal(view.currentQuestion?.revealedAcceptableAnswers, undefined);
      if (type === 'list_multiple') {
        const scored = hub.handleHostAction(session.code, 'award_team', { teamIndex: 0, matchedListCount: 5 });
        assert.equal(scored?.teams[0].points, 4);
      }
      if (type === 'order_items') assert.ok(view.currentQuestion?.options.includes('صلح الحديبية'));
      if (type === 'memory') assert.equal(view.currentQuestion?.memoryRemainingSec, 5);
      const summary = hub.handleHostAction(session.code, 'next_question');
      assert.equal(summary?.phase, index === types.length - 1 ? 'finished' : 'round_summary');
      if (summary?.phase === 'round_summary') hub.handleHostAction(session.code, 'next_round');
    }
    assert.throws(() => hub.createSession(setup), /لا توجد أسئلة جديدة/);
    assert.equal(hub.getSessionView(session.code, false)?.teams[0].points, 4);
  } finally {
    hub.stop();
    db.close();
  }
});
