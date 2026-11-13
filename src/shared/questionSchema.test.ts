import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arabicTextSimilarity,
  parseCsvQuestions,
  validateAndDeduplicateImport,
} from './questionSchema';

test('validateAndDeduplicateImport blocks duplicates, malformed rows, and gates religious needsReview items', () => {
  const existingIds = new Set(['Q-100']);
  const existingHashes = new Set<string>();

  const rows = [
    {
      externalId: 'Q-100', // duplicate id
      roundType: 'multiple_choice',
      category: 'السيرة النبوية',
      ageGroup: 'youth',
      difficulty: 'easy',
      prompt: 'في أي عام هجري وقعت غزوة بدر الكبرى؟',
      options: ['الأولى', 'الثانية', 'الثالثة', 'الرابعة'],
      acceptableAnswers: ['الثانية'],
      correctIndex: 1,
    },
    {
      externalId: 'Q-101',
      roundType: 'multiple_choice',
      category: 'الفقه',
      ageGroup: 'adults',
      difficulty: 'hard',
      prompt: 'ما حكم المسح على الجوربين عند السفر وفق المذهب المقرر في الدرس؟',
      options: ['يوم وليلة', 'ثلاثة أيام بلياليهن', 'لا يجوز', 'أسبوع'],
      acceptableAnswers: ['ثلاثة أيام بلياليهن'],
      correctIndex: 1,
      isReligious: true,
      needsReview: true,
    },
    {
      externalId: 'Q-102',
      roundType: 'rapid_fire',
      category: 'اللغة العربية',
      ageGroup: 'kids',
      difficulty: 'easy',
      prompt: 'كم عدد حروف اللغة العربية الفصحى؟',
      acceptableAnswers: ['28', 'ثمانية وعشرون'],
    },
    {
      externalId: 'Q-103',
      roundType: 'rapid_fire',
      category: 'اللغة العربية',
      ageGroup: 'kids',
      difficulty: 'easy',
      prompt: 'كم عدد حروف اللغة العربية الفصحى؟', // exact duplicate prompt+answer
      acceptableAnswers: ['28', 'ثمانية وعشرون'],
    },
  ];

  const report = validateAndDeduplicateImport(rows, existingIds, existingHashes);
  assert.equal(report.totalReceived, 4);
  assert.equal(report.validCount, 2);
  assert.equal(report.needsReviewCount, 1);
  assert.equal(report.publishedCount, 1);
  assert.equal(report.duplicateRejectedCount, 2);

  const religiousItem = report.accepted.find((q) => q.externalId === 'Q-101');
  assert.equal(religiousItem?.status, 'needs_review');
});

test('validateAndDeduplicateImport processes 5000 questions quickly with accurate distribution', () => {
  const batch = Array.from({ length: 5000 }, (_, i) => ({
    externalId: `BULK-${i + 1}`,
    roundType: i % 2 === 0 ? 'multiple_choice' : 'rapid_fire',
    category: i % 3 === 0 ? 'القرآن الكريم' : i % 3 === 1 ? 'السيرة النبوية' : 'العلوم والطبيعة',
    ageGroup: i % 4 === 0 ? 'kids' : i % 4 === 1 ? 'youth' : i % 4 === 2 ? 'adults' : 'family',
    difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard',
    prompt: `سؤال اختبار رقم ${i + 1} حول المعرفة المتدرجة للطلاب في الحلقات العلمية؟`,
    options: ['أ', 'ب', 'ج', 'د'],
    acceptableAnswers: [`إجابة ${i + 1}`],
    correctIndex: 0,
  }));

  const start = Date.now();
  const report = validateAndDeduplicateImport(batch, new Set(), new Set());
  const elapsedMs = Date.now() - start;

  assert.equal(report.validCount, 5000);
  assert.equal(report.errorCount, 0);
  assert.ok(elapsedMs < 3000, `Expected 5000-row import validation under 3s, took ${elapsedMs}ms`);
});

test('parseCsvQuestions parses quoted Arabic CSV rows accurately', () => {
  const csv = `externalId,roundType,category,ageGroup,difficulty,prompt,options,acceptableAnswers\n"C1","multiple_choice","السيرة النبوية","kids","easy","أين ولد النبي صلى الله عليه وسلم؟","مكة المكرمة|المدينة المنورة|الطائف|القدس","مكة المكرمة"`;
  const parsed = parseCsvQuestions(csv);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].externalId, 'C1');
  assert.equal(parsed[0].category, 'السيرة النبوية');
});

test('arabicTextSimilarity detects high phrasing overlap', () => {
  const sim = arabicTextSimilarity(
    'من هو أول الخلفاء الراشدين بعد النبي صلى الله عليه وسلم؟',
    'من اول الخلفاء الراشدين بعد النبي صلي الله عليه وسلم'
  );
  assert.ok(sim > 0.85);
});
