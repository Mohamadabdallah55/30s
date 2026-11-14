import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { levelToDifficulty, normalizeArabicText } from '../shared/gameRules';
import { buildQuestionHash, coerceRoundType, validateRoundFields } from '../shared/questionSchema';

const ages = {
  '7-10': 'kids_7_10', '11-13': 'preteen_11_13', '14-17': 'teen_14_17',
  '18+': 'adults_18_plus', family_mixed: 'family',
} as const;
const ageSchema = z.enum(['7-10', '11-13', '14-17', '18+', 'family_mixed']);
const text = z.string().trim().min(1);
const items = z.array(text).default([]);
const record = z.object({
  id: text, bank_id: text, age_band: ageSchema, difficulty: z.literal([1, 2, 3, 4, 5]),
  category: text, topic: text, type: text, question: text.min(5),
  answer_text: text, accepted_answers: items, options: items,
  correct_option: text.nullish(), required_count: z.number().int().nullish(),
  valid_items: items, ordered_items: items, memory_items: items, clues: items,
  explanation: z.string().default(''), reference: text.nullish(), review_status: text,
});
const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex');

function convert(row: z.infer<typeof record>) {
  const roundType = coerceRoundType(row.type);
  if (!roundType) throw new Error('نوع الجولة غير معروف');
  if (!['verified', 'needs_review', 'review_required'].includes(row.review_status)) {
    throw new Error('حالة المراجعة غير صالحة للاستيراد');
  }
  let options = row.options;
  let acceptableAnswers = [...new Set([row.answer_text, ...row.accepted_answers])];
  let correctIndex: number | null = null;
  let orderCriteria = '';
  let requiredCount = row.required_count ?? undefined;
  const promptItems = row.question.match(/[:：]\s*\(([^()]+)\)[.؟?]?$/)?.[1]
    ?.split(/\s*[—–]\s*/).map((part) => part.trim()) ?? [];
  switch (roundType) {
    case 'true_false':
      options = ['صح', 'خطأ'];
      correctIndex = options.findIndex((option) => normalizeArabicText(option) === normalizeArabicText(row.answer_text));
      break;
    case 'odd_one_out':
    case 'multiple_choice':
      if (!options.length && roundType === 'odd_one_out') options = promptItems;
      correctIndex = row.correct_option && /^[A-Z]$/i.test(row.correct_option)
        ? row.correct_option.toUpperCase().charCodeAt(0) - 65
        : options.findIndex((option) => normalizeArabicText(option) === normalizeArabicText(row.correct_option ?? row.answer_text));
      // A letter is an index in the supplied file, not a text answer in the game.
      acceptableAnswers = acceptableAnswers.filter((answer) => !/^[A-Z]$/i.test(answer));
      break;
    case 'bid_challenge':
    case 'list_multiple':
      acceptableAnswers = row.valid_items;
      break;
    case 'order_items': {
      options = options.length ? options : promptItems;
      acceptableAnswers = row.ordered_items.map((item) => {
        const label = item.replace(/\s*\([^)]*\)\s*$/, '').split(' / ')[0].trim();
        return options.find((option) => normalizeArabicText(option) === normalizeArabicText(label)) ?? item;
      });
      orderCriteria = row.question.split(/[:：]/)[0];
      if (options.every((option, index) => option === acceptableAnswers[index])) options = [...options].reverse();
      break;
    }
    case 'memory':
      if (!requiredCount && row.memory_items.length) requiredCount = row.memory_items.length;
      break;
  }
  const question = {
    roundType, options, acceptableAnswers, correctIndex, orderCriteria, requiredCount,
    clues: row.clues, memoryItems: row.memory_items, oddReason: row.explanation,
  };
  const invalid = validateRoundFields(question);
  if (invalid) throw new Error(invalid);
  return question;
}

export function importGeminiBank(db: Database.Database, rows: unknown[]) {
  const review: Array<{ row: number; id?: string; reason: string; data: unknown }> = [];
  const duplicates: Array<{ row: number; id: string }> = [];
  const distribution: Record<string, { accepted: number; published: number; categories: Record<string, number> }> = Object.create(null);
  const insertBank = db.prepare(`
    INSERT OR IGNORE INTO question_banks (id, name, description, category, source_type)
    VALUES (?, ?, ?, 'عام', 'imported')
  `);
  const insert = db.prepare(`
    INSERT INTO questions (id, bank_id, external_id, round_type, category, age_group,
      difficulty, difficulty_level, prompt, options_json, acceptable_answers_json, correct_index,
      explanation, clues_json, order_criteria, memory_items_json, memory_reveal_seconds, odd_reason,
      is_religious, status, source_excerpt, normalized_hash, required_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const known = db.prepare(`
    SELECT external_id, prompt, normalized_hash FROM questions WHERE bank_id = ?
  `);
  let accepted = 0;
  db.transaction(() => {
    const changedBanks = new Set<string>();
    const bankIndexes = new Map<string, { ids: Set<string>; hashes: Set<string>; prompts: Set<string> }>();
    for (const [index, raw] of rows.entries()) {
      const parsed = record.safeParse(raw);
      if (!parsed.success) {
        review.push({ row: index + 1, reason: parsed.error.issues.map((issue) => issue.path.join('.')).join(', '), data: raw });
        continue;
      }
      const row = parsed.data;
      let q: ReturnType<typeof convert>;
      try {
        q = convert(row);
      } catch (error) {
        review.push({ row: index + 1, id: row.id, reason: (error as Error).message, data: raw });
        continue;
      }
      const bankId = `bank-import-${fingerprint(row.bank_id).slice(0, 20)}`;
      const hash = buildQuestionHash(row.question, q.acceptableAnswers);
      const promptKey = normalizeArabicText(row.question);
      let knownBank = bankIndexes.get(bankId);
      if (!knownBank) {
        const existing = known.all(bankId) as Array<{ external_id: string; prompt: string; normalized_hash: string }>;
        knownBank = {
          ids: new Set(existing.map((item) => item.external_id)),
          hashes: new Set(existing.map((item) => item.normalized_hash)),
          prompts: new Set(existing.map((item) => normalizeArabicText(item.prompt))),
        };
        bankIndexes.set(bankId, knownBank);
      }
      if (knownBank.ids.has(row.id) || knownBank.hashes.has(hash) || knownBank.prompts.has(promptKey)) {
        duplicates.push({ row: index + 1, id: row.id });
        continue;
      }
      const published = row.review_status === 'verified';
      insertBank.run(bankId, `أسئلة مسجد ابن تيمية · ${row.bank_id}`, 'بنك الأسئلة المستورد');
      const reveal = row.question.match(/لمدة\s+(\d+)\s+ثوان/);
      insert.run(
        `q-import-${fingerprint(bankId + ':' + row.id).slice(0, 24)}`, bankId, row.id, q.roundType,
        row.category, ages[row.age_band], levelToDifficulty(row.difficulty), row.difficulty,
        row.question, JSON.stringify(q.options), JSON.stringify(q.acceptableAnswers), q.correctIndex,
        row.explanation, JSON.stringify(q.clues), q.orderCriteria, JSON.stringify(q.memoryItems),
        reveal ? Math.max(1, Math.min(30, Number(reveal[1]))) : 8,
        q.roundType === 'odd_one_out' ? q.oddReason : '', row.category === 'ديني' ? 1 : 0,
        published ? 'published' : 'needs_review', row.reference ?? null, hash, q.requiredCount ?? null
      );
      knownBank.ids.add(row.id);
      knownBank.hashes.add(hash);
      knownBank.prompts.add(promptKey);
      changedBanks.add(bankId);
      accepted++;
      const pack = distribution[row.bank_id] ??= { accepted: 0, published: 0, categories: Object.create(null) };
      pack.accepted++;
      if (published) pack.published++;
      pack.categories[row.category] = (pack.categories[row.category] ?? 0) + 1;
    }
    for (const bankId of changedBanks) db.prepare('UPDATE question_banks SET version = version + 1 WHERE id = ?').run(bankId);
  }).immediate();
  return { received: rows.length, accepted, rejected: review.length, duplicateCount: duplicates.length, distribution, review, duplicates };
}
