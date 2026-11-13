import type {
  AgeGroup,
  CanonicalAgeGroup,
  Difficulty,
  DifficultyLevel,
  MatchPreset,
  QuestionRecord,
  RoundConfig,
  RoundRuleMeta,
  RoundType,
  TeamState,
} from './types';

export const ROUND_RULES: Record<RoundType, RoundRuleMeta> = {
  rapid_fire: {
    type: 'rapid_fire',
    nameAr: 'الرشاش السريع',
    shortDescAr: 'أسئلة قصيرة متتابعة خلال 30 ثانية متواصلة دون توقف',
    rulesBulletAr: 'نقطة واحدة لكل إجابة صحيحة، والمؤقت يستمر لـ 30 ثانية كاملة عبر كل الأسئلة.',
    defaultDurationSec: 30,
    basePoints: 1,
    multiplier: 1,
    multiQuestionWithinTimer: true,
    questionsPerRound: 8,
  },
  list_multiple: {
    type: 'list_multiple',
    nameAr: 'اذكر ثلاثة أو خمسة',
    shortDescAr: 'تحدي تعداد يقبل إجابات متعددة صحيحة بدون تكرار',
    rulesBulletAr: 'نقطة واحدة عن كل عنصر صحيح ومختلف تذكره قبل انتهاء الوقت.',
    defaultDurationSec: 30,
    basePoints: 1,
    multiplier: 1,
    multiQuestionWithinTimer: false,
    questionsPerRound: 2,
  },
  true_false: {
    type: 'true_false',
    nameAr: 'صح أو خطأ',
    shortDescAr: 'قرارات سريعة متتابعة خلال الوقت المتواصل',
    rulesBulletAr: 'نقطة واحدة لكل إجابة صحيحة مع احتساب سلسلة الإجابات المتواصلة.',
    defaultDurationSec: 30,
    basePoints: 1,
    multiplier: 1,
    multiQuestionWithinTimer: true,
    questionsPerRound: 6,
  },
  multiple_choice: {
    type: 'multiple_choice',
    nameAr: 'اختيار من متعدد',
    shortDescAr: 'أربعة خيارات وإجابة واحدة دقيقة',
    rulesBulletAr: 'نقطة واحدة لكل إجابة صحيحة من الخيارات الأربعة.',
    defaultDurationSec: 30,
    basePoints: 1,
    multiplier: 1,
    multiQuestionWithinTimer: false,
    questionsPerRound: 4,
  },
  fill_blank: {
    type: 'fill_blank',
    nameAr: 'أكمل الفراغ',
    shortDescAr: 'إجابة لفظية أو كتابية دقيقة تكمل الجملة أو الآية',
    rulesBulletAr: 'نقطة واحدة لكل إجابة دقيقة تطابق الفراغ المطلوب.',
    defaultDurationSec: 30,
    basePoints: 1,
    multiplier: 1,
    multiQuestionWithinTimer: false,
    questionsPerRound: 3,
  },
  who_am_i: {
    type: 'who_am_i',
    nameAr: 'من أنا؟',
    shortDescAr: 'أدلة متدرجة — الإجابة المبكرة تمنح 3 نقاط ثم 2 ثم 1',
    rulesBulletAr: 'من الدليل الأول: 3 نقاط · الدليل الثاني: نقطتان · الدليل الثالث: نقطة واحدة.',
    defaultDurationSec: 40,
    basePoints: 3,
    multiplier: 1,
    multiQuestionWithinTimer: false,
    questionsPerRound: 2,
  },
  odd_one_out: {
    type: 'odd_one_out',
    nameAr: 'اكتشف المختلف',
    shortDescAr: 'اختر العنصر المختلف واذكر سبب الاختلاف بوضوح',
    rulesBulletAr: 'نقطة واحدة عند اختيار المختلف وتوضيح سبب الاختلاف.',
    defaultDurationSec: 30,
    basePoints: 1,
    multiplier: 1,
    multiQuestionWithinTimer: false,
    questionsPerRound: 2,
  },
  order_items: {
    type: 'order_items',
    nameAr: 'رتب العناصر',
    shortDescAr: 'رتب العناصر وفق المعيار المعلن في السؤال',
    rulesBulletAr: 'نقطة واحدة للترتيب الصحيح الكامل حسب المعيار المطلوب.',
    defaultDurationSec: 35,
    basePoints: 1,
    multiplier: 1,
    multiQuestionWithinTimer: false,
    questionsPerRound: 2,
  },
  memory: {
    type: 'memory',
    nameAr: 'تحدي الذاكرة',
    shortDescAr: 'احفظ العناصر المعروضة ثم أجب من ذاكرتك بعد اختفائها',
    rulesBulletAr: 'فترة حفظ قصيرة ثم استرجاع؛ نقطة واحدة عن كل استرجاع صحيح.',
    defaultDurationSec: 30,
    basePoints: 1,
    multiplier: 1,
    multiQuestionWithinTimer: false,
    questionsPerRound: 2,
    memoryRevealSec: 8,
  },
  buzzer: {
    type: 'buzzer',
    nameAr: 'المواجهة بالجرس',
    shortDescAr: 'أول فريق يضغط الجرس يحصل على الفرصة، وعند الخطأ تنتقل للخصم',
    rulesBulletAr: 'نقطتان للإجابة الصحيحة. عند الخطأ يُغلق الجرس على الفريق وتنتقل الفرصة للمنافس.',
    defaultDurationSec: 30,
    basePoints: 2,
    multiplier: 1,
    multiQuestionWithinTimer: false,
    questionsPerRound: 4,
  },
  golden: {
    type: 'golden',
    nameAr: 'الجولة الذهبية (×2)',
    shortDescAr: 'مضاعف نقاط (×2) يُطبّق على نوع الجولة المختار للعودة القوية',
    rulesBulletAr: 'تُحتسب نقاط الجولة المختارة مضاعفة (×2) طوال هذه الجولة الحاسمة.',
    defaultDurationSec: 30,
    basePoints: 1,
    multiplier: 2,
    multiQuestionWithinTimer: false,
    questionsPerRound: 3,
  },
};

export const ALL_ROUND_TYPES: RoundType[] = Object.keys(ROUND_RULES) as RoundType[];

export const CANONICAL_AGE_GROUPS: CanonicalAgeGroup[] = [
  'kids_7_10',
  'preteen_11_13',
  'teen_14_17',
  'adults_18_plus',
  'family',
];

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  kids_7_10: 'البراعم (7–10 سنوات)',
  preteen_11_13: 'الأشبال (11–13 سنة)',
  teen_14_17: 'الفتيان والشباب (14–17 سنة)',
  adults_18_plus: 'الكبار (+18 سنة)',
  family: 'عائلي ومفتوح للجميع',
  // Legacy aliases preserved for backward compatibility
  kids: 'البراعم (7–10 سنوات)',
  youth: 'الفتيان والشباب (14–17 سنة)',
  adults: 'الكبار (+18 سنة)',
};

export function normalizeAgeGroup(age?: string | null): CanonicalAgeGroup {
  switch (age) {
    case 'kids':
    case 'kids_7_10':
      return 'kids_7_10';
    case 'preteen_11_13':
      return 'preteen_11_13';
    case 'youth':
    case 'teen_14_17':
      return 'teen_14_17';
    case 'adults':
    case 'adults_18_plus':
      return 'adults_18_plus';
    case 'family':
    default:
      return 'family';
  }
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'مبتدئ / سهل',
  medium: 'متوسط',
  hard: 'متقدم / عميق',
};

export const DIFFICULTY_LEVEL_LABELS: Record<DifficultyLevel, string> = {
  1: 'المستوى 1 — تمهيدي جداً',
  2: 'المستوى 2 — سهل',
  3: 'المستوى 3 — متوسط متوازن',
  4: 'المستوى 4 — فوق المتوسط',
  5: 'المستوى 5 — متقدم تحليلي',
};

export function levelToDifficulty(level: DifficultyLevel): Difficulty {
  if (level <= 2) return 'easy';
  if (level === 3) return 'medium';
  return 'hard';
}

export function difficultyToLevel(diff: Difficulty): DifficultyLevel {
  if (diff === 'easy') return 2;
  if (diff === 'hard') return 5;
  return 3;
}

export const MATCH_PRESETS: MatchPreset[] = [
  {
    id: 'quick',
    titleAr: 'مباراة سريعة',
    subtitleAr: '3 جولات خفيفة (الرشاش + اختيار متعدد + صح وخطأ) — نحو 5 دقائق',
    teamCount: 2,
    ageGroup: 'family',
    difficulty: 'mixed',
    difficultyLevel: 3,
    timerSec: 30,
    roundTypes: ['rapid_fire', 'multiple_choice', 'true_false'],
  },
  {
    id: 'classic',
    titleAr: 'مباراة كلاسيكية',
    subtitleAr: '5 جولات متوازنة بين السرعة والذكاء والجرس والذهبية — نحو 10 دقائق',
    teamCount: 2,
    ageGroup: 'family',
    difficulty: 'mixed',
    difficultyLevel: 3,
    timerSec: 30,
    roundTypes: ['rapid_fire', 'multiple_choice', 'who_am_i', 'buzzer', 'golden'],
  },
  {
    id: 'intense',
    titleAr: 'مباراة حماسية',
    subtitleAr: 'تحديات عميقة (جرس + ذاكرة + ترتيب + مختلف + ذهبية) — تحدٍ قوي',
    teamCount: 2,
    ageGroup: 'teen_14_17',
    difficulty: 'hard',
    difficultyLevel: 4,
    timerSec: 30,
    roundTypes: ['buzzer', 'memory', 'order_items', 'odd_one_out', 'who_am_i', 'golden'],
  },
  {
    id: 'buds',
    titleAr: 'تحدي براعم المسجد',
    subtitleAr: 'مخصص لأعمار 7–10 سنوات بأسلوب مشوق وأسئلة ميسّرة',
    teamCount: 2,
    ageGroup: 'kids_7_10',
    difficulty: 'easy',
    difficultyLevel: 1,
    timerSec: 35,
    roundTypes: ['true_false', 'multiple_choice', 'fill_blank', 'who_am_i'],
  },
  {
    id: 'lesson',
    titleAr: 'تحدي الدرس',
    subtitleAr: 'مبني على بنك درس PDF المعتمد لاختبار طلاب الحلقة',
    teamCount: 2,
    ageGroup: 'preteen_11_13',
    difficulty: 'medium',
    difficultyLevel: 3,
    timerSec: 30,
    roundTypes: ['multiple_choice', 'true_false', 'fill_blank', 'buzzer'],
    sourcePreference: 'lesson',
  },
  {
    id: 'custom',
    titleAr: 'تخصيص كامل',
    subtitleAr: 'تحكم في كل التفاصيل من اختيار الفرق حتى توزيع الجولات والنقاط',
    teamCount: 2,
    ageGroup: 'family',
    difficulty: 'mixed',
    difficultyLevel: 3,
    timerSec: 30,
    roundTypes: ['rapid_fire', 'multiple_choice', 'who_am_i', 'buzzer', 'golden'],
  },
];

/**
 * Normalize Arabic text for tolerant comparison (removes tashkeel, tatweel,
 * unifies alef/taa marbuta/alef maqsura, collapses spaces).
 */
export function normalizeArabicText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[.,،؛:!؟"'()\-_[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildDefaultRoundConfigs(
  selectedTypes: RoundType[],
  overrides?: Partial<Record<RoundType, Partial<RoundConfig>>>
): RoundConfig[] {
  return selectedTypes.map((type, idx) => {
    const meta = ROUND_RULES[type];
    const custom = overrides?.[type];
    const goldenTarget =
      type === 'golden' ? custom?.goldenTargetType ?? 'multiple_choice' : undefined;
    const baseMeta = goldenTarget ? ROUND_RULES[goldenTarget] : meta;
    return {
      roundNumber: idx + 1,
      roundType: type,
      goldenTargetType: goldenTarget,
      titleAr:
        custom?.titleAr ??
        (type === 'golden' && goldenTarget
          ? `الجولة الذهبية (${ROUND_RULES[goldenTarget].nameAr} ×2)`
          : meta.nameAr),
      durationSec: custom?.durationSec ?? meta.defaultDurationSec,
      basePoints: custom?.basePoints ?? baseMeta.basePoints,
      multiplier: custom?.multiplier ?? meta.multiplier,
      questionsPerRound: custom?.questionsPerRound ?? meta.questionsPerRound,
      memoryRevealSec: custom?.memoryRevealSec ?? meta.memoryRevealSec,
    };
  });
}

export function estimateMatchStats(rounds: RoundConfig[]): {
  estimatedMinutes: number;
  requiredQuestions: number;
} {
  let totalSeconds = 0;
  let requiredQuestions = 0;
  for (const r of rounds) {
    const meta = ROUND_RULES[r.roundType];
    requiredQuestions += r.questionsPerRound;
    if (meta.multiQuestionWithinTimer) {
      totalSeconds += r.durationSec + 10;
    } else {
      totalSeconds += r.questionsPerRound * (r.durationSec * 0.65 + 6);
    }
  }
  return {
    estimatedMinutes: Math.max(1, Math.round(totalSeconds / 60)),
    requiredQuestions,
  };
}

/**
 * Balanced scoring model:
 * - rapid_fire / true_false / multiple_choice / fill_blank / odd_one_out / order_items: 1 pt per correct answer
 * - list_multiple / memory: 1 pt per valid recalled item (capped at target list size)
 * - who_am_i: scales down cleanly as clues are revealed (3 -> 2 -> 1)
 * - buzzer: 2 pts per correct buzz answer
 * - golden: multiplies the underlying round's points by ×2
 */
export function calculateQuestionPoints(params: {
  round: RoundConfig;
  isCorrect: boolean;
  revealedClueCount?: number;
  streakCount?: number;
  matchedListCount?: number;
  totalRequiredListCount?: number;
}): number {
  const { round, isCorrect, revealedClueCount = 1, matchedListCount, totalRequiredListCount } = params;
  if (!isCorrect) return 0;

  const effectiveType =
    round.roundType === 'golden' && round.goldenTargetType ? round.goldenTargetType : round.roundType;

  let base = round.basePoints || ROUND_RULES[effectiveType].basePoints;

  if (effectiveType === 'who_am_i') {
    base = Math.max(1, 3 - Math.max(0, revealedClueCount - 1));
  } else if (
    (effectiveType === 'list_multiple' || effectiveType === 'memory') &&
    typeof matchedListCount === 'number' &&
    matchedListCount > 0
  ) {
    const cap = totalRequiredListCount && totalRequiredListCount > 0 ? totalRequiredListCount : 5;
    base = Math.min(cap, Math.max(1, matchedListCount));
  }

  return Math.max(1, Math.round(base * Math.max(1, round.multiplier)));
}

export function evaluateAnswerMatch(
  question: Pick<QuestionRecord, 'roundType' | 'options' | 'acceptableAnswers' | 'correctIndex'>,
  submitted: string | number | string[]
): { isCorrect: boolean; matchedCount?: number } {
  if (
    question.roundType === 'multiple_choice' ||
    question.roundType === 'true_false' ||
    question.roundType === 'odd_one_out'
  ) {
    if (typeof submitted === 'number') {
      if (typeof question.correctIndex === 'number') {
        return { isCorrect: submitted === question.correctIndex };
      }
      const chosenOpt = question.options[submitted];
      if (!chosenOpt) return { isCorrect: false };
      const normChosen = normalizeArabicText(chosenOpt);
      return {
        isCorrect: question.acceptableAnswers.some((a) => normalizeArabicText(a) === normChosen),
      };
    }
    const normSub = normalizeArabicText(String(submitted));
    if (typeof question.correctIndex === 'number' && question.options[question.correctIndex]) {
      if (normalizeArabicText(question.options[question.correctIndex]) === normSub) {
        return { isCorrect: true };
      }
    }
    return {
      isCorrect: question.acceptableAnswers.some((a) => normalizeArabicText(a) === normSub),
    };
  }

  if (question.roundType === 'order_items') {
    const expected =
      question.acceptableAnswers.length > 0 ? question.acceptableAnswers : question.options;
    const submittedList = Array.isArray(submitted)
      ? submitted
      : String(submitted)
          .split(/[،,|]/)
          .map((s) => s.trim())
          .filter(Boolean);
    if (submittedList.length !== expected.length || expected.length === 0) {
      return { isCorrect: false };
    }
    const allMatch = expected.every(
      (item, idx) => normalizeArabicText(item) === normalizeArabicText(submittedList[idx] ?? '')
    );
    return { isCorrect: allMatch };
  }

  if (question.roundType === 'list_multiple') {
    const submittedItems = Array.isArray(submitted)
      ? submitted
      : String(submitted)
          .split(/[،,\n|]+/)
          .map((s) => s.trim())
          .filter(Boolean);
    const normAcceptable = question.acceptableAnswers.map(normalizeArabicText);
    const matched = new Set<string>();
    const seenInput = new Set<string>();
    for (const item of submittedItems) {
      const normItem = normalizeArabicText(item);
      if (!normItem || seenInput.has(normItem)) continue;
      seenInput.add(normItem);
      for (const acc of normAcceptable) {
        if (acc === normItem || (normItem.length >= 3 && (acc.includes(normItem) || normItem.includes(acc)))) {
          matched.add(acc);
        }
      }
    }
    return { isCorrect: matched.size > 0, matchedCount: matched.size };
  }

  // rapid_fire, fill_blank, who_am_i, memory, buzzer, golden
  const normSub = normalizeArabicText(Array.isArray(submitted) ? submitted.join(' ') : String(submitted));
  if (!normSub) return { isCorrect: false };

  const match = question.acceptableAnswers.some((ans) => {
    const normAns = normalizeArabicText(ans);
    if (!normAns) return false;
    if (normAns === normSub) return true;
    const stripAl = (s: string) => s.replace(/^ال/, '');
    if (stripAl(normAns) === stripAl(normSub)) return true;
    return false;
  });
  return { isCorrect: match };
}

export function isAgeCompatible(questionAge: AgeGroup, targetAge: AgeGroup): boolean {
  const qNorm = normalizeAgeGroup(questionAge);
  const tNorm = normalizeAgeGroup(targetAge);
  if (tNorm === 'family' || qNorm === 'family') return true;
  if (qNorm === tNorm) return true;
  const rank: Record<Exclude<CanonicalAgeGroup, 'family'>, number> = {
    kids_7_10: 1,
    preteen_11_13: 2,
    teen_14_17: 3,
    adults_18_plus: 4,
  };
  // Younger tiers can be served to older tiers only by at most 1 step or family; never serve older content to younger!
  return rank[qNorm] <= rank[tNorm] && rank[tNorm] - rank[qNorm] <= 1;
}

export function determineWinner(teams: TeamState[]): {
  isTie: boolean;
  winnerIndices: number[];
  maxPoints: number;
} {
  if (teams.length === 0) return { isTie: true, winnerIndices: [], maxPoints: 0 };
  const maxPoints = Math.max(...teams.map((t) => t.points));
  const winners = teams.filter((t) => t.points === maxPoints).map((t) => t.index);
  return {
    isTie: winners.length > 1,
    winnerIndices: winners,
    maxPoints,
  };
}
