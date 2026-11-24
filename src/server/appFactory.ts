import type { EventV2 } from '../shared/challengeV2';
import { prepareMatchV2 } from './challengeV2/planner';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import multer from 'multer';
import type Database from 'better-sqlite3';
import {
  ALLOWED_AI_MODELS,
  applyQuestionReplacement,
  cancelLessonPipeline,
  getConfiguredAiModel,
  getLessonBatchSummary,
  previewQuestionAlternatives,
  reestimateLessonPotential,
  regenerateRejectedForLesson,
  resumeLessonPipelineAsync,
  setConfiguredAiModel,
  startLessonAnalyzeAsync,
  startLessonGenerationFromAnalysis,
  startLessonPipelineAsync,
  subscribeToLessonStream,
} from './lessonStudio';
import { getBankAvailability, rowToQuestionRecord } from './questionSelection';
import {
  attachOptionalAuth,
  type AuthedRequest,
  issueAuthToken,
  type ProfileRow,
  requireAuth,
  requireRole,
  toPublicProfile,
} from './rbac';
import { GameSessionHub } from './wsHub';
import {
  BotGeminiError,
  type BotChatMessage,
  callJordanianBotGemini,
  getLocalJordanianGuideReply,
  generateNashmiContent,
} from './botService';
import { difficultyToLevel, normalizeAgeGroup } from '../shared/gameRules';
import { JORDANIAN_BOT_DEFAULT_NAME } from '../shared/jordanianBot';
import { buildQuestionHash, parseCsvQuestions, validateAndDeduplicateImport } from '../shared/questionSchema';
import type {
  AgeGroup,
  BotSkillLevel,
  Difficulty,
  DifficultyLevel,
  LessonDistributionMode,
  LessonGenerationMode,
  QuestionAlternativeCandidate,
  QuestionImprovementAction,
  RegenerationSettings,
  RejectedQuestionLog,
  RoundConfig,
  RoundType,
  SessionSettings,
} from '../shared/types';

function decodeUploadedFilename(rawName: string): string {
  if (!rawName) return 'lesson.pdf';
  try {
    // Multer decodes multipart filenames as latin1 by default; recover UTF-8 Arabic characters cleanly when present
    if (/[\u00C0-\u00FF]/.test(rawName) && !/[\u0600-\u06FF]/.test(rawName)) {
      const utf8 = Buffer.from(rawName, 'latin1').toString('utf8');
      if (/[\u0600-\u06FF]/.test(utf8) || !utf8.includes('\uFFFD')) {
        return utf8;
      }
    }
  } catch {
    // Fallback to rawName
  }
  return rawName;
}

export function createAppAndHub(db: Database.Database) {
  const hub = new GameSessionHub(db);
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use(attachOptionalAuth(db));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
  });

  // ================= AUTH & PROFILES =================

  app.post('/api/auth/register', (req, res) => {
    const { username, displayName, password, ageGroup, avatarId } = req.body as {
      username?: string;
      displayName?: string;
      password?: string;
      ageGroup?: AgeGroup;
      avatarId?: string;
    };

    const cleanUser = (username || '').trim().toLowerCase();
    const cleanName = (displayName || '').trim();
    const cleanPass = (password || '').trim();

    if (cleanUser.length < 3 || !/^[a-z0-9_.-]+$/.test(cleanUser)) {
      res.status(400).json({ error: 'اسم المستخدم المستعار يجب أن يكون 3 أحرف إنجليزية أو أرقام على الأقل' });
      return;
    }
    if (cleanName.length < 2) {
      res.status(400).json({ error: 'يرجى كتابة اسم عرض مناسب' });
      return;
    }
    if (cleanPass.length < 4) {
      res.status(400).json({ error: 'رمز الدخول يجب أن لا يقل عن 4 خانات' });
      return;
    }

    const exists = db.prepare(`SELECT 1 FROM profiles WHERE username = ?`).get(cleanUser);
    if (exists) {
      res.status(409).json({ error: 'اسم المستخدم مسجل مسبقاً، اختر اسماً آخر' });
      return;
    }

    const validAges: AgeGroup[] = [
      'kids_7_10',
      'preteen_11_13',
      'teen_14_17',
      'adults_18_plus',
      'family',
      'kids',
      'youth',
      'adults',
    ];
    const safeAge: AgeGroup = validAges.includes(ageGroup as AgeGroup)
      ? normalizeAgeGroup(ageGroup)
      : 'teen_14_17';
    const id = `prof-${crypto.randomUUID().slice(0, 8)}`;
    const hash = bcrypt.hashSync(cleanPass, 8);

    db.prepare(
      `INSERT INTO profiles (id, username, display_name, password_hash, role, age_group, avatar_id, achievements_json)
       VALUES (?, ?, ?, ?, 'player', ?, ?, ?)`
    ).run(id, cleanUser, cleanName, hash, safeAge, avatarId || 'crescent', JSON.stringify(['عضو جديد']));

    const row = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(id) as ProfileRow;
    const token = issueAuthToken(db, id);
    res.status(201).json({ token, profile: toPublicProfile(row) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body as { identifier?: string; password?: string };
    const cleanId = (identifier || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();
    if (!cleanId || !cleanPass) {
      res.status(400).json({ error: 'أدخل اسم المستخدم/البريد ورمز الدخول' });
      return;
    }

    const row = db
      .prepare(`SELECT * FROM profiles WHERE LOWER(username) = ? OR LOWER(email) = ?`)
      .get(cleanId, cleanId) as ProfileRow | undefined;

    if (!row || !bcrypt.compareSync(cleanPass, row.password_hash)) {
      res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      return;
    }

    const token = issueAuthToken(db, row.id);
    res.json({ token, profile: toPublicProfile(row) });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const freshRow = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(userId) as ProfileRow | undefined;
    if (!freshRow) {
      res.status(404).json({ error: 'الحساب غير موجود' });
      return;
    }
    const recentAnswers = db
      .prepare(
        `SELECT a.is_correct, a.points_delta, a.created_at, q.category, q.difficulty, q.round_type
         FROM answers a
         JOIN questions q ON q.id = a.question_id
         WHERE a.profile_id = ?
         ORDER BY a.created_at DESC
         LIMIT 20`
      )
      .all(userId);
    const exposedCount = (
      db.prepare(`SELECT COUNT(*) as c FROM question_exposures WHERE profile_id = ?`).get(userId) as { c: number }
    ).c;

    res.json({
      profile: toPublicProfile(freshRow),
      exposedCount,
      recentAnswers,
    });
  });

  app.get('/api/leaderboard', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT id, display_name, avatar_id, age_group, xp, total_correct
         FROM profiles
         WHERE role IN ('player', 'teacher')
         ORDER BY xp DESC, total_correct DESC
         LIMIT 15`
      )
      .all();
    res.json({ leaderboard: rows });
  });

  // ================= BANKS & QUESTION IMPORTER (ADMIN / TEACHER) =================

  app.get('/api/banks', (_req, res) => {
    const banks = db
      .prepare(
        `SELECT b.*,
                (SELECT COUNT(*) FROM questions q WHERE q.bank_id = b.id AND q.status = 'published') as published_count,
                (SELECT COUNT(*) FROM questions q WHERE q.bank_id = b.id AND q.status = 'needs_review') as needs_review_count
         FROM question_banks b
         WHERE b.is_active = 1
         ORDER BY b.source_type ASC, b.created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    const categories = (
      db
        .prepare(`SELECT DISTINCT category FROM questions WHERE status = 'published' ORDER BY category`)
        .all() as Array<{ category: string }>
    ).map((r) => r.category);

    res.json({
      banks: banks.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        category: b.category,
        sourceType: b.source_type,
        lessonId: b.lesson_id,
        version: b.version,
        isActive: Number(b.is_active) === 1,
        publishedCount: Number(b.published_count || 0),
        needsReviewCount: Number(b.needs_review_count || 0),
        createdAt: b.created_at,
      })),
      categories,
    });
  });

  app.get('/api/questions/availability', (req: AuthedRequest, res) => {
    const bankId = String(req.query.bankId || 'bank-general-mosque');
    const ageGroup = normalizeAgeGroup(String(req.query.ageGroup || 'family'));
    const difficulty = (String(req.query.difficulty || 'mixed') as Difficulty | 'mixed');
    const category = req.query.category ? String(req.query.category) : undefined;
    const categories = req.query.categories
      ? String(req.query.categories)
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
      : undefined;
    const participantIds = req.user ? [req.user.id] : [];

    const availability = getBankAvailability(db, {
      bankId,
      ageGroup,
      difficulty,
      category,
      categories,
      participantProfileIds: participantIds,
      exactRounds: true,
    });
    res.json(availability);
  });

  app.get('/api/settings/ai-model', requireRole(['admin', 'teacher']), (_req, res) => {
    const model = getConfiguredAiModel(db);
    res.json({
      model,
      allowedModels: ALLOWED_AI_MODELS,
      freeTierNoticeAr:
        'يستخدم استوديو PDF حصرياً نماذج Gemini Flash ضمن الحصة المجانية (Free Tier) بحدود طلبات يومية ولحظية ليست بلا حدود، ولا يُستخدم الذكاء الاصطناعي أثناء المباريات العادية إطلاقاً.',
    });
  });

  app.put('/api/settings/ai-model', requireRole(['admin', 'teacher']), (req, res) => {
    try {
      const { model } = req.body as { model?: string };
      const updated = setConfiguredAiModel(db, String(model || ''));
      res.json({
        model: updated,
        allowedModels: ALLOWED_AI_MODELS,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'النموذج المختار غير مدعوم' });
    }
  });

  app.get('/api/banks/:bankId/questions', requireRole(['admin', 'teacher']), (req, res) => {
    const { bankId } = req.params;
    const statusFilter = req.query.status as string | undefined;
    const search = ((req.query.q as string) || '').trim();
    const limit = Math.min(200, Math.max(10, Number(req.query.limit || 100)));

    let sql = `SELECT * FROM questions WHERE bank_id = ?`;
    const params: unknown[] = [bankId];
    if (statusFilter && statusFilter !== 'all') {
      sql += ` AND status = ?`;
      params.push(statusFilter);
    }
    if (search) {
      sql += ` AND (prompt LIKE ? OR category LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Parameters<typeof rowToQuestionRecord>[0][];
    res.json({ questions: rows.map(rowToQuestionRecord) });
  });

  app.post('/api/banks/:bankId/import', requireRole(['admin', 'teacher']), (req, res) => {
    const { bankId } = req.params;
    const bank = db.prepare(`SELECT id, version FROM question_banks WHERE id = ?`).get(bankId) as
      | { id: string; version: number }
      | undefined;
    if (!bank) {
      res.status(404).json({ error: 'بنك الأسئلة غير موجود' });
      return;
    }

    let items: unknown[] = [];
    if (Array.isArray(req.body.questions)) {
      items = req.body.questions;
    } else if (typeof req.body.csvText === 'string') {
      items = parseCsvQuestions(req.body.csvText);
    } else {
      res.status(400).json({ error: 'يرجى إرسال مصفوفة أسئلة JSON أو نص CSV صالح' });
      return;
    }

    const existingIds = new Set(
      (
        db
          .prepare(`SELECT external_id FROM questions WHERE bank_id = ? AND external_id IS NOT NULL`)
          .all(bankId) as Array<{ external_id: string }>
      ).map((r) => r.external_id)
    );
    const existingHashes = new Set(
      (
        db.prepare(`SELECT normalized_hash FROM questions WHERE bank_id = ?`).all(bankId) as Array<{
          normalized_hash: string;
        }>
      ).map((r) => r.normalized_hash)
    );
    const existingPrompts = (
      db
        .prepare(`SELECT prompt FROM questions WHERE bank_id = ? ORDER BY created_at DESC LIMIT 300`)
        .all(bankId) as Array<{ prompt: string }>
    ).map((r) => r.prompt);

    const report = validateAndDeduplicateImport(items, existingIds, existingHashes, existingPrompts);

    const insertQ = db.prepare(`
      INSERT INTO questions (
        id, bank_id, external_id, round_type, category, age_group, difficulty,
        difficulty_level, unsuitable_for_timed,
        prompt, options_json, acceptable_answers_json, correct_index, explanation,
        clues_json, order_criteria, memory_items_json, memory_reveal_seconds,
        odd_reason, is_religious, status, source_page, source_excerpt,
        confidence_score, normalized_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertBatchTx = db.transaction(() => {
      for (const q of report.accepted) {
        insertQ.run(
          `q-${crypto.randomUUID().slice(0, 10)}`,
          bankId,
          q.externalId ?? null,
          q.roundType,
          q.category,
          normalizeAgeGroup(q.ageGroup),
          q.difficulty,
          q.difficultyLevel ?? difficultyToLevel(q.difficulty),
          q.unsuitableForTimed ? 1 : 0,
          q.prompt,
          JSON.stringify(q.options),
          JSON.stringify(q.acceptableAnswers),
          q.correctIndex ?? null,
          q.explanation ?? '',
          JSON.stringify(q.clues ?? []),
          q.orderCriteria ?? '',
          JSON.stringify(q.memoryItems ?? []),
          q.memoryRevealSeconds ?? 8,
          q.oddReason ?? '',
          q.isReligious ? 1 : 0,
          q.status,
          q.sourcePage ?? null,
          q.sourceExcerpt ?? null,
          q.confidenceScore ?? null,
          q.normalizedHash
        );
      }
      db.prepare(`UPDATE question_banks SET version = version + 1 WHERE id = ?`).run(bankId);
    });
    insertBatchTx();

    res.json({
      report: {
        totalReceived: report.totalReceived,
        validCount: report.validCount,
        publishedCount: report.publishedCount,
        needsReviewCount: report.needsReviewCount,
        duplicateRejectedCount: report.duplicateRejectedCount,
        errorCount: report.errorCount,
        issues: report.issues,
        distribution: report.distribution,
        newBankVersion: bank.version + 1,
      },
    });
  });

  app.patch('/api/questions/:questionId', requireRole(['admin', 'teacher']), (req: AuthedRequest, res) => {
    const { questionId } = req.params;
    const existing = db.prepare(`SELECT * FROM questions WHERE id = ?`).get(questionId) as
      | (Parameters<typeof rowToQuestionRecord>[0] & { status: string })
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'السؤال غير موجود' });
      return;
    }

    const {
      prompt,
      options,
      acceptableAnswers,
      explanation,
      status,
      difficulty,
      difficultyLevel,
      unsuitableForTimed,
      rejectionReason,
    } = req.body as {
      prompt?: string;
      options?: string[];
      acceptableAnswers?: string[];
      explanation?: string;
      status?: 'published' | 'needs_review' | 'archived' | 'rejected';
      difficulty?: Difficulty;
      difficultyLevel?: DifficultyLevel;
      unsuitableForTimed?: boolean;
      rejectionReason?: string;
    };

    const nextPrompt = prompt?.trim() || existing.prompt;
    const nextAnswers = acceptableAnswers?.length
      ? acceptableAnswers
      : (JSON.parse(existing.acceptable_answers_json) as string[]);
    const nextOptions = options ?? (JSON.parse(existing.options_json) as string[]);
    const nextStatus = status || existing.status;
    const nextDifficulty = difficulty ?? existing.difficulty;
    const nextLevel = difficultyLevel ?? existing.difficulty_level ?? difficultyToLevel(nextDifficulty);
    const nextUnsuitable =
      typeof unsuitableForTimed === 'boolean' ? (unsuitableForTimed ? 1 : 0) : Number(existing.unsuitable_for_timed || 0);
    const nextRejectionReason =
      typeof rejectionReason === 'string'
        ? rejectionReason.trim()
        : nextStatus === 'rejected'
        ? 'رفضه المعلم أثناء المراجعة'
        : '';

    db.prepare(
      `UPDATE questions
       SET prompt = ?, options_json = ?, acceptable_answers_json = ?, explanation = ?,
           status = ?, difficulty = ?, difficulty_level = ?, unsuitable_for_timed = ?,
           rejection_reason = ?, normalized_hash = ?
       WHERE id = ?`
    ).run(
      nextPrompt,
      JSON.stringify(nextOptions),
      JSON.stringify(nextAnswers),
      explanation ?? existing.explanation,
      nextStatus,
      nextDifficulty,
      nextLevel,
      nextUnsuitable,
      nextRejectionReason,
      buildQuestionHash(nextPrompt, nextAnswers),
      questionId
    );

    if (nextStatus === 'rejected') {
      const batchRow = db
        .prepare(`SELECT id, rejected_details_json FROM lesson_question_batches WHERE bank_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(existing.bank_id) as { id: string; rejected_details_json: string | null } | undefined;
      if (batchRow) {
        const list = JSON.parse(batchRow.rejected_details_json || '[]') as RejectedQuestionLog[];
        list.push({
          prompt: nextPrompt,
          roundType: existing.round_type,
          reason: nextRejectionReason || 'مرفوض من المعلم',
          sourcePage: existing.source_page ?? undefined,
          timestamp: new Date().toISOString(),
        });
        db.prepare(`UPDATE lesson_question_batches SET rejected_details_json = ? WHERE id = ?`).run(
          JSON.stringify(list.slice(-100)),
          batchRow.id
        );
      }
    }

    db.prepare(
      `INSERT INTO question_reviews (id, question_id, reviewer_profile_id, action, notes, previous_status, new_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `rev-${crypto.randomUUID().slice(0, 8)}`,
      questionId,
      req.user!.id,
      nextStatus === 'published' ? 'approve' : nextStatus === 'rejected' ? 'reject' : 'edit',
      nextRejectionReason || req.body.notes || 'تحديث من لوحة الإدارة/المعلم',
      existing.status,
      nextStatus
    );

    const updated = db.prepare(`SELECT * FROM questions WHERE id = ?`).get(questionId) as Parameters<
      typeof rowToQuestionRecord
    >[0];
    res.json({ question: rowToQuestionRecord(updated) });
  });

  app.delete('/api/questions/:questionId', requireRole(['admin', 'teacher']), (req, res) => {
    const { questionId } = req.params;
    const info = db.prepare(`DELETE FROM questions WHERE id = ?`).run(questionId);
    if (info.changes === 0) {
      res.status(404).json({ error: 'السؤال غير موجود' });
      return;
    }
    res.json({ deleted: true });
  });

  // ================= SMART LESSON AI STUDIO (TEACHER / ADMIN) =================

  app.post(
    '/api/lessons/generate',
    requireRole(['admin', 'teacher']),
    upload.single('pdf'),
    async (req: AuthedRequest, res) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: 'يرجى رفع ملف PDF للدرس' });
          return;
        }

        const decodedFilename = decodeUploadedFilename(file.originalname);
        const lessonTitle = String(req.body.lessonTitle || decodedFilename.replace(/\.pdf$/i, '')).trim();
        const subject = String(req.body.subject || 'التربية الإسلامية').trim();
        const ageGroup = normalizeAgeGroup(String(req.body.ageGroup || 'teen_14_17'));
        const difficulty = (req.body.difficulty as Difficulty) || 'medium';
        const requestedCount = Math.min(100, Math.max(5, Number(req.body.requestedCount || 10)));
        const pageRangeHint = req.body.pageRangeHint ? String(req.body.pageRangeHint).trim() : undefined;
        const allowedRoundTypesRaw = req.body.allowedRoundTypes
          ? (JSON.parse(String(req.body.allowedRoundTypes)) as RoundType[])
          : (['multiple_choice', 'true_false', 'rapid_fire', 'fill_blank'] as RoundType[]);

        const summary = startLessonPipelineAsync(db, {
          lessonTitle,
          subject,
          ageGroup,
          difficulty,
          requestedCount,
          allowedRoundTypes: allowedRoundTypesRaw,
          pageRangeHint,
          createdBy: req.user!.id,
          pdfBuffer: file.buffer,
          filename: decodedFilename,
        });

        res.status(202).json({ lesson: summary, questions: [] });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'تعذر تحليل ملف الدرس';
        res.status(400).json({ error: message });
      }
    }
  );

  app.get('/api/lessons/:lessonId/stream', requireRole(['admin', 'teacher']), (req, res) => {
    const lessonId = req.params.lessonId;
    const summary = getLessonBatchSummary(db, lessonId);
    if (!summary) {
      res.status(404).json({ error: 'الدرس غير موجود' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (eventName: string, data: unknown) => {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const existingQuestions = (
      db
        .prepare(`SELECT * FROM questions WHERE bank_id = ? ORDER BY source_page ASC, created_at ASC`)
        .all(summary.bankId) as Parameters<typeof rowToQuestionRecord>[0][]
    ).map(rowToQuestionRecord);

    sendEvent('snapshot', { type: 'snapshot', lesson: summary, newQuestions: existingQuestions });

    const unsubscribe = subscribeToLessonStream(lessonId, (ev) => {
      sendEvent(ev.type, ev);
      if (ev.type === 'done' || ev.type === 'error' || ev.type === 'paused') {
        // Keep stream open briefly for client flush then end cleanly on terminal states
        if (ev.type === 'done' || ev.type === 'error') {
          setTimeout(() => {
            if (!res.writableEnded) res.end();
          }, 150);
        }
      }
    });

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 15_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post('/api/lessons/:lessonId/retry-batch', requireRole(['admin', 'teacher']), (req, res) => {
    try {
      const lesson = resumeLessonPipelineAsync(db, req.params.lessonId, { retryOnlyFailedBatch: true });
      res.status(202).json({ lesson });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر إعادة محاولة الدفعة' });
    }
  });

  app.post('/api/lessons/:lessonId/resume', requireRole(['admin', 'teacher']), (req, res) => {
    try {
      const lesson = resumeLessonPipelineAsync(db, req.params.lessonId, { retryOnlyFailedBatch: false });
      res.status(202).json({ lesson });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر استكمال التوليد' });
    }
  });

  app.post('/api/lessons/:lessonId/cancel', requireRole(['admin', 'teacher']), (req, res) => {
    const lesson = cancelLessonPipeline(db, req.params.lessonId);
    if (!lesson) {
      res.status(404).json({ error: 'الدرس غير موجود' });
      return;
    }
    res.json({ lesson });
  });

  app.get('/api/lessons', requireRole(['admin', 'teacher']), (_req: AuthedRequest, res) => {
    const rows = db
      .prepare(`SELECT id FROM lessons WHERE deleted_at IS NULL ORDER BY created_at DESC`)
      .all() as Array<{ id: string }>;
    const lessons = rows.map((r) => getLessonBatchSummary(db, r.id)).filter(Boolean);
    res.json({ lessons });
  });

  app.get('/api/lessons/:lessonId', requireRole(['admin', 'teacher']), (req, res) => {
    const summary = getLessonBatchSummary(db, req.params.lessonId);
    if (!summary) {
      res.status(404).json({ error: 'الدرس غير موجود' });
      return;
    }
    const questions = (
      db
        .prepare(`SELECT * FROM questions WHERE bank_id = ? ORDER BY source_page ASC, created_at ASC`)
        .all(summary.bankId) as Parameters<typeof rowToQuestionRecord>[0][]
    ).map(rowToQuestionRecord);
    res.json({ lesson: summary, questions });
  });

  app.post(
    '/api/lessons/analyze',
    requireRole(['admin', 'teacher']),
    upload.single('pdf'),
    async (req: AuthedRequest, res) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: 'يرجى رفع ملف PDF للدرس' });
          return;
        }
        const decodedFilename = decodeUploadedFilename(file.originalname);
        const lessonTitle = String(req.body.lessonTitle || decodedFilename.replace(/\.pdf$/i, '')).trim();
        const subject = String(req.body.subject || 'التربية الإسلامية').trim();
        const ageGroup = normalizeAgeGroup(String(req.body.ageGroup || 'teen_14_17'));
        const difficulty = (req.body.difficulty as Difficulty) || 'medium';
        const pageRangeHint = req.body.pageRangeHint ? String(req.body.pageRangeHint).trim() : undefined;

        const summary = startLessonAnalyzeAsync(db, {
          lessonTitle,
          subject,
          ageGroup,
          difficulty,
          pageRangeHint,
          createdBy: req.user!.id,
          pdfBuffer: file.buffer,
          filename: decodedFilename,
        });

        res.status(202).json({ lesson: summary, questions: [] });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'تعذر تحليل ملف الدرس';
        res.status(400).json({ error: message });
      }
    }
  );

  app.post('/api/lessons/:lessonId/reestimate', requireRole(['admin', 'teacher']), (req, res) => {
    try {
      const body = req.body as {
        ageGroup?: AgeGroup;
        difficulty?: Difficulty;
        mode?: LessonGenerationMode;
        distributionMode?: LessonDistributionMode;
        customCount?: number;
        selectedRoundTypes?: RoundType[];
      };
      const lesson = reestimateLessonPotential(db, req.params.lessonId, body);
      res.json({ lesson });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر إعادة حساب السعة' });
    }
  });

  app.post('/api/lessons/:lessonId/start-generation', requireRole(['admin', 'teacher']), async (req, res) => {
    try {
      const body = req.body as {
        mode?: LessonGenerationMode;
        distributionMode?: LessonDistributionMode;
        customCount?: number;
        selectedRoundTypes?: RoundType[];
        pageRangeHint?: string;
      };
      const lesson = await startLessonGenerationFromAnalysis(db, req.params.lessonId, {
        ...body,
        actionType: 'initial',
        sync: false,
      });
      res.status(202).json({ lesson });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر بدء توليد الأسئلة' });
    }
  });

  app.post('/api/lessons/:lessonId/complete-missing', requireRole(['admin', 'teacher']), async (req, res) => {
    try {
      const body = req.body as { selectedRoundTypes?: RoundType[]; settings?: Partial<RegenerationSettings> };
      const lesson = await startLessonGenerationFromAnalysis(db, req.params.lessonId, {
        actionType: 'complete_missing',
        selectedRoundTypes: body.selectedRoundTypes,
        settings: body.settings,
        sync: false,
      });
      res.status(202).json({ lesson });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر استكمال الأسئلة الناقصة' });
    }
  });

  app.post('/api/lessons/:lessonId/generate-more', requireRole(['admin', 'teacher']), async (req, res) => {
    try {
      const body = req.body as {
        additionalCount?: number;
        selectedRoundTypes?: RoundType[];
        prioritizeUndercoveredTopics?: boolean;
        settings?: Partial<RegenerationSettings>;
      };
      const lesson = await startLessonGenerationFromAnalysis(db, req.params.lessonId, {
        actionType: 'generate_more',
        additionalCount: body.additionalCount,
        selectedRoundTypes: body.selectedRoundTypes,
        prioritizeUndercoveredTopics: body.prioritizeUndercoveredTopics ?? true,
        settings: body.settings,
        sync: false,
      });
      res.status(202).json({ lesson });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر توليد أسئلة إضافية' });
    }
  });

  app.post('/api/lessons/:lessonId/regenerate-selected', requireRole(['admin', 'teacher']), async (req, res) => {
    try {
      const body = req.body as {
        questionIds: string[];
        improvementAction?: QuestionImprovementAction;
        targetRoundType?: RoundType;
        settings?: Partial<RegenerationSettings>;
      };
      if (!Array.isArray(body.questionIds) || body.questionIds.length === 0) {
        res.status(400).json({ error: 'يرجى تحديد سؤال واحد على الأقل لتوليد البدائل.' });
        return;
      }
      const previews = await previewQuestionAlternatives(db, req.params.lessonId, body);
      res.json({ previews });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر توليد البدائل للسؤال المختار' });
    }
  });

  app.post('/api/lessons/:lessonId/apply-replacement', requireRole(['admin', 'teacher']), (req, res) => {
    try {
      const body = req.body as {
        targetQuestionId: string;
        candidate: QuestionAlternativeCandidate;
        approveAfterApply?: boolean;
      };
      if (!body.targetQuestionId || !body.candidate) {
        res.status(400).json({ error: 'بيانات الاستبدال غير مكتملة' });
        return;
      }
      const result = applyQuestionReplacement(db, req.params.lessonId, body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر استبدال السؤال' });
    }
  });

  app.post('/api/lessons/:lessonId/approve-all', requireRole(['admin', 'teacher']), (req: AuthedRequest, res) => {
    const summary = getLessonBatchSummary(db, req.params.lessonId);
    if (!summary) {
      res.status(404).json({ error: 'الدرس غير موجود' });
      return;
    }
    const info = db
      .prepare(`UPDATE questions SET status = 'published' WHERE bank_id = ? AND status = 'needs_review'`)
      .run(summary.bankId);
    res.json({ approvedCount: info.changes, lesson: getLessonBatchSummary(db, req.params.lessonId) });
  });

  app.post('/api/lessons/:lessonId/regenerate-rejected', requireRole(['admin', 'teacher']), async (req, res) => {
    try {
      const count = Number(req.body.count || 3);
      if (req.body.async) {
        const lesson = await startLessonGenerationFromAnalysis(db, req.params.lessonId, {
          actionType: 'regenerate_rejected',
          additionalCount: count,
          selectedRoundTypes: req.body.selectedRoundTypes,
          settings: req.body.settings,
          sync: false,
        });
        res.status(202).json({ lesson });
        return;
      }
      const result = await regenerateRejectedForLesson(db, req.params.lessonId, count);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر إعادة التوليد' });
    }
  });

  app.get('/api/lessons/:lessonId/export', requireRole(['admin', 'teacher']), (req, res) => {
    const summary = getLessonBatchSummary(db, req.params.lessonId);
    if (!summary) {
      res.status(404).json({ error: 'الدرس غير موجود' });
      return;
    }
    const questions = (
      db
        .prepare(`SELECT * FROM questions WHERE bank_id = ? ORDER BY source_page ASC`)
        .all(summary.bankId) as Parameters<typeof rowToQuestionRecord>[0][]
    ).map(rowToQuestionRecord);

    if (req.query.format === 'csv') {
      const header = 'id,roundType,category,ageGroup,difficulty,status,sourcePage,prompt,acceptableAnswers,sourceExcerpt\n';
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const body = questions
        .map((q) =>
          [
            q.id,
            q.roundType,
            q.category,
            q.ageGroup,
            q.difficulty,
            q.status,
            q.sourcePage ?? '',
            q.prompt,
            q.acceptableAnswers.join('|'),
            q.sourceExcerpt ?? '',
          ]
            .map(esc)
            .join(',')
        )
        .join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="lesson-${summary.lessonId}.csv"`);
      res.send('\uFEFF' + header + body);
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lesson-${summary.lessonId}.json"`);
    res.send(JSON.stringify({ lesson: summary, questions }, null, 2));
  });

  app.delete('/api/lessons/:lessonId', requireRole(['admin', 'teacher']), (req: AuthedRequest, res) => {
    const lesson = db
      .prepare(`SELECT id, created_by FROM lessons WHERE id = ? AND deleted_at IS NULL`)
      .get(req.params.lessonId) as { id: string; created_by: string } | undefined;

    if (!lesson) {
      res.status(404).json({ error: 'الدرس غير موجود' });
      return;
    }
    if (req.user!.role !== 'admin' && lesson.created_by !== req.user!.id) {
      res.status(403).json({ error: 'يسمح فقط للمعلم المنشئ أو الإدارة بحذف هذا الدرس' });
      return;
    }

    const docs = db
      .prepare(`SELECT storage_path FROM lesson_documents WHERE lesson_id = ?`)
      .all(lesson.id) as Array<{ storage_path: string | null }>;

    db.transaction(() => {
      db.prepare(`UPDATE lessons SET deleted_at = datetime('now'), status = 'deleted' WHERE id = ?`).run(lesson.id);
      db.prepare(`UPDATE question_banks SET is_active = 0 WHERE lesson_id = ?`).run(lesson.id);
      db.prepare(
        `UPDATE questions SET status = 'archived' WHERE bank_id IN (SELECT id FROM question_banks WHERE lesson_id = ?)`
      ).run(lesson.id);
    })();

    for (const d of docs) {
      if (d.storage_path && fs.existsSync(d.storage_path)) {
        try {
          fs.unlinkSync(d.storage_path);
        } catch {
          // Ignore cleanup error
        }
      }
    }

    res.json({ deleted: true });
  });

  // ================= LIVE GAME SESSIONS & HOST/AUDIENCE SYNC =================

  app.get('/api/sessions/resumable', (req: AuthedRequest, res) => {
    const rows = db.prepare(`
      SELECT code, title, phase, host_profile_id, updated_at
      FROM game_sessions WHERE phase != 'finished' AND (host_profile_id = ? OR host_profile_id IS NULL)
      ORDER BY updated_at DESC LIMIT 60
    `).all(req.user?.id ?? null) as Array<{
      code: string; title: string; phase: string; host_profile_id: string | null; updated_at: string;
    }>;
    const sessions = rows.filter((row) => row.host_profile_id ? row.host_profile_id === req.user?.id : Boolean(
      req.headers.cookie?.includes(`t30_host_${row.code}=`) &&
      (() => {
        const session = hub.getSessionInternal(row.code);
        return session && hub.canGuestHost(session, req.headers.cookie);
      })()
    )).slice(0, 12).map((row) => ({
      code: row.code, title: row.title, phase: row.phase, updatedAt: row.updated_at, canHostControl: true,
      hostControlled: hub.getSessionInternal(row.code)?.settings.hostControlled,
    }));
    res.json({ sessions });
  });

  app.post('/api/challenge-v2/preview', (req: AuthedRequest, res) => {
    try {
      const body=req.body;
      if(!['easy','medium','hard','mixed'].includes(body.difficulty??'mixed'))throw new Error('صعوبة غير صالحة.');
      const plan=prepareMatchV2(db,{bankId:String(body.bankId||'bank-import-thirty-seconds-v1'),
        ageGroup:normalizeAgeGroup(body.ageGroup||'family'),difficulty:body.difficulty||'mixed',
        category:typeof body.category==='string'?body.category:'الكل',
        categories:Array.isArray(body.categories)?body.categories.filter((c: unknown)=>typeof c==='string').slice(0,40):[],
        participantProfileIds:req.user?[req.user.id]:[]},Boolean(body.tacticalCards));
      res.json({ready:true,mainQuestions:plan.filter(s=>s.section!=='tiebreak').length,
        tieQuestions:plan.filter(s=>s.section==='tiebreak').length,
        sections:[...new Set(plan.map(s=>s.section))].map(section=>({section,slots:plan.filter(s=>s.section===section).length}))});
    } catch(error) {res.status(400).json({error:error instanceof Error?error.message:'تعذرت تهيئة المباراة'});}
  });

  app.post('/api/sessions/:code/v2/event', (req: AuthedRequest, res) => {
    const s=hub.getSessionInternal(req.params.code);
    if(!s?.challengeV2){res.status(404).json({error:'مباراة V2 غير موجودة'});return;}
    const event=req.body as EventV2 & {teamKey?:unknown};
    const host=event.teamKey === undefined && Boolean(hub.canGuestHost(s,req.headers.cookie)||(req.user&&(req.user.id===s.hostProfileId||req.user.role==='admin')));
    if(!host&&(!Number.isInteger(event.team)||!hub.canTeamPlay(s,event.team!,event.teamKey))){
      res.status(403).json({error:'استخدم رابط فريقك الخاص.'});return;
    }
    if(typeof event.id!=='string'||typeof event.action!=='string'||typeof event.turnId!=='string'||typeof event.questionInstanceId!=='string'){
      res.status(400).json({error:'إجراء غير صالح.'});return;
    }
    try {res.json({session:hub.handleChallengeV2(req.params.code,event,{host,team:host?undefined:event.team})});}
    catch(error){res.status(409).json({error:error instanceof Error?error.message:'تعذر تنفيذ الإجراء',session:hub.getSessionView(s.code,host)});}
  });

  app.post('/api/sessions', (req: AuthedRequest, res) => {
    try {
      const body = req.body as {
        title?: string;
        bankId?: string;
        lessonId?: string | null;
        ageGroup?: AgeGroup;
        difficulty?: Difficulty | 'mixed';
        category?: string;
        categories?: string[];
        teams?: Array<{ name: string; color: string; participantIds?: string[]; participantNames?: string[] }>;
        roundTypes?: RoundType[];
        roundOverrides?: Partial<Record<RoundType, Partial<RoundConfig>>>;
        settings?: Partial<SessionSettings>;
        skipVs?: boolean;
      };

      if (body.settings?.hostControlled && !req.user) {
        res.status(401).json({ error: 'سجّل الدخول لاستخدام تحكم الهاتف.' });
        return;
      }
      const guestHostKey = !req.user && body.settings?.showMode === true ? crypto.randomBytes(24).toString('hex') : undefined;
      const isStaff = req.user?.role === 'teacher' || req.user?.role === 'admin';
      if (body.teams && (!Array.isArray(body.teams) || body.teams.length > 8 || body.teams.some((team) => !team || typeof team.name !== 'string' ||
          (team.participantIds != null && (!Array.isArray(team.participantIds) || team.participantIds.length > 40 ||
            team.participantIds.some((id) => typeof id !== 'string' || (!isStaff && id !== req.user?.id))))))) {
        res.status(400).json({ error: 'راجع أسماء الفرق والمشاركين.' });
        return;
      }
      const rawBot = body.settings?.botOpponent;
      const validSkills: BotSkillLevel[] = ['relaxed', 'balanced', 'fierce'];
      const sanitizedBot = rawBot?.enabled
        ? {
            enabled: true,
            teamIndex: Number.isInteger(rawBot.teamIndex) && rawBot.teamIndex >= 0 && rawBot.teamIndex <= 1 ? rawBot.teamIndex : 1,
            skill: validSkills.includes(rawBot.skill) ? rawBot.skill : 'balanced',
            personaName:
              typeof rawBot.personaName === 'string' && rawBot.personaName.trim()
                ? rawBot.personaName.trim().slice(0, 48)
                : JORDANIAN_BOT_DEFAULT_NAME,
          }
        : undefined;

      const sanitizedSettings: Partial<SessionSettings> | undefined = body.settings
        ? {
            ...body.settings,
            botOpponent: sanitizedBot,
          }
        : undefined;

      const session = hub.createSession({
        hostProfileId: req.user?.id ?? null,
        guestHostKey,
        title: body.title || 'تحدي الـ30 ثانية — مسجد ابن تيمية',
        bankId: body.bankId || 'bank-general-mosque',
        lessonId: body.lessonId ?? null,
        ageGroup: normalizeAgeGroup(body.ageGroup || 'family'),
        difficulty: body.difficulty || 'mixed',
        category: body.category || 'الكل',
        categories: body.categories,
        teams: body.teams || [],
        roundTypes: body.roundTypes || ['rapid_fire', 'multiple_choice', 'who_am_i', 'buzzer', 'golden'],
        roundOverrides: body.roundOverrides,
        settings: sanitizedSettings,
        skipVs: Boolean(body.skipVs),
      });

      if (guestHostKey) res.cookie(`t30_host_${session.code}`, guestHostKey, {
        httpOnly: true, sameSite: 'strict', secure: req.secure || req.get('x-forwarded-proto') === 'https', maxAge: 86400000,
      });
      const isHostAllowed =
        Boolean(guestHostKey) || !session.hostProfileId ||
        req.user?.id === session.hostProfileId ||
        req.user?.role === 'admin' ||
        req.user?.role === 'teacher';
      res.status(201).json({ session: hub.getSessionView(session.code, isHostAllowed) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر إنشاء الجلسة' });
    }
  });

  app.get('/api/sessions/:code', (req: AuthedRequest, res) => {
    const s = hub.getSessionInternal(req.params.code);
    if (!s) {
      res.status(404).json({ error: 'رمز الجلسة غير صحيح أو انتهت الجلسة' });
      return;
    }
    const wantsHost = req.query.role === 'host';
    const canSeeHost =
      wantsHost &&
      (hub.canGuestHost(s, req.headers.cookie) ||
        (req.user && (req.user.role === 'admin' || req.user.role === 'teacher' || req.user.id === s.hostProfileId)));
    res.json({ session: hub.getSessionView(req.params.code, Boolean(canSeeHost)) });
  });

  app.get('/api/sessions/:code/export', (req: AuthedRequest, res) => {
    const s = hub.getSessionInternal(req.params.code);
    if (!s) {
      res.status(404).json({ error: 'الجلسة غير موجودة' });
      return;
    }
    const isAuthorizedHost =
      hub.canGuestHost(s, req.headers.cookie) ||
      (req.user && (req.user.role === 'admin' || req.user.role === 'teacher' || req.user.id === s.hostProfileId));
    if (!isAuthorizedHost) {
      res.status(403).json({ error: 'تصدير بيانات المباراة متاح للمشرف فقط' });
      return;
    }

    const view = hub.getSessionView(req.params.code, true)!;
    if (req.query.format === 'csv') {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = 'timestamp,teamName,delta,roundTitle,reason\n';
      const rows = (view.scoreAuditLog ?? [])
        .map((e) => [e.timestamp, e.teamName, e.delta, e.roundTitle, e.reason].map(esc).join(','))
        .join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="match-${view.code}.csv"`);
      res.send('\uFEFF' + header + rows);
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="match-${view.code}.json"`);
    res.send(
      JSON.stringify(
        {
          code: view.code,
          title: view.title,
          phase: view.phase,
          teams: view.teams,
          stats: view.stats,
          rounds: view.rounds,
          scoreAuditLog: view.scoreAuditLog ?? [],
          exportedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
  });

  app.post('/api/sessions/:code/action', (req: AuthedRequest, res) => {
    const s = hub.getSessionInternal(req.params.code);
    if (!s) {
      res.status(404).json({ error: 'الجلسة غير موجودة' });
      return;
    }
    const isAuthorizedHost =
      hub.canGuestHost(s, req.headers.cookie) ||
      (req.user && (req.user.role === 'admin' || req.user.role === 'teacher' || req.user.id === s.hostProfileId));

    if (!isAuthorizedHost) {
      res.status(403).json({ error: 'التحكم بالجلسة متاح للمشرف أو منشئ المسابقة فقط' });
      return;
    }

    const { action, payload } = req.body as { action: string; payload?: Record<string, unknown> };
    try {
      const updated = hub.handleHostAction(req.params.code, action, payload || {});
      res.json({ session: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء' });
    }
  });

  app.post('/api/sessions/:code/answer', (req: AuthedRequest, res) => {
    const { teamIndex, submitted, questionId, teamKey } = req.body;
    const s = hub.getSessionInternal(req.params.code);
    const team = teamIndex ?? 0;
    const valid = (typeof submitted === 'string' && submitted.length <= 600) ||
      (Number.isInteger(submitted) && submitted >= 0 && submitted < 20) ||
      (Array.isArray(submitted) && submitted.length <= 20 && submitted.every((part) => typeof part === 'string' && part.length <= 160));
    if (!s || !Number.isInteger(team) || !valid) {
      res.status(400).json({ error: 'الإجابة أو المباراة غير صالحة' });
      return;
    }
    const owner = s.hostProfileId ? req.user?.id === s.hostProfileId || req.user?.role === 'admin' || req.user?.role === 'teacher' : hub.canGuestHost(s, req.headers.cookie);
    const teamAuthorized = s.settings.showMode === true && hub.canTeamPlay(s, team, teamKey);
    if (s.settings.showMode && ((!owner && (!teamAuthorized || s.currentQuestion?.roundType !== 'multiple_choice')) ||
        (s.settings.hostControlled && (!teamAuthorized || s.currentQuestion?.roundType !== 'multiple_choice')))) {
      res.status(403).json({ error: 'استخدم رابط فريقك أو لوحة المشرف للإجابة.' });
      return;
    }
    if (s.settings.hostControlled && !s.settings.showMode) {
      res.status(403).json({ error: 'المشرف يسجّل الإجابات من هاتف التحكم.' });
      return;
    }
    const result = hub.submitPlayerAnswer(req.params.code, team, submitted, req.user?.id, questionId, teamAuthorized);
    if (!result) {
      res.status(400).json({ error: 'تغيّر السؤال، أو انتهى وقت الإجابة.' });
      return;
    }
    res.json(result);
  });

  app.post('/api/sessions/:code/buzz', (req: AuthedRequest, res) => {
    const { teamIndex, teamKey, questionId } = req.body;
    const s = hub.getSessionInternal(req.params.code);
    const owner = s && (s.hostProfileId ? req.user?.id === s.hostProfileId || req.user?.role === 'admin' || req.user?.role === 'teacher' : hub.canGuestHost(s, req.headers.cookie));
    if (s?.settings.showMode && !owner && !hub.canTeamPlay(s, teamIndex, teamKey)) {
      res.status(403).json({ error: 'افتح جرس فريقك من الرابط الذي يرسله المشرف.' });
      return;
    }
    const view = hub.handleBuzz(req.params.code, teamIndex ?? 0, questionId);
    if (!view) {
      res.status(409).json({ error: 'الجرس غير متاح الآن أو سبقك فريق آخر' });
      return;
    }
    res.json({ session: view });
  });

  app.post('/api/sessions/:code/bid', (req: AuthedRequest, res) => {
    const s = hub.getSessionInternal(req.params.code);
    if (!s) {
      res.status(404).json({ error: 'الجلسة غير موجودة' });
      return;
    }
    const { action, payload } = req.body as { action: string; payload?: Record<string, unknown> };
    const allowedPlayerActions = ['bid_raise', 'bid_challenge', 'bid_pass', 'bid_record_answer'];
    if (!allowedPlayerActions.includes(action)) {
      res.status(403).json({ error: 'إجراء المزايدة غير مصرح به' });
      return;
    }
    const isAuthorizedHost =
      hub.canGuestHost(s, req.headers.cookie) ||
      (req.user && (req.user.role === 'admin' || req.user.role === 'teacher' || req.user.id === s.hostProfileId));
    if ((s.settings.hostControlled || s.settings.showMode) && !isAuthorizedHost) {
      res.status(403).json({ error: 'المشرف يدير المزايدة من هاتف التحكم.' });
      return;
    }
    const result = hub.handleBidAction(req.params.code, action, payload || {}, Boolean(isAuthorizedHost));
    if (!result) {
      res.status(400).json({ error: 'جولة مين يزوّد غير نشطة حالياً' });
      return;
    }
    if (!result.ok) {
      res.status(409).json({ error: result.error, session: result.view });
      return;
    }
    res.json({ session: result.view });
  });

  // ================= JORDANIAN BOT ADVISOR («نشمي») =================

  app.post('/api/bot/guide', (req, res) => {
    const body = req.body as {
      message?: unknown;
      screen?: unknown;
      sessionCode?: unknown;
    };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > 1000) {
      res.status(400).json({ error: 'اكتب سؤالك لنشمي (بحد أقصى 1000 حرف).' });
      return;
    }
    const screen = typeof body.screen === 'string' ? body.screen.slice(0, 40) : undefined;
    const sessionCode =
      typeof body.sessionCode === 'string' && /^[A-Za-z0-9]{6}$/.test(body.sessionCode.trim())
        ? body.sessionCode.trim().toUpperCase()
        : undefined;

    const reply = getLocalJordanianGuideReply(db, hub, {
      message,
      screen,
      sessionCode,
    });
    res.json({ ...reply, mode: 'local_guide' });
  });

  app.post('/api/bot/chat', async (req, res) => {
    const body = req.body as {
      message?: unknown;
      history?: unknown;
      screen?: unknown;
      sessionCode?: unknown;
    };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > 1200) {
      res.status(400).json({ error: 'اكتب رسالتك لنشمي (بحد أقصى 1200 حرف).' });
      return;
    }
    const screen = typeof body.screen === 'string' ? body.screen.slice(0, 40) : undefined;
    const sessionCode =
      typeof body.sessionCode === 'string' && /^[A-Za-z0-9]{6}$/.test(body.sessionCode.trim())
        ? body.sessionCode.trim().toUpperCase()
        : undefined;
    const history: BotChatMessage[] = Array.isArray(body.history)
      ? body.history
          .filter(
            (item): item is BotChatMessage =>
              Boolean(item) &&
              typeof item === 'object' &&
              (item.role === 'user' || item.role === 'model') &&
              typeof item.text === 'string'
          )
          .slice(-8)
      : [];

    try {
      const result = await callJordanianBotGemini(db, hub, {
        message,
        history,
        screen,
        sessionCode,
      });
      res.json({ ...result, mode: 'gemini' });
    } catch (err) {
      if (err instanceof BotGeminiError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      res.status(502).json({
        error: 'تعذّر الاتصال بمحرك الذكاء الاصطناعي حالياً.',
        code: 'UPSTREAM_ERROR',
      });
    }
  });


  // Private server-to-server bridge for other first-party games. Never use a
  // browser API key, room token, or a public CORS endpoint for this bridge.
  let platformBotInFlight = 0;
  let platformBotWindow = 0;
  let platformBotRequests = 0;
  app.post('/api/bot/platform', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const secret = process.env.NASHMI_SHARED_SECRET || '';
    if (Buffer.byteLength(secret) < 32) {
      res.status(503).json({ error: 'Shared assistant is not configured.' }); return;
    }
    const provided = Buffer.from(req.get('X-Nashmi-Secret') || '');
    const expected = Buffer.from(secret);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      res.status(401).json({ error: 'Unauthorized.' }); return;
    }
    const body = req.body as { game?: unknown; kind?: unknown; message?: unknown; systemInstruction?: unknown } | undefined;
    if (!body || (body.game !== 'yemken_hay' && body.game !== 'codenames') ||
        (body.game === 'codenames' && body.kind !== 'chat') || (body.kind !== 'chat' && body.kind !== 'judge') ||
        typeof body.message !== 'string' || !body.message.trim() || body.message.length > 16000 ||
        typeof body.systemInstruction !== 'string' || !body.systemInstruction.trim() || body.systemInstruction.length > 16000) {
      res.status(400).json({ error: 'Invalid assistant request.' }); return;
    }
    const now = Date.now();
    if (now - platformBotWindow >= 60000) { platformBotWindow = now; platformBotRequests = 0; }
    if (platformBotInFlight >= 2 || platformBotRequests >= 24) {
      res.status(429).json({ error: 'Assistant busy.' }); return;
    }
    platformBotRequests++;
    platformBotInFlight++;
    try {
      const reply = await generateNashmiContent({
        contents: [{ role: 'user', parts: [{ text: body.message }] }],
        systemInstruction: body.systemInstruction,
        json: body.kind === 'judge',
        timeoutMs: body.kind === 'judge' ? 6500 : 10000,
      });
      res.json({ reply });
    } catch (err) {
      const status = err instanceof BotGeminiError ? err.status : 502;
      res.status(status).json({ error: 'Shared assistant temporarily unavailable.' });
    } finally {
      platformBotInFlight--;
    }
  });

  return { app, hub };
}
