import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from './db';
import { seedDatabase } from './seed';
import { GameSessionHub } from './wsHub';
import type { RoundType } from '../shared/types';

test('game show runs twelve rounds from the real seed with a continuous sprint clock and single golden payout', () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const hub = new GameSessionHub(db);
  try {
    const rounds: RoundType[] = ['rapid_fire', 'list_multiple', 'bid_challenge', 'true_false',
      'multiple_choice', 'who_am_i', 'fill_blank', 'odd_one_out', 'order_items', 'memory', 'buzzer', 'golden'];
    const { code } = hub.createSession({ title: 'ليلة التحدي', bankId: 'bank-general-mosque', hostProfileId: null,
      ageGroup: 'family', difficulty: 'mixed', category: 'الكل', teams: [], roundTypes: rounds,
      settings: { showMode: true }, roundOverrides: {
        ...Object.fromEntries(rounds.map((r) => [r, { questionsPerRound: 1 }])),
        rapid_fire: { questionsPerRound: 3 }, golden: { questionsPerRound: 1, multiplier: 10 },
      },
    });
    const h = (action: string, payload: Record<string, unknown> = {}) => hub.handleHostAction(code, action, payload)!;
    const p = () => hub.getSessionView(code, false)!;
    const state = () => hub.getSessionInternal(code)!;
    assert.equal(h('start_match').phase, 'round_intro');
    assert.equal(h('round_countdown').phase, 'countdown');
    assert.equal(p().currentQuestion, null);
    assert.ok(p().countdownEndsAtMs! > Date.now());
    for (const [i, round] of rounds.entries()) {
      const start = h('skip_intro');
      assert.equal(start.phase, 'playing');
      const q = state().currentQuestion!;
      assert.equal(q.roundType, round === 'golden' ? 'multiple_choice' : round);
      assert.equal(p().hostSecret, undefined);
      assert.equal(p().currentQuestion?.revealedAcceptableAnswers, undefined);
      const submit = (value: string | number | string[]) => hub.submitPlayerAnswer(code, p().activeTeamIndex, value, undefined, p().currentQuestion?.id);
      if (round === 'rapid_fire') {
        assert.equal(submit(q.acceptableAnswers[0])?.isCorrect, true);
        assert.notEqual(p().currentQuestion?.id, q.id);
        assert.equal(p().timerEndsAtMs, start.timerEndsAtMs);
        assert.equal(hub.submitPlayerAnswer(code, start.activeTeamIndex, q.acceptableAnswers[0], undefined, q.id), null);
        h('next_question');
        assert.equal(p().timerEndsAtMs, start.timerEndsAtMs);
        assert.equal(submit(state().currentQuestion!.acceptableAnswers[0])?.isCorrect, true);
        h('undo');
        assert.equal(p().currentQuestionIndexInRound, 2);
        assert.equal(submit(state().currentQuestion!.acceptableAnswers[0])?.isCorrect, true);
      } else if (round === 'list_multiple') {
        const [a,b] = q.acceptableAnswers;
        h('list_toggle_item', { item: a });
        assert.equal(p().listProgress?.accepted, 1);
        h('list_toggle_item', { item: a });
        assert.equal(p().listProgress?.accepted, 0);
        h('list_toggle_item', { item: a });
        h('list_toggle_item', { item: b });
        const team = p().activeTeamIndex;
        assert.equal(h('award_team').teams[team].points - start.teams[team].points, 2);
      } else if (round === 'bid_challenge') {
        const a = state().bidState!;
        assert.equal(hub.handleBidAction(code, 'bid_raise', { targetBid: a.maxPossible + 1 }, true)?.ok, false);
        assert.equal(hub.handleBidAction(code, 'bid_raise', { targetBid: 2 }, true)?.ok, true);
        assert.equal(hub.handleBidAction(code, 'bid_challenge', {}, true)?.ok, true);
        const winner = p().activeTeamIndex;
        const record = (answerText: string) => hub.handleBidAction(code, 'bid_record_answer', { answerText }, true);
        assert.equal(record(q.acceptableAnswers[0])?.ok, true);
        assert.equal(record(q.acceptableAnswers[0])?.ok, false);
        assert.deepEqual(p().bidState?.acceptedAnswers, ['']);
        assert.equal(record(q.acceptableAnswers[1])?.ok, true);
        assert.equal(h('bid_complete').teams[winner].points - start.teams[winner].points, 3);
        assert.equal(h('bid_complete').teams[winner].points - start.teams[winner].points, 3);
      } else if (round === 'who_am_i') {
        assert.equal(p().currentQuestion?.revealedClues.length, 1);
        assert.equal(h('reveal_next_clue').currentQuestion?.revealedClues.length, 2);
        const result = submit(q.acceptableAnswers[0]);
        assert.equal(result?.isCorrect, true);
        assert.ok(result.pointsDelta <= start.rounds[i].basePoints);
      } else if (round === 'memory') {
        assert.equal(p().memoryPhase, 'memorize');
        assert.ok((p().currentQuestion?.memoryItems?.length ?? 0) > 0);
        assert.equal(submit(q.memoryItems), null);
        state().memoryEndsAtMs = Date.now() - 1;
        assert.equal(p().memoryPhase, 'recall');
        assert.deepEqual(p().currentQuestion?.memoryItems, []);
        assert.equal(submit(q.memoryItems)?.pointsDelta, q.memoryItems.length);
      } else if (round === 'buzzer') {
        const hit = hub.handleBuzz(code, 1, q.id);
        assert.equal(hit?.buzzedTeamIndex, 1);
        assert.equal(hub.handleBuzz(code, 0, q.id), null);
        assert.equal(submit(q.acceptableAnswers[0])?.isCorrect, true);
      } else {
        const input = round === 'order_items' ? q.acceptableAnswers : q.correctIndex ?? q.acceptableAnswers[0];
        const result = submit(input);
        assert.equal(result?.isCorrect, true);
        if (round === 'golden') {
          assert.equal(result.pointsDelta, start.rounds[i].basePoints * 2);
          assert.equal(submit(input), null);
        }
      }
      assert.equal(h('next_question').phase, i === rounds.length - 1 ? 'finished' : 'round_summary');
      if (i + 1 < rounds.length) assert.equal(h('next_round').phase, 'round_intro');
    }
    assert.ok(p().teams.some((t) => t.points > 0));
    const reconnected = new GameSessionHub(db);
    try {
      assert.equal(reconnected.getSessionView(code, false)?.phase, 'finished');
      assert.deepEqual(reconnected.getSessionView(code, false)?.teams, p().teams);
    } finally { reconnected.stop(); }
  } finally { hub.stop(); db.close(); }
});
