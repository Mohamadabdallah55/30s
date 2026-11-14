import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  FileText,
  MonitorPlay,
  PauseCircle,
  Play,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
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
  AllowedAiModel,
  Difficulty,
  GameSessionView,
  LessonBatchSummary,
  ProfilePublic,
  QuestionRecord,
  RoundConfig,
  RoundType,
} from '../shared/types';
import { apiFetch, getAuthToken, useSessionSocket } from '../utils/api';
import { SessionQrBadge } from './BrandEmblem';

interface LessonStudioProps {
  user: ProfilePublic | null;
  initialLessonId?: string | null;
  onSelectLessonId?: (lessonId: string | null) => void;
  onBack: () => void;
  onOpenAuth: () => void;
  onLaunchSession: (session: GameSessionView) => void;
  onOpenHostPanel?: (session: GameSessionView) => void;
  onOpenProjector?: (session: GameSessionView) => void;
}

export function LessonStudio({
  user,
  initialLessonId,
  onSelectLessonId,
  onBack,
  onOpenAuth,
  onLaunchSession,
  onOpenHostPanel,
  onOpenProjector,
}: LessonStudioProps) {
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
  const [aiModel, setAiModel] = useState<AllowedAiModel>('gemini-4-hydrogen');
  const [allowedAiModels, setAllowedAiModels] = useState<
    Array<{ id: AllowedAiModel; labelAr: string; noteAr?: string }>
  >([
    {
      id: 'gemini-4-hydrogen',
      labelAr: 'gemini-4-hydrogen — متوازن ودقيق لتحليل PDF العربي (موصى به)',
    },
    {
      id: 'gemini-3.1-flash-lite',
      labelAr: 'gemini-3.1-flash-lite — سريع وخفيف لتقليل استهلاك الحصة',
    },
  ]);
  const [freeTierNotice, setFreeTierNotice] = useState<string>(
    'يستخدم استوديو PDF حصرياً نماذج Gemini Flash ضمن الحصة المجانية (Free Tier) بحدود طلبات يومية ولحظية ليست بلا حدود.'
  );
  const [savingModel, setSavingModel] = useState(false);

  // Pre-start QR Remote Control & Quick Match Config
  const [team1Name, setTeam1Name] = useState('فريق النخبة');
  const [team2Name, setTeam2Name] = useState('فريق الرواد');
  const [matchTimerSec, setMatchTimerSec] = useState<number>(30);
  const [preparedSession, setPreparedSession] = useState<GameSessionView | null>(null);
  const [preparingQr, setPreparingQr] = useState(false);
  const [autoOpenProjectorOnStart, setAutoOpenProjectorOnStart] = useState(true);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [qrViewTab, setQrViewTab] = useState<'host' | 'buzzers'>('host');

  // Generated questions filter
  const [questionStatusFilter, setQuestionStatusFilter] = useState<'all' | 'published' | 'needs_review'>('all');
  const [questionSearch, setQuestionSearch] = useState('');

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

  const loadAiModelSetting = async () => {
    if (!isStaff) return;
    try {
      const res = await apiFetch<{
        model: AllowedAiModel;
        allowedModels: Array<{ id: AllowedAiModel; labelAr: string; noteAr?: string } | AllowedAiModel>;
        freeTierNoticeAr?: string;
      }>('/api/settings/ai-model');
      if (res.model) setAiModel(res.model);
      if (res.allowedModels?.length) {
        setAllowedAiModels(
          res.allowedModels.map((item) =>
            typeof item === 'string'
              ? {
                  id: item,
                  labelAr:
                    item === 'gemini-4-hydrogen'
                      ? 'gemini-4-hydrogen — متوازن ودقيق لتحليل PDF العربي (موصى به)'
                      : 'gemini-3.1-flash-lite — سريع وخفيف لتقليل استهلاك الحصة',
                }
              : item
          )
        );
      }
      if (res.freeTierNoticeAr) setFreeTierNotice(res.freeTierNoticeAr);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadLessons();
    loadAiModelSetting();
  }, [isStaff]);

  useEffect(() => {
    if (isStaff && initialLessonId && selectedLesson?.lessonId !== initialLessonId) {
      openLessonDetail(initialLessonId);
    }
  }, [isStaff, initialLessonId]);

  const { connected: qrSocketConnected } = useSessionSocket(
    preparedSession?.code ?? null,
    'host',
    (updated) => {
      setPreparedSession(updated);
      if (autoOpenProjectorOnStart && updated.phase === 'playing' && onOpenProjector) {
        onOpenProjector(updated);
      }
    }
  );

  const handleModelChange = async (nextModel: AllowedAiModel) => {
    setSavingModel(true);
    setError(null);
    try {
      const res = await apiFetch<{ model: AllowedAiModel }>('/api/settings/ai-model', {
        method: 'PUT',
        body: JSON.stringify({ model: nextModel }),
      });
      setAiModel(res.model);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ إعداد النموذج');
    } finally {
      setSavingModel(false);
    }
  };

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
      setPreparedSession(null);
      onSelectLessonId?.(res.lesson.lessonId);
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

  const [excludedMatchRounds, setExcludedMatchRounds] = useState<RoundType[]>([]);
  const createLessonSession = async (): Promise<GameSessionView | null> => {
    if (!selectedLesson) return null;
    const publishedRounds = Array.from(
      new Set(questions.filter((q) => q.status === 'published').map((q) => q.roundType))
    );
    const chosenRounds = publishedRounds.filter((type) => !excludedMatchRounds.includes(type));
    if (!chosenRounds.length) throw new Error('اختار جولة واحدة على الأقل من الأسئلة المعتمدة.');
    const roundOverrides: Partial<Record<RoundType, Partial<RoundConfig>>> = {};
    for (const rt of chosenRounds) {
      roundOverrides[rt] = { durationSec: matchTimerSec };
    }
    const res = await apiFetch<{ session: GameSessionView }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        title: `تحدي الدرس الذكي: ${selectedLesson.title}`,
        bankId: selectedLesson.bankId,
        lessonId: selectedLesson.lessonId,
        ageGroup: selectedLesson.ageGroup,
        difficulty: selectedLesson.difficulty,
        category: 'الكل',
        roundTypes: chosenRounds,
        roundOverrides,
        teams: [
          { name: team1Name.trim() || 'فريق النخبة', color: '#38BDF8' },
          { name: team2Name.trim() || 'فريق الرواد', color: '#F59E0B' },
        ],
        settings: {
          hostControlled: true,
          showMode: true,
          defaultTimerSec: matchTimerSec,
        },
      }),
    });
    return res.session;
  };

  const launchGameNow = async () => {
    if (!selectedLesson) return;
    try {
      const session = preparedSession ?? (await createLessonSession());
      if (session) onLaunchSession(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'يرجى اعتماد سؤال واحد منشور على الأقل قبل البدء');
    }
  };

  const prepareTeacherRemoteQr = async () => {
    if (!selectedLesson) return;
    setError(null);
    setPreparingQr(true);
    try {
      const session = await createLessonSession();
      if (session) {
        setPreparedSession(session);
        setQrViewTab('host');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'يرجى اعتماد سؤال واحد منشور على الأقل قبل تجهيز الجلسة');
    } finally {
      setPreparingQr(false);
    }
  };

  const copyUrl = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedLinkKey(key);
    setTimeout(() => setCopiedLinkKey(null), 2000);
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
            onClick={() => {
              if (
                typeof window !== 'undefined' &&
                window.innerWidth < 1024 &&
                selectedLesson
              ) {
                setSelectedLesson(null);
                setQuestions([]);
                setPreparedSession(null);
                onSelectLessonId?.(null);
                return;
              }
              onBack();
            }}
            className="px-4 py-2.5 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-white/10 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ArrowRight className="w-4 h-4" />
            <span>عودة خطوة</span>
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/20 border border-rose-400/40 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Upload, Free Tier Model Settings & Saved Lessons Sidebar */}
          <div className="lg:col-span-5 space-y-5">
            <div className="rounded-2xl bg-[#101E52] border border-emerald-400/30 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-extrabold text-emerald-300">إعداد نموذج الحصة المجانية (Free Tier)</h2>
                <span className="text-[11px] font-mono text-slate-200 bg-[#09143A] px-2 py-0.5 rounded-lg border border-white/10 whitespace-nowrap shrink-0" dir="ltr">
                  {aiModel}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{freeTierNotice}</p>
              <div>
                <label htmlFor="ai-model-select" className="block text-xs font-bold text-slate-300 mb-1">
                  نموذج Gemini Flash المعتمد (مجاني فقط)
                </label>
                <select
                  id="ai-model-select"
                  value={aiModel}
                  disabled={savingModel}
                  onChange={(e) => handleModelChange(e.target.value as AllowedAiModel)}
                  className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-3 py-2 text-xs font-bold text-white outline-none disabled:opacity-60"
                >
                  {allowedAiModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.labelAr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLesson(null);
                          setQuestions([]);
                          setPreparedSession(null);
                          onSelectLessonId?.(null);
                        }}
                        aria-label="إغلاق تفاصيل الدرس"
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> إغلاق الدرس
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
                          `تم حفظ ${questions.length} من أصل ${selectedLesson.requestedCount} سؤالاً`}
                      </span>
                      <span className="font-bold text-slate-300 tabular-nums">
                        {questions.length} / {selectedLesson.requestedCount} سؤال محفوظ
                        {selectedLesson.totalBatches > 0 &&
                          ` · الدفعات: ${selectedLesson.completedBatches}/${selectedLesson.totalBatches}`}
                      </span>
                    </div>

                    {/* Detailed Batch & Quota Telemetry Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[11px]">
                      <div className="rounded-lg bg-[#101E52] border border-white/10 p-2">
                        <div className="text-slate-400">المستلمة</div>
                        <div className="font-black text-white tabular-nums mt-0.5">{selectedLesson.receivedCount}</div>
                      </div>
                      <div className="rounded-lg bg-[#101E52] border border-white/10 p-2">
                        <div className="text-slate-400">المقبولة</div>
                        <div className="font-black text-sky-300 tabular-nums mt-0.5">{selectedLesson.acceptedCount}</div>
                      </div>
                      <div className="rounded-lg bg-[#101E52] border border-white/10 p-2">
                        <div className="text-slate-400">المحفوظة فعلياً</div>
                        <div className="font-black text-emerald-300 tabular-nums mt-0.5">{questions.length}</div>
                      </div>
                      <div className="rounded-lg bg-[#101E52] border border-white/10 p-2">
                        <div className="text-slate-400">دفعات فاشلة</div>
                        <div className="font-black text-amber-300 tabular-nums mt-0.5">{selectedLesson.failedBatches}</div>
                      </div>
                      <div className="rounded-lg bg-[#101E52] border border-white/10 p-2">
                        <div className="text-slate-400">النموذج</div>
                        <div className="font-mono font-bold text-violet-200 truncate mt-0.5" dir="ltr">
                          {selectedLesson.modelUsed || aiModel}
                        </div>
                      </div>
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
                      <div
                        className={`rounded-lg border p-3 text-xs flex items-start gap-2 ${
                          selectedLesson.errorCategory === 'quota_exhausted'
                            ? 'bg-rose-500/15 border-rose-400/40 text-rose-100'
                            : 'bg-amber-500/15 border-amber-400/30 text-amber-100'
                        }`}
                      >
                        <PauseCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <div>{sanitizeUserError(selectedLesson.errorMessage)}</div>
                          {selectedLesson.errorCategory === 'quota_exhausted' && (
                            <div className="text-[11px] text-rose-200/90">
                              ملاحظة الحصة المجانية: أُوقف الطلب الفوري تلقائياً لحماية حصتك. يمكنك تشغيل المسابقة فوراً بأي أسئلة معتمدة أعلاه أو المحاولة لاحقاً عند تجدد الحصة اليومية.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedLesson.fileAvailable === false &&
                      !isLessonBusy &&
                      questions.length < selectedLesson.requestedCount && (
                        <div className="rounded-lg bg-rose-500/15 border border-rose-400/40 p-3 text-xs text-rose-100 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                          <span>
                            ملف PDF الأصلي غير متاح حالياً على القرص؛ يرجى إعادة رفع الملف من نموذج الرفع الجانبي لاستكمال التوليد أو تشغيل الأسئلة المحفوظة حالياً.
                          </span>
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
                        selectedLesson.fileAvailable !== false &&
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
                        selectedLesson.fileAvailable !== false &&
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

                  {/* Quick Teams & Timer Customization before Launch */}
                  <div className="rounded-xl bg-[#09143A] border border-white/10 p-3.5 space-y-3">
                    <div className="text-xs font-extrabold text-sky-300">تخصيص سريع قبل بدء مسابقة الدرس</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label htmlFor="lesson-team1" className="block text-[11px] font-bold text-slate-300 mb-1">
                          الفريق الأول
                        </label>
                        <input
                          id="lesson-team1"
                          type="text"
                          value={team1Name}
                          onChange={(e) => setTeam1Name(e.target.value)}
                          className="w-full rounded-lg bg-[#101E52] border border-slate-600 px-3 py-1.5 text-xs font-bold text-white outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="lesson-team2" className="block text-[11px] font-bold text-slate-300 mb-1">
                          الفريق الثاني
                        </label>
                        <input
                          id="lesson-team2"
                          type="text"
                          value={team2Name}
                          onChange={(e) => setTeam2Name(e.target.value)}
                          className="w-full rounded-lg bg-[#101E52] border border-slate-600 px-3 py-1.5 text-xs font-bold text-white outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="lesson-timer" className="block text-[11px] font-bold text-slate-300 mb-1">
                          مدة السؤال
                        </label>
                        <select
                          id="lesson-timer"
                          value={matchTimerSec}
                          onChange={(e) => setMatchTimerSec(Number(e.target.value))}
                          className="w-full rounded-lg bg-[#101E52] border border-slate-600 px-2.5 py-1.5 text-xs font-bold text-white outline-none tabular-nums"
                        >
                          <option value={20}>20 ثانية</option>
                          <option value={30}>30 ثانية (القياسي)</option>
                          <option value={45}>45 ثانية</option>
                          <option value={60}>60 ثانية</option>
                        </select>
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

                    {questions.some((q) => q.status === 'published') && <fieldset className="flex flex-wrap gap-2">
                      <legend className="text-xs font-black text-sky-200 mb-2">اختار جولات الدرس</legend>
                      {Array.from(new Set(questions.filter((q) => q.status === 'published').map((q) => q.roundType))).map((type) => (
                        <label key={type} className="text-xs rounded-xl bg-[#101E52] px-3 py-2 flex items-center gap-2">
                          <input type="checkbox" checked={!excludedMatchRounds.includes(type)}
                            onChange={() => {
                              setPreparedSession(null);
                              setExcludedMatchRounds((previous) => previous.includes(type) ? previous.filter((x) => x !== type) : [...previous, type]);
                            }} />
                          {ROUND_RULES[type].nameAr}
                        </label>
                      ))}
                    </fieldset>}
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
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={selectedLesson.publishedCount === 0 || preparingQr}
                          onClick={prepareTeacherRemoteQr}
                          className="px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 font-black text-xs inline-flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
                        >
                          <QrCode className="w-4 h-4" />
                          <span>
                            {preparingQr ? 'جاري تجهيز QR...' : 'تحضير QR لتحكم الأستاذ من الجوال (قبل البدء)'}
                          </span>
                        </button>
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
                      </div>
                    )}
                  </div>

                  {/* Pre-Start Teacher Phone QR Remote Control Studio */}
                  {preparedSession && (
                    <div className="rounded-2xl bg-gradient-to-br from-[#09143A] to-[#0D1E54] border border-emerald-400/50 p-5 space-y-4 shadow-xl">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-5 h-5 text-emerald-300" />
                          <div>
                            <h3 className="text-sm font-black text-white">
                              غرفة تحضير الأستاذ — تحكم من الجوال قبل بدء المسابقة
                            </h3>
                            <div className="text-[11px] text-slate-300 flex items-center gap-2">
                              <span>
                                رمز الجلسة:{' '}
                                <strong className="font-mono text-amber-300 text-xs">{preparedSession.code}</strong>
                              </span>
                              <span>·</span>
                              <span className={qrSocketConnected ? 'text-emerald-300 font-bold' : 'text-slate-400'}>
                                {preparedSession.phase === 'playing'
                                  ? 'تم بدء المسابقة من هاتف الأستاذ!'
                                  : qrSocketConnected
                                  ? 'متصل — بانتظار بدء الأستاذ من الجوال'
                                  : 'جاهز للمسح والربط'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreparedSession(null)}
                          aria-label="إغلاق لوحة QR"
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex gap-2 p-1 rounded-xl bg-[#071030] w-fit">
                        <button
                          type="button"
                          onClick={() => setQrViewTab('host')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                            qrViewTab === 'host' ? 'bg-emerald-400 text-slate-950' : 'text-slate-300'
                          }`}
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>QR تحكم الأستاذ (الجوال)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setQrViewTab('buzzers')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                            qrViewTab === 'buzzers' ? 'bg-sky-400 text-slate-950' : 'text-slate-300'
                          }`}
                        >
                          <Bell className="w-3.5 h-3.5" />
                          <span>QR جرس الطلاب</span>
                        </button>
                      </div>

                      {qrViewTab === 'host' ? (
                        <div className="flex flex-col sm:flex-row items-center gap-5">
                          <SessionQrBadge
                            code={preparedSession.code}
                            url={`${window.location.origin}/?mode=host&code=${preparedSession.code}`}
                            size="lg"
                          />
                          <div className="flex-1 space-y-3 text-right">
                            <p className="text-xs text-slate-200 leading-relaxed">
                              امسح هذا الرمز بكاميرا هاتفك قبل البدء؛ ستفتح لديك لوحة التحكم الكاملة (زر بدء المباراة، كشف الإجابة، المؤقت، وتعديل النقاط) وتبقى شاشة القاعة للبروجكتر.
                            </p>
                            <label className="inline-flex items-center gap-2 text-xs text-emerald-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={autoOpenProjectorOnStart}
                                onChange={(e) => setAutoOpenProjectorOnStart(e.target.checked)}
                                className="rounded accent-emerald-400"
                              />
                              <span>افتح شاشة البروجكتر (16:9) تلقائياً فور ضغط «بدء المباراة» من الجوال</span>
                            </label>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  copyUrl(
                                    'host-qr',
                                    `${window.location.origin}/?mode=host&code=${preparedSession.code}`
                                  )
                                }
                                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1.5"
                              >
                                {copiedLinkKey === 'host-qr' ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                                <span>{copiedLinkKey === 'host-qr' ? 'تم النسخ!' : 'نسخ رابط تحكم الجوال'}</span>
                              </button>
                              {onOpenProjector && (
                                <button
                                  type="button"
                                  onClick={() => onOpenProjector(preparedSession)}
                                  className="px-4 py-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-black inline-flex items-center gap-1.5"
                                >
                                  <MonitorPlay className="w-3.5 h-3.5" />
                                  <span>تشغيل شاشة البروجكتر الآن (16:9)</span>
                                </button>
                              )}
                              {onOpenHostPanel && (
                                <button
                                  type="button"
                                  onClick={() => onOpenHostPanel(preparedSession)}
                                  className="px-3.5 py-2 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-amber-400/35 text-amber-200 text-xs font-bold"
                                >
                                  فتح لوحة المشرف هنا
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {preparedSession.teams.map((t) => {
                            const buzzUrl = `${window.location.origin}/?mode=buzzer&code=${preparedSession.code}&team=${t.index}`;
                            const key = `buzz-${t.index}`;
                            return (
                              <div
                                key={t.index}
                                className="rounded-xl bg-[#101E52] border border-white/10 p-3.5 flex flex-col items-center gap-2 text-center"
                              >
                                <div className="text-xs font-black text-white">جرس {t.name}</div>
                                <SessionQrBadge code={preparedSession.code} url={buzzUrl} size="sm" />
                                <button
                                  type="button"
                                  onClick={() => copyUrl(key, buzzUrl)}
                                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold inline-flex items-center gap-1"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>{copiedLinkKey === key ? 'تم النسخ!' : 'نسخ رابط الجرس'}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Generated Questions Review List */}
                <div className="rounded-2xl bg-[#101E52] border border-white/10 p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-extrabold text-white">
                      مراجعة الأسئلة المولّدة ({questions.length})
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex gap-1 p-1 rounded-xl bg-[#09143A] text-xs font-bold">
                        {(
                          [
                            ['all', 'الكل'],
                            ['published', 'معتمد'],
                            ['needs_review', 'للمراجعة'],
                          ] as const
                        ).map(([k, lbl]) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setQuestionStatusFilter(k)}
                            className={`px-2.5 py-1 rounded-lg transition-colors ${
                              questionStatusFilter === k ? 'bg-sky-400 text-slate-950' : 'text-slate-300'
                            }`}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={questionSearch}
                          onChange={(e) => setQuestionSearch(e.target.value)}
                          placeholder="بحث في الأسئلة..."
                          className="rounded-xl bg-[#09143A] border border-white/10 pr-8 pl-3 py-1.5 text-xs text-white outline-none focus:border-sky-400 w-44"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {questions
                      .filter((q) => {
                        if (questionStatusFilter === 'published' && q.status !== 'published') return false;
                        if (questionStatusFilter === 'needs_review' && q.status === 'published') return false;
                        if (questionSearch.trim()) {
                          const s = questionSearch.trim();
                          return (
                            q.prompt.includes(s) ||
                            q.acceptableAnswers.some((a) => a.includes(s)) ||
                            (q.sourceExcerpt || '').includes(s)
                          );
                        }
                        return true;
                      })
                      .map((q) => (
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
