import {
  AGE_GROUP_LABELS,
  ALL_ROUND_TYPES,
  DIFFICULTY_LABELS,
  ROUND_RULES,
  determineWinner,
  normalizeArabicText,
  normalizeChallengeItem,
} from './gameRules';
import type {
  BidChallengeState,
  BotChatBubble,
  BotSkillLevel,
  GameSessionView,
  QuestionRecord,
  RoundConfig,
  RoundType,
} from './types';

export const JORDANIAN_BOT_DEFAULT_NAME = 'نشمي (البوت الأردني)';

export interface BotRoundGuide {
  roundType: RoundType;
  nicknameJo: string;
  howToPlayJo: string;
  scoringJo: string;
  proTipJo: string;
}

export const ROUND_JORDANIAN_GUIDES: Record<RoundType, BotRoundGuide> = {
  rapid_fire: {
    roundType: 'rapid_fire',
    nicknameJo: 'الرشاش السريع',
    howToPlayJo: 'أسئلة سريعة ورا بعض خلال 30 ثانية متواصلة — الوقت ما بوقف بين سؤال وسؤال!',
    scoringJo: 'نقطة وحدة عن كل إجابة صح، ومع سلسلة إجابات متتالية بتكسب بونص (+1 عند 3 صح ورا بعض).',
    proTipJo: 'إذا السؤال علّق معك لا تضيع الـ30 ثانية، تخطّاه عالسريع وخذ اللي بعده!',
  },
  list_multiple: {
    roundType: 'list_multiple',
    nicknameJo: 'اذكر ثلاثة أو خمسة',
    howToPlayJo: 'بنطلب منك تذكر 3 أو 5 إجابات صحيحة ومختلفة لنفس السؤال قبل ما يخلص الوقت.',
    scoringJo: 'نقطة عن كل عنصر صح ومش مكرر، وممنوع تكتب نفس الإجابة بصيغة ثانية.',
    proTipJo: 'بلّش بالأشياء المضمونة والواضحة أولاً وبعدين كمّل الباقي.',
  },
  true_false: {
    roundType: 'true_false',
    nicknameJo: 'صح أو خطأ',
    howToPlayJo: 'جمل سريعة ورا بعض خلال المؤقت المتواصل، تقرر بسرعة إذا صح ولا خطأ.',
    scoringJo: 'نقطة لكل قرار صح، والسلسلة المتواصلة بتعطيك نقاط زيادة.',
    proTipJo: 'انتبه للتفاصيل الصغيرة بالسؤال زي التواريخ أو كلمات "فقط" و"دائماً" عشان ما تنخدع!',
  },
  multiple_choice: {
    roundType: 'multiple_choice',
    nicknameJo: 'اختيار من متعدد',
    howToPlayJo: 'سؤال وأربعة خيارات (أ، ب، ج، د) — إجابة وحدة بس هي الصح.',
    scoringJo: 'نقطة لكل اختيار صح (أو نقطتين إذا كانت داخل الجولة الذهبية).',
    proTipJo: 'استبعد الخيارين البعيدات أولاً، بعدها الاختيار بين الباقي بصير أسهل بكثير.',
  },
  fill_blank: {
    roundType: 'fill_blank',
    nicknameJo: 'أكمل الفراغ',
    howToPlayJo: 'آية أو حديث أو معلومة فيها فراغ (......) ولازم تكمل الكلمة أو الجملة الناقصة بدقة.',
    scoringJo: 'نقطة للإجابة الدقيقة — والنظام بتساهل مع الهمزات والتشكيل والتاء المربوطة.',
    proTipJo: 'اقرأ الجملة بصوت واطي براسك، المعنى والسياق لحالهم بدلّوك عالكلمة.',
  },
  who_am_i: {
    roundType: 'who_am_i',
    nicknameJo: 'من أنا؟',
    howToPlayJo: 'بنعطيك 3 أدلة بالتدريج عن شخصية أو معلم، وبتقدر تطلب تلميح إذا ما عرفتها.',
    scoringJo: 'إذا عرفتها من الدليل الأول بتاخد 3 نقاط! من الثاني نقطتين، ومن الثالث نقطة وحدة.',
    proTipJo: 'لو متأكد من أول دليل جاوب فوراً وخُذ الـ3 نقاط قبل ما تطلب دليل ثاني.',
  },
  odd_one_out: {
    roundType: 'odd_one_out',
    nicknameJo: 'اكتشف المختلف',
    howToPlayJo: 'أربعة عناصر: ثلاثة منهم بينهم رابط مشترك وواحد شاذ عنهم، اختار المختلف.',
    scoringJo: 'نقطة وحدة عن اختيار العنصر المختلف (وفي اللعب المباشر تقدر توضح السبب).',
    proTipJo: 'اسأل حالك: شو الرابط بين أول ثلاثة؟ بمجرد ما تمسك الرابط ببين المختلف لحاله.',
  },
  order_items: {
    roundType: 'order_items',
    nicknameJo: 'رتب العناصر',
    howToPlayJo: 'أربع بطاقات مخربطة ولازم ترتبها حسب المعيار المكتوب (مثلاً زمنياً من الأقدم للأحدث).',
    scoringJo: 'نقطة وحدة لما يطلع الترتيب كامل 100% مطابق للمعيار.',
    proTipJo: 'ثبّت أول عنصر وآخر عنصر بالأول، وبعدين رتّب الاثنين اللي بالنص.',
  },
  memory: {
    roundType: 'memory',
    nicknameJo: 'تحدي الذاكرة',
    howToPlayJo: 'بتظهر قدامك بطاقات تحفظها لكم ثانية، وبعدين بتختفي وبتجاوب من ذاكرتك!',
    scoringJo: 'نقطة عن كل استرجاع صحيح؛ وبعض الأسئلة بتطلب نفس الترتيب تماماً.',
    proTipJo: 'اربط العناصر بقصة صغيرة أو خُذ أول حرف من كل كلمة عشان تثبت ببالك.',
  },
  buzzer: {
    roundType: 'buzzer',
    nicknameJo: 'المواجهة بالجرس',
    howToPlayJo: 'السؤال بنعرض للفريقين مع بعض؛ أول واحد بكبس الجرس (أو حرف A / L) بياخد الفرصة.',
    scoringJo: 'نقطتين للإجابة الصح! ولو جاوبت غلط بنسكر الجرس عليك وبتروح الفرصة للمنافس.',
    proTipJo: 'لا تكبس الجرس قبل ما تكمل قراءة السؤال إلا إذا كنت متأكد 100% عشان ما يروح عليك!',
  },
  golden: {
    roundType: 'golden',
    nicknameJo: 'الجولة الذهبية (×2)',
    howToPlayJo: 'جولة عادية من النوع المختار بس كل النقاط فيها مضروبة بـ ×2 للعودة القوية!',
    scoringJo: 'أي نقطة بتجيبها بهالجولة بتتدبل ×2 — مثلاً الجرس بصير 4 نقاط ومن أنا بصير 6!',
    proTipJo: 'هاي جولة قلب الطاولة! ركّز فيها منيح وما تفرّط ولا بنقطة.',
  },
  bid_challenge: {
    roundType: 'bid_challenge',
    nicknameJo: 'مين يزوّد؟',
    howToPlayJo: 'مرحلة مزايدة: كل فريق برفع العدد اللي بقدر يذكره بـ30 ثانية لحد ما واحد يقول «بتحدّاك!»',
    scoringJo: 'ما في نقاط للمزايدة نفسها؛ إذا الفائز بالمزايدة جاب العدد بأخد 3 نقاط، وإذا فشل المنافس بأخد نقطتين!',
    proTipJo: 'ارفع بحكمة! لو خصمك بالغ بالعدد، اكبس «بتحدّاك!» وخليه يتورط بالـ30 ثانية.',
  },
};

export interface BotSkillProfile {
  skill: BotSkillLevel;
  labelAr: string;
  accuracy: number;
  buzzDelayMsRange: [number, number];
  thinkDelayMsRange: [number, number];
  bidConfidenceRatio: number;
}

export const BOT_SKILL_PROFILES: Record<BotSkillLevel, BotSkillProfile> = {
  relaxed: {
    skill: 'relaxed',
    labelAr: 'نشمي الهادي (سهل)',
    accuracy: 0.55,
    buzzDelayMsRange: [2800, 4400],
    thinkDelayMsRange: [2000, 3200],
    bidConfidenceRatio: 0.45,
  },
  balanced: {
    skill: 'balanced',
    labelAr: 'نشمي المتوازن (متوسط)',
    accuracy: 0.74,
    buzzDelayMsRange: [1900, 3000],
    thinkDelayMsRange: [1400, 2400],
    bidConfidenceRatio: 0.65,
  },
  fierce: {
    skill: 'fierce',
    labelAr: 'نشمي الناري (صعب)',
    accuracy: 0.9,
    buzzDelayMsRange: [1100, 2000],
    thinkDelayMsRange: [1000, 1700],
    bidConfidenceRatio: 0.85,
  },
};

export type BotTurnAction =
  | { type: 'none' }
  | { type: 'buzz'; teamIndex: number; banterMood: BotChatBubble['mood']; banterText: string }
  | { type: 'bid_raise'; teamIndex: number; targetBid: number; banterMood: BotChatBubble['mood']; banterText: string }
  | { type: 'bid_challenge'; teamIndex: number; banterMood: BotChatBubble['mood']; banterText: string }
  | { type: 'bid_record_answer'; teamIndex: number; answerText: string; isCorrect: boolean; banterMood: BotChatBubble['mood']; banterText: string }
  | { type: 'bid_complete'; teamIndex: number; banterMood: BotChatBubble['mood']; banterText: string }
  | { type: 'reveal_next_clue'; teamIndex: number; banterMood: BotChatBubble['mood']; banterText: string }
  | { type: 'answer'; teamIndex: number; submitted: string | number | string[]; expectedCorrect: boolean; banterMood: BotChatBubble['mood']; banterText: string };

export interface BotDecisionSessionSlice {
  phase: GameSessionView['phase'];
  activeTeamIndex: number;
  buzzedTeamIndex: number | null;
  failedBuzzTeams: number[];
  timerRunning: boolean;
  timerRemainingSec: number;
  answerRevealed: boolean;
  revealedClueCount: number;
  memoryPhase: 'memorize' | 'recall' | 'none';
  bidState: BidChallengeState | null;
  rounds: RoundConfig[];
  currentRoundIndex: number;
  currentQuestion: QuestionRecord | null;
  teams: Array<{ index: number; name: string; points: number; streak: number }>;
}

const BANTER_BANK = {
  match_start: [
    'هلا بالنشامى! أنا نشمي وجاهز للتحدي، يلا نفرجيهم مين قدّها!',
    'حيّ الله الشباب! القهوة جاهزة والمنافسة عالنار، يلا نبلّش!',
    'مساء الهمة! شدّوا الأحزمة لأنو اليوم اللعب غير شكل!',
  ],
  bot_buzz: [
    'كبست الجرس قبلك! استعد للإجابة يا كبير!',
    'أسرع من البرق! الجرس عندي هالمرة!',
    'عالسريع! سمعت السؤال ولحقت الجرس!',
  ],
  bot_correct: [
    'والله جبتها صح! كيف الأداء بس؟',
    'سهلة هاي عالنشامى! يلا عاللي بعده!',
    'مزبوطة مية بالمية! شدّ حيلك لا تتأخر!',
    'كفو! نقطة حلوة بتفتح النفس!',
  ],
  bot_wrong: [
    'أوووف والله زلّت مني! الحق عليك ربكتني!',
    'راحت عليّ هالمرة، فرصتك تعوّض يا بطل!',
    'تلبّكت شوي باللحظة الأخيرة، يلا مسامح حالي!',
  ],
  bot_bid_raise: [
    'برفع السقف! قدّها وقدود إن شاء الله!',
    'لا، أنا بزيد عليك — ورّيني شطارتك!',
    'على بركة الله، بنزوّد الرقم!',
  ],
  bot_bid_challenge: [
    'بتحدّاك يا زلمة! الـ30 ثانية بتحكم بيننا!',
    'كثير هيك! بتحدّاك تجيبهم قبل ما يخلص الوقت!',
    'يلا ورّينا همّتك! بتحدّاك!',
  ],
  bot_thinking_clue: [
    'خلّيني أشوف التلميح اللي بعده عشان أقطع الشك باليقين...',
    'الاسم قريب على بالي، عطيني كمان تلميح!',
  ],
  player_correct: [
    'والله إنك كفو! إجابة مرتبة!',
    'أبدعت يا نشمي! نقطة مستحقة!',
    'يا سلام عليك! ما خليتلي مجال!',
  ],
  player_wrong: [
    'قريبة والله! المرة الجاية بتجيبها!',
    'راحت بالملّي، لا توقف كمّل!',
    'هسا دوري آخذ الصدارة منك!',
  ],
  lead_change: [
    'انقلبت الموازين! اللعبة ولعت نار!',
    'تبدّلت الصدارة يا جماعة — كل ثانية بتفرق!',
  ],
  match_win_bot: [
    'فاز نشمي! بس والله لعبتك بترفع الراس، بنعيدها!',
    'كفو عليك منافسة قوية! هالمرة الحظ ابتسم للنشامى!',
  ],
  match_win_player: [
    'ألف مبروك يا بطل! والله غلبتني عن جدارة!',
    'يسعد دينك شو مبدع! تستاهل الكأس والله!',
  ],
  match_tie: [
    'تعادل! ولا واحد فينا راضي يفرّط — جاهز لكسر التعادل؟',
  ],
} as const;

export type BanterEvent = keyof typeof BANTER_BANK;

export function pickJordanianBanter(event: BanterEvent, rng: () => number = Math.random): string {
  const options = BANTER_BANK[event];
  const idx = Math.min(options.length - 1, Math.floor(rng() * options.length));
  return options[idx];
}

export function computeBotDelayMs(
  skill: BotSkillLevel,
  kind: 'buzz' | 'bid' | 'sprint' | 'standard',
  rng: () => number = Math.random
): number {
  const profile = BOT_SKILL_PROFILES[skill] ?? BOT_SKILL_PROFILES.balanced;
  if (kind === 'buzz') {
    const [min, max] = profile.buzzDelayMsRange;
    return Math.round(min + rng() * (max - min));
  }
  if (kind === 'sprint') {
    const [min, max] = profile.thinkDelayMsRange;
    return Math.round(Math.max(850, min * 0.72) + rng() * ((max - min) * 0.6));
  }
  if (kind === 'bid') {
    return Math.round(950 + rng() * 750);
  }
  const [min, max] = profile.thinkDelayMsRange;
  return Math.round(min + rng() * (max - min));
}

function getEffectiveAccuracy(skill: BotSkillLevel, question: QuestionRecord): number {
  const base = (BOT_SKILL_PROFILES[skill] ?? BOT_SKILL_PROFILES.balanced).accuracy;
  const diffPenalty =
    question.difficulty === 'hard' ? -0.1 : question.difficulty === 'easy' ? 0.08 : 0;
  return Math.min(0.95, Math.max(0.32, base + diffPenalty));
}

function buildWrongChoiceIndex(question: QuestionRecord, rng: () => number): number {
  const total = question.options.length;
  if (total <= 1) return 0;
  const correctIdx = resolveCorrectOptionIndex(question);
  const wrongIndices: number[] = [];
  for (let i = 0; i < total; i++) {
    if (i !== correctIdx) wrongIndices.push(i);
  }
  if (wrongIndices.length === 0) return 0;
  return wrongIndices[Math.floor(rng() * wrongIndices.length)];
}

export function resolveCorrectOptionIndex(question: QuestionRecord): number {
  if (
    typeof question.correctIndex === 'number' &&
    question.correctIndex >= 0 &&
    question.correctIndex < question.options.length
  ) {
    return question.correctIndex;
  }
  const normalizedAnswers = new Set(question.acceptableAnswers.map(normalizeArabicText).filter(Boolean));
  const found = question.options.findIndex((opt) => normalizedAnswers.has(normalizeArabicText(opt)));
  return found >= 0 ? found : 0;
}

export function decideBotTurnAction(params: {
  session: BotDecisionSessionSlice;
  botTeamIndex: number;
  skill: BotSkillLevel;
  rng?: () => number;
}): BotTurnAction {
  const { session, botTeamIndex, skill, rng = Math.random } = params;
  const q = session.currentQuestion;
  if (
    session.phase !== 'playing' ||
    !q ||
    session.answerRevealed ||
    session.memoryPhase === 'memorize'
  ) {
    return { type: 'none' };
  }

  const round = session.rounds[session.currentRoundIndex];
  const effectiveType =
    round?.roundType === 'golden' && round.goldenTargetType ? round.goldenTargetType : q.roundType;

  // 1. Bid Challenge (مين يزوّد)
  if (effectiveType === 'bid_challenge' && session.bidState) {
    const bid = session.bidState;
    if (bid.phase === 'bidding') {
      if (bid.turnTeamIndex !== botTeamIndex) {
        return { type: 'none' };
      }
      const profile = BOT_SKILL_PROFILES[skill] ?? BOT_SKILL_PROFILES.balanced;
      const comfortableMax = Math.max(1, Math.round(bid.maxPossible * profile.bidConfidenceRatio));
      // Challenge if current bid already exceeds comfortable threshold or maxPossible
      if (bid.currentBid >= bid.maxPossible || (bid.currentBid >= comfortableMax && rng() < 0.78)) {
        return {
          type: 'bid_challenge',
          teamIndex: botTeamIndex,
          banterMood: 'tease',
          banterText: pickJordanianBanter('bot_bid_challenge', rng),
        };
      }
      const jump = skill === 'fierce' && bid.currentBid + 2 <= comfortableMax && rng() < 0.35 ? 2 : 1;
      const targetBid = Math.min(bid.maxPossible, bid.currentBid + jump);
      return {
        type: 'bid_raise',
        teamIndex: botTeamIndex,
        targetBid,
        banterMood: 'hype',
        banterText: pickJordanianBanter('bot_bid_raise', rng),
      };
    }

    if (bid.phase === 'executing' && bid.bidderTeamIndex === botTeamIndex && session.timerRunning && session.timerRemainingSec > 0) {
      const usedSet = new Set(bid.acceptedAnswers.map(normalizeChallengeItem).filter(Boolean));
      const remainingValid = q.acceptableAnswers.filter((ans) => {
        const norm = normalizeChallengeItem(ans);
        return norm && !usedSet.has(norm);
      });

      const accuracy = getEffectiveAccuracy(skill, q);
      // If bot already hit its bid or ran out of answers or hits skill ceiling, complete challenge
      const maxBotCanRemember = Math.max(
        1,
        Math.min(remainingValid.length + bid.acceptedAnswers.length, Math.ceil(bid.maxPossible * accuracy))
      );
      if (
        remainingValid.length === 0 ||
        bid.acceptedAnswers.length >= bid.currentBid ||
        (bid.acceptedAnswers.length >= maxBotCanRemember && rng() < 0.65)
      ) {
        return {
          type: 'bid_complete',
          teamIndex: botTeamIndex,
          banterMood: bid.acceptedAnswers.length >= bid.currentBid ? 'happy' : 'tease',
          banterText:
            bid.acceptedAnswers.length >= bid.currentBid
              ? 'جبناها بالـ30 ثانية! كفو!'
              : 'هذا اللي طلع معي بالوقت المتبقي!',
        };
      }

      const chosen = remainingValid[Math.floor(rng() * remainingValid.length)];
      return {
        type: 'bid_record_answer',
        teamIndex: botTeamIndex,
        answerText: chosen,
        isCorrect: true,
        banterMood: 'thinking',
        banterText: `بقول: ${chosen}`,
      };
    }

    return { type: 'none' };
  }

  // Must have live timer running for all non-bidding play
  if (!session.timerRunning || session.timerRemainingSec <= 0) {
    return { type: 'none' };
  }

  // 2. Buzzer Duel (المواجهة بالجرس)
  if (effectiveType === 'buzzer' || q.roundType === 'buzzer') {
    if (session.buzzedTeamIndex === null) {
      if (session.failedBuzzTeams.includes(botTeamIndex)) {
        return { type: 'none' };
      }
      return {
        type: 'buzz',
        teamIndex: botTeamIndex,
        banterMood: 'hype',
        banterText: pickJordanianBanter('bot_buzz', rng),
      };
    }
    if (session.buzzedTeamIndex !== botTeamIndex) {
      return { type: 'none' };
    }
  } else if (session.activeTeamIndex !== botTeamIndex) {
    return { type: 'none' };
  }

  // 3. Who Am I progressive clues
  if (effectiveType === 'who_am_i' && session.revealedClueCount < q.clues.length) {
    const eagerGuessChance = skill === 'fierce' ? 0.62 : skill === 'balanced' ? 0.35 : 0.18;
    if (rng() > eagerGuessChance) {
      return {
        type: 'reveal_next_clue',
        teamIndex: botTeamIndex,
        banterMood: 'thinking',
        banterText: pickJordanianBanter('bot_thinking_clue', rng),
      };
    }
  }

  const accuracy = getEffectiveAccuracy(skill, q);
  const willAnswerCorrectly = rng() < accuracy;

  // 4. Choice-based rounds (multiple_choice, true_false, odd_one_out)
  if (
    q.options.length > 0 &&
    (effectiveType === 'multiple_choice' || effectiveType === 'true_false' || effectiveType === 'odd_one_out')
  ) {
    const choiceIdx = willAnswerCorrectly
      ? resolveCorrectOptionIndex(q)
      : buildWrongChoiceIndex(q, rng);
    return {
      type: 'answer',
      teamIndex: botTeamIndex,
      submitted: choiceIdx,
      expectedCorrect: willAnswerCorrectly,
      banterMood: willAnswerCorrectly ? 'happy' : 'tease',
      banterText: pickJordanianBanter(willAnswerCorrectly ? 'bot_correct' : 'bot_wrong', rng),
    };
  }

  // 5. Order Items
  if (effectiveType === 'order_items') {
    const correctOrder =
      q.acceptableAnswers.length >= 2 ? [...q.acceptableAnswers] : [...q.options];
    if (willAnswerCorrectly || correctOrder.length < 2) {
      return {
        type: 'answer',
        teamIndex: botTeamIndex,
        submitted: correctOrder,
        expectedCorrect: true,
        banterMood: 'happy',
        banterText: pickJordanianBanter('bot_correct', rng),
      };
    }
    const swapped = [...correctOrder];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    return {
      type: 'answer',
      teamIndex: botTeamIndex,
      submitted: swapped,
      expectedCorrect: false,
      banterMood: 'tease',
      banterText: pickJordanianBanter('bot_wrong', rng),
    };
  }

  // 6. List Multiple & Memory
  if (effectiveType === 'list_multiple' || effectiveType === 'memory') {
    const pool = q.acceptableAnswers.length > 0 ? q.acceptableAnswers : q.memoryItems;
    const needed = q.requiredCount ?? (/اذكر\s*(?:خمسة|[5٥])/.test(q.prompt) ? 5 : Math.min(3, Math.max(1, pool.length)));
    if (willAnswerCorrectly) {
      const picked = pool.slice(0, needed);
      return {
        type: 'answer',
        teamIndex: botTeamIndex,
        submitted: effectiveType === 'memory' && picked.length === 1 ? picked[0] : picked,
        expectedCorrect: true,
        banterMood: 'happy',
        banterText: pickJordanianBanter('bot_correct', rng),
      };
    }
    const partial = pool.slice(0, Math.max(1, Math.floor(needed / 2)));
    return {
      type: 'answer',
      teamIndex: botTeamIndex,
      submitted: effectiveType === 'memory' ? ['إجابة غير دقيقة'] : [...partial, 'تخمين غير مؤكد'],
      expectedCorrect: false,
      banterMood: 'tease',
      banterText: pickJordanianBanter('bot_wrong', rng),
    };
  }

  // 7. Text-answer rounds (rapid_fire, fill_blank, who_am_i, buzzer, golden)
  if (willAnswerCorrectly && q.acceptableAnswers.length > 0) {
    return {
      type: 'answer',
      teamIndex: botTeamIndex,
      submitted: q.acceptableAnswers[0],
      expectedCorrect: true,
      banterMood: 'happy',
      banterText: pickJordanianBanter('bot_correct', rng),
    };
  }

  return {
    type: 'answer',
    teamIndex: botTeamIndex,
    submitted: 'مش متأكد والله',
    expectedCorrect: false,
    banterMood: 'tease',
    banterText: pickJordanianBanter('bot_wrong', rng),
  };
}

export interface BotAdvisorContext {
  screen?: string;
  session?: GameSessionView | null;
  availableBanksCount?: number;
  totalQuestionsCount?: number;
}

export interface LocalAdvisorReply {
  reply: string;
  suggestions: string[];
}

function summarizeLiveSessionForBot(session: GameSessionView): string {
  const round = session.rounds[session.currentRoundIndex];
  const scoreSummary = session.teams.map((t) => `${t.name}: ${t.points} نقطة`).join(' | ');
  const winInfo = determineWinner(session.teams);
  const leaderLine = winInfo.isTie
    ? 'الوضع حالياً تعادل حامي!'
    : `المتصدر حالياً: ${session.teams[winInfo.winnerIndices[0]]?.name}`;

  const roundType = round?.goldenTargetType ?? session.currentQuestion?.roundType ?? round?.roundType ?? 'rapid_fire';
  const guide = ROUND_JORDANIAN_GUIDES[roundType];

  const lines: string[] = [
    `وضع المباراة (#${session.code}):`,
    `• النتيجة: ${scoreSummary} (${leaderLine})`,
    `• الجولة الحالية: ${session.currentRoundIndex + 1} من ${session.rounds.length} — «${round?.titleAr ?? guide.nicknameJo}»`,
  ];

  if (session.phase === 'vs') {
    lines.push('• المرحلة: شاشة المواجهة (VS) — اضغط «يلا نبلّش!» لتدخل أول جولة.');
  } else if (session.phase === 'round_intro' || session.phase === 'countdown') {
    lines.push(`• المرحلة: مقدمة الجولة — ${guide.howToPlayJo}`);
  } else if (session.phase === 'playing' || session.phase === 'paused') {
    lines.push(`• المؤقت المتبقي: ${session.timerRemainingSec} ثانية${session.phase === 'paused' ? ' (موقّف مؤقتاً)' : ''}`);
    if (session.bidState) {
      lines.push(
        session.bidState.phase === 'bidding'
          ? `• المزايدة شغالة على ${session.bidState.currentBid} عناصر (الحد الأقصى ${session.bidState.maxPossible}) — الدور على ${session.teams[session.bidState.turnTeamIndex]?.name}.`
          : `• مرحلة تنفيذ «مين يزوّد»: ${session.teams[session.bidState.bidderTeamIndex]?.name} لازم يجيب ${session.bidState.currentBid} إجابات.`
      );
    } else if (roundType === 'buzzer') {
      lines.push(
        session.buzzedTeamIndex !== null
          ? `• الجرس مع ${session.teams[session.buzzedTeamIndex]?.name} الآن!`
          : '• الجرس مفتوح! أول فريق بكبس باخد الفرصة (نقطتان).'
      );
    } else if (session.memoryPhase === 'memorize') {
      lines.push(`• مرحلة الحفظ (${session.memoryRemainingSec}ث) — احفظ العناصر قبل ما تختفي!`);
    } else {
      lines.push(`• الدور الحالي: ${session.teams[session.activeTeamIndex]?.name ?? 'الفريق الأول'}`);
    }
    lines.push(`• نصيحة نشمي لهالجولة: ${guide.proTipJo}`);
  } else if (session.phase === 'round_summary') {
    lines.push('• خلصت الجولة! اضغط «الجولة التالية» عشان تكمل.');
  } else if (session.phase === 'finished') {
    lines.push('• المباراة انتهت! تقدر تبدأ مباراة جديدة أو تكسر التعادل إذا النتيجة متساوية.');
  }

  return lines.join('\n');
}

export function answerGameQuestionLocally(query: string, context: BotAdvisorContext = {}): LocalAdvisorReply {
  const norm = normalizeArabicText(query);
  const session = context.session ?? null;

  const defaultSuggestions = session
    ? ['شو وضع المباراة؟', 'اشرحلي الجولة الحالية', 'كيف النقاط بتنحسب؟', 'اعطيني تكتيك للفوز']
    : ['شو كل الـ12 جولة؟', 'كيف النقاط بتنحسب؟', 'كيف ألعب ضد نشمي؟', 'كيف أربط التلفزيون والموبايلات؟'];

  // 1. Live match status / what should I do now
  if (
    session &&
    /(وضع المبار|شو اسوي|ايش اسوي|هسا|الان|الحين|مين فايز|النتيج|تكتيك|نصيحه|نصائح|كيف افوز)/.test(norm)
  ) {
    return {
      reply: `هلا بالنشمي! شوف وضع مباراتكم لحظة بلحظة:\n\n${summarizeLiveSessionForBot(session)}`,
      suggestions: defaultSuggestions,
    };
  }

  // 2. Current round explanation when inside a match
  if (session && /(الجوله الحاليه|هاي الجوله|هذه الجوله|اشرحلي الجوله|شو هاي الجوله)/.test(norm)) {
    const round = session.rounds[session.currentRoundIndex];
    const rt = round?.goldenTargetType ?? session.currentQuestion?.roundType ?? round?.roundType ?? 'rapid_fire';
    const guide = ROUND_JORDANIAN_GUIDES[rt];
    return {
      reply: [
        `جولتكم الحالية هي «${guide.nicknameJo}»${round?.roundType === 'golden' ? ' (مضاعفة ذهبية ×2!)' : ''}:`,
        `• كيف تنلعب: ${guide.howToPlayJo}`,
        `• النقاط: ${guide.scoringJo}`,
        `• سرّ نشمي: ${guide.proTipJo}`,
      ].join('\n'),
      suggestions: defaultSuggestions,
    };
  }

  // 3. Specific round lookup (all 12 rounds)
  const roundMatchRules: Array<[RoundType, RegExp]> = [
    ['rapid_fire', /الرشاش|سريع/],
    ['bid_challenge', /مين يزود|يزود|مزايد/],
    ['who_am_i', /من انا|تلميح|ادله/],
    ['buzzer', /الجرس|مواجهه بالجرس/],
    ['golden', /الذهبيه|ذهبيه|مضاعف|دبل/],
    ['memory', /الذاكره|ذاكره|حفظ/],
    ['order_items', /رتب|ترتيب/],
    ['odd_one_out', /المختلف|الشاذ/],
    ['list_multiple', /اذكر ثلاث|اذكر خمس|تعداد/],
    ['true_false', /صح او خطا|صح وخطا/],
    ['multiple_choice', /اختيار من متعدد|خيارات/],
    ['fill_blank', /اكمل الفراغ|فراغ/],
  ];
  for (const [rt, pattern] of roundMatchRules) {
    if (pattern.test(norm) && !/(كل الجولات|كل ال|12 جوله|جميع الجولات)/.test(norm)) {
      const g = ROUND_JORDANIAN_GUIDES[rt];
      return {
        reply: [
          `يا سيدي هاي كل تفاصيل جولة «${g.nicknameJo}»:`,
          `• اللعب: ${g.howToPlayJo}`,
          `• النقاط: ${g.scoringJo}`,
          `• نصيحة نشمي: ${g.proTipJo}`,
        ].join('\n'),
        suggestions: defaultSuggestions,
      };
    }
  }

  // 4. All 12 rounds overview
  if (/(كل الجولات|جميع الجولات|انواع الجولات|12|اللعبه كلها|اشرحلي اللعبه|كيف تنلعب)/.test(norm)) {
    const list = ALL_ROUND_TYPES.map(
      (rt, idx) => `${idx + 1}. ${ROUND_JORDANIAN_GUIDES[rt].nicknameJo}: ${ROUND_RULES[rt].shortDescAr}`
    ).join('\n');
    return {
      reply: `يا هلا بيك في «تحدّي الـ30 ثانية»! اللعبة فيها 12 نوع جولة حماسية بتختار منهم اللي بدك إياه:\n\n${list}\n\nاختار أي جولة وأنا بشرحلك تكتيكها بالتفصيل!`,
      suggestions: ['اشرحلي مين يزوّد', 'اشرحلي من أنا', 'كيف النقاط بتنحسب؟', 'كيف ألعب ضد نشمي؟'],
    };
  }

  // 5. Scoring & rules
  if (/(نقاط|حساب|بتنحسب|بونص|سلسله|تعادل|خصم)/.test(norm)) {
    return {
      reply: [
        'نظام النقاط في تحدّي الـ30 ثانية عادل ومليان حماس:',
        '• الأسئلة العادية (الرشاش، اختيار متعدد، صح/خطأ، فراغ، مختلف، ترتيب): نقطة وحدة (+1 بونص كل 3 إجابات صح ورا بعض).',
        '• من أنا؟: من الدليل الأول 3 نقاط، الثاني نقطتان، الثالث نقطة.',
        '• المواجهة بالجرس: نقطتان للإجابة الصح (وبخيار المشرف إما انتقال الفرصة أو خصم نقطة عند الخطأ).',
        '• مين يزوّد؟: الفائز بالمزايدة إذا جاب العدد خلال 30ث باخد 3 نقاط، وإذا فشل باخد الخصم نقطتين.',
        '• الجولة الذهبية: بتضاعف كل نقاط الجولة ×2!',
        '• إذا خلصت المباراة تعادل، بتقدروا تلعبوا جولة كسر تعادل حاسمة بالجرس!',
      ].join('\n'),
      suggestions: defaultSuggestions,
    };
  }

  // 6. Playing against the Jordanian Bot
  if (/(ضد نشمي|ضد البوت|العب لحالي|فردي|بوت|اتحداك|تحدى نشمي)/.test(norm)) {
    return {
      reply: [
        'تقدر تتحدّاني بأي وقت! عندي 3 مستويات: هادي (سهل)، متوازن (متوسط)، وناري (صعب).',
        '• من الصفحة الرئيسية اضغط «تحدّى نشمي» أو من صفحة الإعداد اختار «ضد البوت (نشمي)».',
        '• رح ألعب قدامك بكل الـ12 جولة: أزايد عليك بمين يزوّد، أسبقك عالجرس، وأرد عليك باللهجة الأردنية لحظة بلحظة!',
      ].join('\n'),
      suggestions: ['شو كل الـ12 جولة؟', 'كيف النقاط بتنحسب؟', 'اقترحلي مباراة'],
    };
  }

  // 7. Projector, Host Console, and Team Buzzer QR
  if (/(تلفزيون|بروجيكتور|شاشه الجمهور|موبايل|هاتف|مشرف|جرس الهاتف|كود|qr)/.test(norm)) {
    return {
      reply: [
        'لو بدكم تلعبوا جماعة بالبيت أو بالمسجد مع شاشة عرض وموبايلات:',
        '1. من صفحة «جهّز التحدّي»، اختار «تحكم من الهاتف» عشان تفتح لوحة الحكم على موبايل المشرف.',
        '2. من لوحة الحكم، انسخ رابط «شاشة الجمهور» أو افتحها على التلفزيون/البروجيكتور (الجواب بضل مخفي عن الجمهور لحد ما تكشفه!).',
        '3. وزّع QR جرس الفريقين عشان كل فريق يضغط الجرس أو يجاوب الاختيارات من موبايله مباشرة!',
      ].join('\n'),
      suggestions: defaultSuggestions,
    };
  }

  // 8. Lesson Studio & Non-repetition
  if (/(درس|pdf|ملف|ذكاء|تكرار|ما بتتكرر|بنك|اسئله)/.test(norm)) {
    const bankLine =
      typeof context.totalQuestionsCount === 'number' && context.totalQuestionsCount > 0
        ? `حالياً فيه ${context.totalQuestionsCount} سؤال جاهز في ${context.availableBanksCount ?? 1} بنوك أسئلة.`
        : 'فيه آلاف الأسئلة الجاهزة والمتنوعة بالموقع.';
    return {
      reply: [
        `${bankLine}`,
        '• مانع التكرار: إذا سجلت دخول بحسابك، النظام بسجّل كل سؤال مرّ عليك وما بعيده أبداً غير لما تخلّص كل أسئلة الفئة!',
        '• استوديو الدرس الذكي: المعلم أو المشرف برفع ملف PDF للدرس، والذكاء الاصطناعي بحلله وبعملك خريطة معرفية وبولّد أسئلة موزونة على الجولات!',
      ].join('\n'),
      suggestions: defaultSuggestions,
    };
  }

  // 9. Match recommendations
  if (/(اقترح|مباراه|شو العب|فئات|مستوى|اعمار)/.test(norm)) {
    return {
      reply: [
        'أحسن 3 خيارات تبدأ فيهم حسب قعدتكم:',
        '• جلسة سريعة (5 دقائق): الرشاش + اختيار من متعدد + صح أو خطأ.',
        '• القعدة الكلاسيكية (10 دقائق): الرشاش + اختيار متعدد + من أنا + الجرس + الجولة الذهبية.',
        '• تحدي النشامى القوي: الجرس + الذاكرة + رتب العناصر + اكتشف المختلف + مين يزوّد + الذهبية!',
        `• وكمان متوفر 5 فئات عمرية: ${Object.values(AGE_GROUP_LABELS).slice(0, 5).join('، ')}، و${Object.values(DIFFICULTY_LABELS).join(' / ')}.`,
      ].join('\n'),
      suggestions: defaultSuggestions,
    };
  }

  // Fallback warm Jordanian response
  const liveHint = session ? `\n\n${summarizeLiveSessionForBot(session)}` : '';
  return {
    reply: `هلا بيك يا نشمي! أنا «نشمي»، البوت الأردني الفاهم «تحدّي الـ30 ثانية» من أولها لآخرها — من الـ12 جولة لحد المزايدة والجرس والشاشة والذكاء الاصطناعي.${liveHint}\n\nاسألني عن أي جولة، عن النقاط، عن وضع مباراتك، أو كبّس «تحدّى نشمي» ونلعب وجه لوجه!`,
    suggestions: defaultSuggestions,
  };
}

export function buildJordanianBotSystemPrompt(context: BotAdvisorContext = {}): string {
  const roundsSpec = ALL_ROUND_TYPES.map((rt) => {
    const g = ROUND_JORDANIAN_GUIDES[rt];
    return `- ${ROUND_RULES[rt].nameAr} (${rt}): ${g.howToPlayJo} | النقاط: ${g.scoringJo}`;
  }).join('\n');

  const liveBlock = context.session
    ? `\nحالة المباراة الحالية (للإرشاد فقط — لا تخمن أو تكشف أي إجابة سرية غير مكشوفة):\n${summarizeLiveSessionForBot(context.session)}\nالسؤال المعروض حالياً: ${context.session.currentQuestion?.prompt ?? 'لا يوجد سؤال معروض بعد'}`
    : `\nالشاشة الحالية للمستخدم: ${context.screen || 'الرئيسية'}`;

  return [
    'أنت «نشمي»، بوت أردني ذكي، خفيف دم، ومؤدب (بأجواء عائلية ومناسبة لمكتبة ألعاب مسجد ابن تيمية في الأردن).',
    'تتكلم باللهجة الأردنية البيضاء الواضحة واللطيفة (مثل: هلا بالنشمي، يا زلمة، كفو، شدّ حيلك، عالسريع، يا سلام عليك، يلا نبلّش).',
    'أنت فاهم لعبة «تحدّي الـ30 ثانية» كاملة بكل تفاصيلها:',
    roundsSpec,
    'القواعد العامة:',
    '- الفئات العمرية الخمسة: البراعم (7-10)، الأشبال (11-13)، الفتيان والشباب (14-17)، الكبار (+18)، وعائلي.',
    '- توجد 3 أوضاع لعب: شاشة واحدة تفاعلية، تحكم هاتف المشرف + شاشة الجمهور + QR جرس الفريقين، واللعب الفردي ضدك أنت (نشمي البوت الأردني).',
    '- الحسابات المسجلة تمنع تكرار الأسئلة عبر الجلسات، ويوجد استوديو الدرس الذكي لتحويل ملفات PDF إلى جولات أسئلة.',
    '- مهم جداً: إذا سألك اللاعب عن إجابة سؤال جاري الآن ولم ينكشف جوابه بعد (`answerRevealed: false`)، لا تغشّشه الجواب الصحيح! أعطه تلميحاً عاماً عن استراتيجية الجولة فقط.',
    'أجب بإيجاز ووضوح (3-6 أسطر مرتبة) وبلطف أردني أصيل، واكتب نصاً عادياً مباشرة بدون علامات ماركداون مثل ** أو ## أو ```.',
    liveBlock,
  ].join('\n');
}
