import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDatabase } from './db';
import {
  type GeminiRunner,
  type LessonStreamEvent,
  runLessonPipeline,
  subscribeToLessonStream,
} from './lessonStudio';
import { seedDatabase } from './seed';
import type { RoundType } from '../shared/types';

function makeValidPdfBuffer(pageCount = 17, tag = 'A'): Buffer {
  const pages = Array.from({ length: pageCount }, (_, i) => `${i + 1} 0 obj << /Type /Page /Font << >> >> endobj`).join('\n');
  return Buffer.from(`%PDF-1.4\n${pages}\nBT (Sulh al-Hudaybiyyah Benchmark ${tag}) Tj ET\n%%EOF`, 'latin1');
}

function createLatencyModeledRunner(options: {
  pdfUploadMs?: number;
  sliceGenerateMs?: number;
  verifyMs?: number;
} = {}): {
  runner: GeminiRunner;
  metrics: {
    analysisCalls: number;
    batchCallsWithPdf: number;
    batchCallsWithTextSliceOnly: number;
    verifyFlashLiteCalls: number;
    verifyPrimaryCalls: number;
  };
} {
  const pdfUploadMs = options.pdfUploadMs ?? 95;
  const sliceGenerateMs = options.sliceGenerateMs ?? 28;
  const verifyMs = options.verifyMs ?? 12;

  const metrics = {
    analysisCalls: 0,
    batchCallsWithPdf: 0,
    batchCallsWithTextSliceOnly: 0,
    verifyFlashLiteCalls: 0,
    verifyPrimaryCalls: 0,
  };

  let qCounter = 0;

  const runner: GeminiRunner = {
    async generateStructuredJson({ pdfBase64, pageSliceText, model, prompt }) {
      // Analysis call
      if (prompt.includes('readabilityOk')) {
        metrics.analysisCalls++;
        await new Promise((r) => setTimeout(r, pdfUploadMs));
        return {
          finishReason: 'STOP',
          candidateTokens: 650,
          text: JSON.stringify({
            readabilityOk: true,
            readabilityNote: 'ملف عربي واضح من 17 صفحة حول صلح الحديبية.',
            actualPageCount: 17,
            isReligiousContent: true,
            topics: [
              { title: 'بداية الخروج والرؤيا', pageNumbers: [1, 2, 3, 4], keyConcepts: ['الإحرام', 'ذي الحليفة'] },
              { title: 'المفاوضات وبيعة الرضوان', pageNumbers: [5, 6, 7, 8, 9], keyConcepts: ['عثمان بن عفان', 'بيعة الرضوان'] },
              { title: 'بنود المعاهدة وتحليلها', pageNumbers: [10, 11, 12, 13], keyConcepts: ['هدنة عشر سنين', 'رد من جاء مسلماً'] },
              { title: 'التحلل وسورة الفتح', pageNumbers: [14, 15, 16, 17], keyConcepts: ['أم سلمة', 'سورة الفتح'] },
            ],
            pageSummaries: Array.from({ length: 17 }, (_, i) => ({
              page: i + 1,
              summary: `ملخص علمي مركز للصفحة ${i + 1} من صلح الحديبية.`,
              factsVsHypotheticals: `حقائق صفحة ${i + 1}`,
              tablesOrComparisons: i % 2 === 0 ? `مقارنة صفحة ${i + 1}` : '',
              timelineEvents: `ترتيب زمني صفحة ${i + 1}`,
            })),
            pageTexts: Array.from({ length: 17 }, (_, i) => ({
              page: i + 1,
              text: `نص موثق للصفحة ${i + 1} يتضمن أحداث صلح الحديبية في السنة السادسة للهجرة ومفاوضات سهيل بن عمرو ومواقف الصحابة.`,
            })),
            objectives: ['استنتاج الحكمة السياسية من بنود الحديبية', 'تتبع التسلسل الزمني للأحداث'],
            estimatedMaxDistinctQuestions: 80,
            coverageSummary: 'ملف شامل عن صلح الحديبية.',
          }),
        };
      }

      // Independent verification call
      if (prompt.includes('أنت مدقق علمي مستقل')) {
        if (model === 'gemini-3.1-flash-lite') metrics.verifyFlashLiteCalls++;
        else metrics.verifyPrimaryCalls++;
        await new Promise((r) => setTimeout(r, verifyMs));
        const listMatch = prompt.match(/القائمة:\n([\s\S]*)$/);
        const arr = listMatch ? (JSON.parse(listMatch[1]) as Array<{ index: number; sourcePage: number }>) : [];
        return {
          finishReason: 'STOP',
          candidateTokens: 160,
          text: JSON.stringify(
            arr.map((item) => ({
              index: item.index,
              supported: true,
              correctedPage: item.sourcePage,
              reason: 'مطابق للنص المرجعي.',
            }))
          ),
        };
      }

      // Batch generation call
      if (pdfBase64) metrics.batchCallsWithPdf++;
      else if (pageSliceText && pageSliceText.length > 0) metrics.batchCallsWithTextSliceOnly++;

      await new Promise((r) => setTimeout(r, pdfBase64 ? pdfUploadMs : sliceGenerateMs));

      const countMatch = prompt.match(/توليد \*\*(\d+)\*\*/);
      const reqInBatch = countMatch ? Number(countMatch[1]) : 8;
      const roundCycle: RoundType[] = ['multiple_choice', 'true_false', 'fill_blank', 'who_am_i'];

      const generated = Array.from({ length: reqInBatch }, () => {
        const n = ++qCounter;
        const page = ((n - 1) % 17) + 1;
        const rt = roundCycle[(n - 1) % roundCycle.length];
        if (rt === 'multiple_choice') {
          return {
            roundType: 'multiple_choice',
            prompt: `سؤال سرعة وتحليل (${n}) حول صلح الحديبية صفحة ${page}: ما الأثر المباشر للبند ${n}؟`,
            options: [`أثر موثق ${n}`, `خيار غير صحيح ${n}ب`, `خيار غير صحيح ${n}ج`, `خيار غير صحيح ${n}د`],
            acceptableAnswers: [`أثر موثق ${n}`],
            correctIndex: 0,
            explanation: `مثبت في الصفحة ${page}.`,
            cognitiveSkill: 'analysis',
            sourcePage: page,
            sourceExcerpt: `مقتطف موثق من صفحة ${page} للبند رقم ${n}.`,
            confidenceScore: 0.95,
            isReligious: true,
          };
        }
        if (rt === 'true_false') {
          return {
            roundType: 'true_false',
            prompt: `سؤال (${n}): وقع الحدث التفاوضي رقم ${n} في صلح الحديبية خلال ذي القعدة (صفحة ${page}).`,
            options: ['صح', 'خطأ'],
            acceptableAnswers: ['صح'],
            correctIndex: 0,
            explanation: `مثبت زمنياً صفحة ${page}.`,
            cognitiveSkill: 'chronology',
            sourcePage: page,
            sourceExcerpt: `نص زمني موثق صفحة ${page} رقم ${n}.`,
            confidenceScore: 0.94,
            isReligious: true,
          };
        }
        if (rt === 'who_am_i') {
          return {
            roundType: 'who_am_i',
            prompt: `سؤال (${n}): من الشخصية المرتبطة بالموقف رقم ${n} في صلح الحديبية صفحة ${page}؟`,
            clues: [`إشارة أولى ${n}`, `إشارة ثانية صفحة ${page}`, `إشارة حاسمة ${n}`],
            acceptableAnswers: [`صحابي الموقف ${n}`],
            explanation: `مذكور صفحة ${page}.`,
            cognitiveSkill: 'inference',
            sourcePage: page,
            sourceExcerpt: `وصف الموقف ${n} في صفحة ${page}.`,
            confidenceScore: 0.91,
            isReligious: true,
          };
        }
        return {
          roundType: 'fill_blank',
          prompt: `سؤال (${n}): أكمل العبارة الموثقة في صلح الحديبية صفحة ${page} للمشهد رقم ${n}: ___`,
          options: [],
          acceptableAnswers: [`الكلمة الموثقة ${n}`],
          explanation: `وردت نصاً في صفحة ${page}.`,
          cognitiveSkill: 'recall',
          sourcePage: page,
          sourceExcerpt: `عبارة أصلية صفحة ${page} رقم ${n}.`,
          confidenceScore: 0.93,
          isReligious: true,
        };
      });

      return {
        finishReason: 'STOP',
        candidateTokens: 900,
        text: JSON.stringify({
          questions: generated,
          materialExhausted: false,
          exhaustionReason: '',
        }),
      };
    },
  };

  return { runner, metrics };
}

test('Speedup & SSE Streaming Benchmark: 50 questions use pageSliceText, flash-lite verify, parallel pool, and SHA-256 cache', async () => {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const { runner, metrics } = createLatencyModeledRunner();
  const pdf = makeValidPdfBuffer(17, 'SPEED');

  const events: Array<{ type: LessonStreamEvent['type']; atMs: number; verifiedCount: number; newCount: number }> = [];
  const t0 = Date.now();

  // First run: 50 questions on 17-page PDF
  // Subscribe to stream before launching runLessonPipeline? We don't have lessonId before createLessonBatchJob,
  // so run via runLessonPipeline & also capture second-run SSE directly on a created job.
  const summary1 = await runLessonPipeline(
    db,
    {
      lessonTitle: 'صلح الحديبية — قياس السرعة 50 سؤالاً',
      subject: 'السيرة النبوية',
      ageGroup: 'teen_14_17',
      difficulty: 'hard',
      requestedCount: 50,
      allowedRoundTypes: ['multiple_choice', 'true_false', 'fill_blank', 'who_am_i'],
      createdBy: 'prof-teacher-1',
      pdfBuffer: pdf,
      filename: 'صلح_الحديبية_سريع.pdf',
    },
    runner
  );
  const run1Elapsed = Date.now() - t0;

  assert.equal(summary1.verifiedCount, 50);
  assert.equal(metrics.analysisCalls, 1, 'PDF binary uploaded only once for analysis');
  assert.equal(metrics.batchCallsWithPdf, 0, 'Zero batch calls re-upload full PDF when pageTexts exist');
  assert.ok(metrics.batchCallsWithTextSliceOnly >= 6, `Expected >=6 text-slice batch calls, got ${metrics.batchCallsWithTextSliceOnly}`);
  assert.ok(metrics.verifyFlashLiteCalls >= 6, 'Verification pass routed to fast gemini-3.1-flash-lite');

  // Verify parallel wall-clock speedup vs sequential full-PDF baseline (1 analysis + 8*95ms batches + 8*verify ~ >= 950ms sequential)
  const theoreticalSequentialFullPdfMs = 95 + metrics.batchCallsWithTextSliceOnly * 95 + metrics.verifyFlashLiteCalls * 12;
  assert.ok(
    run1Elapsed < theoreticalSequentialFullPdfMs * 0.6,
    `Expected parallel+slice run (${run1Elapsed}ms) to be significantly faster than sequential full-PDF (${theoreticalSequentialFullPdfMs}ms)`
  );

  // Second run with identical PDF buffer -> must hit global SHA-256 pdf_analysis_cache (0 new analysis calls!)
  const { runner: runner2, metrics: metrics2 } = createLatencyModeledRunner();
  const { createLessonBatchJob, processLessonBatches } = await import('./lessonStudio');
  const job2 = createLessonBatchJob(db, {
    lessonTitle: 'صلح الحديبية — تشغيل ثانٍ مخبأ',
    subject: 'السيرة النبوية',
    ageGroup: 'adults_18_plus',
    difficulty: 'medium',
    requestedCount: 50,
    allowedRoundTypes: ['multiple_choice', 'true_false', 'fill_blank'],
    createdBy: 'prof-teacher-1',
    pdfBuffer: pdf,
    filename: 'صلح_الحديبية_مخبأ.pdf',
  });

  const t1 = Date.now();
  const unsub = subscribeToLessonStream(job2.lessonId, (ev) => {
    events.push({
      type: ev.type,
      atMs: Date.now() - t1,
      verifiedCount: ev.lesson.verifiedCount,
      newCount: ev.newQuestions?.length ?? 0,
    });
  });

  const summary2 = await processLessonBatches({
    db,
    lessonId: job2.lessonId,
    allowedRoundTypes: ['multiple_choice', 'true_false', 'fill_blank'],
    runner: runner2,
  });
  unsub();

  assert.equal(summary2.verifiedCount, 50);
  assert.equal(metrics2.analysisCalls, 0, 'Global SHA-256 cache hit skips Gemini PDF analysis completely');
  assert.equal(summary2.cacheHit, true);

  // SSE streaming delivers Batch 1 progressively well before final completion
  const firstBatchEvent = events.find((e) => e.type === 'batch_saved' && e.newCount > 0);
  const doneEvent = events.find((e) => e.type === 'done');
  assert.ok(firstBatchEvent, 'Expected progressive batch_saved SSE event');
  assert.ok(doneEvent, 'Expected done SSE event');
  assert.ok(firstBatchEvent.atMs <= doneEvent.atMs, 'First batch arrived progressively before completion');

  // Verify zero duplicate prompts
  const prompts = (
    db.prepare(`SELECT prompt FROM questions WHERE bank_id = ?`).all(summary2.bankId) as Array<{ prompt: string }>
  ).map((r) => r.prompt);
  assert.equal(new Set(prompts).size, 50);

  // Cleanup temp PDF files
  const docs = db
    .prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id IN (?, ?)`)
    .all(summary1.lessonId, job2.lessonId) as Array<{ storage_path: string }>;
  for (const d of docs) {
    if (d.storage_path && fs.existsSync(d.storage_path)) fs.unlinkSync(d.storage_path);
  }
  db.close();
});
