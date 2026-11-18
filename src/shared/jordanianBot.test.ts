import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_ROUND_TYPES,
  ROUND_RULES,
  buildDefaultRoundConfigs,
} from './gameRules';
import {
  HOST_COMMENTARY_BANK,
  HostReactionEngine,
  ROUND_HOST_INTROS,
  ROUND_JORDANIAN_GUIDES,
  answerGameQuestionLocally,
  buildJordanianBotSystemPrompt,
  decideBotTurnAction,
  getTotalHostCommentaryCount,
  pickJordanianBanter,
  pickNonRepeatingFromPool,
  resolveCorrectOptionIndex,
  resolveNashmiVisualMood,
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

function makeLiveSessionView(overrides: Partial<GameSessionView> = {}): GameSessionView {
  return {
    id: 'sess-host-1',
    code: 'HOST01',
    title: 'تحدي الـ30 ثانية',
    bankId: 'bank-general-mosque',
    bankName: 'البنك العام',
    ageGroup: 'family',
    difficulty: 'mixed',
    category: 'الكل',
    phase: 'vs',
    teams: [
      { index: 0, name: 'صقور عمّان', color: '#38BDF8', points: 0, strikes: 0, streak: 0, participantIds: [], participantNames: [] },
      { index: 1, name: 'نشامى إربد', color: '#FF68A0', points: 0, strikes: 0, streak: 0, participantIds: [], participantNames: [] },
    ],
    activeTeamIndex: 0,
    buzzedTeamIndex: null,
    failedBuzzTeams: [],
    rounds: buildDefaultRoundConfigs(['rapid_fire', 'buzzer', 'bid_challenge', 'golden']),
    currentRoundIndex: 0,
    currentQuestionIndexInRound: 0,
    timerRemainingSec: 30,
    timerRunning: false,
    timerEndsAtMs: null,
    answerRevealed: false,
    revealedClueCount: 1,
    memoryPhase: 'none',
    memoryRemainingSec: 0,
    bidState: null,
    exhaustedNotice: null,
    lastFeedback: null,
    settings: {
      soundEnabled: true,
      calmMode: true,
      reducedMotion: false,
      allowGuestMode: true,
      defaultTimerSec: 30,
      strikesLimit: 3,
      showMode: true,
    },
    currentQuestion: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('HostReactionEngine covers all 12 round intros, streaks, errors, timeouts, buzzer speed, bidding, close scores, and visual moods', () => {
  for (const rt of ALL_ROUND_TYPES) {
    assert.ok(ROUND_HOST_INTROS[rt].length >= 2, `Missing host intros for ${rt}`);
  }

  const engine = new HostReactionEngine();
  let t = 10_000;

  // 1. VS welcome -> hyped
  const vsStep = engine.step(makeLiveSessionView({ phase: 'vs' }), { nowMs: t });
  assert.equal(vsStep.emitted?.kind, 'match_welcome');
  assert.equal(vsStep.mood, 'hyped');

  // 2. Round 0 start (rapid_fire) -> round_start hyped
  t += 1000;
  const r0Step = engine.step(
    makeLiveSessionView({ phase: 'round_intro', currentRoundIndex: 0 }),
    { nowMs: t, rng: () => 0 }
  );
  assert.equal(r0Step.emitted?.kind, 'round_start');
  assert.equal(r0Step.mood, 'hyped');
  assert.match(r0Step.emitted!.text, /الرشاش/);

  // 3. Streak praise -> celebrating
  t += 1500;
  const streakStep = engine.step(
    makeLiveSessionView({
      phase: 'playing',
      timerRunning: true,
      timerRemainingSec: 22,
      currentQuestion: {
        id: 'q1',
        bankId: 'bank-general-mosque',
        roundType: 'rapid_fire',
        category: 'الكل',
        ageGroup: 'family',
        difficulty: 'medium',
        prompt: 'سؤال',
        options: [],
        cluesCount: 0,
        revealedClues: [],
        memoryPhase: 'none',
        memoryRemainingSec: 0,
        isReligious: true,
      },
      teams: [
        { index: 0, name: 'صقور عمّان', color: '#38BDF8', points: 4, strikes: 0, streak: 3, participantIds: [], participantNames: [] },
        { index: 1, name: 'نشامى إربد', color: '#FF68A0', points: 2, strikes: 0, streak: 0, participantIds: [], participantNames: [] },
      ],
      lastFeedback: { type: 'streak', message: 'ثلاثية!', pointsDelta: 2, teamIndex: 0, atMs: t },
    }),
    { nowMs: t, rng: () => 0 }
  );
  assert.equal(streakStep.emitted?.kind, 'streak');
  assert.equal(streakStep.mood, 'celebrating');
  assert.ok(
    HOST_COMMENTARY_BANK.streak.some((line) => streakStep.emitted!.text === line),
    `Expected streak phrase from bank, got: ${streakStep.emitted!.text}`
  );

  // 4. Wrong answer -> teasing
  t += 1200;
  const wrongStep = engine.step(
    makeLiveSessionView({
      phase: 'playing',
      timerRunning: true,
      timerRemainingSec: 18,
      lastFeedback: { type: 'wrong', message: 'خطأ', pointsDelta: 0, teamIndex: 1, atMs: t },
    }),
    { nowMs: t, rng: () => 0 }
  );
  assert.equal(wrongStep.emitted?.kind, 'wrong');
  assert.equal(wrongStep.mood, 'teasing');

  // 5. Urgent <= 5s overrides to 'tense'
  t += 5000;
  const tenseMood = resolveNashmiVisualMood(
    makeLiveSessionView({
      phase: 'playing',
      timerRunning: true,
      timerRemainingSec: 4,
    }),
    wrongStep.reaction,
    t
  );
  assert.equal(tenseMood, 'tense');

  // 6. Time out -> shocked
  t += 4000;
  const timeoutStep = engine.step(
    makeLiveSessionView({
      phase: 'playing',
      timerRunning: false,
      timerRemainingSec: 0,
      answerRevealed: false,
      currentQuestion: {
        id: 'q-to',
        bankId: 'b',
        roundType: 'rapid_fire',
        category: 'الكل',
        ageGroup: 'family',
        difficulty: 'medium',
        prompt: 'سؤال',
        options: [],
        cluesCount: 0,
        revealedClues: [],
        memoryPhase: 'none',
        memoryRemainingSec: 0,
        isReligious: true,
      },
    }),
    { nowMs: t, rng: () => 0 }
  );
  assert.equal(timeoutStep.emitted?.kind, 'timeout');
  assert.equal(timeoutStep.mood, 'shocked');
  assert.match(timeoutStep.emitted!.text, /30 ثانية|الوقت/);

  // 7. Buzzer fast reflex (< 2.5s)
  t += 2000;
  engine.step(
    makeLiveSessionView({
      phase: 'playing',
      currentRoundIndex: 1,
      timerRunning: true,
      timerRemainingSec: 30,
      buzzedTeamIndex: null,
      currentQuestion: {
        id: 'q-buz',
        bankId: 'b',
        roundType: 'buzzer',
        category: 'الكل',
        ageGroup: 'family',
        difficulty: 'medium',
        prompt: 'سؤال جرس',
        options: [],
        cluesCount: 0,
        revealedClues: [],
        memoryPhase: 'none',
        memoryRemainingSec: 0,
        isReligious: true,
      },
    }),
    { nowMs: t }
  );
  t += 900; // Pressed in 0.9s!
  const buzzStep = engine.step(
    makeLiveSessionView({
      phase: 'playing',
      currentRoundIndex: 1,
      timerRunning: true,
      timerRemainingSec: 29,
      buzzedTeamIndex: 1,
      currentQuestion: {
        id: 'q-buz',
        bankId: 'b',
        roundType: 'buzzer',
        category: 'الكل',
        ageGroup: 'family',
        difficulty: 'medium',
        prompt: 'سؤال جرس',
        options: [],
        cluesCount: 0,
        revealedClues: [],
        memoryPhase: 'none',
        memoryRemainingSec: 0,
        isReligious: true,
      },
    }),
    { nowMs: t }
  );
  assert.equal(buzzStep.emitted?.kind, 'buzzer_fast');
  assert.ok(
    HOST_COMMENTARY_BANK.buzzer_fast.some((line) => buzzStep.emitted!.text.startsWith(line)),
    `Expected buzzer_fast phrase from bank, got: ${buzzStep.emitted!.text}`
  );

  // 8. Bid challenge bold bid & challenge
  t += 2000;
  engine.step(
    makeLiveSessionView({
      phase: 'playing',
      currentRoundIndex: 2,
      timerRunning: false,
      bidState: {
        phase: 'bidding',
        currentBid: 2,
        bidderTeamIndex: 0,
        startingTeamIndex: 0,
        turnTeamIndex: 1,
        maxPossible: 6,
        challenged: false,
        acceptedAnswers: [],
      },
    }),
    { nowMs: t }
  );
  t += 1000;
  const boldBidStep = engine.step(
    makeLiveSessionView({
      phase: 'playing',
      currentRoundIndex: 2,
      timerRunning: false,
      bidState: {
        phase: 'bidding',
        currentBid: 4,
        bidderTeamIndex: 1,
        startingTeamIndex: 0,
        turnTeamIndex: 0,
        maxPossible: 6,
        challenged: false,
        acceptedAnswers: [],
      },
    }),
    { nowMs: t, rng: () => 0 }
  );
  assert.equal(boldBidStep.emitted?.kind, 'bid_bold');
  assert.equal(boldBidStep.mood, 'thinking');

  t += 1000;
  const bidExecStep = engine.step(
    makeLiveSessionView({
      phase: 'playing',
      currentRoundIndex: 2,
      timerRunning: true,
      timerRemainingSec: 30,
      bidState: {
        phase: 'executing',
        currentBid: 4,
        bidderTeamIndex: 1,
        startingTeamIndex: 0,
        turnTeamIndex: 0,
        maxPossible: 6,
        challenged: true,
        acceptedAnswers: [],
      },
    }),
    { nowMs: t }
  );
  assert.equal(bidExecStep.emitted?.kind, 'bid_challenge');
  assert.equal(bidExecStep.mood, 'tense');

  // 9. Lead change / comeback in golden round -> celebrating
  t += 1500;
  const comebackStep = engine.step(
    makeLiveSessionView({
      phase: 'playing',
      currentRoundIndex: 3,
      timerRunning: true,
      timerRemainingSec: 20,
      teams: [
        { index: 0, name: 'صقور عمّان', color: '#38BDF8', points: 10, strikes: 0, streak: 0, participantIds: [], participantNames: [] },
        { index: 1, name: 'نشامى إربد', color: '#FF68A0', points: 11, strikes: 0, streak: 1, participantIds: [], participantNames: [] },
      ],
      lastFeedback: { type: 'lead_change', message: 'تبدل!', pointsDelta: 2, teamIndex: 1, atMs: t },
    }),
    { nowMs: t }
  );
  assert.equal(comebackStep.emitted?.kind, 'comeback');
  assert.equal(comebackStep.mood, 'celebrating');
  assert.ok(
    HOST_COMMENTARY_BANK.comeback.some((line) => comebackStep.emitted!.text.startsWith(line)),
    `Expected comeback phrase from bank, got: ${comebackStep.emitted!.text}`
  );

  // 10. Victory celebration
  t += 2000;
  const winStep = engine.step(
    makeLiveSessionView({
      phase: 'finished',
      teams: [
        { index: 0, name: 'صقور عمّان', color: '#38BDF8', points: 10, strikes: 0, streak: 0, participantIds: [], participantNames: [] },
        { index: 1, name: 'نشامى إربد', color: '#FF68A0', points: 14, strikes: 0, streak: 2, participantIds: [], participantNames: [] },
      ],
    }),
    { nowMs: t }
  );
  assert.equal(winStep.emitted?.kind, 'victory');
  assert.equal(winStep.mood, 'celebrating');
  assert.match(winStep.emitted!.text, /نشامى إربد/);
});

test('HOST_COMMENTARY_BANK contains over 80 unique vibrant Jordanian phrases including all requested categories', () => {
  const totalCount = getTotalHostCommentaryCount();
  assert.ok(totalCount > 80, `Expected > 80 phrases, found ${totalCount}`);

  const allLines = Object.values(HOST_COMMENTARY_BANK).flat();
  assert.equal(allLines.length, totalCount);
  assert.equal(new Set(allLines).size, allLines.length, 'Every phrase in HOST_COMMENTARY_BANK should be unique');

  const expectedByCategory: Array<[keyof typeof HOST_COMMENTARY_BANK, string[]]> = [
    [
      'correct',
      [
        'يا عيني عالقطاعة! جبتها من نص الجول!',
        'وحش والله، مخّك شغّال نار اليوم!',
        'عفيه عليكم، ولا غلطة!',
        'سجّل عندك، نقطة ولا أروع!',
        'كفو والله، هيك اللعب ولا بلاش!',
        'ما شاء الله، تركيز مليون!',
        'بالصميم! ما أعطيتوا مجال للتفكير!',
        'يا سلام عليك، إجابة معلم!',
      ],
    ],
    [
      'streak',
      [
        'ولّعت الصالة! ما حدا قادر يوقفهم!',
        'هاتريك يا كبير! شو هالتركيز؟',
        'يا ساتر، الفريق هاظ داخل يكسر الدنيا!',
        'قطار وماشي، مين بده يوقفه؟',
        'نار يا حبيبي نار، سلسلة ولا أجمل!',
      ],
    ],
    [
      'wrong',
      [
        'هاردلك، قربتوا كثير بس زحلطت!',
        'يا حرام، كانت عطرف اللسان!',
        'مش مشكلة، الجايات أكثر من الرايحات!',
        'ركزوا يا شباب، التسرع ضيّعها!',
        'أوف، راحت عليكم بنص ثانية!',
        'لا تزعلوا، لسا الملعب طويل!',
      ],
    ],
    [
      'timeout',
      [
        'طارت الـ 30 ثانية زي البرق!',
        'يا ساتر، الجرس ما بيرحم!',
        'صفّرت الساعة، راحت النقطة!',
        'الوقت كالسيف، أسرع المرة الجاية يا شباب!',
        'خلص البنزين، انتهى الوقت!',
      ],
    ],
    [
      'buzzer_fast',
      [
        'يا لطيف شو هالسرعة! أصبعك عالزناد!',
        'سبقهم بلمح البصر!',
      ],
    ],
    [
      'bid_bold',
      [
        'مين يزوّد؟ الميدان يا حميدان!',
        'يا عيني عالثقة، قدّها وقدود؟',
        'رفع السقف عالآخر، خلينا نشوف الشطارة!',
        'المزاد ولّع، والكل بده يكسب!',
      ],
    ],
    [
      'comeback',
      ['يا ساتر عالريمونتادا! قلبوا الطاولة!'],
    ],
    [
      'close_score',
      [
        'الفرق شعرة، النفس الأخير هو اللي بيحسم!',
        'الجولة الذهبية رح تقلب الموازين!',
      ],
    ],
    [
      'victory',
      [
        'مبروك للأبطال! فوز مستحق عن جدارة!',
        'رفعتوا الراس، مباراة للتاريخ!',
      ],
    ],
  ];

  for (const [category, phrases] of expectedByCategory) {
    const pool = HOST_COMMENTARY_BANK[category] as readonly string[];
    for (const phrase of phrases) {
      assert.ok(pool.includes(phrase), `Missing phrase in ${category}: ${phrase}`);
    }
  }
});

test('pickNonRepeatingFromPool exhausts every item before resetting and avoids back-to-back repeats on reset', () => {
  const rngPatterns: Array<() => number> = [
    () => 0,
    () => 0.9999,
    (() => {
      let step = 0;
      return () => ((step++ * 0.37) % 1);
    })(),
  ];

  for (const rng of rngPatterns) {
    let usedPools: Record<string, number[]> = {};
    const pool = HOST_COMMENTARY_BANK.correct;
    const seenFirstCycle: string[] = [];

    for (let i = 0; i < pool.length; i++) {
      const res = pickNonRepeatingFromPool('correct', pool, usedPools, rng);
      usedPools = res.nextUsedPools;
      seenFirstCycle.push(res.chosen);
    }

    assert.equal(new Set(seenFirstCycle).size, pool.length, 'First full cycle must emit every item once with zero repeats');

    const firstAfterReset = pickNonRepeatingFromPool('correct', pool, usedPools, rng);
    assert.notEqual(
      firstAfterReset.chosen,
      seenFirstCycle[seenFirstCycle.length - 1],
      'Cycle reset must not repeat the immediately preceding phrase'
    );
  }
});

test('HostReactionEngine never repeats phrases in a category until all phrases in that pool are used', () => {
  const engine = new HostReactionEngine();
  let t = 50_000;

  // Trigger round_start once first so round_start never shadows feedback
  engine.step(makeLiveSessionView({ phase: 'playing', currentRoundIndex: 0 }), { nowMs: t, rng: () => 0.25 });

  // Exhaust entire 'correct' pool
  const emittedCorrect: string[] = [];
  for (let i = 0; i < HOST_COMMENTARY_BANK.correct.length; i++) {
    t += 1000;
    const res = engine.step(
      makeLiveSessionView({
        phase: 'playing',
        currentRoundIndex: 0,
        lastFeedback: { type: 'correct', message: 'صح!', pointsDelta: 1, teamIndex: 0, atMs: t },
      }),
      { nowMs: t, rng: () => (i * 0.61) % 1 }
    );
    assert.equal(res.emitted?.kind, 'correct');
    emittedCorrect.push(res.emitted!.text);
  }
  assert.equal(new Set(emittedCorrect).size, HOST_COMMENTARY_BANK.correct.length);

  // Next 'correct' after exhaustion starts a new cycle without back-to-back repeat
  t += 1000;
  const resetCorrect = engine.step(
    makeLiveSessionView({
      phase: 'playing',
      currentRoundIndex: 0,
      lastFeedback: { type: 'correct', message: 'صح!', pointsDelta: 1, teamIndex: 0, atMs: t },
    }),
    { nowMs: t, rng: () => 0 }
  );
  assert.equal(resetCorrect.emitted?.kind, 'correct');
  assert.notEqual(resetCorrect.emitted!.text, emittedCorrect[emittedCorrect.length - 1]);

  // Exhaust entire 'wrong' and 'timeout' pools
  const emittedWrong: string[] = [];
  for (let i = 0; i < HOST_COMMENTARY_BANK.wrong.length; i++) {
    t += 1000;
    const res = engine.step(
      makeLiveSessionView({
        phase: 'playing',
        currentRoundIndex: 0,
        lastFeedback: { type: 'wrong', message: 'خطأ', pointsDelta: 0, teamIndex: 1, atMs: t },
      }),
      { nowMs: t, rng: () => 0 }
    );
    assert.equal(res.emitted?.kind, 'wrong');
    emittedWrong.push(res.emitted!.text);
  }
  assert.equal(new Set(emittedWrong).size, HOST_COMMENTARY_BANK.wrong.length);

  const emittedTimeouts: string[] = [];
  for (let i = 0; i < HOST_COMMENTARY_BANK.timeout.length; i++) {
    t += 1000;
    const res = engine.step(
      makeLiveSessionView({
        phase: 'playing',
        currentRoundIndex: 0,
        timerRunning: false,
        timerRemainingSec: 0,
        answerRevealed: false,
        currentQuestion: {
          id: `q-timeout-${i}`,
          bankId: 'b',
          roundType: 'rapid_fire',
          category: 'الكل',
          ageGroup: 'family',
          difficulty: 'medium',
          prompt: `سؤال ${i}`,
          options: [],
          cluesCount: 0,
          revealedClues: [],
          memoryPhase: 'none',
          memoryRemainingSec: 0,
          isReligious: true,
        },
      }),
      { nowMs: t, rng: () => 0.99 }
    );
    assert.equal(res.emitted?.kind, 'timeout');
    emittedTimeouts.push(res.emitted!.text);
  }
  assert.equal(new Set(emittedTimeouts).size, HOST_COMMENTARY_BANK.timeout.length);
});

