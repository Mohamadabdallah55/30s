import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  Edit3,
  FileText,
  PauseCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AGE_GROUP_LABELS,
  ALL_ROUND_TYPES,
  CANONICAL_AGE_GROUPS,
  DIFFICULTY_LABELS,
  ROUND_RULES,
} from '../shared/gameRules';
import type {
  AgeGroup,
  Difficulty,
  GameSessionView,
  LessonBatchSummary,
  ProfilePublic,
  QuestionRecord,
  RoundType,
} from '../shared/types';
import { apiFetch, getAuthToken } from '../utils/api';

interface LessonStudioProps {
  user: ProfilePublic | null;
  onBack: () => void;
  onOpenAuth: () => void;
  onLaunchSession: (session: GameSessionView) => void;
}

export function LessonStudio({ user, onBack, onOpenAuth, onLaunchSession }: LessonStudioProps) {
  const [lessons, setLessons] = useState<LessonBatchSummary[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<LessonBatchSummary | null>(null);
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);

  // Upload Form
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [subject, setSubject] = useState('السيرة النبوية');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('teen_14_17');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [requestedCount, setRequestedCount] = useState<number>(10);
  const [pageRangeHint, setPageRangeHint] = useState('');
  const [allowedTypes, setAllowedTypes] = useState<RoundType[]>([
    'multiple_choice',
    'true_false',
    'rapid_fire',
    'fill_blank',
    'who_am_i',
    'list_multiple',
  ]);

  const [generating, setGenerating] = useState(false);
  const [pipelineStepLabel, setPipelineStepLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [autoStartSec, setAutoStartSec] = useState<number | null>(null);

  const isStaff = user?.role === 'admin' || user?.role === 'teacher';
  const activeProcessingStages = new Set([
    'uploaded',
    'document_parsing',
    'arabic_analysis',
    'learning_objectives',
    'distribution_plan',
    'question_generation',
    'grounding_verification',
    'deduplication',
    'schema_validation',
  ]);
  const isLessonBusy = Boolean(
    selectedLesson && (selectedLesson.isProcessing || activeProcessingStages.has(selectedLesson.pipelineStage))
  );

  const sanitizeUserError = (msg: string): string => {
    if (/Unterminated string|Unexpected token|JSON at position/i.test(msg)) {
      return 'انقطعت استجابة الذكاء الاصطناعي قبل اكتمال إحدى الدفعات. تم حفظ الأسئلة الصالحة السابقة ويمكنك الضغط على «إعادة محاولة الدفعة الفاشلة» أو «استكمال التوليد».';
    }
    return msg;
  };

  const loadLessons = async () => {
    if (!isStaff) return;
    try {
      const res = await apiFetch<{ lessons: LessonBatchSummary[] }>('/api/lessons');
      setLessons(res.lessons);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadLessons();
  }, [isStaff]);

  useEffect(() => {
    if (!selectedLesson || !isLessonBusy) return;
    const token = getAuthToken() || '';
    const streamUrl = `/api/lessons/${selectedLesson.lessonId}/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(streamUrl);

    const mergeQuestions = (incoming?: QuestionRecord[]) => {
      if (!incoming || incoming.length === 0) return;
      setQuestions((prev) => {
        const map = new Map<string, QuestionRecord>();
        for (const q of prev) map.set(q.id, q);
        for (const q of incoming) map.set(q.id, q);
        return Array.from(map.values()).sort((a, b) => (a.sourcePage ?? 0) - (b.sourcePage ?? 0));
      });
    };

    const handleStreamEvent = (raw: MessageEvent) => {
      try {
        const data = JSON.parse(raw.data) as {
          type: string;
          lesson: LessonBatchSummary;
          newQuestions?: QuestionRecord[];
        };
        if (data.lesson) {
          setSelectedLesson(data.lesson);
          setPipelineStepLabel(data.lesson.statusMessageAr || '');
        }
        if (data.newQuestions) {
          mergeQuestions(data.newQuestions);
        }
        if (data.type === 'done' || data.type === 'paused' || data.type === 'error') {
          setGenerating(false);
          setPipelineStepLabel('');
          loadLessons();
          es.close();
        }
      } catch {
        // Ignore malformed SSE frame
      }
    };

    es.addEventListener('snapshot', handleStreamEvent as EventListener);
    es.addEventListener('stage', handleStreamEvent as EventListener);
    es.addEventListener('batch_saved', handleStreamEvent as EventListener);
    es.addEventListener('done', handleStreamEvent as EventListener);
    es.addEventListener('paused', handleStreamEvent as EventListener);
    es.addEventListener('error', handleStreamEvent as EventListener);

    es.onerror = () => {
      // Fallback one-shot refresh if SSE drops prematurely
      apiFetch<{ lesson: LessonBatchSummary; questions: QuestionRecord[] }>(
        `/api/lessons/${selectedLesson.lessonId}`
      )
        .then((res) => {
          setSelectedLesson(res.lesson);
          setQuestions(res.questions);
          if (!res.lesson.isProcessing && !activeProcessingStages.has(res.lesson.pipelineStage)) {
            setGenerating(false);
            setPipelineStepLabel('');
            loadLessons();
            es.close();
          }
        })
        .catch(() => {});
    };

    return () => {
      es.close();
    };
  }, [selectedLesson?.lessonId, isLessonBusy]);

  useEffect(() => {
    if (autoStartSec === null) return;
    if (autoStartSec <= 0) {
      setAutoStartSec(null);
      launchGameNow();
      return;
    }
    const t = setTimeout(() => setAutoStartSec((s) => (s !== null ? s - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [autoStartSec]);

  const openLessonDetail = async (lessonId: string) => {
    setError(null);
    try {
      const res = await apiFetch<{ lesson: LessonBatchSummary; questions: QuestionRecord[] }>(
        `/api/lessons/${lessonId}`
      );
      setSelectedLesson(res.lesson);
      setQuestions(res.questions);
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر تحميل تفاصيل الدرس'));
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile) {
      setError('يرجى اختيار ملف PDF عربي للدرس');
      return;
    }
    setError(null);
    setGenerating(true);
    setPipelineStepLabel('جاري رفع الملف وبدء التوليد المتدرج بالدفعات...');

    try {
      const fd = new FormData();
      fd.append('pdf', pdfFile);
      fd.append('lessonTitle', lessonTitle.trim() || pdfFile.name.replace(/\.pdf$/i, ''));
      fd.append('subject', subject);
      fd.append('ageGroup', ageGroup);
      fd.append('difficulty', difficulty);
      fd.append('requestedCount', String(requestedCount));
      if (pageRangeHint.trim()) fd.append('pageRangeHint', pageRangeHint.trim());
      fd.append('allowedRoundTypes', JSON.stringify(allowedTypes));

      const res = await apiFetch<{ lesson: LessonBatchSummary; questions: QuestionRecord[] }>(
        '/api/lessons/generate',
        { method: 'POST', body: fd }
      );
      setSelectedLesson(res.lesson);
      setQuestions(res.questions);
      setPdfFile(null);
      setLessonTitle('');
      loadLessons();
      if (!res.lesson.isProcessing && !activeProcessingStages.has(res.lesson.pipelineStage)) {
        setGenerating(false);
        setPipelineStepLabel('');
      }
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر توليد الأسئلة من الملف'));
      setGenerating(false);
      setPipelineStepLabel('');
    }
  };

  const handleRetryFailedBatch = async () => {
    if (!selectedLesson) return;
    setError(null);
    setGenerating(true);
    try {
      const res = await apiFetch<{ lesson: LessonBatchSummary }>(
        `/api/lessons/${selectedLesson.lessonId}/retry-batch`,
        { method: 'POST' }
      );
      setSelectedLesson(res.lesson);
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر إعادة محاولة الدفعة'));
      setGenerating(false);
    }
  };

  const handleResumeGeneration = async () => {
    if (!selectedLesson) return;
    setError(null);
    setGenerating(true);
    try {
      const res = await apiFetch<{ lesson: LessonBatchSummary }>(
        `/api/lessons/${selectedLesson.lessonId}/resume`,
        { method: 'POST' }
      );
      setSelectedLesson(res.lesson);
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر استكمال التوليد'));
      setGenerating(false);
    }
  };

  const handleCancelGeneration = async () => {
    if (!selectedLesson) return;
    try {
      const res = await apiFetch<{ lesson: LessonBatchSummary }>(
        `/api/lessons/${selectedLesson.lessonId}/cancel`,
        { method: 'POST' }
      );
      setSelectedLesson(res.lesson);
      setGenerating(false);
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر إلغاء المعالجة'));
    }
  };

  const approveQuestion = async (q: QuestionRecord) => {
    try {
      await apiFetch(`/api/questions/${q.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'published' }),
      });
      if (selectedLesson) await openLessonDetail(selectedLesson.lessonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر اعتماد السؤال');
    }
  };

  const approveAllAndAutoStart = async (withAutoCountdown: boolean) => {
    if (!selectedLesson) return;
    try {
      await apiFetch(`/api/lessons/${selectedLesson.lessonId}/approve-all`, { method: 'POST' });
      await openLessonDetail(selectedLesson.lessonId);
      if (withAutoCountdown) {
        setAutoStartSec(5);
      } else {
        await launchGameNow();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر اعتماد الأسئلة');
    }
  };

  const launchGameNow = async () => {
    if (!selectedLesson) return;
    try {
      const publishedRounds = Array.from(
        new Set(questions.filter((q) => q.status === 'published').map((q) => q.roundType))
      );
      const res = await apiFetch<{ session: GameSessionView }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          title: `تحدي الدرس الذكي: ${selectedLesson.title}`,
          bankId: selectedLesson.bankId,
          lessonId: selectedLesson.lessonId,
          ageGroup: selectedLesson.ageGroup,
          difficulty: selectedLesson.difficulty,
          category: 'الكل',
          roundTypes: publishedRounds.length > 0 ? publishedRounds : ['multiple_choice'],
          teams: [
            { name: 'فريق النخبة', color: '#38BDF8' },
            { name: 'فريق الرواد', color: '#F59E0B' },
          ],
        }),
      });
      onLaunchSession(res.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'يرجى اعتماد سؤال واحد منشور على الأقل قبل البدء');
    }
  };

  const saveEdit = async (qId: string) => {
    try {
      await apiFetch(`/api/questions/${qId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          prompt: editPrompt,
          acceptableAnswers: editAnswer.split('|').map((s) => s.trim()).filter(Boolean),
          status: 'published',
        }),
      });
      setEditingId(null);
      if (selectedLesson) await openLessonDetail(selectedLesson.lessonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التعديل');
    }
  };

  const deleteQuestion = async (qId: string) => {
    try {
      await apiFetch(`/api/questions/${qId}`, { method: 'DELETE' });
      if (selectedLesson) await openLessonDetail(selectedLesson.lessonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف السؤال');
    }
  };

  const regenerateRejected = async () => {
    if (!selectedLesson) return;
    setGenerating(true);
    try {
      await apiFetch(`/api/lessons/${selectedLesson.lessonId}/regenerate-rejected`, {
        method: 'POST',
        body: JSON.stringify({ count: Math.max(2, selectedLesson.rejectedCount) }),
      });
      await openLessonDetail(selectedLesson.lessonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إعادة التوليد');
    } finally {
      setGenerating(false);
    }
  };

  const deleteLesson = async (lessonId: string) => {
    try {
      await apiFetch(`/api/lessons/${lessonId}`, { method: 'DELETE' });
      if (selectedLesson?.lessonId === lessonId) {
        setSelectedLesson(null);
        setQuestions([]);
      }
      loadLessons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الدرس');
    }
  };

  const exportBank = async (format: 'json' | 'csv') => {
    if (!selectedLesson) return;
    const token = localStorage.getItem('t30_mosque_token') || '';
    const res = await fetch(`/api/lessons/${selectedLesson.lessonId}/export?format=${format}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lesson-${selectedLesson.lessonId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isStaff) {
    return (
      <div className="min-h-screen bg-[#09143A] text-slate-50 p-6 flex items-center justify-center">
        <div className="max-w-lg w-full rounded-3xl bg-[#101E52] border border-violet-400/30 p-8 text-center space-y-5">
          <Sparkles className="w-12 h-12 text-amber-300 mx-auto" />
          <h1 className="text-2xl font-black text-white">تحدي الدرس الذكي — للمعلم والمشرف</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            هذه الميزة مخصصة لمعلمي ومشرفي حلقات مسجد ابن تيمية لرفع دروس PDF وتحويلها آلياً إلى مسابقات موثقة بالصفحة والمصدر.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-6 py-3 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black"
            >
              تسجيل دخول المعلم / المشرف
            </button>
            <button
              type="button"
              onClick={onBack}
              className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold"
            >
              العودة للرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09143A] text-slate-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-300" />
              <span>تحدي الدرس الذكي — استوديو PDF بالذكاء الاصطناعي</span>
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              من رفع PDF عربي (نصي أو ممسوح ضوئياً) إلى التحقق المصدري والاعتماد وتشغيل المسابقة تلقائياً
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2.5 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-white/10 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <ArrowRight className="w-4 h-4" />
            <span>الرئيسية</span>
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/20 border border-rose-400/40 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Upload & Saved Lessons Sidebar */}
          <div className="lg:col-span-5 space-y-5">
            <form onSubmit={handleGenerate} className="rounded-2xl bg-[#101E52] border border-violet-400/30 p-5 space-y-4">
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-sky-400" />
                <span>رفع درس PDF جديد</span>
              </h2>

              <div>
                <label htmlFor="lesson-pdf-input" className="block text-xs font-bold text-slate-300 mb-1.5">
                  ملف الدرس (PDF عربي — بحد أقصى 15 ميجابايت)
                </label>
                <input
                  id="lesson-pdf-input"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-200 file:ml-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-sky-400 file:text-slate-950 file:font-bold bg-[#09143A] rounded-xl p-2 border border-slate-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="lesson-title" className="block text-xs font-bold text-slate-300 mb-1">
                    عنوان الدرس
                  </label>
                  <input
                    id="lesson-title"
                    type="text"
                    value={lessonTitle}
                    onChange={(e) => setLessonTitle(e.target.value)}
                    placeholder="مثال: الهجرة النبوية الشريفة"
                    className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-3 py-2 text-sm text-white outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="lesson-subject" className="block text-xs font-bold text-slate-300 mb-1">
                    المادة / التصنيف
                  </label>
                  <input
                    id="lesson-subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-3 py-2 text-sm text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="lesson-age" className="block text-xs font-bold text-slate-300 mb-1">
                    الفئة العمرية
                  </label>
                  <select
                    id="lesson-age"
                    value={ageGroup}
                    onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
                    className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-2 py-2 text-xs text-white"
                  >
                    {CANONICAL_AGE_GROUPS.map((ag) => (
                      <option key={ag} value={ag}>
                        {AGE_GROUP_LABELS[ag]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="lesson-diff" className="block text-xs font-bold text-slate-300 mb-1">
                    الصعوبة
                  </label>
                  <select
                    id="lesson-diff"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                    className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-2 py-2 text-xs text-white"
                  >
                    {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
                      <option key={d} value={d}>
                        {DIFFICULTY_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="lesson-count" className="block text-xs font-bold text-slate-300 mb-1">
                    عدد الأسئلة
                  </label>
                  <select
                    id="lesson-count"
                    value={requestedCount}
                    onChange={(e) => setRequestedCount(Number(e.target.value))}
                    className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-2 py-2 text-xs text-white tabular-nums"
                  >
                    <option value={10}>10 أسئلة</option>
                    <option value={20}>20 سؤالاً</option>
                    <option value={30}>30 سؤالاً</option>
                    <option value={50}>50 سؤالاً</option>
                    <option value={100}>100 سؤال</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="lesson-pages" className="block text-xs font-bold text-slate-300 mb-1">
                  نطاق صفحات محدد (اختياري لجولة قصيرة)
                </label>
                <input
                  id="lesson-pages"
                  type="text"
                  value={pageRangeHint}
                  onChange={(e) => setPageRangeHint(e.target.value)}
                  placeholder="مثال: الصفحات 2 إلى 5 فقط"
                  className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-300 mb-1.5">أنواع التحديات المرغوبة</span>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_ROUND_TYPES.map((rt) => {
                    const active = allowedTypes.includes(rt);
                    return (
                      <button
                        key={rt}
                        type="button"
                        onClick={() =>
                          setAllowedTypes((prev) =>
                            prev.includes(rt) ? (prev.length > 1 ? prev.filter((x) => x !== rt) : prev) : [...prev, rt]
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
                          active
                            ? 'bg-violet-600 border-violet-400 text-white'
                            : 'bg-[#09143A] border-white/10 text-slate-400'
                        }`}
                      >
                        {ROUND_RULES[rt].nameAr}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={generating}
                className="w-full py-3.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-sm disabled:opacity-60"
              >
                {generating ? 'جاري التحليل والتوليد والتحقق...' : 'تحليل PDF وتوليد بنك المسابقة'}
              </button>

              {generating && pipelineStepLabel && (
                <p className="text-xs text-sky-300 text-center font-bold">{pipelineStepLabel}</p>
              )}
            </form>

            {/* Saved Lessons */}
            <div className="rounded-2xl bg-[#101E52] border border-white/10 p-5 space-y-3">
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-300" />
                <span>مكتبة الدروس المحفوظة ({lessons.length})</span>
              </h2>
              {lessons.length === 0 ? (
                <p className="text-xs text-slate-400">لم تُرفع دروس بعد. ارفع ملف PDF لإنشاء أول بنك درس مستقل.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {lessons.map((l) => (
                    <div
                      key={l.lessonId}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                        selectedLesson?.lessonId === l.lessonId
                          ? 'bg-sky-500/20 border-sky-400'
                          : 'bg-[#09143A] border-white/10'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openLessonDetail(l.lessonId)}
                        className="text-right flex-1 min-w-0"
                      >
                        <div className="font-bold text-sm text-white truncate">{l.title}</div>
                        <div className="text-[11px] text-slate-400">
                          {l.publishedCount} منشور · {l.needsReviewCount} للمراجعة · {l.pageCount} صفحة
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteLesson(l.lessonId)}
                        aria-label={`حذف درس ${l.title}`}
                        className="p-2 rounded-lg text-rose-300 hover:bg-rose-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pipeline Diagnostic & Teacher Review Area */}
          <div className="lg:col-span-7 space-y-5">
            {!selectedLesson ? (
              <div className="rounded-2xl bg-[#101E52] border border-white/10 p-10 text-center space-y-3">
                <FileText className="w-12 h-12 text-slate-500 mx-auto" />
                <h2 className="text-lg font-extrabold text-white">اختر درساً أو ارفع PDF جديداً</h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  يظهر هنا مسار المعالجة الذكي (5 مراحل وبث فوري)، موضوعات الدرس، التغطية، والأسئلة الموثقة برقم الصفحة والمقتطف الداعم.
                </p>
              </div>
            ) : (
              <>
                {/* Pipeline Stages Inspector */}
                <div className="rounded-2xl bg-[#101E52] border border-sky-400/25 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black text-white">{selectedLesson.title}</h2>
                      <div className="text-xs text-slate-300">
                        {selectedLesson.filename} · {selectedLesson.pageCount} صفحة ·{' '}
                        {selectedLesson.isScannedPdf ? 'PDF ممسوح ضوئياً' : 'PDF نصي'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => exportBank('json')}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => exportBank('csv')}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> CSV
                      </button>
                    </div>
                  </div>

                  {/* 5-Phase High-Level Progress + Incremental Streaming Counter */}
                  <div className="rounded-xl bg-[#09143A] border border-sky-400/20 p-4 space-y-3">
                    {(() => {
                      const stage = selectedLesson.pipelineStage;
                      const activeStep =
                        stage === 'uploaded' || stage === 'document_parsing'
                          ? 0
                          : stage === 'arabic_analysis' ||
                            stage === 'learning_objectives' ||
                            stage === 'distribution_plan'
                          ? 1
                          : stage === 'question_generation'
                          ? 2
                          : stage === 'grounding_verification' ||
                            stage === 'deduplication' ||
                            stage === 'schema_validation'
                          ? 3
                          : 4;
                      const phases = [
                        'قراءة PDF',
                        'تحليل الدرس',
                        'توليد الأسئلة',
                        'تدقيق النتائج',
                        'تجهيز المسابقة',
                      ];
                      return (
                        <div className="grid grid-cols-5 gap-1.5 text-center">
                          {phases.map((label, idx) => {
                            const done =
                              stage === 'teacher_review' ||
                              stage === 'session_ready' ||
                              idx < activeStep;
                            const current =
                              isLessonBusy && idx === activeStep;
                            return (
                              <div
                                key={label}
                                className={`rounded-lg py-1.5 px-1 text-[11px] font-bold border ${
                                  done
                                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                                    : current
                                    ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                                    : 'bg-[#101E52] border-white/10 text-slate-400'
                                }`}
                              >
                                {label}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-extrabold text-sky-300">
                        {selectedLesson.statusMessageAr ||
                          `تم إنشاء ${questions.length} من أصل ${selectedLesson.requestedCount} سؤالًا`}
                      </span>
                      <span className="font-bold text-slate-300 tabular-nums">
                        {questions.length} / {selectedLesson.requestedCount} سؤال صالح
                        {selectedLesson.totalBatches > 0 &&
                          ` · الدفعات: ${selectedLesson.completedBatches}/${selectedLesson.totalBatches}`}
                      </span>
                    </div>

                    {(selectedLesson.cacheHit || selectedLesson.elapsedMs) && (
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
                        {selectedLesson.cacheHit && (
                          <span className="text-emerald-300 font-bold">
                            تحليل PDF محفوظ مسبقاً (تسريع فوري)
                          </span>
                        )}
                        {typeof selectedLesson.elapsedMs === 'number' && selectedLesson.elapsedMs > 0 && (
                          <span className="tabular-nums text-sky-200">
                            الزمن الفعلي: {(selectedLesson.elapsedMs / 1000).toFixed(1)} ثانية
                          </span>
                        )}
                      </div>
                    )}

                    <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          selectedLesson.pipelineStage === 'batch_paused' || selectedLesson.pipelineStage === 'failed'
                            ? 'bg-amber-400'
                            : selectedLesson.pipelineStage === 'cancelled'
                            ? 'bg-slate-400'
                            : 'bg-sky-400'
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (questions.length / Math.max(1, selectedLesson.requestedCount)) * 100
                            )
                          )}%`,
                        }}
                      />
                    </div>

                    {selectedLesson.errorMessage && (
                      <div className="rounded-lg bg-amber-500/15 border border-amber-400/30 p-3 text-xs text-amber-100 flex items-start gap-2">
                        <PauseCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                        <span>{sanitizeUserError(selectedLesson.errorMessage)}</span>
                      </div>
                    )}

                    {selectedLesson.insufficientContentNote && (
                      <div className="rounded-lg bg-violet-500/15 border border-violet-400/30 p-3 text-xs text-violet-100 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-violet-300 shrink-0 mt-0.5" />
                        <span>{selectedLesson.insufficientContentNote}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {isLessonBusy && (
                        <button
                          type="button"
                          onClick={handleCancelGeneration}
                          className="px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>إلغاء</span>
                        </button>
                      )}

                      {!isLessonBusy &&
                        (selectedLesson.failedBatchIndex !== null ||
                          selectedLesson.pipelineStage === 'batch_paused' ||
                          selectedLesson.pipelineStage === 'failed') && (
                          <button
                            type="button"
                            onClick={handleRetryFailedBatch}
                            className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black inline-flex items-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>إعادة محاولة الدفعة الفاشلة</span>
                          </button>
                        )}

                      {!isLessonBusy &&
                        !selectedLesson.insufficientContentNote &&
                        (selectedLesson.pipelineStage === 'batch_paused' ||
                          selectedLesson.pipelineStage === 'cancelled' ||
                          selectedLesson.pipelineStage === 'failed' ||
                          questions.length < selectedLesson.requestedCount) && (
                          <button
                            type="button"
                            onClick={handleResumeGeneration}
                            className="px-3.5 py-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-black inline-flex items-center gap-1.5"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>استكمال التوليد</span>
                          </button>
                        )}
                    </div>

                    {selectedLesson.diagnosticLogs.length > 0 && (
                      <details className="text-[11px] text-slate-400 pt-1">
                        <summary className="cursor-pointer font-bold text-slate-300 hover:text-white">
                          سجل التشخيص الفني ({selectedLesson.diagnosticLogs.length})
                        </summary>
                        <div className="mt-2 max-h-40 overflow-y-auto space-y-1 bg-[#060E2A] p-2.5 rounded-lg border border-white/5 font-mono text-[10px]">
                          {selectedLesson.diagnosticLogs.map((d, di) => (
                            <div key={di} className="text-slate-300">
                              {d.batchIndex !== undefined ? `[B${d.batchIndex + 1} size=${d.batchSize ?? '-'}] ` : ''}
                              {d.finishReason ? `finishReason=${d.finishReason} ` : ''}
                              {d.outputChars !== undefined ? `chars=${d.outputChars} ` : ''}
                              — {d.message}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>

                  {/* Stage Logs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedLesson.stageLogs.map((log, i) => (
                      <div key={i} className="rounded-xl bg-[#09143A] p-3 border border-white/10 text-xs space-y-0.5">
                        <div className="font-bold text-white flex items-center justify-between">
                          <span>{log.labelAr}</span>
                          <span
                            className={
                              log.status === 'completed'
                                ? 'text-emerald-400'
                                : log.status === 'running'
                                ? 'text-sky-300'
                                : log.status === 'warning'
                                ? 'text-amber-300'
                                : 'text-rose-400'
                            }
                          >
                            {log.status === 'completed'
                              ? 'مكتمل'
                              : log.status === 'running'
                              ? 'قيد التنفيذ'
                              : log.status === 'warning'
                              ? 'مراجعة'
                              : 'فشل'}
                          </span>
                        </div>
                        <p className="text-slate-400">{log.detail}</p>
                      </div>
                    ))}
                  </div>

                  {/* Topics & Objectives */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-[#09143A] p-3 border border-white/10">
                      <div className="font-bold text-sky-300 mb-1">الموضوعات المستخلصة</div>
                      <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                        {selectedLesson.topics.map((t, idx) => (
                          <li key={idx}>{t}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl bg-[#09143A] p-3 border border-white/10">
                      <div className="font-bold text-violet-300 mb-1">ملخص التغطية والتحقق</div>
                      <p className="text-slate-300 leading-relaxed">{selectedLesson.coverageSummary}</p>
                      <div className="mt-2 font-bold text-slate-200 tabular-nums">
                        معتمد: {selectedLesson.publishedCount} · للمراجعة: {selectedLesson.needsReviewCount} · مرفوض: {selectedLesson.rejectedCount}
                      </div>
                    </div>
                  </div>

                  {/* Launch Bar */}
                  <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {selectedLesson.rejectedCount > 0 && !isLessonBusy && (
                        <button
                          type="button"
                          disabled={generating}
                          onClick={regenerateRejected}
                          className="px-3.5 py-2.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>إعادة توليد الأسئلة المرفوضة فقط</span>
                        </button>
                      )}
                      {selectedLesson.needsReviewCount > 0 && !isLessonBusy && (
                        <button
                          type="button"
                          onClick={() => approveAllAndAutoStart(true)}
                          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black inline-flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>اعتماد الكل وبدء تلقائي (5ث)</span>
                        </button>
                      )}
                    </div>

                    {autoStartSec !== null ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-300 tabular-nums">
                          يبدأ اللعب خلال {autoStartSec}ث...
                        </span>
                        <button
                          type="button"
                          onClick={() => setAutoStartSec(null)}
                          className="px-3 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold"
                        >
                          إلغاء البدء التلقائي
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={selectedLesson.publishedCount === 0}
                        onClick={launchGameNow}
                        className="px-5 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-xs inline-flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>
                          {selectedLesson.publishedCount === 0
                            ? 'اعتمد سؤالاً واحداً على الأقل للبدء'
                            : `ابدأ الآن بالأسئلة المعتمدة (${selectedLesson.publishedCount})`}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Generated Questions Review List */}
                <div className="rounded-2xl bg-[#101E52] border border-white/10 p-5 space-y-3">
                  <h3 className="text-base font-extrabold text-white">
                    مراجعة الأسئلة المولّدة ({questions.length})
                  </h3>
                  <div className="space-y-3">
                    {questions.map((q) => (
                      <div key={q.id} className="rounded-xl bg-[#09143A] border border-white/10 p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sky-300">{ROUND_RULES[q.roundType]?.nameAr}</span>
                            <span>·</span>
                            <span className="text-amber-300 font-bold">صفحة {q.sourcePage || 1}</span>
                            {q.isReligious && (
                              <>
                                <span>·</span>
                                <span className="text-violet-300">محتوى شرعي</span>
                              </>
                            )}
                          </div>
                          <span
                            className={`font-bold flex items-center gap-1 ${
                              q.status === 'published' ? 'text-emerald-400' : 'text-amber-300'
                            }`}
                          >
                            {q.status === 'published' ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" /> معتمد ومنشور
                              </>
                            ) : (
                              <>
                                <ShieldAlert className="w-3.5 h-3.5" /> بانتظار اعتماد المعلم
                              </>
                            )}
                          </span>
                        </div>

                        {editingId === q.id ? (
                          <div className="space-y-2 pt-1">
                            <input
                              type="text"
                              value={editPrompt}
                              onChange={(e) => setEditPrompt(e.target.value)}
                              className="w-full rounded-lg bg-[#101E52] border border-sky-400 px-3 py-2 text-sm text-white"
                            />
                            <input
                              type="text"
                              value={editAnswer}
                              onChange={(e) => setEditAnswer(e.target.value)}
                              placeholder="الإجابات مفصولة بـ |"
                              className="w-full rounded-lg bg-[#101E52] border border-sky-400 px-3 py-2 text-xs text-white"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => saveEdit(q.id)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold"
                              >
                                حفظ واعتماد
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="px-3 py-1.5 rounded-lg bg-white/10 text-xs"
                              >
                                إلغاء
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="font-bold text-white text-sm">{q.prompt}</div>
                            <div className="text-xs text-emerald-300">
                              الإجابة: {q.acceptableAnswers.join(' · ')}
                            </div>
                            {q.sourceExcerpt && (
                              <div className="text-xs text-slate-400">الدليل من الملف: «{q.sourceExcerpt}»</div>
                            )}
                          </>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          {q.status !== 'published' && (
                            <button
                              type="button"
                              onClick={() => approveQuestion(q)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 text-xs font-bold inline-flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> اعتماد
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(q.id);
                              setEditPrompt(q.prompt);
                              setEditAnswer(q.acceptableAnswers.join(' | '));
                            }}
                            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteQuestion(q.id)}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> حذف
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
