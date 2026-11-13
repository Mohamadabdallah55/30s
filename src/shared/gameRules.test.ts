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
} from './gameRules';

test('ALL_ROUND_TYPES includes all 11 required round modes', () => {
  assert.equal(ALL_ROUND_TYPES.length, 11);
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
