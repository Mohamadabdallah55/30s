import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  ALL_ROUND_TYPES,
  difficultyToLevel,
  isAgeCompatible,
  levelToDifficulty,
  normalizeAgeGroup,
} from '../shared/gameRules';
import { arabicTextSimilarity } from '../shared/questionSchema';
import type { AgeGroup, Difficulty, DifficultyLevel, QuestionRecord, RoundType } from '../shared/types';

export interface SelectionRequest {
  bankId: string;
  roundType: RoundType;
  goldenTargetType?: RoundType;
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
  id: string;
  bank_id: string;
  external_id: string | null;
  round_type: RoundType;
  category: string;
  age_group: AgeGroup;
  difficulty: Difficulty;
  difficulty_level: number | null;
  unsuitable_for_timed: number | null;
  prompt: string;
  options_json: string;
  acceptable_answers_json: string;
  correct_index: number | null;
  explanation: string | null;
  clues_json: string;
  order_criteria: string | null;
  memory_items_json: string;
  memory_reveal_seconds: number | null;
  odd_reason: string | null;
  is_religious: number;
  status: 'published' | 'needs_review' | 'archived' | 'rejected';
  source_page: number | null;
  source_excerpt: string | null;
  confidence_score: number | null;
  created_at: string;
}

export function rowToQuestionRecord(row: QuestionRow): QuestionRecord {
  const diffLevel = (
    row.difficulty_level && row.difficulty_level >= 1 && row.difficulty_level <= 5
      ? row.difficulty_level
      : difficultyToLevel(row.difficulty)
  ) as DifficultyLevel;
  return {
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
    explanation: row.explanation ?? '',
    clues: JSON.parse(row.clues_json || '[]'),
    orderCriteria: row.order_criteria ?? '',
    memoryItems: JSON.parse(row.memory_items_json || '[]'),
    memoryRevealSeconds: row.memory_reveal_seconds ?? 8,
    oddReason: row.odd_reason ?? '',
    isReligious: row.is_religious === 1,
    status: row.status,
    sourcePage: row.source_page,
    sourceExcerpt: row.source_excerpt,
    confidenceScore: row.confidence_score,
    createdAt: row.created_at,
  };
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
    if (!isAgeCompatible(q.age_group, params.ageGroup)) return false;
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
  if (byRoundType.golden.total === 0 && compatPool.length > 0) {
    byRoundType.golden = {
      total: compatPool.length,
      unseen: compatPool.filter((q) => !exposedSet.has(q.id)).length,
    };
  }
  if (byRoundType.buzzer.total === 0 && compatPool.length > 0) {
    byRoundType.buzzer = {
      total: compatPool.length,
      unseen: compatPool.filter((q) => !exposedSet.has(q.id)).length,
    };
  }
  if (byRoundType.bid_challenge.total === 0 && byRoundType.list_multiple.total > 0) {
    byRoundType.bid_challenge = { ...byRoundType.list_multiple };
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
    const allPublished = db
      .prepare(
        `SELECT * FROM questions
         WHERE bank_id = ? AND status = 'published'`
      )
      .all(req.bankId) as QuestionRow[];

    const exposedSet = new Set<string>(req.excludeQuestionIds ?? []);
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
      if (!exposedSet.has(q.id) && isAgeCompatible(q.age_group, req.ageGroup)) {
        availableCategorySet.add(q.category);
      }
    }
    const availableCategories = Array.from(availableCategorySet);

    const categoryList = normalizeCategoryFilter(req.category, req.categories);
    const disallowUntimed = TIMED_SPRINT_ROUNDS.has(effectiveRoundType);

    let candidates = allPublished.filter((q) => {
      if (exposedSet.has(q.id)) return false;
      if (!isAgeCompatible(q.age_group, req.ageGroup)) return false;
      if (req.difficulty !== 'mixed' && !req.adaptiveDifficulty && q.difficulty !== req.difficulty) return false;
      if (categoryList && !categoryList.includes(q.category)) return false;
      if (disallowUntimed && Number(q.unsuitable_for_timed || 0) === 1) return false;
      return q.round_type === effectiveRoundType;
    });

    if (
      candidates.length === 0 &&
      (req.roundType === 'golden' || effectiveRoundType === 'buzzer' || effectiveRoundType === 'rapid_fire')
    ) {
      const fallbackCompatibleTypes: RoundType[] = ['rapid_fire', 'fill_blank', 'multiple_choice', 'buzzer', 'golden'];
      candidates = allPublished.filter((q) => {
        if (exposedSet.has(q.id)) return false;
        if (!isAgeCompatible(q.age_group, req.ageGroup)) return false;
        if (req.difficulty !== 'mixed' && !req.adaptiveDifficulty && q.difficulty !== req.difficulty) return false;
        if (categoryList && !categoryList.includes(q.category)) return false;
        if (disallowUntimed && Number(q.unsuitable_for_timed || 0) === 1) return false;
        return fallbackCompatibleTypes.includes(q.round_type);
      });
    } else if (candidates.length === 0 && effectiveRoundType === 'bid_challenge') {
      candidates = allPublished.filter((q) => {
        if (exposedSet.has(q.id)) return false;
        if (!isAgeCompatible(q.age_group, req.ageGroup)) return false;
        if (req.difficulty !== 'mixed' && !req.adaptiveDifficulty && q.difficulty !== req.difficulty) return false;
        if (categoryList && !categoryList.includes(q.category)) return false;
        return q.round_type === 'list_multiple';
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
