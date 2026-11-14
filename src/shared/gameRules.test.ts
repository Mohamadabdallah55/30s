import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_ROUND_TYPES,
  buildDefaultRoundConfigs,
  calculateQuestionPoints,
  determineWinner,
  evaluateAnswerMatch,
  isAgeCompatible,
  normalizeArabicText,
  resolveBidChallengePoints,
} from './gameRules';
import { buildSessionMatrix } from './qr';

test('ALL_ROUND_TYPES includes all 12 required round modes including bid_challenge', () => {
  assert.equal(ALL_ROUND_TYPES.length, 12);
  assert.ok(ALL_ROUND_TYPES.includes('rapid_fire'));
  assert.ok(ALL_ROUND_TYPES.includes('list_multiple'));
  assert.ok(ALL_ROUND_TYPES.includes('true_false'));
  assert.ok(ALL_ROUND_TYPES.includes('multiple_choice'));
  assert.ok(ALL_ROUND_TYPES.includes('fill_blank'));
  assert.ok(ALL_ROUND_TYPES.includes('who_am_i'));
  assert.ok(ALL_ROUND_TYPES.includes('odd_one_out'));
  assert.ok(ALL_ROUND_TYPES.includes('order_items'));
  assert.ok(ALL_ROUND_TYPES.includes('memory'));
  assert.ok(ALL_ROUND_TYPES.includes('buzzer'));
  assert.ok(ALL_ROUND_TYPES.includes('golden'));
  assert.ok(ALL_ROUND_TYPES.includes('bid_challenge'));
});

test('normalizeArabicText removes tashkeel and normalizes hamza/taa marbuta/alef maqsura', () => {
  assert.equal(normalizeArabicText('أَبُو بَكْرٍ الصِّدِّيقُ'), 'ابو بكر الصديق');
  assert.equal(normalizeArabicText('المدينة المنورة'), normalizeArabicText('المدينه المنوره'));
  assert.equal(normalizeArabicText('موسى عليه السلام'), normalizeArabicText('موسي عليه السلام'));
});

test('calculateQuestionPoints respects balanced scoring, golden 2x target multiplier, list_multiple per-item, and who_am_i clue decay', () => {
  const [goldenRound, whoRound, listRound] = buildDefaultRoundConfigs([
    'golden',
    'who_am_i',
    'list_multiple',
  ]);
  const [goldenBuzzerRound] = buildDefaultRoundConfigs(['golden'], {
    golden: { goldenTargetType: 'buzzer' },
  });
  // Default goldenTargetType is multiple_choice (base 1 * 2 = 2)
  assert.equal(calculateQuestionPoints({ round: goldenRound, isCorrect: true }), 2);
  assert.equal(calculateQuestionPoints({ round: goldenRound, isCorrect: false }), 0);

  // Golden targeting buzzer (base 2 * 2 = 4)
  assert.equal(calculateQuestionPoints({ round: goldenBuzzerRound, isCorrect: true }), 4);

  // who_am_i progressive decay: 3 -> 2 -> 1
  assert.equal(
    calculateQuestionPoints({ round: whoRound, isCorrect: true, revealedClueCount: 1 }),
    3
  );
  assert.equal(
    calculateQuestionPoints({ round: whoRound, isCorrect: true, revealedClueCount: 2 }),
    2
  );
  assert.equal(
    calculateQuestionPoints({ round: whoRound, isCorrect: true, revealedClueCount: 3 }),
    1
  );

  // list_multiple awards 1 point per distinct correct answer up to 5
  assert.equal(
    calculateQuestionPoints({ round: listRound, isCorrect: true, matchedListCount: 3 }),
    3
  );
});

test('evaluateAnswerMatch validates MCQ, order_items, list_multiple, and fill_blank', () => {
  assert.equal(
    evaluateAnswerMatch(
      {
        roundType: 'multiple_choice',
        options: ['مكة', 'المدينة', 'القدس', 'الطائف'],
        acceptableAnswers: ['المدينة'],
        correctIndex: 1,
      },
      1
    ).isCorrect,
    true
  );

  assert.equal(
    evaluateAnswerMatch(
      {
        roundType: 'order_items',
        options: ['العشاء', 'الفجر', 'الظهر'],
        acceptableAnswers: ['الفجر', 'الظهر', 'العشاء'],
      },
      ['الفجر', 'الظهر', 'العشاء']
    ).isCorrect,
    true
  );

  const listResult = evaluateAnswerMatch(
    {
      roundType: 'list_multiple',
      options: [],
      acceptableAnswers: ['الشهادتان', 'إقامة الصلاة', 'إيتاء الزكاة', 'صوم رمضان', 'حج البيت'],
    },
    'الشهادتان، إقامة الصلاة، صوم رمضان'
  );
  assert.equal(listResult.isCorrect, true);
  assert.equal(listResult.matchedCount, 3);

  assert.equal(
    evaluateAnswerMatch(
      {
        roundType: 'fill_blank',
        options: [],
        acceptableAnswers: ['غار ثور'],
      },
      'ثور'
    ).isCorrect,
    false
  );
  assert.equal(
    evaluateAnswerMatch(
      {
        roundType: 'fill_blank',
        options: [],
        acceptableAnswers: ['غار ثور'],
      },
      'غار ثور'
    ).isCorrect,
    true
  );
});

test('age compatibility prevents adult-only questions from reaching kids', () => {
  assert.equal(isAgeCompatible('kids', 'kids'), true);
  assert.equal(isAgeCompatible('family', 'kids'), true);
  assert.equal(isAgeCompatible('adults', 'kids'), false);
  assert.equal(isAgeCompatible('youth', 'adults'), true);
});

test('determineWinner handles clear winner and ties', () => {
  const win = determineWinner([
    { index: 0, name: 'أ', color: '#fff', points: 50, strikes: 0, streak: 0, participantIds: [], participantNames: [] },
    { index: 1, name: 'ب', color: '#000', points: 30, strikes: 0, streak: 0, participantIds: [], participantNames: [] },
  ]);
  assert.equal(win.isTie, false);
  assert.deepEqual(win.winnerIndices, [0]);

  const tie = determineWinner([
    { index: 0, name: 'أ', color: '#fff', points: 40, strikes: 0, streak: 0, participantIds: [], participantNames: [] },
    { index: 1, name: 'ب', color: '#000', points: 40, strikes: 0, streak: 0, participantIds: [], participantNames: [] },
  ]);
  assert.equal(tie.isTie, true);
  assert.deepEqual(tie.winnerIndices, [0, 1]);
});

test('resolveBidChallengePoints awards 3 pts to successful bidder and 2 pts to opponent on failure', () => {
  const success = resolveBidChallengePoints({
    currentBid: 5,
    bidderTeamIndex: 0,
    acceptedCount: 5,
    teamCount: 2,
    multiplier: 1,
  });
  assert.equal(success.succeeded, true);
  assert.equal(success.winnerTeamIndex, 0);
  assert.equal(success.pointsAwarded, 3);

  const failTwoTeams = resolveBidChallengePoints({
    currentBid: 6,
    bidderTeamIndex: 0,
    acceptedCount: 4,
    teamCount: 2,
    multiplier: 1,
  });
  assert.equal(failTwoTeams.succeeded, false);
  assert.equal(failTwoTeams.winnerTeamIndex, 1);
  assert.equal(failTwoTeams.pointsAwarded, 2);

  const failSolo = resolveBidChallengePoints({
    currentBid: 6,
    bidderTeamIndex: 0,
    acceptedCount: 4,
    teamCount: 1,
    multiplier: 1,
  });
  assert.equal(failSolo.succeeded, false);
  assert.equal(failSolo.pointsAwarded, 0);

  const goldenWin = resolveBidChallengePoints({
    currentBid: 4,
    bidderTeamIndex: 1,
    acceptedCount: 5,
    teamCount: 2,
    multiplier: 2,
  });
  assert.equal(goldenWin.winnerTeamIndex, 1);
  assert.equal(goldenWin.pointsAwarded, 6);
});

test('buildSessionMatrix generates a real scannable ISO QR matrix with 3 finder patterns', () => {
  const urlA = 'https://mosque.example.com/?mode=host&code=ABC123';
  const urlB = 'https://mosque.example.com/?mode=host&code=XYZ789';
  const matA = buildSessionMatrix(urlA);
  const matB = buildSessionMatrix(urlB);

  const n = matA.length;
  assert.ok(n >= 25, `Expected QR version >= 2 for full URL, got ${n}x${n}`);
  assert.equal(matA[0].length, n);
  // Top-left 7x7 finder corners + center
  assert.equal(matA[0][0], true);
  assert.equal(matA[0][6], true);
  assert.equal(matA[6][0], true);
  assert.equal(matA[3][3], true);
  assert.equal(matA[1][1], false);
  // Top-right & bottom-left finder centers
  assert.equal(matA[3][n - 4], true);
  assert.equal(matA[n - 4][3], true);
  // Different URLs produce different matrices
  assert.notDeepEqual(matA, matB);
});
