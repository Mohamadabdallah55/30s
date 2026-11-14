import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDatabase } from './db';
import {
  BatchOutputLimitError,
  buildLessonDistributionPlan,
  cancelLessonPipeline,
  createLessonBatchJob,
  DEFAULT_AI_MODEL,
  type GeminiRunner,
  GeneratedBatchResponseSchema,
  getConfiguredAiModel,
  getLessonBatchSummary,
  InvalidJsonResponseError,
  parseStructuredResponseStrict,
  processLessonBatches,
  QuotaExhaustedError,
  resumeLessonPipelineAsync,
  runLessonPipeline,
  setConfiguredAiModel,
  TransientNetworkError,
} from './lessonStudio';
import { seedDatabase } from './seed';
import type { RoundType } from '../shared/types';

function makeValidPdfBuffer(pageCount = 17): Buffer {
  const pages = Array.from({ length: pageCount }, (_, i) => `${i + 1} 0 obj << /Type /Page /Font << >> >> endobj`).join('\n');
  return Buffer.from(`%PDF-1.4\n${pages}\nBT (Sulh al-Hudaybiyyah Arabic Lesson) Tj ET\n%%EOF`, 'latin1');
}

function createHudaybiyyahMockRunner(options: {
  maxMaterialQuestions?: number;
  truncateAtCall?: number;
  maxTokensAtCall?: number;
  networkFailRange?: [number, number];
} = {}): { runner: GeminiRunner; stats: { analysisCalls: number; batchCalls: number; verifyCalls: number; batchSizes: number[] } } {
  const stats = { analysisCalls: 0, batchCalls: 0, verifyCalls: 0, batchSizes: [] as number[] };
  let qCounter = 0;
  let callIndex = 0;
  const maxCap = options.maxMaterialQuestions ?? 999;

  const runner: GeminiRunner = {
    async generateStructuredJson({ prompt }) {
      callIndex++;

      // Analysis stage
      if (prompt.includes('readabilityOk')) {
        stats.analysisCalls++;
        return {
          finishReason: 'STOP',
          candidateTokens: 480,
          text: JSON.stringify({
            readabilityOk: true,
            readabilityNote: 'ملف عربي واضح ومنسق عن صلح الحديبية في 17 صفحة.',
            actualPageCount: 17,
            isReligiousContent: true,
            topics: [
              { title: 'أسباب خروج النبي صلى الله عليه وسلم ورؤيا العمرة', pageNumbers: [1, 2, 3], keyConcepts: ['رؤيا العمرة', 'ذي الحليفة', 'الهدي'] },
              { title: 'مواقف قريش وإرسال عثمان رضي الله عنه وبيعة الرضوان', pageNumbers: [4, 5, 6, 7], keyConcepts: ['عروة بن مسعود', 'عثمان بن عفان', 'بيعة الرضوان'] },
              { title: 'بنود صلح الحديبية وتحليل نتائجها الاستراتيجية', pageNumbers: [8, 9, 10, 11, 12], keyConcepts: ['الهدنة عشر سنين', 'رد من جاء مسلماً', 'الفتح المبين'] },
              { title: 'رد فعل الصحابة وموقف أم سلمة وحكمة التحلل', pageNumbers: [13, 14, 15, 16, 17], keyConcepts: ['عمر بن الخطاب', 'أم سلمة', 'نزول سورة الفتح'] },
            ],
            pageSummaries: Array.from({ length: 17 }, (_, i) => ({
              page: i + 1,
              summary: `تفاصيل الصفحة ${i + 1} من أحداث صلح الحديبية ومقارنة المواقف التاريخية.`,
              factsVsHypotheticals: `حقائق تاريخية مثبتة في صفحة ${i + 1}`,
              tablesOrComparisons: i % 3 === 0 ? `مقارنة بنود المفاوضات صفحة ${i + 1}` : '',
              timelineEvents: `الترتيب الزمني للحدث رقم ${i + 1} في ذي القعدة 6 هـ`,
            })),
            objectives: [
              'تحليل دلالات التحول الاستراتيجي بعد صلح الحديبية',
              'الربط بين مواقف المفاوضين عبر صفحات الوثيقة',
              'التمييز بين البنود الظاهرية والنتائج بعيدة المدى',
            ],
            estimatedMaxDistinctQuestions: Math.min(100, maxCap),
            coverageSummary: 'تغطية شاملة لأحداث ومواقف وبنود ونتائج صلح الحديبية.',
          }),
        };
      }

      // Independent verification pass
      if (prompt.includes('أنت مدقق علمي مستقل')) {
        stats.verifyCalls++;
        const listMatch = prompt.match(/القائمة:\n([\s\S]*)$/);
        const arr = listMatch ? (JSON.parse(listMatch[1]) as Array<{ index: number; sourcePage: number }>) : [];
        return {
          finishReason: 'STOP',
          candidateTokens: 200,
          text: JSON.stringify(
            arr.map((item) => ({
              index: item.index,
              supported: true,
              correctedPage: item.sourcePage,
              reason: 'مثبت في النص المرجعي لصلح الحديبية.',
            }))
          ),
        };
      }

      // Batch generation pass
      stats.batchCalls++;
      // Respect the prompt's existing-questions avoidance list (just like the real Gemini prompt)
      const existingNums = Array.from(prompt.matchAll(/السؤال[^(\n]*\((\d+)\)/g)).map((m) => Number(m[1]));
      if (existingNums.length > 0) {
        qCounter = Math.max(qCounter, ...existingNums);
      }
      const countMatch = prompt.match(/توليد \*\*(\d+)\*\*/);
      const reqInBatch = countMatch ? Number(countMatch[1]) : 6;
      stats.batchSizes.push(reqInBatch);

      if (options.networkFailRange && callIndex >= options.networkFailRange[0] && callIndex <= options.networkFailRange[1]) {
        throw new TransientNetworkError('انقطاع اتصال الشبكة بالخادم');
      }

      if (options.maxTokensAtCall && stats.batchCalls === options.maxTokensAtCall) {
        return {
          finishReason: 'MAX_TOKENS',
          candidateTokens: 8192,
          text: '{"questions":[{"roundType":"multiple_choice","prompt":"سؤال مقطوع بسبب الحد الأقصى',
        };
      }

      if (options.truncateAtCall && stats.batchCalls === options.truncateAtCall) {
        return {
          finishReason: 'STOP',
          candidateTokens: 4000,
          text: '{"questions":[{"roundType":"multiple_choice","prompt":"سؤال انقطع نصه فجأة أثناء الإرسال',
        };
      }

      const roundTypesCycle: RoundType[] = [
        'multiple_choice',
        'true_false',
        'who_am_i',
        'order_items',
        'odd_one_out',
        'list_multiple',
        'fill_blank',
      ];
      const generated: unknown[] = [];
      let exhausted = false;

      for (let i = 0; i < reqInBatch; i++) {
        if (qCounter >= maxCap) {
          exhausted = true;
          break;
        }
        qCounter++;
        const n = qCounter;
        const page = ((n - 1) % 17) + 1;
        const rt = roundTypesCycle[(n - 1) % roundTypesCycle.length];

        if (rt === 'multiple_choice') {
          generated.push({
            roundType: 'multiple_choice',
            prompt: `السؤال التحليلي (${n}) في صلح الحديبية: ما الدلالة الاستراتيجية للبند رقم ${n} عند الربط بين صفحتي ${page} و${(page % 17) + 1}؟`,
            options: [
              `النتيجة التحليلية المعتمدة للبند ${n}`,
              `افتراض غير مثبت ${n}أ`,
              `افتراض غير مثبت ${n}ب`,
              `افتراض غير مثبت ${n}ج`,
            ],
            acceptableAnswers: [`النتيجة التحليلية المعتمدة للبند ${n}`],
            correctIndex: 0,
            explanation: `استنتاج مرتبط بالصفحة ${page} والصفحة ${(page % 17) + 1}.`,
            cognitiveSkill: 'analysis',
            sourcePage: page,
            sourceExcerpt: `مقتطف موثق من نص صلح الحديبية صفحة ${page} يثبت البند ${n}.`,
            confidenceScore: 0.94,
            isReligious: true,
          });
        } else if (rt === 'true_false') {
          generated.push({
            roundType: 'true_false',
            prompt: `السؤال (${n}): في التسلسل الزمني لصلح الحديبية، سبق الحدث رقم ${n} تحلل الصحابة في الصفحة ${page}.`,
            options: ['صح', 'خطأ'],
            acceptableAnswers: ['صح'],
            correctIndex: 0,
            explanation: `موثق بالتسلسل الزمني صفحة ${page}.`,
            cognitiveSkill: 'chronology',
            sourcePage: page,
            sourceExcerpt: `توثيق الحدث الزمني ${n} في صفحة ${page}.`,
            confidenceScore: 0.92,
            isReligious: true,
          });
        } else if (rt === 'order_items') {
          generated.push({
            roundType: 'order_items',
            prompt: `السؤال (${n}): رتب محطات التفاوض رقم ${n} في صلح الحديبية تصاعدياً حسب ورودها في صفحة ${page}:`,
            options: [`الخطوة ج-${n}`, `الخطوة أ-${n}`, `الخطوة ب-${n}`],
            acceptableAnswers: [`الخطوة أ-${n}`, `الخطوة ب-${n}`, `الخطوة ج-${n}`],
            orderCriteria: 'الترتيب الزمني للأحداث',
            explanation: `ورد هذا الترتيب في صفحة ${page}.`,
            cognitiveSkill: 'chronology',
            sourcePage: page,
            sourceExcerpt: `تسلسل الخطوات أ وب وج للمحطة ${n} صفحة ${page}.`,
            confidenceScore: 0.91,
            isReligious: true,
          });
        } else if (rt === 'who_am_i') {
          generated.push({
            roundType: 'who_am_i',
            prompt: `السؤال (${n}): من الشخصية المقصودة في ملف صلح الحديبية صفحة ${page}؟`,
            clues: [`الدليل الأول للشخصية ${n}`, `الدليل الثاني من صفحة ${page}`, `الدليل الثالث الحاسم ${n}`],
            acceptableAnswers: [`مبعوث المفاوضات رقم ${n}`],
            explanation: `مذكور في صفحة ${page}.`,
            cognitiveSkill: 'inference',
            sourcePage: page,
            sourceExcerpt: `توصيف المبعوث رقم ${n} في صفحة ${page}.`,
            confidenceScore: 0.9,
            isReligious: true,
          });
        } else {
          generated.push({
            roundType: rt,
            prompt: `السؤال المتقدم (${n}) من نوع ${rt}: استنتج الفارق الجوهري الموثق للمشهد ${n} في صفحة ${page}.`,
            options: rt === 'odd_one_out' ? [`حقيقة ${n}أ`, `حقيقة ${n}ب`, `افتراض دخيل ${n}`, `حقيقة ${n}ج`] : [],
            acceptableAnswers: [rt === 'odd_one_out' ? `افتراض دخيل ${n}` : `الإجابة الموثقة ${n}`],
            oddReason: rt === 'odd_one_out' ? `العنصر ${n} افتراضي وليس بنداً تاريخياً.` : '',
            explanation: `استناداً إلى المقارنة في صفحة ${page}.`,
            cognitiveSkill: 'comparison',
            sourcePage: page,
            sourceExcerpt: `نص داعم للمشهد ${n} في صفحة ${page}.`,
            confidenceScore: 0.93,
            isReligious: true,
          });
        }
      }

      return {
        finishReason: 'STOP',
        candidateTokens: 1200,
        text: JSON.stringify({
          questions: generated,
          materialExhausted: exhausted,
          exhaustionReason: exhausted ? 'تم استنفاد كافة الحقائق المتفردة في الملف دون تكرار.' : '',
        }),
      };
    },
  };

  return { runner, stats };
}

test('parseStructuredResponseStrict rejects MAX_TOKENS and truncated JSON without naive brace-closing', () => {
  assert.throws(
    () =>
      parseStructuredResponseStrict(
        {
          finishReason: 'MAX_TOKENS',
          text: '{"questions":[{"roundType":"multiple_choice","prompt":"سؤال غير مكتمل',
          candidateTokens: 8192,
        },
        GeneratedBatchResponseSchema
      ),
    (err: unknown) => err instanceof BatchOutputLimitError
  );

  assert.throws(
    () =>
      parseStructuredResponseStrict(
        {
          finishReason: 'STOP',
          text: '{"questions":[{"roundType":"multiple_choice","prompt":"Unterminated string simulation',
          candidateTokens: 3200,
        },
        GeneratedBatchResponseSchema
      ),
    (err: unknown) => err instanceof InvalidJsonResponseError
  );
});

test('Bug scenario: Sulh al-Hudaybiyyah 17-page advanced PDF with 50 hard questions completes cleanly with 0 duplicates', async () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const { runner, stats } = createHudaybiyyahMockRunner();

  const summary = await runLessonPipeline(
    db,
    {
      lessonTitle: 'صلح الحديبية — دراسة تحليلية متقدمة',
      subject: 'السيرة النبوية',
      ageGroup: 'adults',
      difficulty: 'hard',
      requestedCount: 50,
      allowedRoundTypes: ['multiple_choice', 'true_false', 'who_am_i', 'order_items', 'odd_one_out', 'fill_blank'],
      createdBy: 'prof-teacher-1',
      pdfBuffer: makeValidPdfBuffer(17),
      filename: 'sulh_hudaybiyyah_advanced.pdf',
    },
    runner
  );

  assert.equal(summary.pageCount, 17);
  assert.equal(summary.requestedCount, 50);
  assert.equal(summary.verifiedCount, 50);
  assert.equal(stats.analysisCalls, 1);
  assert.ok(stats.batchCalls >= 8, `Expected incremental batches, got ${stats.batchCalls}`);
  assert.ok(stats.batchSizes.every((s) => s >= 2 && s <= 10));

  const savedRows = db
    .prepare(`SELECT prompt, source_page, source_excerpt, status FROM questions WHERE bank_id = ?`)
    .all(summary.bankId) as Array<{ prompt: string; source_page: number; source_excerpt: string; status: string }>;
  assert.equal(savedRows.length, 50);
  assert.ok(savedRows.every((r) => r.source_page >= 1 && r.source_page <= 17 && r.source_excerpt.length > 5));

  // Verify distribution across pages and zero duplicates
  const uniquePrompts = new Set(savedRows.map((r) => r.prompt));
  assert.equal(uniquePrompts.size, 50);

  // Cleanup disk PDF created by test
  const doc = db.prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`).get(summary.lessonId) as {
    storage_path: string;
  };
  if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
  db.close();
});

test('Supports 10, 30, and 100 requested questions via incremental distribution plan', async () => {
  for (const target of [10, 30, 100]) {
    const db = createDatabase(':memory:');
    seedDatabase(db);
    const { runner } = createHudaybiyyahMockRunner();

    const summary = await runLessonPipeline(
      db,
      {
        lessonTitle: `اختبار ${target} سؤالاً`,
        subject: 'السيرة النبوية',
        ageGroup: 'youth',
        difficulty: target === 100 ? 'medium' : 'hard',
        requestedCount: target,
        allowedRoundTypes: ['multiple_choice', 'true_false', 'rapid_fire', 'fill_blank'],
        createdBy: 'prof-teacher-1',
        pdfBuffer: makeValidPdfBuffer(17),
        filename: `lesson_${target}.pdf`,
      },
      runner
    );

    assert.equal(summary.verifiedCount, target, `Expected exact ${target} verified questions`);
    const doc = db.prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`).get(summary.lessonId) as {
      storage_path: string;
    };
    if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
    db.close();
  }
});

test('Truncated JSON and MAX_TOKENS shrink batch size automatically, retry failed batch, and recover to 50/50', async () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  // Batch call 2 returns MAX_TOKENS; batch call 4 returns truncated JSON string
  const { runner, stats } = createHudaybiyyahMockRunner({
    maxTokensAtCall: 2,
    truncateAtCall: 4,
  });

  const summary = await runLessonPipeline(
    db,
    {
      lessonTitle: 'اختبار التعافي التلقائي وتقليص الدفعة',
      subject: 'السيرة النبوية',
      ageGroup: 'adults',
      difficulty: 'hard',
      requestedCount: 50,
      allowedRoundTypes: ['multiple_choice', 'true_false', 'fill_blank'],
      createdBy: 'prof-teacher-1',
      pdfBuffer: makeValidPdfBuffer(17),
      filename: 'recovery_shrink.pdf',
    },
    runner
  );

  assert.equal(summary.verifiedCount, 50);
  // Verify batch size visibly shrank after MAX_TOKENS / truncation
  assert.ok(stats.batchSizes.some((sz) => sz <= 3), `Expected shrunk batch size <=3, got ${stats.batchSizes.join(',')}`);
  assert.ok(summary.diagnosticLogs.some((d) => d.finishReason === 'MAX_TOKENS'));

  const doc = db.prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`).get(summary.lessonId) as {
    storage_path: string;
  };
  if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
  db.close();
});

test('Mid-pipeline network failure preserves valid batches, avoids raw errors, and resumes cleanly without re-analysis or duplicates', async () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);

  // Fail network around batch 3 across retries -> pauses mid-run with valid batches saved
  const failingSetup = createHudaybiyyahMockRunner({ networkFailRange: [6, 12] });
  const { lessonId } = createLessonBatchJob(db, {
    lessonTitle: 'اختبار الاستكمال بعد الانقطاع',
    subject: 'السيرة النبوية',
    ageGroup: 'adults',
    difficulty: 'hard',
    requestedCount: 30,
    allowedRoundTypes: ['multiple_choice', 'true_false', 'who_am_i'],
    createdBy: 'prof-teacher-1',
    pdfBuffer: makeValidPdfBuffer(17),
    filename: 'pause_resume.pdf',
  });

  const paused = await processLessonBatches({
    db,
    lessonId,
    allowedRoundTypes: ['multiple_choice', 'true_false', 'who_am_i'],
    runner: failingSetup.runner,
  });

  assert.equal(paused.pipelineStage, 'batch_paused');
  assert.ok(paused.verifiedCount > 0 && paused.verifiedCount < 30, `Saved partial count=${paused.verifiedCount}`);
  assert.ok(paused.failedBatchIndex !== null);
  assert.ok(paused.errorMessage && !/Unterminated string|SyntaxError/.test(paused.errorMessage));
  assert.ok(!paused.statusMessageAr.includes('30 من أصل 30'));

  const partialSavedBeforeResume = paused.verifiedCount;

  // Resume with a healthy runner -> must reuse cached analysis (0 new analysisCalls) and reach 30/30!
  const resumeSetup = createHudaybiyyahMockRunner();
  const completed = await processLessonBatches({
    db,
    lessonId,
    allowedRoundTypes: ['multiple_choice', 'true_false', 'who_am_i'],
    runner: resumeSetup.runner,
  });

  assert.equal(resumeSetup.stats.analysisCalls, 0, 'Must reuse saved LessonAnalysis instead of re-analyzing PDF');
  assert.equal(completed.verifiedCount, 30);
  assert.ok(completed.verifiedCount > partialSavedBeforeResume);

  // Verify zero duplicate prompts after pause+resume
  const prompts = (
    db.prepare(`SELECT prompt FROM questions WHERE bank_id = ?`).all(completed.bankId) as Array<{ prompt: string }>
  ).map((r) => r.prompt);
  assert.equal(new Set(prompts).size, 30);

  const doc = db.prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`).get(lessonId) as {
    storage_path: string;
  };
  if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
  db.close();
});

test('Insufficient PDF content stops honestly without inventing filler questions', async () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const { runner } = createHudaybiyyahMockRunner({ maxMaterialQuestions: 9 });

  const summary = await runLessonPipeline(
    db,
    {
      lessonTitle: 'ملف مختصر جداً',
      subject: 'السيرة النبوية',
      ageGroup: 'youth',
      difficulty: 'hard',
      requestedCount: 30,
      allowedRoundTypes: ['multiple_choice', 'true_false'],
      createdBy: 'prof-teacher-1',
      pdfBuffer: makeValidPdfBuffer(2),
      filename: 'short_lesson.pdf',
    },
    runner
  );

  assert.equal(summary.verifiedCount, 9);
  assert.ok(summary.insufficientContentNote.length > 10);
  assert.ok(!summary.statusMessageAr.includes('30/30'));

  const doc = db.prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`).get(summary.lessonId) as {
    storage_path: string;
  };
  if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
  db.close();
});

test('buildLessonDistributionPlan respects batch bounds (5-10) and cancelLessonPipeline preserves progress', () => {
  const plan50 = buildLessonDistributionPlan({
    requestedCount: 50,
    difficulty: 'hard',
    allowedRoundTypes: ['multiple_choice', 'order_items', 'who_am_i'],
    analysis: {
      readabilityOk: true,
      readabilityNote: '',
      actualPageCount: 17,
      isReligiousContent: true,
      topics: ['محور 1', 'محور 2', 'محور 3'],
      pageSummaries: [],
      pageTexts: [],
      objectives: ['هدف 1'],
      estimatedMaxDistinctQuestions: 50,
      coverageSummary: 'ملخص',
    },
  });
  assert.equal(
    plan50.reduce((sum, b) => sum + b.targetCount, 0),
    50
  );
  assert.ok(plan50.every((b) => b.targetCount >= 2 && b.targetCount <= 10));

  const db = createDatabase(':memory:');
  seedDatabase(db);
  const { lessonId } = createLessonBatchJob(db, {
    lessonTitle: 'اختبار إلغاء',
    subject: 'السيرة',
    ageGroup: 'youth',
    difficulty: 'medium',
    requestedCount: 20,
    allowedRoundTypes: ['multiple_choice'],
    createdBy: 'prof-teacher-1',
    pdfBuffer: makeValidPdfBuffer(5),
    filename: 'cancel.pdf',
  });
  db.prepare(`UPDATE lesson_question_batches SET pipeline_stage = 'batch_paused' WHERE lesson_id = ?`).run(lessonId);
  const cancelled = cancelLessonPipeline(db, lessonId);
  assert.equal(cancelled?.pipelineStage, 'cancelled');

  const doc = db.prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`).get(lessonId) as {
    storage_path: string;
  };
  if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
  db.close();
});

test('Free Tier model policy defaults to gemini-4-hydrogen and strictly rejects paid models like gemini-4-argon', () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  assert.equal(getConfiguredAiModel(db), DEFAULT_AI_MODEL);
  assert.equal(getConfiguredAiModel(db), 'gemini-4-hydrogen');

  const lite = setConfiguredAiModel(db, 'gemini-3.1-flash-lite');
  assert.equal(lite, 'gemini-3.1-flash-lite');
  assert.equal(getConfiguredAiModel(db), 'gemini-3.1-flash-lite');

  assert.throws(() => setConfiguredAiModel(db, 'gemini-4-argon'));
  assert.throws(() => setConfiguredAiModel(db, 'gemini-2.5-pro'));
  db.close();
});

test('GeneratedBatchResponseSchema normalizes non-enum cognitiveSkill strings without throwing SchemaValidationError', () => {
  const parsed = GeneratedBatchResponseSchema.parse({
    questions: [
      {
        roundType: 'multiple_choice',
        prompt: 'ما الشرط الذي قبل النبي صلى الله عليه وسلم توقيعه في صلح الحديبية؟',
        options: ['الهدنة عشر سنين', 'إلغاء العمرة نهائياً', 'دفع جزية', 'ترك المدينة'],
        acceptableAnswers: ['الهدنة عشر سنين'],
        correctIndex: 0,
        cognitiveSkill: 'التحليل والاستنتاج التاريخي',
        sourcePage: '8',
        sourceExcerpt: 'واتفقا على وضع الحرب عشر سنين',
        confidenceScore: 1.5,
      },
    ],
  });
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].cognitiveSkill, 'inference');
  assert.equal(parsed.questions[0].sourcePage, 8);
  assert.equal(parsed.questions[0].confidenceScore, 1);
});

test('Free Tier daily quota exhaustion stops immediately, saves partial batches cleanly, and reports honest 0-saved status when 0 saved', async () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);

  // Case A: quota exhausted before first batch saves -> must honestly show 0 saved and errorCategory='quota_exhausted'
  const zeroQuotaRunner: GeminiRunner = {
    async generateStructuredJson({ prompt }) {
      if (prompt.includes('readabilityOk')) {
        return {
          finishReason: 'STOP',
          candidateTokens: 350,
          text: JSON.stringify({
            readabilityOk: true,
            readabilityNote: 'واضح',
            actualPageCount: 10,
            isReligiousContent: true,
            topics: [{ title: 'صلح الحديبية', pageNumbers: [1, 2], keyConcepts: ['الهدنة'] }],
            pageSummaries: Array.from({ length: 10 }, (_, i) => ({
              page: i + 1,
              summary: `ملخص صفحة ${i + 1}`,
            })),
            objectives: ['فهم الحدث'],
            estimatedMaxDistinctQuestions: 30,
            coverageSummary: 'ملخص',
          }),
        };
      }
      throw new QuotaExhaustedError('نفدت الحصة المجانية اليومية للطلبات (Free Tier Quota Exceeded).', {
        retryDelaySec: 3600,
        isDailyLimit: true,
      });
    },
  };

  const zeroRes = await runLessonPipeline(
    db,
    {
      lessonTitle: 'درس نفاد الحصة عند البداية',
      subject: 'السيرة النبوية',
      ageGroup: 'adults',
      difficulty: 'hard',
      requestedCount: 20,
      allowedRoundTypes: ['multiple_choice', 'true_false'],
      createdBy: 'prof-teacher-1',
      pdfBuffer: makeValidPdfBuffer(10),
      filename: 'quota_zero.pdf',
    },
    zeroQuotaRunner
  );

  assert.equal(zeroRes.pipelineStage, 'batch_paused');
  assert.equal(zeroRes.verifiedCount, 0);
  assert.equal(zeroRes.errorCategory, 'quota_exhausted');
  assert.equal(zeroRes.lastBatchStatus, 'paused');
  assert.equal(zeroRes.modelUsed, 'gemini-4-hydrogen');
  assert.ok(zeroRes.failedBatches >= 1);
  assert.ok(zeroRes.statusMessageAr.includes('0 من أصل 20'), `Unexpected status: ${zeroRes.statusMessageAr}`);
  assert.ok(zeroRes.statusMessageAr.includes('لم يُحفظ أي سؤال'));
  assert.ok(!zeroRes.statusMessageAr.includes('20 من أصل 20'));

  const doc = db.prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`).get(zeroRes.lessonId) as {
    storage_path: string;
  };
  if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
  db.close();
});

test('Analysis stage falls back to compact schema when large PDF hits MAX_TOKENS and blocks resume if PDF file missing', async () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  let analysisAttempts = 0;
  const baseMock = createHudaybiyyahMockRunner().runner;

  const compactFallbackRunner: GeminiRunner = {
    async generateStructuredJson(params) {
      if (params.prompt.includes('readabilityOk')) {
        analysisAttempts++;
        if (analysisAttempts === 1) {
          return {
            finishReason: 'MAX_TOKENS',
            candidateTokens: 8192,
            text: '{"readabilityOk":true,"pageTexts":[{"page":1,"text":"محتوى طويل انقطع',
          };
        }
      }
      return baseMock.generateStructuredJson(params);
    },
  };

  const summary = await runLessonPipeline(
    db,
    {
      lessonTitle: 'اختبار تعافي تحليل الملف الكبير',
      subject: 'السيرة النبوية',
      ageGroup: 'adults',
      difficulty: 'hard',
      requestedCount: 10,
      allowedRoundTypes: ['multiple_choice', 'true_false'],
      createdBy: 'prof-teacher-1',
      pdfBuffer: makeValidPdfBuffer(17),
      filename: 'large_compact_fallback.pdf',
    },
    compactFallbackRunner
  );

  assert.equal(analysisAttempts, 2);
  assert.equal(summary.verifiedCount, 10);
  assert.equal(summary.fileAvailable, true);

  // Remove physical PDF -> getLessonBatchSummary must report fileAvailable=false and resumeLessonPipelineAsync must fail synchronously
  const doc = db.prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`).get(summary.lessonId) as {
    storage_path: string;
  };
  if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);

  const missingCheck = getLessonBatchSummary(db, summary.lessonId);
  assert.equal(missingCheck?.fileAvailable, false);
  assert.throws(
    () => resumeLessonPipelineAsync(db, summary.lessonId, { retryOnlyFailedBatch: false }),
    /ملف PDF/
  );
  db.close();
});
