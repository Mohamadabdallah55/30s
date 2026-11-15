import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { levelToDifficulty, normalizeArabicText, normalizeChallengeItem } from '../shared/gameRules';
import { buildQuestionHash, coerceRoundType, validateRoundFields } from '../shared/questionSchema';

export const FULL_BANK_ID = 'bank-import-thirty-seconds-v1';

const ages = { '7-10': 'kids_7_10', '11-13': 'preteen_11_13', '14-17': 'teen_14_17', '18+': 'adults_18_plus', 'عائلات': 'family' } as const;
const text = z.string().trim().min(1);
const items = z.array(text);
const rawRow = z.object({
  id: text, concept_id: text, type: text, category: text, question_ar: text,
  age_bands: z.array(z.enum(['7-10', '11-13', '14-17', '18+', 'عائلات'])).min(1),
  difficulty: z.literal([1, 2, 3, 4, 5]),
  answer_ar: text.nullable(),
  status: z.enum(['approved', 'needs_review', 'draft']),
  host_review_required: z.boolean(),
  source_ref: text.nullish(),
  data: z.record(z.string(), z.unknown()),
});

function convert(input: unknown) {
  const row = rawRow.parse(input);
  const type = coerceRoundType(row.type);
  if (!type || type === 'golden' || type === 'buzzer') throw new Error('نوع سؤال غير مدعوم');
  const d = row.data;
  const readList = (key: string) => items.parse(d[key]);
  let answers = row.answer_ar ? [row.answer_ar] : [];
  let options: string[] = [];
  let clues: string[] = [];
  let memoryItems: string[] = [];
  let correctIndex: number | null = null;
  let requiredCount: number | undefined;
  let viewSeconds = 8;
  let memoryRequireOrder = false;
  let explanation = '';
  let orderCriteria = '';
  let bidMinimum: number | null = null;
  let bidMaximum: number | null = null;
  let acceptsOtherAnswers = false;
  switch (type) {
    case 'multiple_choice':
    case 'odd_one_out':
      options = readList(type === 'odd_one_out' ? 'items' : 'options');
      correctIndex = z.number().int().nonnegative().parse(d.correct_index);
      if (type === 'odd_one_out') explanation = text.parse(d.reason_ar);
      break;
    case 'true_false': {
      if (text.parse(d.statement) !== row.question_ar) throw new Error('العبارة لا تطابق السؤال');
      options = ['صح', 'خطأ'];
      correctIndex = z.boolean().parse(d.is_true) ? 0 : 1;
      explanation = typeof d.correct_fact === 'string' ? d.correct_fact : '';
      break;
    }
    case 'who_am_i':
      clues = readList('clues');
      break;
    case 'fill_blank':
      answers = [...new Set([...answers, ...readList('accepted_answers')])];
      break;
    case 'list_multiple':
    case 'bid_challenge': {
      acceptsOtherAnswers = d.answers_are_exhaustive === false;
      answers = readList('accepted_answers');
      if (type === 'list_multiple') requiredCount = z.number().int().parse(d.required_count);
      else {
        bidMinimum = z.number().int().positive().parse(d.minimum_bid);
        const actualMax = new Set(answers.map(normalizeChallengeItem).filter(Boolean)).size;
        bidMaximum = Math.min(actualMax, z.number().int().positive().parse(d.suggested_max_bid));
        if (bidMinimum >= bidMaximum) throw new Error('حدود المزايدة لا تسمح بتحدٍّ قابل للعب');
      }
      break;
    }
    case 'order_items':
      options = readList('shown_items');
      answers = readList('correct_order');
      orderCriteria = text.parse(d.criterion);
      if (options.every((item, i) => normalizeArabicText(item) === normalizeArabicText(answers[i]))) options = [...options].reverse();
      break;
    case 'memory':
      memoryItems = readList('display_items');
      answers = readList('recall_answers');
      memoryRequireOrder = d.require_order === true;
      if (memoryItems.length !== answers.length || memoryItems.some((item, i) => normalizeArabicText(item) !== normalizeArabicText(answers[i])))
        throw new Error('عناصر العرض لا تطابق عناصر الاسترجاع');
      viewSeconds = z.number().int().min(1).max(30).parse(d.view_seconds);
      break;
  }
  const invalid = validateRoundFields({ roundType: type, options, acceptableAnswers: answers, correctIndex, requiredCount,
    clues, memoryItems, orderCriteria, oddReason: explanation });
  if (invalid) throw new Error(invalid);
  const religious = /^دينيات(?:\s|$)/.test(row.category) ||
    ['القرآن الكريم', 'السيرة النبوية', 'المسجد والآداب', 'فقه وآداب', 'براعم المسجد'].includes(row.category);
  const published = row.status === 'approved' && !row.host_review_required && !religious;
  return { row, type, ages: [...new Set(row.age_bands.map((age) => ages[age]))], answers, options, clues, memoryItems,
    memoryRequireOrder, correctIndex, requiredCount, viewSeconds, orderCriteria, explanation, published, religious, bidMinimum, bidMaximum, acceptsOtherAnswers };
}

export function importFullBank(db: Database.Database, input: unknown) {
  const { questions } = z.object({ questions: z.array(z.unknown()) }).parse(input);
  const report = { received: questions.length, published: 0, needsReview: 0, duplicates: 0,
    invalid: [] as Array<{ id?: string; reason: string }> };
  db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO question_banks (id, name, description, category, source_type)
      VALUES (?, 'تحدي الـ30 ثانية · بنك الأسئلة المتنوع', 'أسئلة متنوعة مع ملحق الرياضة والدين والثقافة', 'عام', 'imported')`).run(FULL_BANK_ID);
    const previous = db.prepare('SELECT external_id, normalized_hash FROM questions WHERE bank_id = ?').all(FULL_BANK_ID) as
      Array<{ external_id: string; normalized_hash: string }>;
    const ids = new Set(previous.map((q) => q.external_id));
    const hashes = new Set(previous.map((q) => q.normalized_hash));
    const insert = db.prepare(`INSERT INTO questions (
      id, bank_id, external_id, round_type, category, age_group, age_bands_json, concept_id, difficulty, difficulty_level,
      prompt, options_json, acceptable_answers_json, correct_index, explanation, clues_json, order_criteria, memory_items_json,
      memory_reveal_seconds, memory_require_order, required_count, bid_minimum, bid_maximum, odd_reason, is_religious, status, normalized_hash, source_excerpt, accepts_other_answers
    ) VALUES (${Array.from({length:29}, () => '?').join(',')})`);
    for (const raw of questions) {
      let q: ReturnType<typeof convert>;
      try { q = convert(raw); }
      catch (error) {
        const id = typeof raw === 'object' && raw && 'id' in raw ? String(raw.id) : undefined;
        report.invalid.push({ id, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      // Identical concepts can have distinct round representations.
      const digest = (s: string) => createHash('sha256').update(s).digest('hex');
      const hash = digest(q.type + ':' + buildQuestionHash(q.row.question_ar, q.answers) + ':' +
        JSON.stringify([q.clues, q.memoryItems, q.type === 'order_items' ? q.answers : []].map((xs) => xs.map(normalizeArabicText))));
      if (ids.has(q.row.id) || hashes.has(hash)) { report.duplicates++; continue; }
      insert.run('q-import-' + digest(FULL_BANK_ID + ':' + q.row.id).slice(0,24), FULL_BANK_ID, q.row.id, q.type, q.row.category,
        q.ages.find((age) => age !== 'family') ?? 'family', JSON.stringify(q.ages), q.row.concept_id, levelToDifficulty(q.row.difficulty),
        q.row.difficulty, q.row.question_ar, JSON.stringify(q.options), JSON.stringify(q.answers), q.correctIndex,
        q.explanation, JSON.stringify(q.clues), q.orderCriteria, JSON.stringify(q.memoryItems), q.viewSeconds,
        Number(q.memoryRequireOrder), q.requiredCount ?? null, q.bidMinimum, q.bidMaximum,
        q.type === 'odd_one_out' ? q.explanation : '', Number(q.religious), q.published ? 'published' : 'needs_review', hash, q.row.source_ref ?? null, Number(q.acceptsOtherAnswers));
      ids.add(q.row.id);
      hashes.add(hash);
      if (q.published) report.published++;
      else report.needsReview++;
    }
    if (report.published + report.needsReview > 0) db.prepare('UPDATE question_banks SET version = version + 1 WHERE id = ?').run(FULL_BANK_ID);
  }).immediate();
  return report;
}
