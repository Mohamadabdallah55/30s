import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Edit3,
  FileText,
  Layers,
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
import { MotionConfig, motion } from 'motion/react';
import {
  AGE_GROUP_LABELS,
  CANONICAL_AGE_GROUPS,
  DIFFICULTY_LABELS,
  ROUND_RULES,
} from '../shared/gameRules';
import { COGNITIVE_LEVEL_LABELS } from '../shared/lessonIntelligence';
import type {
  AgeGroup,
  AllowedAiModel,
  Difficulty,
  GameSessionView,
  LessonBatchSummary,
  LessonDistributionMode,
  LessonGenerationMode,
  ProfilePublic,
  QuestionAlternativeCandidate,
  QuestionImprovementAction,
  QuestionRecord,
  RegenerationSettings,
  RoundConfig,
  RoundType,
} from '../shared/types';
import { apiFetch, getAuthToken, useSessionSocket } from '../utils/api';
import { SessionQrBadge } from './BrandEmblem';
import { LessonPotentialReport } from './lessonStudio/LessonPotentialReport';
import {
  QuestionPreviewModal,
  type QuestionPreviewBundle,
} from './lessonStudio/QuestionPreviewModal';
import { StickyRegenBar } from './lessonStudio/StickyRegenBar';

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

const PHASE_ONE_STAGES = new Set([
  'uploaded',
  'document_parsing',
  'arabic_analysis',
  'learning_objectives',
]);

const GENERATION_ACTIVE_STAGES = new Set([
  'distribution_plan',
  'question_generation',
  'grounding_verification',
  'deduplication',
  'schema_validation',
]);

const IMPROVEMENT_ACTIONS: Array<{ id: QuestionImprovementAction; label: string }> = [
  { id: 'easier', label: 'أسهل' },
  { id: 'harder', label: 'أصعب' },
  { id: 'more_analytical', label: 'أكثر تحليلاً' },
  { id: 'shorter', label: 'أقصر' },
  { id: 'clearer', label: 'أوضح' },
  { id: 'convert_round', label: 'تحويل جولة' },
  { id: 'new_idea', label: 'فكرة جديدة' },
];

const PIPELINE_STAGE_LABELS: Record<string, string> = {
  uploaded: 'تم الرفع',
  document_parsing: 'قراءة الصفحات',
  arabic_analysis: 'التحليل العلمي',
  learning_objectives: 'بناء خريطة المعرفة',
  analyzed: 'مكتمل التحليل',
  distribution_plan: 'تخطيط التوزيع',
  question_generation: 'جاري توليد الأسئلة',
  grounding_verification: 'التدقيق العلمي المستقل',
  deduplication: 'منع التكرار',
  schema_validation: 'فحص الصياغة',
  teacher_review: 'مراجعة المعلم',
  batch_paused: 'متوقف مؤقتاً',
  failed: 'تعذّر الإكمال',
  cancelled: 'متوقف بإذن المشرف',
  completed: 'مكتمل وجاهز',
};

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
  const [activeStudioTab, setActiveStudioTab] = useState<'report' | 'control'>('control');

  // Upload & Auto-Analysis Form (Screen 1)
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [subject, setSubject] = useState('السيرة النبوية');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('teen_14_17');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [pageRangeHint, setPageRangeHint] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Plan & Selection State (Screen 3)
  const [selectedRounds, setSelectedRounds] = useState<RoundType[]>([
    'multiple_choice',
    'true_false',
    'rapid_fire',
    'fill_blank',
    'who_am_i',
    'list_multiple',
  ]);
  const [generationMode, setGenerationMode] = useState<LessonGenerationMode>('suggested');
  const [distributionMode, setDistributionMode] = useState<LessonDistributionMode>('ai');
  const [customCount, setCustomCount] = useState<number>(15);
  const [reestimating, setReestimating] = useState(false);
  const [startingGeneration, setStartingGeneration] = useState(false);

  // Status / Errors / Model Config
  const [analyzingUpload, setAnalyzingUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    'يستخدم استوديو PDF حصرياً نماذج Gemini Flash ضمن الحصة المجانية (Free Tier) بحدود طلبات يومية ولحظية.'
  );
  const [savingModel, setSavingModel] = useState(false);

  // Screen 4 Control Room State
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [regenSettings, setRegenSettings] = useState<RegenerationSettings>({
    alternativeCount: 2,
    preferredRoundTypes: [],
    prioritizeUndercoveredTopics: true,
    applyMode: 'preview',
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [previewBundles, setPreviewBundles] = useState<QuestionPreviewBundle[]>([]);
  const [applyingPreviewId, setApplyingPreviewId] = useState<string | null>(null);
  const [improveMenuQuestionId, setImproveMenuQuestionId] = useState<string | null>(null);
  const [rejectingQuestionId, setRejectingQuestionId] = useState<string | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [questionStatusFilter, setQuestionStatusFilter] = useState<
    'all' | 'published' | 'needs_review' | 'rejected'
  >('all');
  const [questionSearch, setQuestionSearch] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Pre-start QR Remote & Match Launch
  const [team1Name, setTeam1Name] = useState('فريق النخبة');
  const [team2Name, setTeam2Name] = useState('فريق الرواد');
  const [matchTimerSec, setMatchTimerSec] = useState<number>(30);
  const [excludedMatchRounds, setExcludedMatchRounds] = useState<RoundType[]>([]);
  const [preparedSession, setPreparedSession] = useState<GameSessionView | null>(null);
  const [preparingQr, setPreparingQr] = useState(false);
  const [autoOpenProjectorOnStart, setAutoOpenProjectorOnStart] = useState(true);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [qrViewTab, setQrViewTab] = useState<'host' | 'buzzers'>('host');
  const [autoStartSec, setAutoStartSec] = useState<number | null>(null);

  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  const isLessonBusy = Boolean(
    selectedLesson &&
      (selectedLesson.isProcessing ||
        PHASE_ONE_STAGES.has(selectedLesson.pipelineStage) ||
        GENERATION_ACTIVE_STAGES.has(selectedLesson.pipelineStage))
  );

  const sanitizeUserError = (msg: string): string => {
    if (/Unterminated string|Unexpected token|JSON at position/i.test(msg)) {
      return 'انقطعت استجابة الذكاء الاصطناعي قبل اكتمال إحدى الدفعات. تم حفظ الأسئلة الصالحة السابقة ويمكنك الاستكمال فوراً.';
    }
    return msg;
  };

  const syncReportDefaultsFromLesson = (lesson: LessonBatchSummary) => {
    if (lesson.generationMode) setGenerationMode(lesson.generationMode);
    if (lesson.distributionMode) setDistributionMode(lesson.distributionMode);
    if (lesson.generationPlanPreview?.targetCount) {
      setCustomCount(lesson.generationPlanPreview.targetCount);
    } else if (lesson.capacityEstimate?.suggestedCount) {
      setCustomCount(lesson.capacityEstimate.suggestedCount);
    }
    if (lesson.generationPlanPreview?.selectedRoundTypes?.length) {
      setSelectedRounds(lesson.generationPlanPreview.selectedRoundTypes);
    } else if (lesson.roundSuitability?.length) {
      const rec = lesson.roundSuitability
        .filter((s) => s.recommendedSelected && !s.isMultiplier)
        .map((s) => s.roundType);
      if (rec.length > 0) setSelectedRounds(rec);
    }
  };

  const loadLessons = async () => {
    if (!isStaff) return;
    try {
      const res = await apiFetch<{ lessons: LessonBatchSummary[] }>('/api/lessons');
      setLessons(res.lessons);
    } catch {
      // Ignore transient library fetch error
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
          if (data.lesson.pipelineStage === 'analyzed') {
            syncReportDefaultsFromLesson(data.lesson);
            setActiveStudioTab('report');
          } else if (
            GENERATION_ACTIVE_STAGES.has(data.lesson.pipelineStage) ||
            data.lesson.verifiedCount > 0
          ) {
            setActiveStudioTab('control');
          }
        }
        if (data.newQuestions) {
          mergeQuestions(data.newQuestions);
        }
        if (data.type === 'done' || data.type === 'paused' || data.type === 'error') {
          setAnalyzingUpload(false);
          setStartingGeneration(false);
          setBusyAction(null);
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
      apiFetch<{ lesson: LessonBatchSummary; questions: QuestionRecord[] }>(
        `/api/lessons/${selectedLesson.lessonId}`
      )
        .then((res) => {
          setSelectedLesson(res.lesson);
          setQuestions(res.questions);
          if (res.lesson.pipelineStage === 'analyzed') {
            syncReportDefaultsFromLesson(res.lesson);
          }
          if (
            !res.lesson.isProcessing &&
            !PHASE_ONE_STAGES.has(res.lesson.pipelineStage) &&
            !GENERATION_ACTIVE_STAGES.has(res.lesson.pipelineStage)
          ) {
            setAnalyzingUpload(false);
            setStartingGeneration(false);
            setBusyAction(null);
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
      setSelectedQuestionIds([]);
      setPreparedSession(null);
      syncReportDefaultsFromLesson(res.lesson);
      if (res.lesson.pipelineStage === 'analyzed' || res.questions.length === 0) {
        setActiveStudioTab('report');
      } else {
        setActiveStudioTab('control');
      }
      onSelectLessonId?.(res.lesson.lessonId);
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر تحميل تفاصيل الدرس'));
    }
  };

  // Priority 1: Auto Phase-1 Analysis immediately upon selecting/dropping PDF!
  const startAutoPhaseOne = async (file: File) => {
    setPdfFile(file);
    const derivedTitle = lessonTitle.trim() || file.name.replace(/\.pdf$/i, '');
    if (!lessonTitle.trim()) setLessonTitle(derivedTitle);

    setError(null);
    setAnalyzingUpload(true);
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      fd.append('lessonTitle', derivedTitle);
      fd.append('subject', subject);
      fd.append('ageGroup', ageGroup);
      fd.append('difficulty', difficulty);
      if (pageRangeHint.trim()) fd.append('pageRangeHint', pageRangeHint.trim());

      const res = await apiFetch<{ lesson: LessonBatchSummary; questions: QuestionRecord[] }>(
        '/api/lessons/analyze',
        { method: 'POST', body: fd }
      );
      setSelectedLesson(res.lesson);
      setQuestions(res.questions ?? []);
      setActiveStudioTab('report');
      syncReportDefaultsFromLesson(res.lesson);
      setPdfFile(null);
      setLessonTitle('');
      onSelectLessonId?.(res.lesson.lessonId);
      loadLessons();
      if (!res.lesson.isProcessing && !PHASE_ONE_STAGES.has(res.lesson.pipelineStage)) {
        setAnalyzingUpload(false);
      }
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر بدء تحليل ملف PDF'));
      setAnalyzingUpload(false);
    }
  };

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

  const handleReestimate = async (patch: {
    ageGroup?: AgeGroup;
    difficulty?: Difficulty;
    mode?: LessonGenerationMode;
    distributionMode?: LessonDistributionMode;
    customCount?: number;
    selectedRoundTypes?: RoundType[];
  }) => {
    if (!selectedLesson) return;
    const prevSnapshot = selectedLesson;
    if (patch.mode) setGenerationMode(patch.mode);
    if (patch.distributionMode) setDistributionMode(patch.distributionMode);
    if (typeof patch.customCount === 'number') setCustomCount(patch.customCount);
    if (patch.ageGroup || patch.difficulty) {
      setSelectedLesson({
        ...selectedLesson,
        ...(patch.ageGroup ? { ageGroup: patch.ageGroup } : {}),
        ...(patch.difficulty ? { difficulty: patch.difficulty } : {}),
      });
    }

    setReestimating(true);
    setError(null);
    try {
      const res = await apiFetch<{ lesson: LessonBatchSummary }>(
        `/api/lessons/${selectedLesson.lessonId}/reestimate`,
        {
          method: 'POST',
          body: JSON.stringify({
            ageGroup: patch.ageGroup,
            difficulty: patch.difficulty,
            mode: patch.mode ?? generationMode,
            distributionMode: patch.distributionMode ?? distributionMode,
            customCount: patch.customCount ?? customCount,
            selectedRoundTypes: patch.selectedRoundTypes ?? selectedRounds,
          }),
        }
      );
      setSelectedLesson(res.lesson);
      if (res.lesson.generationPlanPreview?.selectedRoundTypes?.length && !patch.selectedRoundTypes) {
        setSelectedRounds(res.lesson.generationPlanPreview.selectedRoundTypes);
      }
    } catch (err) {
      setSelectedLesson(prevSnapshot);
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر إعادة التقدير'));
    } finally {
      setReestimating(false);
    }
  };

  const handleStartGenerationFromPlan = async () => {
    if (!selectedLesson) return;
    setError(null);
    setStartingGeneration(true);
    try {
      const res = await apiFetch<{ lesson: LessonBatchSummary }>(
        `/api/lessons/${selectedLesson.lessonId}/start-generation`,
        {
          method: 'POST',
          body: JSON.stringify({
            mode: generationMode,
            distributionMode,
            customCount,
            selectedRoundTypes: selectedRounds,
            pageRangeHint: pageRangeHint.trim() || undefined,
          }),
        }
      );
      setSelectedLesson(res.lesson);
      setActiveStudioTab('control');
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر بدء توليد الأسئلة'));
      setStartingGeneration(false);
    }
  };

  const handleRetryFailedBatch = async () => {
    if (!selectedLesson) return;
    setError(null);
    setBusyAction('retry');
    try {
      const res = await apiFetch<{ lesson: LessonBatchSummary }>(
        `/api/lessons/${selectedLesson.lessonId}/retry-batch`,
        { method: 'POST' }
      );
      setSelectedLesson(res.lesson);
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر إعادة محاولة الدفعة'));
      setBusyAction(null);
    }
  };

  const handleResumeGeneration = async () => {
    if (!selectedLesson) return;
    setError(null);
    setBusyAction('resume');
    try {
      const res = await apiFetch<{ lesson: LessonBatchSummary }>(
        `/api/lessons/${selectedLesson.lessonId}/resume`,
        { method: 'POST' }
      );
      setSelectedLesson(res.lesson);
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر استكمال التوليد'));
      setBusyAction(null);
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
      setAnalyzingUpload(false);
      setStartingGeneration(false);
      setBusyAction(null);
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر إلغاء المعالجة'));
    }
  };

  // Sticky Control Center Handlers (Priority 5)
  const handleRegenerateRejected = async () => {
    if (!selectedLesson) return;
    setError(null);
    setBusyAction('rejected');
    try {
      const count = Math.max(1, Math.min(8, selectedLesson.rejectedCount || 3));
      const res = await apiFetch<{ lesson: LessonBatchSummary }>(
        `/api/lessons/${selectedLesson.lessonId}/regenerate-rejected`,
        {
          method: 'POST',
          body: JSON.stringify({
            count,
            async: true,
            selectedRoundTypes: regenSettings.preferredRoundTypes,
            settings: regenSettings,
          }),
        }
      );
      setSelectedLesson(res.lesson);
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر إعادة توليد المرفوض'));
      setBusyAction(null);
    }
  };

  const handleCompleteMissing = async () => {
    if (!selectedLesson) return;
    setError(null);
    setBusyAction('complete');
    try {
      const res = await apiFetch<{ lesson: LessonBatchSummary }>(
        `/api/lessons/${selectedLesson.lessonId}/complete-missing`,
        {
          method: 'POST',
          body: JSON.stringify({
            selectedRoundTypes: regenSettings.preferredRoundTypes,
            settings: regenSettings,
          }),
        }
      );
      setSelectedLesson(res.lesson);
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر استكمال الأسئلة الناقصة'));
      setBusyAction(null);
    }
  };

  const handleGenerateMore = async (count: number) => {
    if (!selectedLesson) return;
    setError(null);
    setBusyAction('more');
    try {
      const res = await apiFetch<{ lesson: LessonBatchSummary }>(
        `/api/lessons/${selectedLesson.lessonId}/generate-more`,
        {
          method: 'POST',
          body: JSON.stringify({
            additionalCount: count,
            selectedRoundTypes: regenSettings.preferredRoundTypes,
            prioritizeUndercoveredTopics: regenSettings.prioritizeUndercoveredTopics,
            settings: regenSettings,
          }),
        }
      );
      setSelectedLesson(res.lesson);
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر توليد أسئلة إضافية'));
      setBusyAction(null);
    }
  };

  const handlePreviewSelectedOrImprove = async (
    qIds: string[],
    improvementAction?: QuestionImprovementAction
  ) => {
    if (!selectedLesson || qIds.length === 0) return;
    setError(null);
    setBusyAction('preview');
    setImproveMenuQuestionId(null);
    try {
      const res = await apiFetch<{ previews: QuestionPreviewBundle[] }>(
        `/api/lessons/${selectedLesson.lessonId}/regenerate-selected`,
        {
          method: 'POST',
          body: JSON.stringify({
            questionIds: qIds,
            improvementAction,
            settings: regenSettings,
          }),
        }
      );
      setPreviewBundles(res.previews);
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر توليد البدائل المقترحة'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleApplyReplacement = async (
    targetQuestionId: string,
    candidate: QuestionAlternativeCandidate,
    approveAfterApply: boolean
  ) => {
    if (!selectedLesson) return;
    setApplyingPreviewId(candidate.candidateId);
    setError(null);
    try {
      const res = await apiFetch<{ question: QuestionRecord; lesson: LessonBatchSummary }>(
        `/api/lessons/${selectedLesson.lessonId}/apply-replacement`,
        {
          method: 'POST',
          body: JSON.stringify({ targetQuestionId, candidate, approveAfterApply }),
        }
      );
      setQuestions((prev) => prev.map((q) => (q.id === targetQuestionId ? res.question : q)));
      setSelectedLesson(res.lesson);
      setPreviewBundles((prev) => prev.filter((b) => b.originalQuestion.id !== targetQuestionId));
      setSelectedQuestionIds((prev) => prev.filter((id) => id !== targetQuestionId));
    } catch (err) {
      setError(sanitizeUserError(err instanceof Error ? err.message : 'تعذر تطبيق البديل'));
    } finally {
      setApplyingPreviewId(null);
    }
  };

  // Question Review / Edit / Reject / Delete
  const approveQuestion = async (q: QuestionRecord) => {
    try {
      const res = await apiFetch<{ question: QuestionRecord }>(`/api/questions/${q.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'published' }),
      });
      setQuestions((prev) => prev.map((x) => (x.id === q.id ? res.question : x)));
      if (selectedLesson) {
        const refreshed = await apiFetch<{ lesson: LessonBatchSummary }>(
          `/api/lessons/${selectedLesson.lessonId}`
        );
        setSelectedLesson(refreshed.lesson);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر اعتماد السؤال');
    }
  };

  const submitRejectWithReason = async (qId: string) => {
    const reason = rejectReasonInput.trim() || 'مرفوض من المعلم لعدم الملاءمة';
    try {
      const res = await apiFetch<{ question: QuestionRecord }>(`/api/questions/${qId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', rejectionReason: reason }),
      });
      setQuestions((prev) => prev.map((x) => (x.id === qId ? res.question : x)));
      setRejectingQuestionId(null);
      setRejectReasonInput('');
      if (selectedLesson) {
        const refreshed = await apiFetch<{ lesson: LessonBatchSummary }>(
          `/api/lessons/${selectedLesson.lessonId}`
        );
        setSelectedLesson(refreshed.lesson);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر رفض السؤال');
    }
  };

  const saveEdit = async (qId: string) => {
    try {
      const res = await apiFetch<{ question: QuestionRecord }>(`/api/questions/${qId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          prompt: editPrompt,
          acceptableAnswers: editAnswer
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      setQuestions((prev) => prev.map((x) => (x.id === qId ? res.question : x)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التعديل');
    }
  };

  const deleteQuestion = async (qId: string) => {
    try {
      await apiFetch(`/api/questions/${qId}`, { method: 'DELETE' });
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
      setSelectedQuestionIds((prev) => prev.filter((id) => id !== qId));
      if (selectedLesson) {
        const refreshed = await apiFetch<{ lesson: LessonBatchSummary }>(
          `/api/lessons/${selectedLesson.lessonId}`
        );
        setSelectedLesson(refreshed.lesson);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف السؤال');
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

  const createLessonSession = async (): Promise<GameSessionView | null> => {
    if (!selectedLesson) return null;
    const publishedRounds = Array.from(
      new Set(questions.filter((q) => q.status === 'published').map((q) => q.roundType))
    );
    const chosenRounds = publishedRounds.filter((type) => !excludedMatchRounds.includes(type));
    if (!chosenRounds.length) throw new Error('اختر جولة واحدة على الأقل من الأسئلة المعتمدة.');
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
      if (!session) return;
      const started = await apiFetch<{ session: GameSessionView }>(
        `/api/sessions/${session.code}/host-action`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'start_match' }),
        }
      );
      onLaunchSession(started.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر بدء المباراة');
    }
  };

  const handlePrepareTeacherQr = async () => {
    setError(null);
    setPreparingQr(true);
    try {
      const session = await createLessonSession();
      if (session) {
        setPreparedSession(session);
        setQrViewTab('host');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تجهيز رمز التحكم من الهاتف');
    } finally {
      setPreparingQr(false);
    }
  };

  const handleCopySessionLink = (key: string, url: string) => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedLinkKey(key);
    setTimeout(() => setCopiedLinkKey(null), 2000);
  };

  const exportLessonFile = async (format: 'json' | 'csv') => {
    if (!selectedLesson) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/lessons/${selectedLesson.lessonId}/export?format=${format}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('تعذر التصدير');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lesson-${selectedLesson.lessonId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('تعذر تنزيل ملف التصدير');
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    try {
      await apiFetch(`/api/lessons/${lessonId}`, { method: 'DELETE' });
      if (selectedLesson?.lessonId === lessonId) {
        setSelectedLesson(null);
        setQuestions([]);
        onSelectLessonId?.(null);
      }
      await loadLessons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الدرس');
    }
  };

  const handleStepBack = () => {
    if (selectedLesson) {
      setSelectedLesson(null);
      setQuestions([]);
      setPreparedSession(null);
      setPreviewBundles([]);
      setError(null);
      onSelectLessonId?.(null);
      loadLessons();
      return;
    }
    onBack();
  };

  const publishedCount = useMemo(
    () => questions.filter((q) => q.status === 'published').length,
    [questions]
  );
  const needsReviewCount = useMemo(
    () => questions.filter((q) => q.status === 'needs_review').length,
    [questions]
  );
  const rejectedQuestionsCount = useMemo(
    () => questions.filter((q) => q.status === 'rejected').length,
    [questions]
  );

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (questionStatusFilter !== 'all' && q.status !== questionStatusFilter) return false;
      if (questionSearch.trim()) {
        const needle = questionSearch.trim();
        const hay = `${q.prompt} ${q.acceptableAnswers.join(' ')} ${q.sourceExcerpt ?? ''} ${q.learningObjective ?? ''}`;
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [questions, questionStatusFilter, questionSearch]);

  const publishedRoundStats = useMemo(() => {
    const map = new Map<RoundType, number>();
    for (const q of questions) {
      if (q.status !== 'published') continue;
      map.set(q.roundType, (map.get(q.roundType) ?? 0) + 1);
    }
    return Array.from(map.entries());
  }, [questions]);

  const activeScreen: 1 | 2 | 3 | 4 = useMemo(() => {
    if (!selectedLesson) return 1;
    if (PHASE_ONE_STAGES.has(selectedLesson.pipelineStage)) return 2;
    if (selectedLesson.pipelineStage === 'analyzed' && activeStudioTab === 'report') return 3;
    if (activeStudioTab === 'report' && selectedLesson.knowledgeMap) return 3;
    return 4;
  }, [selectedLesson, activeStudioTab]);

  if (!isStaff) {
    return (
      <div className="min-h-screen bg-[#060D24] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl border border-amber-400/25 bg-[#09143A] p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center mx-auto text-amber-300">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black">استوديو الدروس الذكي 2.0</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            هذا الاستوديو مخصص للمعلمين والمشرفين لتحليل دروس PDF وبناء خريطة المعرفة وتوليد مسابقات موثقة.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={onOpenAuth}
              className="rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-5 py-2.5 text-sm cursor-pointer"
            >
              تسجيل الدخول كمعلم أو مشرف
            </button>
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl bg-white/10 hover:bg-white/15 px-5 py-2.5 text-sm font-bold cursor-pointer"
            >
              العودة
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        dir="rtl"
        className="min-h-screen bg-[#060D24] text-white pb-24 md:pb-14 selection:bg-sky-400 selection:text-slate-950"
      >
        {/* Top Studio Navigation Bar */}
        <header className="border-b border-white/10 bg-[#09143A]/95 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleStepBack}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#060D24] hover:border-sky-400/40 px-3.5 py-2 text-xs font-bold text-slate-200 transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>{selectedLesson ? 'مكتبة الدروس والرفع' : 'رجوع'}</span>
              </button>
              <div>
                <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                  <Brain className="w-5 h-5 text-sky-400 shrink-0" />
                  <span>استوديو الدروس الذكي</span>
                </h1>
                <p className="text-[11px] sm:text-xs text-slate-400">
                  تحليل PDF تلقائي · خريطة معرفة · تقدير سعة · فحص الـ12 جولة · تحكم تربوي مستمر
                </p>
              </div>
            </div>

            {selectedLesson && (
              <div className="flex items-center gap-2">
                {selectedLesson.knowledgeMap && (
                  <div className="inline-flex rounded-xl border border-white/10 bg-[#060D24] p-1">
                    <button
                      type="button"
                      onClick={() => setActiveStudioTab('report')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                        activeScreen === 3 ? 'bg-sky-400 text-slate-950' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      تقرير الإمكانيات والخطة
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveStudioTab('control')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                        activeScreen === 4 ? 'bg-sky-400 text-slate-950' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      غرفة الأسئلة ({selectedLesson.verifiedCount})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
          {error && (
            <div className="rounded-2xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-100 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />
                {error}
              </span>
              <button type="button" onClick={() => setError(null)} className="text-red-300 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ================= SCREEN 1: UPLOAD & AUTO-ANALYZE + LIBRARY ================= */}
          {activeScreen === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              {/* Auto Upload Zone (Left / Main) */}
              <div className="lg:col-span-7 space-y-5">
                <section className="rounded-3xl border border-sky-400/25 bg-[#09143A]/95 p-6 shadow-[0_24px_60px_rgba(3,7,18,0.5)] space-y-5">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      <span>الخطوة 1 — ارفع ملف الدرس PDF لبدء التحليل التلقائي</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white">
                      تحليل فوري وخريطة معرفة قبل طلب أي سؤال
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-300">
                      بمجرد اختيار أو إسقاط ملف PDF، يقرأ المحرك الصفحات تلقائياً ويقدّر أكبر عدد ممكن من الأسئلة ويفحص الجولات الـ12 دون توليد مبكر.
                    </p>
                  </div>

                  {/* Quick Pre-Tags (Optional before upload; recalculable after!) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">اسم الدرس (اختياري)</label>
                      <input
                        type="text"
                        value={lessonTitle}
                        onChange={(e) => setLessonTitle(e.target.value)}
                        placeholder="يُستخرج تلقائياً من اسم الملف إذا تُرك فارغاً"
                        className="w-full rounded-xl bg-[#060D24] border border-white/15 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">المادة أو المجال</label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full rounded-xl bg-[#060D24] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">الفئة العمرية الأولية</label>
                      <select
                        value={ageGroup}
                        onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
                        className="w-full rounded-xl bg-[#060D24] border border-white/15 px-3 py-2 text-sm text-white"
                      >
                        {CANONICAL_AGE_GROUPS.map((ag) => (
                          <option key={ag} value={ag}>
                            {AGE_GROUP_LABELS[ag]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">مستوى الصعوبة الأولي</label>
                      <select
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                        className="w-full rounded-xl bg-[#060D24] border border-white/15 px-3 py-2 text-sm text-white"
                      >
                        <option value="easy">{DIFFICULTY_LABELS.easy}</option>
                        <option value="medium">{DIFFICULTY_LABELS.medium}</option>
                        <option value="hard">{DIFFICULTY_LABELS.hard}</option>
                      </select>
                    </div>
                  </div>

                  {/* Drag & Drop / Click File Dropzone -> Auto-triggers Phase 1! */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) void startAutoPhaseOne(f);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`rounded-3xl border-2 border-dashed p-8 text-center cursor-pointer transition space-y-3 ${
                      dragActive
                        ? 'border-sky-400 bg-sky-500/10'
                        : 'border-white/20 bg-[#060D24]/85 hover:border-sky-400/60 hover:bg-[#0B163C]'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void startAutoPhaseOne(f);
                        e.currentTarget.value = '';
                      }}
                    />
                    <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center mx-auto text-sky-300">
                      <Upload className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-base font-black text-white">
                        {analyzingUpload
                          ? 'جارٍ رفع الملف وبدء التحليل التلقائي...'
                          : pdfFile
                          ? `تم اختيار: ${pdfFile.name}`
                          : 'اسحب ملف PDF وأسقطه هنا أو اضغط لاختياره'}
                      </div>
                      <p className="text-xs text-slate-400">
                        يبدأ التحليل التربوي وتقدير السعة فور الرفع مباشرة (الحد الأقصى 15 ميجابايت).
                      </p>
                    </div>
                  </div>

                  {/* Free Tier AI Model Selector */}
                  <div className="rounded-2xl border border-white/10 bg-[#060D24]/90 p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-sky-300">
                        نموذج التحليل والتوليد المجاني (Free Tier)
                      </span>
                      {savingModel && <span className="text-[11px] text-slate-400">جارٍ الحفظ...</span>}
                    </div>
                    <select
                      value={aiModel}
                      disabled={savingModel}
                      onChange={(e) => void handleModelChange(e.target.value as AllowedAiModel)}
                      className="w-full rounded-xl bg-[#09143A] border border-white/15 px-3 py-2 text-xs font-bold text-white"
                    >
                      {allowedAiModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.labelAr}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{freeTierNotice}</p>
                  </div>
                </section>
              </div>

              {/* Saved Lessons Library */}
              <div className="lg:col-span-5">
                <section className="rounded-3xl border border-white/10 bg-[#09143A]/90 p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <FileText className="w-5 h-5 text-amber-400" />
                      <span>مكتبة الدروس المحللة والمحفوظة ({lessons.length})</span>
                    </h3>
                  </div>

                  {lessons.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-[#060D24]/70 p-8 text-center text-xs text-slate-400">
                      لم تُرفع دروس بعد. ارفع ملف PDF لبدء أول درس محفوظ بخريطة معرفته الكاملة.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
                      {lessons.map((item) => (
                        <div
                          key={item.lessonId}
                          className="rounded-2xl border border-white/10 bg-[#060D24]/90 p-4 hover:border-sky-400/40 transition flex flex-col gap-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => void openLessonDetail(item.lessonId)}
                              className="text-right flex-1 space-y-1 cursor-pointer"
                            >
                              <div className="text-sm font-black text-white hover:text-sky-300 transition">
                                {item.title}
                              </div>
                              <div className="text-[11px] text-slate-400 tabular-nums">
                                {item.subject} · {item.pageCount} صفحات · {AGE_GROUP_LABELS[item.ageGroup as keyof typeof AGE_GROUP_LABELS] || item.ageGroup}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteLesson(item.lessonId)}
                              className="text-slate-500 hover:text-red-400 p-1 rounded-lg"
                              title="حذف الدرس"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 text-[11px]">
                            <span className="text-sky-300 font-bold tabular-nums">
                              {item.pipelineStage === 'analyzed'
                                ? `تحليل جاهز (السعة المقترحة: ${item.capacityEstimate?.suggestedCount ?? item.requestedCount})`
                                : `${item.verifiedCount} سؤالًا محفوظًا · ${item.publishedCount} معتمد`}
                            </span>
                            <button
                              type="button"
                              onClick={() => void openLessonDetail(item.lessonId)}
                              className="rounded-lg bg-white/10 hover:bg-sky-400 hover:text-slate-950 px-2.5 py-1 font-bold text-white transition cursor-pointer"
                            >
                              {item.pipelineStage === 'analyzed' ? 'عرض التقرير والخطة' : 'فتح غرفة التحكم'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </motion.div>
          )}

          {/* ================= SCREEN 2: AI BRAIN LIVE ANALYSIS ================= */}
          {activeScreen === 2 && selectedLesson && (
            <motion.div
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="max-w-3xl mx-auto rounded-3xl border border-sky-400/30 bg-[#09143A]/95 p-6 sm:p-8 space-y-6 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-sky-500/20 border border-sky-400/35 flex items-center justify-center text-sky-300">
                    <Brain className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-sky-300">المرحلة الثانية — عقل التحليل وبناء خريطة المعرفة</div>
                    <h2 className="text-xl font-black text-white">{selectedLesson.title}</h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCancelGeneration()}
                  className="rounded-xl border border-red-400/35 bg-red-500/15 px-3.5 py-2 text-xs font-bold text-red-200 hover:bg-red-500/25 flex items-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>إيقاف التحليل</span>
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#060D24]/90 p-4 text-sm text-sky-200 font-semibold">
                {selectedLesson.statusMessageAr || 'جارٍ قراءة الصفحات واستخراج المفاهيم والأهداف التعليمية...'}
              </div>

              <div className="space-y-2.5">
                {selectedLesson.stageLogs.map((log) => (
                  <div
                    key={log.stage}
                    className="rounded-2xl border border-white/10 bg-[#060D24]/80 px-4 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-black text-white">{log.labelAr}</div>
                      <div className="text-[11px] text-slate-300">{log.detail}</div>
                    </div>
                    <span
                      className={`text-[11px] font-bold shrink-0 ${
                        log.status === 'completed'
                          ? 'text-emerald-300'
                          : log.status === 'running'
                          ? 'text-sky-300'
                          : 'text-amber-300'
                      }`}
                    >
                      {log.status === 'completed' ? 'مكتمل' : log.status === 'running' ? 'نشط' : log.status}
                    </span>
                  </div>
                ))}
              </div>

              {selectedLesson.topics.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-[#060D24]/85 p-4 space-y-2">
                  <div className="text-xs font-bold text-slate-400">المحاور المكتشفة حتى الآن:</div>
                  <div className="flex flex-wrap gap-2 text-xs text-sky-200">
                    {selectedLesson.topics.map((t, i) => (
                      <span key={i} className="rounded-lg border border-sky-400/25 bg-sky-500/10 px-2.5 py-1">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ================= SCREEN 3: LESSON POTENTIAL REPORT & PLAN PREVIEW ================= */}
          {activeScreen === 3 && selectedLesson && (
            <LessonPotentialReport
              lesson={selectedLesson}
              selectedRounds={selectedRounds}
              generationMode={generationMode}
              distributionMode={distributionMode}
              customCount={customCount}
              pageRangeHint={pageRangeHint}
              reestimating={reestimating}
              startingGeneration={startingGeneration}
              onReestimate={(patch) => void handleReestimate(patch)}
              onChangeSelectedRounds={setSelectedRounds}
              onChangePageRangeHint={setPageRangeHint}
              onStartGeneration={() => void handleStartGenerationFromPlan()}
            />
          )}

          {/* ================= SCREEN 4: QUESTION CONTROL ROOM ================= */}
          {activeScreen === 4 && selectedLesson && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {/* Priority 5: Persistent Sticky Regeneration Control Center */}
              <StickyRegenBar
                lesson={selectedLesson}
                selectedQuestionIds={selectedQuestionIds}
                actualRejectedQuestionCount={rejectedQuestionsCount}
                settings={regenSettings}
                busyAction={busyAction}
                onChangeSettings={setRegenSettings}
                onRegenerateRejected={() => void handleRegenerateRejected()}
                onCompleteMissing={() => void handleCompleteMissing()}
                onRegenerateSelected={() =>
                  void handlePreviewSelectedOrImprove(selectedQuestionIds)
                }
                onGenerateMore={(count) => void handleGenerateMore(count)}
              />

              {/* Priority 7: Real DB-Backed Live Generation & Coverage Monitor */}
              <section
                data-testid="live-generation-monitor"
                className="rounded-3xl border border-white/10 bg-[#09143A]/95 p-5 sm:p-6 space-y-5 shadow-xl"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-sky-300">
                      <BarChart3 className="w-4 h-4" />
                      <span>مراقب التوليد الفعلي والتغطية العلمية</span>
                      <span className="text-slate-400 font-normal">
                        · المرحلة:{' '}
                        <strong className="text-white">
                          {PIPELINE_STAGE_LABELS[selectedLesson.pipelineStage] ?? selectedLesson.pipelineStage}
                        </strong>
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white break-words">{selectedLesson.title}</h2>
                    <p className="text-xs text-slate-300">
                      {selectedLesson.statusMessageAr || 'متابعة حالة البنك والدفعات من قاعدة البيانات مباشرة.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isLessonBusy ? (
                      <button
                        type="button"
                        onClick={() => void handleCancelGeneration()}
                        className="rounded-xl border border-red-400/40 bg-red-500/15 px-3.5 py-2 text-xs font-bold text-red-200 hover:bg-red-500/25 flex items-center gap-1.5"
                      >
                        <PauseCircle className="w-4 h-4" />
                        <span>إيقاف مؤقت مع الحفظ</span>
                      </button>
                    ) : (
                      (selectedLesson.pipelineStage === 'batch_paused' ||
                        selectedLesson.pipelineStage === 'failed' ||
                        selectedLesson.pipelineStage === 'cancelled') && (
                        <>
                          {selectedLesson.failedBatchIndex !== null && (
                            <button
                              type="button"
                              onClick={() => void handleRetryFailedBatch()}
                              className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-3.5 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/25 flex items-center gap-1.5"
                            >
                              <RefreshCw className="w-4 h-4" />
                              <span>إعادة محاولة الدفعة المتوقفة</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleResumeGeneration()}
                            className="rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-3.5 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 flex items-center gap-1.5"
                          >
                            <Play className="w-4 h-4" />
                            <span>استكمال التوليد</span>
                          </button>
                        </>
                      )
                    )}

                    <button
                      type="button"
                      onClick={() => setShowDiagnostics((s) => !s)}
                      className="rounded-xl border border-white/15 bg-[#060D24] px-3 py-2 text-xs font-bold text-slate-300 hover:border-white/30"
                    >
                      {showDiagnostics ? 'إخفاء السجل الفني' : 'السجل الفني والتفاصيل'}
                    </button>
                  </div>
                </div>

                {/* Live Numeric Telemetry Grid (Real DB Values) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  {[
                    { label: 'المطلوب', val: selectedLesson.requestedCount, cls: 'text-white' },
                    { label: 'المستلم', val: selectedLesson.receivedCount, cls: 'text-slate-200' },
                    { label: 'المحفوظ فعلياً', val: selectedLesson.verifiedCount, cls: 'text-sky-300' },
                    { label: 'المرفوض', val: Math.max(rejectedQuestionsCount, selectedLesson.rejectedCount), cls: 'text-amber-300' },
                    { label: 'يحتاج مراجعة', val: needsReviewCount, cls: 'text-indigo-300' },
                    { label: 'المعتمد للعب', val: publishedCount, cls: 'text-emerald-300' },
                    {
                      label: 'الدفعات',
                      val: `${selectedLesson.completedBatches}/${Math.max(1, selectedLesson.totalBatches)}`,
                      cls: 'text-slate-200',
                      span: 'col-span-2 sm:col-span-1',
                    },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className={`rounded-2xl border border-white/10 bg-[#060D24]/90 p-3 ${stat.span ?? ''}`}
                    >
                      <div className="text-[11px] text-slate-400 font-semibold">{stat.label}</div>
                      <div className={`text-xl font-black mt-0.5 tabular-nums ${stat.cls}`}>{stat.val}</div>
                    </div>
                  ))}
                </div>

                {/* Coverage Progress + Topic Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-[#060D24]/85 p-4 space-y-2.5">
                    {(selectedLesson.topicCoverage?.length ?? 0) > 0 ? (
                      <>
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-slate-300">
                            تغطية محاور الدرس ({selectedLesson.topicsCoveredCount ?? 0} من{' '}
                            {selectedLesson.topicCoverage?.length ?? 0} محاور)
                          </span>
                          <span className="text-emerald-300 tabular-nums">
                            {selectedLesson.coveragePercentage ?? 0}%
                          </span>
                        </div>
                        <svg className="w-full h-2.5 rounded-full overflow-hidden bg-slate-800" viewBox="0 0 100 6" preserveAspectRatio="none">
                          <rect
                            x="0"
                            y="0"
                            width={Math.max(3, selectedLesson.coveragePercentage ?? 0)}
                            height="6"
                            rx="3"
                            fill="#10B981"
                          />
                        </svg>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {selectedLesson.topicCoverage!.map((tc, idx) => (
                            <span
                              key={idx}
                              className={`text-[11px] px-2 py-0.5 rounded-lg border tabular-nums ${
                                tc.coveredCount > 0
                                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                                  : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                              }`}
                            >
                              {tc.title}: {tc.coveredCount}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="text-xs font-bold text-slate-300">تغطية محاور الدرس</div>
                        <p className="text-xs text-slate-400">
                          هذا الدرس محفوظ قبل ترقية خريطة المحاور التربوية؛ جميع أسئلته متاحة للمراجعة واللعب والتحسين بالذكاء الاصطناعي.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actual Distributions Summary */}
                  <div className="rounded-2xl border border-white/10 bg-[#060D24]/85 p-4 space-y-2">
                    <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-sky-400" />
                      <span>التوزيع الفعلي في قاعدة البيانات</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] text-slate-200">
                      {Object.entries(selectedLesson.roundDistributionActual ?? {}).map(([rt, cnt]) => (
                        <span key={rt} className="rounded-lg border border-white/10 bg-[#09143A] px-2.5 py-1 tabular-nums">
                          {ROUND_RULES[rt as RoundType]?.nameAr ?? rt}: <strong className="text-sky-300">{cnt}</strong>
                        </span>
                      ))}
                    </div>
                    {selectedLesson.stopReasonAr && (
                      <div className="text-xs text-amber-300 font-semibold pt-1">
                        سبب التوقف الصادق: {selectedLesson.stopReasonAr}
                      </div>
                    )}
                  </div>
                </div>

                {showDiagnostics && (
                  <div className="rounded-2xl border border-white/10 bg-[#060D24] p-4 space-y-3 text-xs">
                    {selectedLesson.rejectedDetails && selectedLesson.rejectedDetails.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="font-black text-amber-300">
                          سجل أسباب الرفض الأخيرة ({selectedLesson.rejectedDetails.length}):
                        </div>
                        {selectedLesson.rejectedDetails.slice(-6).map((rej, idx) => (
                          <div key={idx} className="text-[11px] text-slate-300 border-b border-white/5 pb-1">
                            • [{rej.roundType}] {rej.reason} — <span className="text-slate-400">{rej.prompt.slice(0, 65)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-1 max-h-44 overflow-y-auto">
                      <div className="font-black text-slate-300">سجل الدفعات والاتصال:</div>
                      {selectedLesson.diagnosticLogs.slice(-10).map((d, idx) => (
                        <div key={idx} className="text-[11px] text-slate-400">
                          • {d.message} {d.elapsedMs ? `(${Math.round(d.elapsedMs)}ms)` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Teacher Pre-Start Match & Phone QR Bar */}
              <section className="rounded-3xl border border-emerald-400/20 bg-[#09143A]/95 p-5 sm:p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                      <MonitorPlay className="w-5 h-5 text-emerald-400" />
                      <span>اعتماد الأسئلة وإطلاق مسابقة الدرس + تحكم الهاتف بـ QR</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      معتمد للعب: <strong className="text-emerald-300 tabular-nums">{publishedCount}</strong> · يحتاج مراجعة:{' '}
                      <strong className="text-amber-300 tabular-nums">{needsReviewCount}</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void exportLessonFile('json')}
                      className="rounded-xl border border-white/15 bg-[#060D24] px-3 py-2 text-xs font-bold text-slate-200 hover:border-white/30 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>JSON</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportLessonFile('csv')}
                      className="rounded-xl border border-white/15 bg-[#060D24] px-3 py-2 text-xs font-bold text-slate-200 hover:border-white/30 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </button>

                    {needsReviewCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void approveAllAndAutoStart(false)}
                        className="rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black px-4 py-2 text-xs transition whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        اعتماد الكل وبدء المباراة ({questions.length})
                      </button>
                    )}

                    {publishedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void launchGameNow()}
                        className="rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-2 text-xs transition flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>تشغيل المباراة بالأسئلة المعتمدة ({publishedCount})</span>
                      </button>
                    )}
                  </div>
                </div>

                {autoStartSec !== null && (
                  <div className="rounded-xl border border-amber-400/40 bg-amber-950/35 px-4 py-2.5 text-xs font-bold text-amber-200 flex items-center justify-between">
                    <span>سيبدأ العرض خلال {autoStartSec} ثوانٍ...</span>
                    <button
                      type="button"
                      onClick={() => setAutoStartSec(null)}
                      className="underline text-white"
                    >
                      إلغاء العد التنازلي
                    </button>
                  </div>
                )}

                {publishedCount > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2 border-t border-white/10">
                    <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">الفريق الأول</label>
                        <input
                          type="text"
                          value={team1Name}
                          onChange={(e) => setTeam1Name(e.target.value)}
                          className="w-full rounded-xl bg-[#060D24] border border-white/15 px-3 py-2 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">الفريق الثاني</label>
                        <input
                          type="text"
                          value={team2Name}
                          onChange={(e) => setTeam2Name(e.target.value)}
                          className="w-full rounded-xl bg-[#060D24] border border-white/15 px-3 py-2 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">مؤقت السؤال (ث)</label>
                        <input
                          type="number"
                          min={10}
                          max={90}
                          value={matchTimerSec}
                          onChange={(e) => setMatchTimerSec(Math.max(10, Math.min(90, Number(e.target.value || 30))))}
                          className="w-full rounded-xl bg-[#060D24] border border-white/15 px-3 py-2 text-xs text-white tabular-nums"
                        />
                      </div>

                      {publishedRoundStats.length > 0 && (
                        <div className="sm:col-span-3 flex flex-wrap gap-1.5 pt-1">
                          {publishedRoundStats.map(([rt, cnt]) => {
                            const active = !excludedMatchRounds.includes(rt);
                            return (
                              <button
                                key={rt}
                                type="button"
                                onClick={() =>
                                  setExcludedMatchRounds((prev) =>
                                    prev.includes(rt) ? prev.filter((x) => x !== rt) : [...prev, rt]
                                  )
                                }
                                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition ${
                                  active
                                    ? 'border-sky-400/50 bg-sky-500/15 text-sky-200'
                                    : 'border-white/10 bg-[#060D24] text-slate-500 line-through'
                                }`}
                              >
                                {ROUND_RULES[rt]?.nameAr ?? rt} ({cnt})
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="lg:col-span-5 flex flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-[#060D24]/85 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                          <Smartphone className="w-4 h-4" />
                          <span>تجهيز باركود تحكم الأستاذ من الهاتف</span>
                        </div>
                        <button
                          type="button"
                          disabled={preparingQr}
                          onClick={() => void handlePrepareTeacherQr()}
                          className="rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black px-3 py-1.5 text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>{preparingQr ? 'جارٍ التجهيز...' : preparedSession ? 'تحديث QR' : 'إنشاء QR'}</span>
                        </button>
                      </div>

                      {preparedSession && (
                        <div className="space-y-3 pt-1">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-emerald-300 font-bold">
                              رمز الغرفة: {preparedSession.code} {qrSocketConnected ? '· متصل' : ''}
                            </span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => setQrViewTab('host')}
                                className={`px-2 py-0.5 rounded-md font-bold ${
                                  qrViewTab === 'host' ? 'bg-sky-400 text-slate-950' : 'bg-[#09143A] text-slate-300'
                                }`}
                              >
                                هاتف الأستاذ
                              </button>
                              <button
                                type="button"
                                onClick={() => setQrViewTab('buzzers')}
                                className={`px-2 py-0.5 rounded-md font-bold ${
                                  qrViewTab === 'buzzers' ? 'bg-sky-400 text-slate-950' : 'bg-[#09143A] text-slate-300'
                                }`}
                              >
                                أجراس الفرق
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {(() => {
                              const hostUrl = `${window.location.origin}/?mode=host&code=${preparedSession.code}`;
                              const buzzerUrl = `${window.location.origin}/?mode=buzzer&code=${preparedSession.code}`;
                              const targetUrl = qrViewTab === 'host' ? hostUrl : buzzerUrl;
                              return (
                                <>
                                  <div className="shrink-0">
                                    <SessionQrBadge code={preparedSession.code} url={targetUrl} size="sm" />
                                  </div>
                                  <div className="space-y-2 flex-1 min-w-0 text-[11px]">
                                    <button
                                      type="button"
                                      onClick={() => handleCopySessionLink(qrViewTab, targetUrl)}
                                      className="w-full rounded-lg border border-white/15 bg-[#09143A] px-2.5 py-1.5 text-slate-200 hover:border-sky-400 flex items-center justify-center gap-1.5"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>{copiedLinkKey === qrViewTab ? 'تم النسخ!' : 'نسخ رابط التحكم'}</span>
                                    </button>
                                    {onOpenHostPanel && (
                                      <button
                                        type="button"
                                        onClick={() => onOpenHostPanel(preparedSession)}
                                        className="w-full rounded-lg bg-emerald-500/20 border border-emerald-400/35 px-2.5 py-1.5 text-emerald-200 font-bold"
                                      >
                                        فتح شاشة المشرف الآن
                                      </button>
                                    )}
                                    <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={autoOpenProjectorOnStart}
                                        onChange={(e) => setAutoOpenProjectorOnStart(e.target.checked)}
                                        className="accent-sky-400"
                                      />
                                      <span>فتح البروجكتر تلقائياً عند البدء</span>
                                    </label>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* Pedagogical Question Bank List & Filters */}
              <section className="rounded-3xl border border-white/10 bg-[#09143A]/90 p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        { id: 'all', label: `الكل (${questions.length})` },
                        { id: 'needs_review', label: `يحتاج مراجعة (${needsReviewCount})` },
                        { id: 'published', label: `معتمد (${publishedCount})` },
                        { id: 'rejected', label: `مرفوض (${rejectedQuestionsCount})` },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setQuestionStatusFilter(f.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                          questionStatusFilter === f.id
                            ? 'bg-sky-400 text-slate-950'
                            : 'bg-[#060D24] text-slate-300 border border-white/10'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={questionSearch}
                      onChange={(e) => setQuestionSearch(e.target.value)}
                      placeholder="ابحث في نص السؤال أو الهدف أو المقتطف..."
                      className="w-full rounded-xl bg-[#060D24] border border-white/15 pr-9 pl-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                    />
                  </div>
                </div>

                {filteredQuestions.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-[#060D24]/70 p-8 text-center text-xs text-slate-400">
                    لا توجد أسئلة مطابقة للتصفية الحالية.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredQuestions.map((q) => {
                      const isSelected = selectedQuestionIds.includes(q.id);
                      const cogLabel =
                        COGNITIVE_LEVEL_LABELS[q.cognitiveLevel ?? 'understand'] ?? 'فهم';
                      return (
                        <article
                          key={q.id}
                          className={`rounded-2xl border p-4 sm:p-5 transition space-y-3 ${
                            isSelected
                              ? 'border-indigo-400 bg-indigo-950/25'
                              : q.status === 'rejected'
                              ? 'border-red-400/25 bg-red-950/15'
                              : q.status === 'published'
                              ? 'border-emerald-400/20 bg-[#060D24]/90'
                              : 'border-white/10 bg-[#060D24]/90'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5 flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedQuestionIds((prev) => [...prev, q.id]);
                                  } else {
                                    setSelectedQuestionIds((prev) => prev.filter((x) => x !== q.id));
                                  }
                                }}
                                aria-label={`تحديد السؤال ${q.prompt}`}
                                className="mt-1 w-4 h-4 accent-indigo-400 shrink-0 cursor-pointer"
                              />
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                                  <span className="text-sky-300">
                                    {ROUND_RULES[q.roundType]?.nameAr ?? q.roundType}
                                  </span>
                                  <span className="text-slate-500">·</span>
                                  <span className="text-indigo-300">{cogLabel}</span>
                                  <span className="text-slate-500">·</span>
                                  <span className="text-slate-300">{DIFFICULTY_LABELS[q.difficulty]}</span>
                                  <span className="text-slate-500">·</span>
                                  <span className="text-slate-400 tabular-nums">صفحة {q.sourcePage ?? 1}</span>
                                  {q.isHypotheticalScenario && (
                                    <>
                                      <span className="text-slate-500">·</span>
                                      <span className="text-amber-300">موقف تطبيقي افتراضي</span>
                                    </>
                                  )}
                                  <span className="text-slate-500">·</span>
                                  <span
                                    className={
                                      q.status === 'published'
                                        ? 'text-emerald-300'
                                        : q.status === 'rejected'
                                        ? 'text-red-300'
                                        : 'text-amber-300'
                                    }
                                  >
                                    {q.status === 'published'
                                      ? 'معتمد للعب'
                                      : q.status === 'rejected'
                                      ? 'مرفوض'
                                      : 'بانتظار مراجعة المعلم'}
                                  </span>
                                </div>

                                {editingId === q.id ? (
                                  <div className="space-y-2 pt-2">
                                    <textarea
                                      value={editPrompt}
                                      onChange={(e) => setEditPrompt(e.target.value)}
                                      rows={2}
                                      className="w-full rounded-xl bg-[#09143A] border border-sky-400/40 px-3 py-2 text-sm text-white"
                                    />
                                    <input
                                      type="text"
                                      value={editAnswer}
                                      onChange={(e) => setEditAnswer(e.target.value)}
                                      placeholder="الإجابات المقبولة مفصولة بـ |"
                                      className="w-full rounded-xl bg-[#09143A] border border-white/15 px-3 py-1.5 text-xs text-white"
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void saveEdit(q.id)}
                                        className="rounded-lg bg-emerald-400 text-slate-950 font-black px-3 py-1.5 text-xs"
                                      >
                                        حفظ التعديل
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingId(null)}
                                        className="rounded-lg bg-white/10 text-slate-200 px-3 py-1.5 text-xs"
                                      >
                                        إلغاء
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <h4 className="text-sm sm:text-base font-bold text-white leading-relaxed">
                                    {q.prompt}
                                  </h4>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center gap-1.5 shrink-0 relative">
                              {q.status !== 'published' && (
                                <button
                                  type="button"
                                  onClick={() => void approveQuestion(q)}
                                  className="rounded-lg bg-emerald-500/20 border border-emerald-400/35 hover:bg-emerald-500/35 px-2.5 py-1.5 text-xs font-bold text-emerald-200 flex items-center gap-1 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>اعتماد</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  setImproveMenuQuestionId((cur) => (cur === q.id ? null : q.id))
                                }
                                className="rounded-lg bg-indigo-500/20 border border-indigo-400/35 hover:bg-indigo-500/35 px-2.5 py-1.5 text-xs font-bold text-indigo-100 flex items-center gap-1 cursor-pointer"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>تحسين بالذكاء</span>
                                <ChevronDown className="w-3 h-3" />
                              </button>

                              {improveMenuQuestionId === q.id && (
                                <div className="absolute left-0 top-9 z-30 w-44 rounded-2xl border border-sky-400/30 bg-[#09143A] p-1.5 shadow-2xl space-y-1">
                                  {IMPROVEMENT_ACTIONS.map((act) => (
                                    <button
                                      key={act.id}
                                      type="button"
                                      onClick={() => void handlePreviewSelectedOrImprove([q.id], act.id)}
                                      className="w-full text-right rounded-xl px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-sky-500/20 hover:text-white transition"
                                    >
                                      {act.label}
                                    </button>
                                  ))}
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(q.id);
                                  setEditPrompt(q.prompt);
                                  setEditAnswer(q.acceptableAnswers.join(' | '));
                                }}
                                className="rounded-lg bg-white/10 hover:bg-white/20 p-1.5 text-slate-200"
                                title="تعديل"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {q.status !== 'rejected' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectingQuestionId(q.id);
                                    setRejectReasonInput('');
                                  }}
                                  className="rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 px-2 py-1.5 text-xs font-bold text-amber-200"
                                >
                                  رفض
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => void deleteQuestion(q.id)}
                                className="rounded-lg bg-red-500/15 hover:bg-red-500/30 p-1.5 text-red-300"
                                title="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {rejectingQuestionId === q.id && (
                            <div className="rounded-xl border border-amber-400/35 bg-amber-950/25 p-3 flex flex-wrap items-center gap-2">
                              <input
                                type="text"
                                value={rejectReasonInput}
                                onChange={(e) => setRejectReasonInput(e.target.value)}
                                placeholder="اذكر سبب الرفض (سيستفيد منه النظام عند إعادة التوليد)..."
                                className="flex-1 min-w-[200px] rounded-lg bg-[#060D24] border border-white/15 px-3 py-1.5 text-xs text-white"
                              />
                              <button
                                type="button"
                                onClick={() => void submitRejectWithReason(q.id)}
                                className="rounded-lg bg-amber-400 text-slate-950 font-black px-3 py-1.5 text-xs"
                              >
                                تأكيد الرفض
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectingQuestionId(null)}
                                className="rounded-lg bg-white/10 text-slate-200 px-3 py-1.5 text-xs"
                              >
                                إلغاء
                              </button>
                            </div>
                          )}

                          {/* Pedagogical Answers & Source Grounding Details */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs bg-[#09143A]/65 rounded-xl p-3 border border-white/5">
                            <div>
                              <span className="text-slate-400 font-bold">الإجابة المعتمدة: </span>
                              <span className="text-emerald-300 font-bold">
                                {q.acceptableAnswers.join(' / ')}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-bold">الهدف التعليمي: </span>
                              <span className="text-slate-200">{q.learningObjective || selectedLesson.title}</span>
                            </div>
                            {q.answerCorrectnessReason && (
                              <div>
                                <span className="text-slate-400 font-bold">سبب صحة الإجابة: </span>
                                <span className="text-slate-200">{q.answerCorrectnessReason}</span>
                              </div>
                            )}
                            {q.gradingCriterion && (
                              <div>
                                <span className="text-slate-400 font-bold">معيار التصحيح: </span>
                                <span className="text-slate-200">{q.gradingCriterion}</span>
                              </div>
                            )}
                            {q.sourceExcerpt && (
                              <div className="md:col-span-2 text-[11px] text-slate-400">
                                المقتطف الموثق (ص {q.sourcePage ?? 1}): «{q.sourceExcerpt}»
                              </div>
                            )}
                            {q.rejectionReason && (
                              <div className="md:col-span-2 text-[11px] text-red-300 font-bold">
                                سبب الرفض المسجل: {q.rejectionReason}
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </motion.div>
          )}
        </main>

        {/* Preview-Before-Replace / Single-Question Improve Modal */}
        <QuestionPreviewModal
          previews={previewBundles}
          applyingId={applyingPreviewId}
          onApply={handleApplyReplacement}
          onClose={() => setPreviewBundles([])}
        />
      </div>
    </MotionConfig>
  );
}
