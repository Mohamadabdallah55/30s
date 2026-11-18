import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_ROUND_TYPES,
  ROUND_RULES,
  buildDefaultRoundConfigs,
} from './gameRules';
import {
  ROUND_JORDANIAN_GUIDES,
  answerGameQuestionLocally,
  buildJordanianBotSystemPrompt,
  decideBotTurnAction,
  pickJordanianBanter,
  resolveCorrectOptionIndex,
} from './jordanianBot';
import type { BidChallengeState, GameSessionView, QuestionRecord, RoundType } from './types';

function makeQuestion(overrides: Partial<QuestionRecord> = {}): QuestionRecord {
  return {
    id: 'q-test-1',
    bankId: 'bank-general-mosque',
    roundType: 'multiple_choice',
    category: 'السيرة النبوية',
    ageGroup: 'family',
    difficulty: 'medium',
    prompt: 'من هو مؤذن النبي ﷺ الأول في المدينة؟',
    options: ['بلال بن رباح', 'أبو ذر', 'سعد بن معاذ', 'خالد بن الوليد'],
    acceptableAnswers: ['بلال بن رباح'],
    correctIndex: 0,
    clues: [],
    memoryItems: [],
    isReligious: true,
    status: 'published',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBaseSession(roundType: RoundType, q: QuestionRecord) {
  return {
    phase: 'playing' as const,
    activeTeamIndex: 1,
    buzzedTeamIndex: null as number | null,
    failedBuzzTeams: [] as number[],
    timerRunning: true,
    timerRemainingSec: 25,
    answerRevealed: false,
    revealedClueCount: 1,
    memoryPhase: 'none' as 'none' | 'memorize' | 'recall',
    bidState: null as BidChallengeState | null,
    rounds: buildDefaultRoundConfigs([roundType]),
    currentRoundIndex: 0,
    currentQuestion: q,
    teams: [
      { index: 0, name: 'فريق النشامى', points: 4, streak: 1 },
      { index: 1, name: 'نشمي (البوت الأردني)', points: 3, streak: 0 },
    ],
  };
}

test('Every one of the 12 round types has a Jordanian guide entry and local advisor coverage', () => {
  assert.equal(ALL_ROUND_TYPES.length, 12);
  for (const rt of ALL_ROUND_TYPES) {
    const guide = ROUND_JORDANIAN_GUIDES[rt];
    assert.ok(guide, `Missing Jordanian guide for ${rt}`);
    assert.ok(guide.howToPlayJo.length > 10);
    assert.ok(guide.scoringJo.length > 10);
    assert.ok(guide.proTipJo.length > 10);

    const res = answerGameQuestionLocally(`اشرحلي جولة ${ROUND_RULES[rt].nameAr}`);
    assert.ok(res.reply.length > 20, `Empty advisor reply for ${rt}`);
    assert.ok(res.suggestions.length >= 2);
  }
});

test('decideBotTurnAction handles choice, order_items, list_multiple, memory, fill_blank, rapid_fire, and golden', () => {
  // Always pick accurate branch via deterministic rng = 0.05
  const lowRng = () => 0.05;

  const mcqAction = decideBotTurnAction({
    session: makeBaseSession('multiple_choice', makeQuestion()),
    botTeamIndex: 1,
    skill: 'balanced',
    rng: lowRng,
  });
  assert.equal(mcqAction.type, 'answer');
  assert.equal(mcqAction.submitted, 0);
  assert.equal(mcqAction.expectedCorrect, true);

  // Wrong answer branch when rng = 0.99
  const wrongMcq = decideBotTurnAction({
    session: makeBaseSession('multiple_choice', makeQuestion()),
    botTeamIndex: 1,
    skill: 'relaxed',
    rng: () => 0.99,
  });
  assert.equal(wrongMcq.type, 'answer');
  assert.notEqual(wrongMcq.submitted, 0);
  assert.equal(wrongMcq.expectedCorrect, false);

  // Order items
  const orderQ = makeQuestion({
    roundType: 'order_items',
    options: ['فتح مكة', 'الهجرة', 'بدر'],
    acceptableAnswers: ['الهجرة', 'بدر', 'فتح مكة'],
  });
  const orderAction = decideBotTurnAction({
    session: makeBaseSession('order_items', orderQ),
    botTeamIndex: 1,
    skill: 'fierce',
    rng: lowRng,
  });
  assert.equal(orderAction.type, 'answer');
  assert.deepEqual(orderAction.submitted, ['الهجرة', 'بدر', 'فتح مكة']);

  // List multiple
  const listQ = makeQuestion({
    roundType: 'list_multiple',
    prompt: 'اذكر ثلاثة من أركان الإسلام:',
    acceptableAnswers: ['الشهادتان', 'الصلاة', 'الزكاة', 'الصوم', 'الحج'],
    requiredCount: 3,
  });
  const listAction = decideBotTurnAction({
    session: makeBaseSession('list_multiple', listQ),
    botTeamIndex: 1,
    skill: 'fierce',
    rng: lowRng,
  });
  assert.equal(listAction.type, 'answer');
  assert.deepEqual(listAction.submitted, ['الشهادتان', 'الصلاة', 'الزكاة']);

  // Memory: must NOT act during memorize phase
  const memQ = makeQuestion({
    roundType: 'memory',
    memoryItems: ['بدر', 'أحد', 'الخندق'],
    acceptableAnswers: ['بدر'],
  });
  const memDuringMemorize = decideBotTurnAction({
    session: { ...makeBaseSession('memory', memQ), memoryPhase: 'memorize', timerRunning: false },
    botTeamIndex: 1,
    skill: 'balanced',
    rng: lowRng,
  });
  assert.equal(memDuringMemorize.type, 'none');

  const memDuringRecall = decideBotTurnAction({
    session: { ...makeBaseSession('memory', memQ), memoryPhase: 'recall', timerRunning: true },
    botTeamIndex: 1,
    skill: 'balanced',
    rng: lowRng,
  });
  assert.equal(memDuringRecall.type, 'answer');
  assert.equal(memDuringRecall.expectedCorrect, true);

  // Golden wrapping rapid_fire
  const goldenSession = makeBaseSession('golden', makeQuestion({ roundType: 'rapid_fire', options: [], acceptableAnswers: ['يس'] }));
  goldenSession.rounds[0].goldenTargetType = 'rapid_fire';
  const goldenAction = decideBotTurnAction({
    session: goldenSession,
    botTeamIndex: 1,
    skill: 'balanced',
    rng: lowRng,
  });
  assert.equal(goldenAction.type, 'answer');
  assert.equal(goldenAction.submitted, 'يس');
});

test('decideBotTurnAction handles buzzer duel, who_am_i clue reveals, and bid_challenge phases', () => {
  // Buzzer: first buzz, then answer
  const buzQ = makeQuestion({ roundType: 'buzzer', options: [], acceptableAnswers: ['زيد بن حارثة'] });
  const buzSession = makeBaseSession('buzzer', buzQ);
  buzSession.activeTeamIndex = 0; // Even when activeTeamIndex is 0, bot can buzz in buzzer!
  const buzzMove = decideBotTurnAction({ session: buzSession, botTeamIndex: 1, skill: 'balanced' });
  assert.equal(buzzMove.type, 'buzz');

  buzSession.buzzedTeamIndex = 1;
  const buzAnswer = decideBotTurnAction({ session: buzSession, botTeamIndex: 1, skill: 'balanced', rng: () => 0.05 });
  assert.equal(buzAnswer.type, 'answer');
  assert.equal(buzAnswer.submitted, 'زيد بن حارثة');

  // Who Am I: relaxed bot requests next clue on high rng
  const whoQ = makeQuestion({
    roundType: 'who_am_i',
    options: [],
    clues: ['دليل 1', 'دليل 2', 'دليل 3'],
    acceptableAnswers: ['أبو بكر الصديق'],
  });
  const whoClueMove = decideBotTurnAction({
    session: makeBaseSession('who_am_i', whoQ),
    botTeamIndex: 1,
    skill: 'relaxed',
    rng: () => 0.8,
  });
  assert.equal(whoClueMove.type, 'reveal_next_clue');

  // Bid challenge: bidding raise vs challenge, then executing
  const bidQ = makeQuestion({
    roundType: 'bid_challenge',
    options: [],
    acceptableAnswers: ['عمان', 'إربد', 'الزرقاء', 'الكرك', 'معان', 'العقبة'],
  });
  const bidSession = makeBaseSession('bid_challenge', bidQ);
  bidSession.timerRunning = false;
  bidSession.bidState = {
    phase: 'bidding',
    currentBid: 2,
    bidderTeamIndex: 0,
    startingTeamIndex: 0,
    turnTeamIndex: 1,
    maxPossible: 6,
    challenged: false,
    acceptedAnswers: [],
  };
  const raiseMove = decideBotTurnAction({
    session: bidSession,
    botTeamIndex: 1,
    skill: 'fierce',
    rng: () => 0.5,
  });
  assert.equal(raiseMove.type, 'bid_raise');

  bidSession.bidState.currentBid = 6;
  const challengeMove = decideBotTurnAction({
    session: bidSession,
    botTeamIndex: 1,
    skill: 'balanced',
    rng: () => 0.5,
  });
  assert.equal(challengeMove.type, 'bid_challenge');

  bidSession.bidState = {
    phase: 'executing',
    currentBid: 3,
    bidderTeamIndex: 1,
    startingTeamIndex: 0,
    turnTeamIndex: 0,
    maxPossible: 6,
    challenged: true,
    acceptedAnswers: ['عمان'],
  };
  bidSession.timerRunning = true;
  const execMove = decideBotTurnAction({
    session: bidSession,
    botTeamIndex: 1,
    skill: 'fierce',
    rng: () => 0.1,
  });
  assert.equal(execMove.type, 'bid_record_answer');
  assert.notEqual(execMove.answerText, 'عمان');
});

test('Jordanian advisor understands live match state and never leaks secret answers', () => {
  const liveView: GameSessionView = {
    id: 'sess-1',
    code: 'JO2026',
    title: 'تحدي الـ30 ثانية',
    bankId: 'bank-general-mosque',
    bankName: 'البنك العام',
    ageGroup: 'family',
    difficulty: 'mixed',
    category: 'الكل',
    phase: 'playing',
    teams: [
      { index: 0, name: 'النشامى', color: '#38BDF8', points: 7, strikes: 0, streak: 2, participantIds: [], participantNames: [] },
      { index: 1, name: 'نشمي', color: '#F59E0B', points: 5, strikes: 0, streak: 0, participantIds: [], participantNames: [] },
    ],
    activeTeamIndex: 0,
    buzzedTeamIndex: null,
    failedBuzzTeams: [],
    rounds: buildDefaultRoundConfigs(['bid_challenge']),
    currentRoundIndex: 0,
    currentQuestionIndexInRound: 0,
    timerRemainingSec: 22,
    timerRunning: true,
    timerEndsAtMs: null,
    answerRevealed: false,
    revealedClueCount: 1,
    memoryPhase: 'none',
    memoryRemainingSec: 0,
    bidState: {
      phase: 'bidding',
      currentBid: 4,
      bidderTeamIndex: 0,
      startingTeamIndex: 0,
      turnTeamIndex: 1,
      maxPossible: 12,
      challenged: false,
      acceptedAnswers: [],
    },
    exhaustedNotice: null,
    lastFeedback: null,
    settings: {
      soundEnabled: false,
      calmMode: true,
      reducedMotion: false,
      allowGuestMode: true,
      defaultTimerSec: 30,
      strikesLimit: 3,
    },
    currentQuestion: {
      id: 'q1',
      bankId: 'bank-general-mosque',
      roundType: 'bid_challenge',
      category: 'الأردن',
      ageGroup: 'family',
      difficulty: 'medium',
      prompt: 'كم محافظة في الأردن تستطيع تسميتها؟',
      options: [],
      cluesCount: 0,
      revealedClues: [],
      memoryPhase: 'none',
      memoryRemainingSec: 0,
      isReligious: false,
    },
    updatedAt: new Date().toISOString(),
  };

  const statusReply = answerGameQuestionLocally('شو وضع المباراة هسا؟', { session: liveView });
  assert.match(statusReply.reply, /JO2026/);
  assert.match(statusReply.reply, /النشامى/);
  assert.match(statusReply.reply, /المزايدة شغالة/);

  const prompt = buildJordanianBotSystemPrompt({ session: liveView });
  assert.match(prompt, /نشمي/);
  assert.match(prompt, /لا تغشّشه الجواب الصحيح/);
  assert.equal(resolveCorrectOptionIndex(makeQuestion()), 0);
  assert.ok(pickJordanianBanter('match_start').length > 5);
});
