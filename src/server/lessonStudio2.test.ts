import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createDatabase } from './db';
import { seedDatabase } from './seed';
import {
  analyzeLessonPdfPhaseOne,
  applyQuestionReplacement,
  getLessonBatchSummary,
  previewQuestionAlternatives,
  QuotaExhaustedError,
  reestimateLessonPotential,
  startLessonGenerationFromAnalysis,
  type GeminiRunner,
} from './lessonStudio';
import type { QuestionAlternativeCandidate } from '../shared/types';

function makeValidPdfBuffer(pages = 6): Buffer {
  const pageEntries = Array.from({ length: pages }, (_, i) => `${i + 1} 0 obj << /Type /Page >> endobj`).join('\n');
  return Buffer.from(
    `%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n${pageEntries}\nBT /F1 12 Tf (Sulh al-Hudaybiyyah) Tj ET\n%%EOF`,
    'latin1'
  );
}

function createStudio2MockRunner(opts: {
  pages?: number;
  rejectFirstN?: number;
  quotaOnBatch?: number;
} = {}): {
  runner: GeminiRunner;
  stats: { analysisCalls: number; batchCalls: number; verifyCalls: number; previewCalls: number; prompts: string[] };
} {
  const pages = opts.pages ?? 6;
  const stats = { analysisCalls: 0, batchCalls: 0, verifyCalls: 0, previewCalls: 0, prompts: [] as string[] };
  let qCounter = 0;

  const runner: GeminiRunner = {
    async generateStructuredJson({ prompt }) {
      stats.prompts.push(prompt);

      if (prompt.includes('حلل ملف PDF المرفق')) {
        stats.analysisCalls++;
        return {
          finishReason: 'STOP',
          candidateTokens: 900,
          text: JSON.stringify({
            readabilityOk: true,
            readabilityNote: 'مقروء بالكامل',
            actualPageCount: pages,
            isReligiousContent: true,
            topics: [
              { title: 'مقدمات الحديبية', pageNumbers: [1, 2], keyConcepts: ['الرؤيا', 'ذو الحليفة'] },
              { title: 'المفاوضات وبنود الصلح', pageNumbers: [3, 4], keyConcepts: ['عروة بن مسعود', 'سهيل بن عمرو', 'الهدنة'] },
              { title: 'بيعة الرضوان والنتائج', pageNumbers: [5, 6], keyConcepts: ['الشجرة', 'سورة الفتح'] },
            ],
            pageSummaries: Array.from({ length: pages }, (_, i) => ({
              page: i + 1,
              summary: `ملخص موثق للصفحة ${i + 1} يتضمن أحداث صلح الحديبية وسببها.`,
              factsVsHypotheticals: 'حقائق تاريخية ثابتة بالسنة السادسة للهجرة.',
              tablesOrComparisons: i === 2 ? 'مقارنة بنود الصلح العاجلة والآجلة' : '',
              timelineEvents: `السنة 6 هـ - المحطة ${i + 1}`,
            })),
            pageTexts: Array.from({ length: pages }, (_, i) => ({
              page: i + 1,
              text: `نص موثق من صفحة ${i + 1} حول صلح الحديبية ومفاوضات قريش والصحابة في ذي الحليفة والحديبية.`,
            })),
            objectives: ['فهم أسباب خروج النبي صلى الله عليه وسلم معتمراً', 'استنتاج الدروس السياسية والتربوية من بنود الصلح'],
            estimatedMaxDistinctQuestions: 28,
            coverageSummary: 'تحليل متكامل لأحداث صلح الحديبية وبنوده ونتائجه.',
            directFacts: [
              { text: 'وقع صلح الحديبية في السنة السادسة للهجرة', page: 1 },
              { text: 'كان مفاوض قريش الرئيسي سهيل بن عمرو', page: 3 },
              { text: 'اتفق الطرفان على هدنة مدتها عشر سنوات', page: 4 },
              { text: 'سُميت البيعة تحت الشجرة بيعة الرضوان', page: 5 },
            ],
            causesAndEffects: [
              { cause: 'إشاعة مقتل عثمان بن عفان رضي الله عنه', effect: 'دعا النبي صلى الله عليه وسلم إلى بيعة الرضوان', page: 5 },
              { cause: 'هدنة عشر سنوات', effect: 'انتشر الإسلام وتفرغت الدعوة لمراسلة الملوك', page: 6 },
            ],
            eventsAndFigures: [
              { name: 'عثمان بن عفان', roleOrEvent: 'مبعوث النبي إلى قريش', timeHint: 'قبل البيعة', page: 5 },
              { name: 'سهيل بن عمرو', roleOrEvent: 'مفوض قريش لتوقيع الصلح', timeHint: 'المفاوضات', page: 3 },
              { name: 'عروة بن مسعود', roleOrEvent: 'مفاوض قريش الأول', timeHint: 'بداية التفاوض', page: 3 },
            ],
            listsAndClassifications: [
              { title: 'شروط صلح الحديبية الأساسية', items: ['هدنة عشر سنوات', 'الرجوع في العام نفسه', 'رد من يأتي من قريش دون إذن وليه'], page: 4 },
              { title: 'نتائج صلح الحديبية الدعوية', items: ['دخول أعداد كبيرة في الإسلام', 'أمن طرق الدعوة', 'مراسلة الملوك'], page: 6 },
            ],
            comparisons: [{ title: 'المظهر الظاهري والنتيجة البعيدة للصلح', sides: ['شدة الشروط ظاهرياً', 'فتح مبين على المدى البعيد'], page: 6 }],
            analyticalPoints: [{ point: 'لماذا وصف القرآن صلح الحديبية بالفتح المبين', page: 6 }],
            educationalValues: ['الانضباط القيادي', 'الحكمة في التفاوض'],
            suitableAgeGroups: ['teen_14_17', 'adults_18_plus'],
            contentDiversityScore: 86,
          }),
        };
      }

      if (prompt.includes('اقترح') && prompt.includes('بدائل')) {
        stats.previewCalls++;
        const altMatch = prompt.match(/اقترح\s+(\d+)\s+بدائل/);
        const count = altMatch ? Number(altMatch[1]) : 2;
        return {
          finishReason: 'STOP',
          candidateTokens: 500,
          text: JSON.stringify({
            alternatives: Array.from({ length: count }, (_, idx) => ({
              roundType: prompt.includes('تحويل') ? 'who_am_i' : 'multiple_choice',
              prompt: `سؤال بديل محسن (${idx + 1}) من صلح الحديبية: ما الدلالة التربوية لموقف ${qCounter + idx + 1}؟`,
              options: prompt.includes('تحويل') ? [] : [`الدلالة الصحيحة ${idx + 1}`, 'مشتت أ', 'مشتت ب', 'مشتت ج'],
              acceptableAnswers: [`الدلالة الصحيحة ${idx + 1}`],
              clues: prompt.includes('تحويل') ? ['شخصية مفاوضة في الحديبية', 'مثل قريش في صياغة البنود', 'اتفق على مدة الهدنة'] : [],
              correctIndex: prompt.includes('تحويل') ? null : 0,
              explanation: 'استنتاج مدعوم مباشرة من صفحة 4 في الدرس.',
              sourcePage: 4,
              sourceExcerpt: 'مقتطف موثق من صفحة 4 حول بنود صلح الحديبية.',
              learningObjective: 'استنتاج الدلالات التربوية لمفاوضات الحديبية',
              cognitiveLevel: 'analyze',
              difficulty: 'hard',
              answerCorrectnessReason: 'مذكور صراحة ضمن أحداث التفاوض صفحة 4.',
              gradingCriterion: 'ذكر الدلالة الاستراتيجية الصحيحة للهدنة.',
              isHypotheticalScenario: false,
            })),
          }),
        };
      }

      if (prompt.includes('أنت مدقق علمي مستقل')) {
        stats.verifyCalls++;
        const listStart = prompt.indexOf('[');
        const items = JSON.parse(prompt.slice(listStart)) as Array<{ index: number; prompt: string; sourceExcerpt: string }>;
        return {
          finishReason: 'STOP',
          candidateTokens: 250,
          text: JSON.stringify(
            items.map((item) => {
              const bad = item.prompt.includes('غير مدعوم') || item.sourceExcerpt.includes('خاطئ');
              return {
                index: item.index,
                supported: !bad,
                reason: bad ? 'غير مثبت في صفحة الدرس' : 'مثبت',
              };
            })
          ),
        };
      }

      // Batch generation
      stats.batchCalls++;
      if (opts.quotaOnBatch && stats.batchCalls >= opts.quotaOnBatch) {
        throw new QuotaExhaustedError('نفدت الحصة اليومية المجانية', { isDailyLimit: true, retryDelaySec: 3600 });
      }

      const targetMatch = prompt.match(/توليد\s+\*\*(\d+)\*\*/);
      const batchTarget = targetMatch ? Number(targetMatch[1]) : 5;
      const questions: Array<Record<string, unknown>> = [];

      for (let i = 0; i < batchTarget; i++) {
        qCounter++;
        const n = qCounter;
        const page = ((n - 1) % pages) + 1;
        const shouldFailGrounding = opts.rejectFirstN && n <= opts.rejectFirstN;

        questions.push({
          roundType: n % 2 === 0 ? 'true_false' : 'multiple_choice',
          prompt: shouldFailGrounding
            ? `سؤال غير مدعوم سيتم رفضه (${n})`
            : `سؤال موثق رقم (${n}) عن محاور صلح الحديبية في الصفحة ${page}؟`,
          options: n % 2 === 0 ? ['صح', 'خطأ'] : [`إجابة صحيحة ${n}`, `خيار أ-${n}`, `خيار ب-${n}`, `خيار ج-${n}`],
          acceptableAnswers: [n % 2 === 0 ? 'صح' : `إجابة صحيحة ${n}`],
          correctIndex: 0,
          explanation: `تفسير موثق صفحة ${page}.`,
          cognitiveSkill: 'analysis',
          cognitiveLevel: n % 3 === 0 ? 'analyze' : 'understand',
          learningObjective: n % 2 === 0 ? 'مقدمات الحديبية' : 'المفاوضات وبنود الصلح',
          answerCorrectnessReason: `مؤكد من نص الصفحة ${page}.`,
          gradingCriterion: `تطابق الإجابة مع النص في الصفحة ${page}.`,
          isHypotheticalScenario: false,
          sourcePage: page,
          sourceExcerpt: shouldFailGrounding ? 'مقتطف خاطئ غير موجود' : `مقتطف موثق من صفحة ${page} لسؤال ${n}.`,
          confidenceScore: 0.94,
          isReligious: true,
        });
      }

      return {
        finishReason: 'STOP',
        candidateTokens: 1100,
        text: JSON.stringify({
          questions,
          materialExhausted: false,
          exhaustionReason: '',
        }),
      };
    },
  };

  return { runner, stats };
}

test('Phase-1 auto-analysis builds Knowledge Map, Capacity & 12-Round Suitability with 0 questions and supports 0-LLM re-estimation', async () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const { runner, stats } = createStudio2MockRunner();

  const analyzed = await analyzeLessonPdfPhaseOne(
    db,
    {
      lessonTitle: 'صلح الحديبية — الاستوديو الذكي',
      subject: 'السيرة النبوية',
      ageGroup: 'adults_18_plus',
      difficulty: 'medium',
      createdBy: 'prof-teacher-1',
      pdfBuffer: makeValidPdfBuffer(6),
      filename: 'hudaybiyyah_s2.pdf',
    },
    runner
  );

  assert.equal(analyzed.pipelineStage, 'analyzed');
  assert.equal(analyzed.verifiedCount, 0);
  assert.equal(stats.analysisCalls, 1);
  assert.equal(stats.batchCalls, 0);
  assert.ok(analyzed.knowledgeMap && analyzed.knowledgeMap.mainConcepts.length >= 3);
  assert.ok(analyzed.capacityEstimate && analyzed.capacityEstimate.suggestedCount > 0);
  assert.equal(analyzed.roundSuitability?.length, 12);

  // Instant recalculation for kids + hard uses 0 Gemini calls
  const callsBefore = stats.analysisCalls + stats.batchCalls;
  const reestimated = reestimateLessonPotential(db, analyzed.lessonId, {
    ageGroup: 'kids_7_10',
    difficulty: 'hard',
    mode: 'custom',
    customCount: 8,
  });
  assert.equal(stats.analysisCalls + stats.batchCalls, callsBefore);
  assert.ok(
    reestimated.capacityEstimate!.estimatedMaxCount <= analyzed.capacityEstimate!.estimatedMaxCount
  );
  assert.equal(reestimated.generationPlanPreview?.targetCount, 8);

  const doc = db.prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`).get(analyzed.lessonId) as {
    storage_path: string;
  };
  if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
  db.close();
});

test('Compensation loop handles rejected items, complete_missing preserves existing, and generate_more expands bank', async () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const { runner } = createStudio2MockRunner({ rejectFirstN: 4 });

  const analyzed = await analyzeLessonPdfPhaseOne(
    db,
    {
      lessonTitle: 'اختبار التعويض والاستكمال',
      subject: 'السيرة النبوية',
      ageGroup: 'teen_14_17',
      difficulty: 'medium',
      createdBy: 'prof-teacher-1',
      pdfBuffer: makeValidPdfBuffer(6),
      filename: 'compensation_s2.pdf',
    },
    runner
  );

  // Start generation targeting 12 questions (first 4 candidates fail verification -> compensation reaches 12!)
  const afterGen = await startLessonGenerationFromAnalysis(db, analyzed.lessonId, {
    actionType: 'initial',
    mode: 'custom',
    customCount: 12,
    selectedRoundTypes: ['multiple_choice', 'true_false'],
    runner,
    sync: true,
  });

  assert.equal(afterGen.verifiedCount, 12);
  assert.equal(afterGen.rejectedCount, 4);
  assert.ok((afterGen.rejectedDetails?.length ?? 0) >= 4);

  const existingIdsBefore = new Set(
    (
      db.prepare(`SELECT id FROM questions WHERE bank_id = ?`).all(afterGen.bankId) as Array<{ id: string }>
    ).map((r) => r.id)
  );

  // Generate 5 more without touching existing 12
  const afterMore = await startLessonGenerationFromAnalysis(db, analyzed.lessonId, {
    actionType: 'generate_more',
    additionalCount: 5,
    prioritizeUndercoveredTopics: true,
    runner,
    sync: true,
  });

  assert.equal(afterMore.verifiedCount, 17);
  const afterMoreIds = new Set(
    (
      db.prepare(`SELECT id FROM questions WHERE bank_id = ?`).all(afterMore.bankId) as Array<{ id: string }>
    ).map((r) => r.id)
  );
  for (const oldId of existingIdsBefore) {
    assert.ok(afterMoreIds.has(oldId), `Existing question ${oldId} must be preserved during generate_more`);
  }

  // Delete 3 questions to simulate shortfall (14/17) then run complete_missing
  const toDelete = Array.from(afterMoreIds).slice(0, 3);
  for (const delId of toDelete) {
    db.prepare(`DELETE FROM questions WHERE id = ?`).run(delId);
  }
  const survivingIds = new Set(
    (
      db.prepare(`SELECT id FROM questions WHERE bank_id = ?`).all(afterMore.bankId) as Array<{ id: string }>
    ).map((r) => r.id)
  );
  assert.equal(survivingIds.size, 14);

  const afterComplete = await startLessonGenerationFromAnalysis(db, analyzed.lessonId, {
    actionType: 'complete_missing',
    runner,
    sync: true,
  });
  assert.equal(afterComplete.verifiedCount, 17);
  const finalIds = new Set(
    (
      db.prepare(`SELECT id FROM questions WHERE bank_id = ?`).all(afterComplete.bankId) as Array<{ id: string }>
    ).map((r) => r.id)
  );
  for (const sId of survivingIds) {
    assert.ok(finalIds.has(sId), `Surviving question ${sId} must remain intact after complete_missing`);
  }

  const doc = db.prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`).get(analyzed.lessonId) as {
    storage_path: string;
  };
  if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
  db.close();
});

test('Preview-Before-Replace & single-question improvement leave DB untouched until explicitly applied, and Quota stops cleanly', async () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const { runner } = createStudio2MockRunner();

  const analyzed = await analyzeLessonPdfPhaseOne(
    db,
    {
      lessonTitle: 'اختبار المعاينة والتحسين',
      subject: 'السيرة النبوية',
      ageGroup: 'adults_18_plus',
      difficulty: 'medium',
      createdBy: 'prof-teacher-1',
      pdfBuffer: makeValidPdfBuffer(6),
      filename: 'preview_s2.pdf',
    },
    runner
  );

  // Guard check: mark order_items unsuitable in doc to test guard explicitly
  db.prepare(
    `UPDATE lesson_documents SET round_suitability_json = ? WHERE lesson_id = ?`
  ).run(
    JSON.stringify([
      {
        roundType: 'order_items',
        nameAr: 'رتبها',
        descriptionAr: '',
        tier: 'unsuitable',
        tierLabelAr: 'غير مناسبة',
        expectedValidCount: 0,
        distinctContribution: 0,
        suitableDifficulty: 'medium',
        cognitiveSkillsAr: [],
        reasonAr: 'لا يوجد تسلسل زمني',
        recommendedSelected: false,
        selectable: false,
      },
    ]),
    analyzed.lessonId
  );

  await assert.rejects(
    async () => {
      await startLessonGenerationFromAnalysis(db, analyzed.lessonId, {
        actionType: 'initial',
        selectedRoundTypes: ['order_items'],
        runner,
        sync: true,
      });
    },
    /غير مناسبة/
  );

  // Restore clean suitability via reestimate and generate 6 questions
  reestimateLessonPotential(db, analyzed.lessonId, {});
  const gen = await startLessonGenerationFromAnalysis(db, analyzed.lessonId, {
    actionType: 'initial',
    mode: 'custom',
    customCount: 6,
    selectedRoundTypes: ['multiple_choice', 'true_false'],
    runner,
    sync: true,
  });
  assert.equal(gen.verifiedCount, 6);

  const firstQ = db
    .prepare(`SELECT id, prompt FROM questions WHERE bank_id = ? LIMIT 1`)
    .get(gen.bankId) as { id: string; prompt: string };

  // Preview 2 alternatives for improvement action 'more_analytical'
  const previews = await previewQuestionAlternatives(db, analyzed.lessonId, {
    questionIds: [firstQ.id],
    improvementAction: 'more_analytical',
    settings: { alternativeCount: 2 },
    runner,
  });
  assert.equal(previews.length, 1);
  assert.equal(previews[0].alternatives.length, 2);

  // Original in DB MUST remain untouched after preview!
  const unchangedQ = db
    .prepare(`SELECT prompt FROM questions WHERE id = ?`)
    .get(firstQ.id) as { prompt: string };
  assert.equal(unchangedQ.prompt, firstQ.prompt);

  // Apply candidate 2 -> DB updates cleanly
  const chosen: QuestionAlternativeCandidate = previews[0].alternatives[1];
  const applied = applyQuestionReplacement(db, analyzed.lessonId, {
    targetQuestionId: firstQ.id,
    candidate: chosen,
  });
  assert.equal(applied.question.prompt, chosen.prompt);
  assert.equal(applied.question.cognitiveLevel, 'analyze');

  // Verify Free Tier Quota stop during generate_more saves partial and sets honest stopReasonAr
  const quotaRunner = createStudio2MockRunner({ quotaOnBatch: 1 });
  const afterQuota = await startLessonGenerationFromAnalysis(db, analyzed.lessonId, {
    actionType: 'generate_more',
    additionalCount: 5,
    runner: quotaRunner.runner,
    sync: true,
  });
  assert.equal(afterQuota.pipelineStage, 'batch_paused');
  assert.equal(afterQuota.errorCategory, 'quota_exhausted');
  assert.ok(afterQuota.stopReasonAr && afterQuota.stopReasonAr.includes('الحصة'));
  assert.equal(getLessonBatchSummary(db, analyzed.lessonId)!.verifiedCount, 6);

  const doc = db.prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`).get(analyzed.lessonId) as {
    storage_path: string;
  };
  if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
  db.close();
});

test('Single-slice materialExhausted marks only assigned pages and compensation covers remaining unexhausted pages', async () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);

  // Verify buildLessonDistributionPlan creates disjoint initial page slices
  const { buildLessonDistributionPlan } = await import('./lessonStudio');
  const disjointPlan = buildLessonDistributionPlan({
    requestedCount: 24,
    difficulty: 'medium',
    allowedRoundTypes: ['multiple_choice', 'true_false'],
    analysis: {
      readabilityOk: true,
      readabilityNote: '',
      actualPageCount: 12,
      isReligiousContent: true,
      topics: [{ title: 'محور عام', pageNumbers: [1, 2, 3, 4, 5, 6], keyConcepts: [] }],
      pageSummaries: [],
      pageTexts: [],
      objectives: [],
      estimatedMaxDistinctQuestions: 24,
      coverageSummary: '',
    },
  });
  const seenInitialPages = new Set<number>();
  for (const slot of disjointPlan) {
    for (const p of slot.assignedPages) {
      assert.equal(seenInitialPages.has(p), false, `Page ${p} overlapped across initial batches`);
      seenInitialPages.add(p);
    }
  }

  let qSeq = 0;
  let exhaustEarlySliceOnce = false;
  const baseRunner = createStudio2MockRunner({ pages: 6 }).runner;

  const partialExhaustRunner: GeminiRunner = {
    async generateStructuredJson(req) {
      if (req.prompt.includes('حلل ملف PDF المرفق') || req.prompt.includes('أنت مدقق علمي مستقل')) {
        return baseRunner.generateStructuredJson(req);
      }
      // First batch covering early pages [1, 2] returns only 2 questions with materialExhausted=true
      if (!exhaustEarlySliceOnce && req.prompt.includes('الصفحات المخصصة: 1')) {
        exhaustEarlySliceOnce = true;
        return {
          finishReason: 'STOP',
          candidateTokens: 400,
          text: JSON.stringify({
            questions: [1, 2].map((p) => {
              qSeq++;
              return {
                roundType: 'multiple_choice',
                prompt: `سؤال تمهيدي موثق (${qSeq}) من الصفحة ${p}؟`,
                options: [`إجابة ${qSeq}`, 'خيار ب', 'خيار ج', 'خيار د'],
                acceptableAnswers: [`إجابة ${qSeq}`],
                correctIndex: 0,
                explanation: `تفسير موثق صفحة ${p}.`,
                sourcePage: p,
                sourceExcerpt: `مقتطف موثق من صفحة ${p}.`,
                confidenceScore: 0.92,
                isReligious: true,
              };
            }),
            materialExhausted: true,
            exhaustionReason: 'تمت تغطية صفحات المقدمة بالكامل.',
          }),
        };
      }

      // Subsequent batches on remaining pages 3..6 succeed and compensate up to target 12!
      const targetMatch = req.prompt.match(/توليد\s+\*\*(\d+)\*\*/);
      const count = targetMatch ? Number(targetMatch[1]) : 4;
      const pageMatch = req.prompt.match(/الصفحات المخصصة:\s*([^\n]+)/);
      const parsedPages = pageMatch
        ? pageMatch[1]
            .split(/[^\d]+/)
            .map(Number)
            .filter((n) => n >= 1 && n <= 6)
        : [3, 4, 5, 6];
      const activePages = parsedPages.length > 0 ? parsedPages : [3, 4, 5, 6];

      const questions = Array.from({ length: count }, (_, idx) => {
        qSeq++;
        const p = activePages[idx % activePages.length];
        return {
          roundType: qSeq % 2 === 0 ? 'true_false' : 'multiple_choice',
          prompt: `سؤال عميق فريد (${qSeq}) مستخرج من الصفحة ${p} في صلح الحديبية؟`,
          options: qSeq % 2 === 0 ? ['صح', 'خطأ'] : [`إجابة صحيحة ${qSeq}`, `خيار أ-${qSeq}`, `خيار ب-${qSeq}`, `خيار ج-${qSeq}`],
          acceptableAnswers: [qSeq % 2 === 0 ? 'صح' : `إجابة صحيحة ${qSeq}`],
          correctIndex: 0,
          explanation: `موثق من صفحة ${p}.`,
          sourcePage: p,
          sourceExcerpt: `مقتطف موثق من صفحة ${p} رقم ${qSeq}.`,
          confidenceScore: 0.94,
          isReligious: true,
        };
      });

      return {
        finishReason: 'STOP',
        candidateTokens: 900,
        text: JSON.stringify({ questions, materialExhausted: false, exhaustionReason: '' }),
      };
    },
  };

  const analyzed = await analyzeLessonPdfPhaseOne(
    db,
    {
      lessonTitle: 'اختبار استكمال الصفحات غير المستنفدة',
      subject: 'السيرة النبوية',
      ageGroup: 'adults_18_plus',
      difficulty: 'medium',
      createdBy: 'prof-teacher-1',
      pdfBuffer: makeValidPdfBuffer(6),
      filename: 'partial_exhaust_s2.pdf',
    },
    partialExhaustRunner
  );

  const generated = await startLessonGenerationFromAnalysis(db, analyzed.lessonId, {
    actionType: 'initial',
    mode: 'custom',
    customCount: 12,
    selectedRoundTypes: ['multiple_choice', 'true_false'],
    runner: partialExhaustRunner,
    sync: true,
  });

  assert.equal(exhaustEarlySliceOnce, true);
  assert.equal(generated.verifiedCount, 12, `Expected pipeline to continue across pages 3..6 and reach 12, got ${generated.verifiedCount}`);

  const doc = db.prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`).get(analyzed.lessonId) as {
    storage_path: string;
  };
  if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
  db.close();
});

