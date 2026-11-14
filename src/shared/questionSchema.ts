import {
  ALL_ROUND_TYPES,
  difficultyToLevel,
  levelToDifficulty,
  normalizeAgeGroup,
  normalizeArabicText,
} from './gameRules';
import type { AgeGroup, Difficulty, DifficultyLevel, QuestionStatus, RoundType } from './types';

export interface ImportedQuestionCandidate {
  externalId?: string;
  roundType: RoundType;
  category: string;
  ageGroup: AgeGroup;
  difficulty: Difficulty;
  difficultyLevel?: DifficultyLevel;
  unsuitableForTimed?: boolean;
  prompt: string;
  options: string[];
  acceptableAnswers: string[];
  correctIndex?: number | null;
  explanation?: string;
  clues?: string[];
  orderCriteria?: string;
  memoryItems?: string[];
  memoryRevealSeconds?: number;
  oddReason?: string;
  isReligious?: boolean;
  needsReview?: boolean;
  sourcePage?: number | null;
  sourceExcerpt?: string | null;
  confidenceScore?: number | null;
}

export interface ImportValidationIssue {
  rowIndex: number;
  externalId?: string;
  reason: string;
}

export interface ImportReport {
  totalReceived: number;
  validCount: number;
  publishedCount: number;
  needsReviewCount: number;
  duplicateRejectedCount: number;
  errorCount: number;
  issues: ImportValidationIssue[];
  distribution: {
    byAge: Record<string, number>;
    byCategory: Record<string, number>;
    byDifficulty: Record<string, number>;
    byRoundType: Record<string, number>;
  };
  accepted: Array<ImportedQuestionCandidate & { status: QuestionStatus; normalizedHash: string }>;
}

const VALID_AGES: AgeGroup[] = [
  'kids_7_10',
  'preteen_11_13',
  'teen_14_17',
  'adults_18_plus',
  'family',
  'kids',
  'youth',
  'adults',
];
const VALID_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * Map legacy or 9-type labels into the engine's 11 RoundTypes cleanly.
 */
export function coerceRoundType(raw: string): RoundType | null {
  const val = String(raw || '').trim().toLowerCase();
  if ((ALL_ROUND_TYPES as string[]).includes(val)) {
    return val as RoundType;
  }
  const aliases: Record<string, RoundType> = {
    'الرشاش': 'rapid_fire',
    'rapid': 'rapid_fire',
    'اذكر ثلاثة': 'list_multiple',
    'اذكر خمسة': 'list_multiple',
    'list': 'list_multiple',
    'صح أو خطأ': 'true_false',
    'صح وخطأ': 'true_false',
    'tf': 'true_false',
    'اختيار من متعدد': 'multiple_choice',
    'mcq': 'multiple_choice',
    'أكمل الفراغ': 'fill_blank',
    'fill': 'fill_blank',
    'من أنا': 'who_am_i',
    'who': 'who_am_i',
    'اكتشف المختلف': 'odd_one_out',
    'odd': 'odd_one_out',
    'رتب العناصر': 'order_items',
    'order': 'order_items',
    'الذاكرة': 'memory',
    'المواجهة بالجرس': 'buzzer',
    'الجولة الذهبية': 'golden',
    'مين يزود': 'bid_challenge',
    'مين يزوّد': 'bid_challenge',
    'مزايدة': 'bid_challenge',
    'bid': 'bid_challenge',
  };
  return aliases[val] ?? null;
}

export function buildQuestionHash(prompt: string, answers: string[]): string {
  const normP = normalizeArabicText(prompt);
  const normA = answers.map(normalizeArabicText).filter(Boolean).sort().join('|');
  return `${normP}::${normA}`;
}

/**
 * Fast bigram Jaccard similarity for Arabic semantic/phrasing near-duplicate detection.
 */
export function arabicTextSimilarity(a: string, b: string): number {
  const na = normalizeArabicText(a);
  const nb = normalizeArabicText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length < 4 || nb.length < 4) return na === nb ? 1 : 0;

  // If both contain numbers and the numbers differ, they are distinct factual questions
  const numsA = na.match(/\d+/g)?.join(',') ?? '';
  const numsB = nb.match(/\d+/g)?.join(',') ?? '';
  if (numsA && numsB && numsA !== numsB) {
    return 0;
  }

  const wordsA = new Set(na.split(' ').filter(Boolean));
  const wordsB = new Set(nb.split(' ').filter(Boolean));
  let wordInter = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) wordInter++;
  }
  const wordUnion = wordsA.size + wordsB.size - wordInter;
  const wordSim = wordUnion === 0 ? 0 : wordInter / wordUnion;

  const getBigrams = (str: string) => {
    const set = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      set.add(str.slice(i, i + 2));
    }
    return set;
  };
  const sa = getBigrams(na);
  const sb = getBigrams(nb);
  let intersection = 0;
  for (const bg of sa) {
    if (sb.has(bg)) intersection++;
  }
  const union = sa.size + sb.size - intersection;
  const bigramSim = union === 0 ? 0 : intersection / union;
  return (wordSim + bigramSim) / 2;
}

export function parseCsvQuestions(csvText: string): Array<Record<string, string>> {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (ch === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  if (lines.length < 2) return [];

  const splitRow = (row: string) => {
    const cols: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') {
        if (quoted && row[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (c === ',' && !quoted) {
        cols.push(cell.trim());
        cell = '';
      } else {
        cell += c;
      }
    }
    cols.push(cell.trim());
    return cols;
  };

  const headers = splitRow(lines[0]).map((h) => h.replace(/^\uFEFF/, '').trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitRow(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? '';
    });
    rows.push(obj);
  }
  return rows;
}

export function validateAndDeduplicateImport(
  rawItems: unknown[],
  existingExternalIds: Set<string>,
  existingHashes: Set<string>,
  existingPrompts: string[] = []
): ImportReport {
  const issues: ImportValidationIssue[] = [];
  const accepted: ImportReport['accepted'] = [];
  const seenExtIds = new Set<string>(existingExternalIds);
  const seenHashes = new Set<string>(existingHashes);
  const distribution = {
    byAge: {} as Record<string, number>,
    byCategory: {} as Record<string, number>,
    byDifficulty: {} as Record<string, number>,
    byRoundType: {} as Record<string, number>,
  };

  let duplicateRejectedCount = 0;
  let publishedCount = 0;
  let needsReviewCount = 0;

  // Keep a bounded window of recent prompts for fast similarity check even at 5000+ scale
  const recentPromptCheck = existingPrompts.slice(-400);

  for (let i = 0; i < rawItems.length; i++) {
    const row = rawItems[i] as Record<string, unknown> | null;
    if (!row || typeof row !== 'object') {
      issues.push({ rowIndex: i + 1, reason: 'سجل غير صالح (ليس كائن JSON)' });
      continue;
    }

    const externalId = row.externalId ? String(row.externalId).trim() : row.id ? String(row.id).trim() : undefined;
    if (externalId) {
      if (seenExtIds.has(externalId)) {
        duplicateRejectedCount++;
        issues.push({ rowIndex: i + 1, externalId, reason: `معرّف مكرر: ${externalId}` });
        continue;
      }
    }

    const roundType = coerceRoundType(String(row.roundType ?? row.type ?? ''));
    if (!roundType) {
      issues.push({ rowIndex: i + 1, externalId, reason: `نوع الجولة غير مدعوم: ${String(row.roundType ?? '')}` });
      continue;
    }

    const prompt = String(row.prompt ?? row.question ?? '').trim();
    if (prompt.length < 5) {
      issues.push({ rowIndex: i + 1, externalId, reason: 'نص السؤال قصير جداً أو مفقود' });
      continue;
    }

    const category = String(row.category ?? 'ثقافة عامة').trim();
    const ageGroupRaw = String(row.ageGroup ?? 'family').trim().toLowerCase() as AgeGroup;
    const ageGroup: AgeGroup = VALID_AGES.includes(ageGroupRaw) ? normalizeAgeGroup(ageGroupRaw) : 'family';
    const rawLevel = Number(row.difficultyLevel ?? row.difficulty_level);
    const hasNumericLevel = Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 5;
    const diffRaw = String(row.difficulty ?? '').trim().toLowerCase() as Difficulty;
    const difficulty: Difficulty = VALID_DIFFICULTIES.includes(diffRaw)
      ? diffRaw
      : hasNumericLevel
      ? levelToDifficulty(rawLevel as DifficultyLevel)
      : 'medium';
    const difficultyLevel: DifficultyLevel = hasNumericLevel
      ? (rawLevel as DifficultyLevel)
      : difficultyToLevel(difficulty);
    const unsuitableForTimed = Boolean(row.unsuitableForTimed === true || row.unsuitableForTimed === 'true');

    const options = Array.isArray(row.options)
      ? row.options.map((o) => String(o).trim()).filter(Boolean)
      : typeof row.options === 'string' && row.options.trim()
      ? row.options.split('|').map((s) => s.trim()).filter(Boolean)
      : [];

    const acceptableAnswers = Array.isArray(row.acceptableAnswers)
      ? row.acceptableAnswers.map((a) => String(a).trim()).filter(Boolean)
      : row.answer
      ? String(row.answer).split('|').map((s) => s.trim()).filter(Boolean)
      : typeof row.acceptableAnswers === 'string'
      ? row.acceptableAnswers.split('|').map((s) => s.trim()).filter(Boolean)
      : [];

    if (roundType === 'multiple_choice' && options.length < 2) {
      issues.push({ rowIndex: i + 1, externalId, reason: 'سؤال الاختيار من متعدد يتطلب خيارين على الأقل (يفضل 4)' });
      continue;
    }

    if (acceptableAnswers.length === 0 && typeof row.correctIndex !== 'number') {
      issues.push({ rowIndex: i + 1, externalId, reason: 'الإجابة المقبولة مفقودة' });
      continue;
    }

    const hash = buildQuestionHash(prompt, acceptableAnswers.length > 0 ? acceptableAnswers : [options[Number(row.correctIndex ?? 0)] ?? '']);
    if (seenHashes.has(hash)) {
      duplicateRejectedCount++;
      issues.push({ rowIndex: i + 1, externalId, reason: 'تكرار مطابق لسؤال موجود مسبقاً' });
      continue;
    }

    // Near-duplicate similarity check against recent prompts (bounded window for O(N) performance at 5000+ scale)
    let isNearDup = false;
    if (i < 1500) {
      for (let p = Math.max(0, recentPromptCheck.length - 80); p < recentPromptCheck.length; p++) {
        if (arabicTextSimilarity(prompt, recentPromptCheck[p]) >= 0.92) {
          isNearDup = true;
          break;
        }
      }
    }
    if (isNearDup) {
      duplicateRejectedCount++;
      issues.push({ rowIndex: i + 1, externalId, reason: 'تشابه دلالي مفرط مع سؤال موجود' });
      continue;
    }

    const isReligious = Boolean(
      row.isReligious === true ||
        row.isReligious === 'true' ||
        /قرآن|تفسير|حديث|فقه|سيرة|عقيدة|إسلام|مسجد|صلاة|صيام|زكاة|حج/.test(category + ' ' + prompt)
    );
    const explicitNeedsReview = row.needsReview === true || row.needsReview === 'true' || row.status === 'needs_review';
    const explicitApproved = row.status === 'published' && row.needsReview !== true && row.needsReview !== 'true';
    // Religious questions must NOT auto-publish before supervisor/teacher approval
    const status: QuestionStatus =
      explicitNeedsReview || (isReligious && !explicitApproved) ? 'needs_review' : 'published';

    if (status === 'needs_review') needsReviewCount++;
    else publishedCount++;

    if (externalId) seenExtIds.add(externalId);
    seenHashes.add(hash);
    recentPromptCheck.push(prompt);

    distribution.byAge[ageGroup] = (distribution.byAge[ageGroup] ?? 0) + 1;
    distribution.byCategory[category] = (distribution.byCategory[category] ?? 0) + 1;
    distribution.byDifficulty[difficulty] = (distribution.byDifficulty[difficulty] ?? 0) + 1;
    distribution.byRoundType[roundType] = (distribution.byRoundType[roundType] ?? 0) + 1;

    const clues = Array.isArray(row.clues)
      ? row.clues.map((c) => String(c).trim()).filter(Boolean)
      : typeof row.clues === 'string' && row.clues.trim()
      ? row.clues.split('|').map((s) => s.trim()).filter(Boolean)
      : [];

    const memoryItems = Array.isArray(row.memoryItems)
      ? row.memoryItems.map((m) => String(m).trim()).filter(Boolean)
      : typeof row.memoryItems === 'string' && row.memoryItems.trim()
      ? row.memoryItems.split('|').map((s) => s.trim()).filter(Boolean)
      : [];

    accepted.push({
      externalId,
      roundType,
      category,
      ageGroup,
      difficulty,
      difficultyLevel,
      unsuitableForTimed,
      prompt,
      options,
      acceptableAnswers:
        acceptableAnswers.length > 0
          ? acceptableAnswers
          : [options[Number(row.correctIndex ?? 0)] ?? ''].filter(Boolean),
      correctIndex: typeof row.correctIndex === 'number' ? row.correctIndex : null,
      explanation: row.explanation ? String(row.explanation).trim() : undefined,
      clues,
      orderCriteria: row.orderCriteria ? String(row.orderCriteria).trim() : undefined,
      memoryItems,
      memoryRevealSeconds: typeof row.memoryRevealSeconds === 'number' ? row.memoryRevealSeconds : undefined,
      oddReason: row.oddReason ? String(row.oddReason).trim() : undefined,
      isReligious,
      needsReview: explicitNeedsReview,
      sourcePage: typeof row.sourcePage === 'number' ? row.sourcePage : null,
      sourceExcerpt: row.sourceExcerpt ? String(row.sourceExcerpt).trim() : null,
      confidenceScore: typeof row.confidenceScore === 'number' ? row.confidenceScore : null,
      status,
      normalizedHash: hash,
    });
  }

  return {
    totalReceived: rawItems.length,
    validCount: accepted.length,
    publishedCount,
    needsReviewCount,
    duplicateRejectedCount,
    errorCount: issues.length,
    issues: issues.slice(0, 100), // keep UI report fast even if thousands of errors
    distribution,
    accepted,
  };
}
