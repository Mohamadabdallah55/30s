import crypto from 'node:crypto';
import { FULL_BANK_ID } from './importFullBank';
import type Database from 'better-sqlite3';
import {
  ALL_ROUND_TYPES,
  ROUND_RULES,
  difficultyToLevel,
  isAgeCompatible,
  levelToDifficulty,
  normalizeAgeGroup,
  normalizeArabicText,
} from '../shared/gameRules';
import { arabicTextSimilarity } from '../shared/questionSchema';
import type { AgeGroup, Difficulty, DifficultyLevel, QuestionRecord, RoundType } from '../shared/types';

export interface SelectionRequest {
  bankId: string;
  roundType: RoundType;
  goldenTargetType?: RoundType;
  exactRounds?: boolean;
  ageGroup: AgeGroup;
  difficulty: Difficulty | 'mixed';
  targetDifficultyLevel?: DifficultyLevel;
  adaptiveDifficulty?: boolean;
  category?: string;
  categories?: string[];
  participantProfileIds: string[];
  sessionId?: string;
  recentSessionPrompts?: string[];
  excludeQuestionIds?: string[];
}

export interface SelectionResult {
  question: QuestionRecord | null;
  exhausted: boolean;
  remainingInFilter: number;
  availableCategories: string[];
  messageAr?: string;
}

interface QuestionRow {
  answer_aliases_json?: string;
  id: string;
  bank_id: string;
  external_id: string | null;
  round_type: RoundType;
  category: string;
  age_group: AgeGroup;
  age_bands_json?: string | null;
  concept_id?: string | null;
  difficulty: Difficulty;
  difficulty_level: number | null;
  unsuitable_for_timed: number | null;
  prompt: string;
  options_json: string;
  acceptable_answers_json: string;
  correct_index: number | null;
  required_count?: number | null;
  explanation: string | null;
  clues_json: string;
  order_criteria: string | null;
  memory_items_json: string;
  memory_reveal_seconds: number | null;
  memory_require_order?: number;
  bid_minimum?: number | null;
  bid_maximum?: number | null;
  odd_reason: string | null;
  is_religious: number;
  status: 'published' | 'needs_review' | 'archived' | 'rejected';
  source_page: number | null;
  source_excerpt: string | null;
  accepts_other_answers?: number | null;
  confidence_score: number | null;
  learning_objective?: string | null;
  cognitive_level?: string | null;
  answer_correctness_reason?: string | null;
  grading_criterion?: string | null;
  is_hypothetical_scenario?: number | null;
  rejection_reason?: string | null;
  created_at: string;
}

export function rowToQuestionRecord(row: QuestionRow): QuestionRecord {
  const diffLevel = (
    row.difficulty_level && row.difficulty_level >= 1 && row.difficulty_level <= 5
      ? row.difficulty_level
      : difficultyToLevel(row.difficulty)
  ) as DifficultyLevel;
  const cogRaw = row.cognitive_level;
  const cognitiveLevel =
    cogRaw === 'remember' || cogRaw === 'understand' || cogRaw === 'apply' || cogRaw === 'analyze' || cogRaw === 'infer'
      ? cogRaw
      : undefined;
  return {
    answerAliases: JSON.parse(row.answer_aliases_json || '{}'),
    id: row.id,
    bankId: row.bank_id,
    externalId: row.external_id,
    roundType: row.round_type,
    category: row.category,
    ageGroup: normalizeAgeGroup(row.age_group),
    difficulty: row.difficulty || levelToDifficulty(diffLevel),
    difficultyLevel: diffLevel,
    unsuitableForTimed: Number(row.unsuitable_for_timed || 0) === 1,
    prompt: row.prompt,
    options: JSON.parse(row.options_json || '[]'),
    acceptableAnswers: JSON.parse(row.acceptable_answers_json || '[]'),
    correctIndex: row.correct_index,
    requiredCount: row.required_count,
    explanation: row.explanation ?? '',
    clues: JSON.parse(row.clues_json || '[]'),
    orderCriteria: row.order_criteria ?? '',
    memoryItems: JSON.parse(row.memory_items_json || '[]'),
    memoryRevealSeconds: row.memory_reveal_seconds ?? 8,
    memoryRequireOrder: row.memory_require_order === 1,
    bidMinimum: row.bid_minimum,
    bidMaximum: row.bid_maximum,
    acceptsOtherAnswers: row.accepts_other_answers == null ? undefined : row.accepts_other_answers === 1,
    conceptId: row.concept_id,
    oddReason: row.odd_reason ?? '',
    isReligious: row.is_religious === 1,
    status: row.status,
    sourcePage: row.source_page,
    sourceExcerpt: row.source_excerpt,
    confidenceScore: row.confidence_score,
    learningObjective: row.learning_objective ?? undefined,
    cognitiveLevel,
    answerCorrectnessReason: row.answer_correctness_reason ?? undefined,
    gradingCriterion: row.grading_criterion ?? undefined,
    isHypotheticalScenario: Number(row.is_hypothetical_scenario || 0) === 1,
    rejectionReason: row.rejection_reason ?? undefined,
    createdAt: row.created_at,
  };
}

function bidItemCount(row: QuestionRow): number {
  const answers = JSON.parse(row.acceptable_answers_json || '[]') as string[];
  return new Set(answers.map(normalizeArabicText).filter(Boolean)).size;
}

function fitsAge(row: QuestionRow, age: AgeGroup): boolean {
  if (!row.age_bands_json) return isAgeCompatible(row.age_group, age);
  try { return (JSON.parse(row.age_bands_json) as string[]).includes(normalizeAgeGroup(age)); }
  catch { return false; }
}

function isPlayable(row: QuestionRow): boolean {
  try {
    const q = rowToQuestionRecord(row);
    const strings = (items: unknown): items is string[] =>
      Array.isArray(items) && items.every((item) => typeof item === 'string' && item.trim().length > 0);
    if (!q.prompt?.trim() || !Object.hasOwn(ROUND_RULES, q.roundType) ||
        ![q.options, q.acceptableAnswers, q.clues, q.memoryItems].every(strings)) return false;
    const unique = (items: string[]) => new Set(items.map(normalizeArabicText).filter(Boolean));
    if (q.roundType === 'list_multiple' || q.roundType === 'bid_challenge') {
      return unique(q.acceptableAnswers).size >= (q.requiredCount ?? 3);
    }
    if (q.roundType === 'memory') return unique(q.memoryItems).size >= 2;
    if (q.roundType === 'order_items') {
      const options = unique(q.options);
      const answers = unique(q.acceptableAnswers);
      return options.size >= 2 && options.size === q.options.length && answers.size === q.acceptableAnswers.length &&
        options.size === answers.size && [...answers].every((answer) => options.has(answer));
    }
    if (['true_false', 'multiple_choice', 'odd_one_out'].includes(q.roundType)) {
      return q.options.length >= 2 && unique(q.options).size === q.options.length &&
        q.correctIndex != null && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length;
    }
    if (q.roundType === 'who_am_i' && q.clues.length < 2) return false;
    return q.acceptableAnswers.length > 0;
  } catch {
    return false;
  }
}

const TIMED_SPRINT_ROUNDS = new Set<RoundType>(['rapid_fire', 'true_false', 'buzzer']);

function normalizeCategoryFilter(category?: string, categories?: string[]): string[] | null {
  const cleaned = (categories ?? [])
    .map((c) => c.trim())
    .filter((c) => c && c !== 'الكل');
  if (cleaned.length > 0) return Array.from(new Set(cleaned));
  if (category && category.trim() && category.trim() !== 'الكل') {
    return [category.trim()];
  }
  return null;
}

/**
 * Computes real published & unseen question availability per roundType and category for setup wizard.
 */
export function getBankAvailability(
  db: Database.Database,
  params: {
    bankId: string;
    ageGroup: AgeGroup;
    difficulty: Difficulty | 'mixed';
    category?: string;
    categories?: string[];
    exactRounds?: boolean;
    participantProfileIds?: string[];
  }
): {
  totalPublishedInFilter: number;
  unseenInFilter: number;
  byRoundType: Record<RoundType, { total: number; unseen: number }>;
  byCategory: Record<string, { total: number; unseen: number }>;
} {
  const allPublished = db
    .prepare(`SELECT * FROM questions WHERE bank_id = ? AND status = 'published'`)
    .all(params.bankId) as QuestionRow[];

  const permanentIds = Array.from(
    new Set((params.participantProfileIds ?? []).filter((id) => id && !id.startsWith('guest-')))
  );
  const exposedSet = new Set<string>();
  if (permanentIds.length > 0) {
    const placeholders = permanentIds.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT DISTINCT question_id FROM question_exposures
         WHERE bank_id = ? AND profile_id IN (${placeholders})`
      )
      .all(params.bankId, ...permanentIds) as Array<{ question_id: string }>;
    for (const r of rows) exposedSet.add(r.question_id);
  }

  const baseMatching = allPublished.filter((q) => {
    if (!isPlayable(q)) return false;
    if (TIMED_SPRINT_ROUNDS.has(q.round_type) && Number(q.unsuitable_for_timed || 0) === 1) return false;
    if (!fitsAge(q, params.ageGroup)) return false;
    if (params.difficulty !== 'mixed' && q.difficulty !== params.difficulty) return false;
    return true;
  });

  const byCategory: Record<string, { total: number; unseen: number }> = {};
  for (const q of baseMatching) {
    if (!byCategory[q.category]) byCategory[q.category] = { total: 0, unseen: 0 };
    byCategory[q.category].total += 1;
    if (!exposedSet.has(q.id)) byCategory[q.category].unseen += 1;
  }

  const categoryList = normalizeCategoryFilter(params.category, params.categories);
  const matching = categoryList
    ? baseMatching.filter((q) => categoryList.includes(q.category))
    : baseMatching;

  const byRoundType = {} as Record<RoundType, { total: number; unseen: number }>;
  for (const rt of ALL_ROUND_TYPES) {
    byRoundType[rt] = { total: 0, unseen: 0 };
  }

  let unseenTotal = 0;
  for (const q of matching) {
    const isSeen = exposedSet.has(q.id);
    if (!isSeen) unseenTotal++;
    const rt = q.round_type;
    if (byRoundType[rt]) {
      byRoundType[rt].total += 1;
      if (!isSeen) byRoundType[rt].unseen += 1;
    }
  }

  // Fallback compatibility: golden & buzzer can draw from compatible Q&A if dedicated slots are scarce
  const compatPool = matching.filter((q) =>
    ['rapid_fire', 'fill_blank', 'multiple_choice', 'buzzer', 'golden'].includes(q.round_type) &&
    Number(q.unsuitable_for_timed || 0) === 0
  );
  if (!params.exactRounds && byRoundType.golden.total === 0 && compatPool.length > 0) {
    byRoundType.golden = {
      total: compatPool.length,
      unseen: compatPool.filter((q) => !exposedSet.has(q.id)).length,
    };
  }
  if (params.bankId === FULL_BANK_ID) {
    const buzzerPool = compatPool.filter((q) => ['rapid_fire', 'fill_blank'].includes(q.round_type));
    byRoundType.buzzer = { total: buzzerPool.length, unseen: buzzerPool.filter((q) => !exposedSet.has(q.id)).length };
  } else if (!params.exactRounds && byRoundType.buzzer.total === 0 && compatPool.length > 0) {
    byRoundType.buzzer = {
      total: compatPool.length,
      unseen: compatPool.filter((q) => !exposedSet.has(q.id)).length,
    };
  }
  if (!params.exactRounds && byRoundType.bid_challenge.total === 0) {
    const eligible = matching.filter((question) => question.round_type === 'list_multiple' && bidItemCount(question) >= 3);
    byRoundType.bid_challenge = { total: eligible.length, unseen: eligible.filter((q) => !exposedSet.has(q.id)).length };
  }

  return {
    totalPublishedInFilter: matching.length,
    unseenInFilter: unseenTotal,
    byRoundType,
    byCategory,
  };
}

/**
 * Atomically selects and marks a non-repeated question using SQLite BEGIN IMMEDIATE
 * transaction locking so concurrent draws never issue the same question twice.
 */
export function selectNextQuestionTx(
  db: Database.Database,
  req: SelectionRequest
): SelectionResult {
  const permanentIds = Array.from(
    new Set(req.participantProfileIds.filter((id) => id && !id.startsWith('guest-')))
  );

  const effectiveRoundType =
    req.roundType === 'golden' && req.goldenTargetType ? req.goldenTargetType : req.roundType;

  const runTx = db.transaction((): SelectionResult => {
    const allPublished = (db
      .prepare(
        `SELECT * FROM questions
         WHERE bank_id = ? AND status = 'published'`
      )
      .all(req.bankId) as QuestionRow[]).filter(isPlayable);

    const exposedSet = new Set<string>(req.excludeQuestionIds ?? []);
    const usedConcepts = new Set(allPublished.filter((row) => exposedSet.has(row.id)).map((row) => row.concept_id).filter(Boolean));
    const eligible = (q: QuestionRow) => !exposedSet.has(q.id) && (!q.concept_id || !usedConcepts.has(q.concept_id));
    if (permanentIds.length > 0) {
      const placeholders = permanentIds.map(() => '?').join(',');
      const exposedRows = db
        .prepare(
          `SELECT DISTINCT question_id FROM question_exposures
           WHERE bank_id = ? AND profile_id IN (${placeholders})`
        )
        .all(req.bankId, ...permanentIds) as Array<{ question_id: string }>;
      for (const r of exposedRows) {
        exposedSet.add(r.question_id);
      }
    }

    const availableCategorySet = new Set<string>();
    for (const q of allPublished) {
      if (!exposedSet.has(q.id) && fitsAge(q, req.ageGroup)) {
        availableCategorySet.add(q.category);
      }
    }
    const availableCategories = Array.from(availableCategorySet);

    const categoryList = normalizeCategoryFilter(req.category, req.categories);
    const disallowUntimed = TIMED_SPRINT_ROUNDS.has(effectiveRoundType);

    let candidates = allPublished.filter((q) => {
      if (!eligible(q)) return false;
      if (!fitsAge(q, req.ageGroup)) return false;
      if (req.difficulty !== 'mixed' && !req.adaptiveDifficulty && q.difficulty !== req.difficulty) return false;
      if (categoryList && !categoryList.includes(q.category)) return false;
      if (disallowUntimed && Number(q.unsuitable_for_timed || 0) === 1) return false;
      return q.round_type === effectiveRoundType || (req.bankId === FULL_BANK_ID && effectiveRoundType === 'buzzer' &&
        (q.round_type === 'rapid_fire' || q.round_type === 'fill_blank'));
    });

    if (
      !req.exactRounds && candidates.length === 0 &&
      (req.roundType === 'golden' || effectiveRoundType === 'buzzer' || effectiveRoundType === 'rapid_fire')
    ) {
      const fallbackCompatibleTypes: RoundType[] = ['rapid_fire', 'fill_blank', 'multiple_choice', 'buzzer', 'golden'];
      candidates = allPublished.filter((q) => {
        if (!eligible(q)) return false;
        if (!fitsAge(q, req.ageGroup)) return false;
        if (req.difficulty !== 'mixed' && !req.adaptiveDifficulty && q.difficulty !== req.difficulty) return false;
        if (categoryList && !categoryList.includes(q.category)) return false;
        if (disallowUntimed && Number(q.unsuitable_for_timed || 0) === 1) return false;
        return fallbackCompatibleTypes.includes(q.round_type);
      });
    } else if (!req.exactRounds && candidates.length === 0 && effectiveRoundType === 'bid_challenge') {
      candidates = allPublished.filter((q) => {
        if (!eligible(q)) return false;
        if (!fitsAge(q, req.ageGroup)) return false;
        if (req.difficulty !== 'mixed' && !req.adaptiveDifficulty && q.difficulty !== req.difficulty) return false;
        if (categoryList && !categoryList.includes(q.category)) return false;
        return q.round_type === 'list_multiple' && bidItemCount(q) >= 3;
      });
    }

    if (candidates.length === 0) {
      const catLabel = categoryList ? categoryList.join('، ') : null;
      return {
        question: null,
        exhausted: true,
        remainingInFilter: 0,
        availableCategories,
        messageAr: catLabel
          ? `انتهت الأسئلة غير المعروضة في فئة «${catLabel}» لهذا الحساب. اختر فئة أخرى أو أعد تدوير الأسئلة بموافقتك.`
          : 'انتهت جميع الأسئلة غير المعروضة في هذا البنك لهذه الفئة العمرية/المستوى. يمكنك اختيار بنك آخر أو الموافقة على إعادة الدورة.',
      };
    }

    // Prioritize matching numeric difficultyLevel (1..5) if requested or adaptive mode is on
    if (req.targetDifficultyLevel) {
      const exactLevel = candidates.filter(
        (q) => (q.difficulty_level ?? difficultyToLevel(q.difficulty)) === req.targetDifficultyLevel
      );
      if (exactLevel.length > 0) {
        candidates = exactLevel;
      } else {
        const nearLevel = candidates.filter(
          (q) => Math.abs((q.difficulty_level ?? difficultyToLevel(q.difficulty)) - req.targetDifficultyLevel!) <= 1
        );
        if (nearLevel.length > 0) candidates = nearLevel;
      }
    }

    const recentPrompts = req.recentSessionPrompts ?? [];
    let nonSimilar = candidates;
    if (recentPrompts.length > 0 && candidates.length > 1) {
      const filtered = candidates.filter((cand) =>
        recentPrompts.every((rp) => arabicTextSimilarity(cand.prompt, rp) < 0.78)
      );
      if (filtered.length > 0) nonSimilar = filtered;
    }

    const chosenRow = nonSimilar[crypto.randomInt(0, nonSimilar.length)];
    const chosen = rowToQuestionRecord(chosenRow);
    if (req.bankId === FULL_BANK_ID && effectiveRoundType === 'buzzer') {
      chosen.roundType = 'buzzer';
      chosen.options = [];
      chosen.correctIndex = null;
    }

    const insertExposure = db.prepare(`
      INSERT OR IGNORE INTO question_exposures (id, profile_id, question_id, bank_id, session_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    const getStats = db.prepare(
      `SELECT total_questions_seen, categories_played_json, difficulties_played_json FROM profiles WHERE id = ?`
    );
    const updateStats = db.prepare(`
      UPDATE profiles
      SET total_questions_seen = ?, categories_played_json = ?, difficulties_played_json = ?
      WHERE id = ?
    `);

    for (const pid of permanentIds) {
      const info = insertExposure.run(
        `exp-${crypto.randomUUID().slice(0, 12)}`,
        pid,
        chosen.id,
        req.bankId,
        req.sessionId ?? null
      );
      if (info.changes > 0) {
        const prof = getStats.get(pid) as
          | {
              total_questions_seen: number;
              categories_played_json: string;
              difficulties_played_json: string;
            }
          | undefined;
        if (prof) {
          const cats = JSON.parse(prof.categories_played_json || '{}') as Record<string, number>;
          const diffs = JSON.parse(prof.difficulties_played_json || '{"easy":0,"medium":0,"hard":0}') as Record<string, number>;
          cats[chosen.category] = (cats[chosen.category] ?? 0) + 1;
          diffs[chosen.difficulty] = (diffs[chosen.difficulty] ?? 0) + 1;
          updateStats.run(
            prof.total_questions_seen + 1,
            JSON.stringify(cats),
            JSON.stringify(diffs),
            pid
          );
        }
      }
    }

    return {
      question: chosen,
      exhausted: false,
      remainingInFilter: candidates.length - 1,
      availableCategories,
    };
  });

  return runTx.immediate();
}

export function resetExposureCycleTx(
  db: Database.Database,
  profileIds: string[],
  bankId: string,
  category?: string
): number {
  const permanentIds = profileIds.filter((id) => id && !id.startsWith('guest-'));
  if (permanentIds.length === 0) return 0;

  const placeholders = permanentIds.map(() => '?').join(',');
  if (category && category !== 'الكل') {
    const info = db
      .prepare(
        `DELETE FROM question_exposures
         WHERE bank_id = ? AND profile_id IN (${placeholders})
         AND question_id IN (SELECT id FROM questions WHERE bank_id = ? AND category = ?)`
      )
      .run(bankId, ...permanentIds, bankId, category);
    return info.changes;
  }
  const info = db
    .prepare(
      `DELETE FROM question_exposures
       WHERE bank_id = ? AND profile_id IN (${placeholders})`
    )
    .run(bankId, ...permanentIds);
  return info.changes;
}

/** V2 prepares a complete deck without exposing questions or using fallback round conversions. */
export function getChallengeV2Candidates(db: Database.Database, req: Omit<SelectionRequest, 'roundType'>): QuestionRecord[] {
  const rows = (db.prepare("SELECT * FROM questions WHERE bank_id = ? AND status = 'published'").all(req.bankId) as QuestionRow[])
    .filter(row => isPlayable(row) && fitsAge(row, req.ageGroup));
  const participants = req.participantProfileIds.filter(id => id && !id.startsWith('guest-'));
  const exposed = new Set<string>();
  if (participants.length) {
    const marks = participants.map(() => '?').join(',');
    const exposures = db.prepare(`SELECT DISTINCT question_id FROM question_exposures WHERE bank_id=? AND profile_id IN (${marks})`)
      .all(req.bankId, ...participants) as Array<{question_id: string}>;
    exposures.forEach(row => exposed.add(row.question_id));
  }
  const concepts = new Set(rows.filter(row => exposed.has(row.id)).map(row => row.concept_id).filter(Boolean));
  const prompts = new Set(rows.filter(row => exposed.has(row.id)).map(row => normalizeArabicText(row.prompt)));
  const categories = normalizeCategoryFilter(req.category, req.categories);
  return rows.filter(row => !exposed.has(row.id) && (!row.concept_id || !concepts.has(row.concept_id)) &&
    !prompts.has(normalizeArabicText(row.prompt)) && (!categories || categories.includes(row.category))).map(rowToQuestionRecord);
}
