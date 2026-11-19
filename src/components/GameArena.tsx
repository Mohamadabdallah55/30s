import { ChallengeV2Surface } from './ChallengeV2Surface';
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bell,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  Flame,
  Flag,
  HelpCircle,
  Info,
  Pause,
  Play,
  Power,
  QrCode,
  RotateCcw,
  SkipForward,
  Smartphone,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from 'lucide-react';
import { determineWinner, normalizeArabicText, ROUND_RULES } from '../shared/gameRules';
import type { GameSessionView } from '../shared/types';
import { apiFetch, getAuthToken, useSessionSocket } from '../utils/api';
import { soundFx } from '../utils/sound';
import { PlayerAvatar, SessionQrBadge } from './BrandEmblem';

import { NashmiStageHost } from './ShowArt';
import { ShowArena } from './ShowArena';
import { useShowCountdown, useShowSound } from './ShowPresentation';

interface GameArenaProps {
  initialSession: GameSessionView;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onPlayAgain: () => void;
  onExit: () => void;
  onGoHome?: () => void;
  onOpenHostPanel?: (code: string) => void;
  onOpenBot?: () => void;
  onSessionUpdate?: (next: GameSessionView) => void;
}

export function GameArena({
  initialSession,
  soundEnabled,
  onToggleSound,
  onPlayAgain,
  onExit,
  onGoHome,
  onOpenHostPanel,
  onOpenBot,
  onSessionUpdate,
}: GameArenaProps) {
  const [session, setSession] = useState<GameSessionView>(initialSession);
  const [textAnswer, setTextAnswer] = useState('');
  const [listChips, setListChips] = useState<string[]>([]);
  const [listDupWarning, setListDupWarning] = useState<string | null>(null);
  const [orderedItems, setOrderedItems] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [objectionSent, setObjectionSent] = useState(false);
  const [showTypedSprint, setShowTypedSprint] = useState(false);
  const [showError, setShowError] = useState('');
  const showBusy = useRef(false);
  const [actionPending, setActionPending] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [showVsQr, setShowVsQr] = useState(false);
  const [copiedVsQr, setCopiedVsQr] = useState(false);
  const [bidAnswerText, setBidAnswerText] = useState('');
  const [bidError, setBidError] = useState<string | null>(null);
  const [bidBusy, setBidBusy] = useState(false);
  const prevFeedbackAt = useRef<number>(0);
  const lastUrgentTick = useRef<number>(-1);
  const lastRoundIntroRef = useRef<number>(-1);

  const countdown = useShowCountdown(session.countdownEndsAtMs);
  useShowSound(session.settings.showMode ? session : null, countdown);
  const { connected, reconnecting } = useSessionSocket(session.code, initialSession.hostSecret ? 'host' : 'player', (next) => {
    setSession(next);
    onSessionUpdate?.(next);
  });

  useEffect(() => {
    if (session.phase === 'paused') document.body.dataset.state = 'paused';
    else if (session.phase === 'finished') document.body.dataset.state = 'gameover';
    else document.body.dataset.state = 'playing';
    return () => {
      document.body.dataset.state = 'title';
    };
  }, [session.phase]);

  const qId = session.currentQuestion?.id;
  const qOptionsKey = session.currentQuestion?.options.join('|') ?? '';
  useEffect(() => {
    setTextAnswer('');
    setBidAnswerText('');
    setBidError(null);
    setListChips([]);
    setListDupWarning(null);
    setObjectionSent(false);
    if (session.currentQuestion?.roundType === 'order_items') {
      setOrderedItems([...session.currentQuestion.options]);
    } else {
      setOrderedItems([]);
    }
  }, [qId, qOptionsKey, session.currentQuestion?.roundType]);

  useEffect(() => {
    const round = session.rounds[session.currentRoundIndex];
    soundFx.setRoundContext(round?.roundType, round?.goldenTargetType);
    if (!session.settings.showMode && session.phase === 'playing' && lastRoundIntroRef.current !== session.currentRoundIndex) {
      soundFx.roundStart(round?.roundType, round?.goldenTargetType);
    }
    if (
      !session.settings.showMode && session.phase === 'playing' &&
      session.hasShownIntro === false &&
      lastRoundIntroRef.current !== session.currentRoundIndex
    ) {
      lastRoundIntroRef.current = session.currentRoundIndex;
      setShowRulesModal(true);
    }
  }, [session.phase, session.hasShownIntro, session.currentRoundIndex, session.rounds, session.settings.showMode]);

  useEffect(() => {
    if (session.lastFeedback && session.lastFeedback.atMs !== prevFeedbackAt.current) {
      prevFeedbackAt.current = session.lastFeedback.atMs;
      const rt = session.rounds[session.currentRoundIndex]?.roundType;
      if (session.settings.showMode && session.lastFeedback.type === 'streak') soundFx.combo();
      else if (session.settings.showMode && session.lastFeedback.type === 'lead_change') soundFx.lead();
      else if (
        session.lastFeedback.type === 'correct' ||
        session.lastFeedback.type === 'golden' ||
        session.lastFeedback.type === 'streak' ||
        session.lastFeedback.type === 'lead_change'
      ) {
        soundFx.correct(rt);
      } else if (session.lastFeedback.type === 'wrong') {
        soundFx.wrong(rt);
      }
    }
  }, [session.lastFeedback, session.rounds, session.currentRoundIndex, session.settings.showMode]);

  useEffect(() => {
    if (
      !session.settings.showMode && session.phase === 'playing' &&
      session.timerRunning &&
      session.timerRemainingSec <= 5 &&
      session.timerRemainingSec > 0 &&
      lastUrgentTick.current !== session.timerRemainingSec
    ) {
      lastUrgentTick.current = session.timerRemainingSec;
      soundFx.tickUrgent(session.rounds[session.currentRoundIndex]?.roundType);
    }
  }, [session.phase, session.timerRunning, session.timerRemainingSec, session.rounds, session.currentRoundIndex, session.settings.showMode]);

  useEffect(() => {
    if (!session.settings.showMode && session.phase === 'finished') {
      soundFx.victory(determineWinner(session.teams).isTie);
    }
  }, [session.phase, session.teams, session.settings.showMode]);

  useEffect(() => {
    if (session.settings.showMode || session.challengeV2) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmEndOpen) {
          setConfirmEndOpen(false);
          return;
        }
        if (session.phase === 'playing') sendHostAction('pause_timer');
        else if (session.phase === 'paused') sendHostAction('resume_timer');
        return;
      }
      if (inInput) return;
      if (e.key === 'm' || e.key === 'M') {
        onToggleSound();
      } else if (e.key === 'p' || e.key === 'P') {
        if (session.phase === 'playing') sendHostAction('pause_timer');
        else if (session.phase === 'paused') sendHostAction('resume_timer');
      } else if (
        session.phase === 'playing' &&
        session.currentQuestion?.roundType === 'buzzer' &&
        session.buzzedTeamIndex === null &&
        !session.answerRevealed &&
        session.timerRemainingSec > 0
      ) {
        if ((e.key === 'a' || e.key === 'A' || e.key === 'ش') && !session.failedBuzzTeams.includes(0)) {
          handleBuzz(0);
        } else if (
          (e.key === 'l' || e.key === 'L' || e.key === 'م') &&
          session.teams.length > 1 &&
          !session.failedBuzzTeams.includes(1)
        ) {
          handleBuzz(1);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const sendHostAction = async (action: string, payload: Record<string, unknown> = {}) => {
    if (session.settings.showMode && showBusy.current) return;
    showBusy.current = true;
    setActionPending(true);
    setShowError('');
    try {
      const res = await apiFetch<{ session: GameSessionView }>(`/api/sessions/${session.code}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, payload: { questionId: session.currentQuestion?.id, ...payload } }),
      });
      setSession(res.session);
    } catch (err) {
      if (session.settings.showMode) setShowError(err instanceof Error ? err.message : 'تعذّر تنفيذ الإجراء.');
    } finally {
      showBusy.current = false;
      setActionPending(false);
    }
  };

  const handleDismissIntro = async () => {
    setShowRulesModal(false);
    await sendHostAction('mark_intro_seen');
  };

  const handleBuzz = async (teamIdx: number) => {
    soundFx.buzz();
    try {
      const res = await apiFetch<{ session: GameSessionView }>(`/api/sessions/${session.code}/buzz`, {
        method: 'POST',
        body: JSON.stringify({ teamIndex: teamIdx, questionId: session.currentQuestion?.id }),
      });
      setSession((previous) => previous.hostSecret ? { ...res.session, hostSecret: previous.hostSecret } : res.session);
    } catch (err) {
      if (session.settings.showMode) setShowError(err instanceof Error ? err.message : 'الجرس مش متاح.');
    }
  };

  const handleSubmitAnswer = async (submitted: string | number | string[]) => {
    if (submitting || showBusy.current || session.answerRevealed || session.timerRemainingSec <= 0) return;
    showBusy.current = true;
    setShowError('');
    setSubmitting(true);
    try {
      const teamIndex = session.buzzedTeamIndex ?? session.activeTeamIndex;
      const res = await apiFetch<{ view: GameSessionView }>(`/api/sessions/${session.code}/answer`, {
        method: 'POST',
        body: JSON.stringify({ teamIndex, submitted, questionId: session.currentQuestion?.id }),
      });
      setSession((previous) => previous.hostSecret ? { ...res.view, hostSecret: previous.hostSecret } : res.view);
      setTextAnswer('');
    } catch (err) {
      if (session.settings.showMode) setShowError(err instanceof Error ? err.message : 'تعذّر تسجيل الإجابة.');
    } finally {
      showBusy.current = false;
      setSubmitting(false);
    }
  };

  const handleBidAction = async (action: string, payload: Record<string, unknown> = {}) => {
    if (bidBusy) return;
    setBidBusy(true);
    setBidError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/sessions/${session.code}/bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action, payload }),
      });
      const json = (await res.json()) as { session?: GameSessionView; error?: string };
      if (json.session) setSession(json.session);
      if (!res.ok && json.error) {
        setBidError(json.error);
      }
      if (res.ok && action === 'bid_record_answer') {
        setBidAnswerText('');
      }
    } catch {
      setBidError('تعذر تنفيذ إجراء المزايدة');
    } finally {
      setBidBusy(false);
    }
  };

  const handleAddListChip = () => {
    const trimmed = textAnswer.trim();
    if (!trimmed) return;
    const normNew = normalizeArabicText(trimmed);
    const exists = listChips.some((c) => normalizeArabicText(c) === normNew);
    if (exists) {
      setListDupWarning(`العنصر «${trimmed}» مضاف بالفعل — أضف إجابة مختلفة.`);
      return;
    }
    setListDupWarning(null);
    setListChips((prev) => [...prev, trimmed]);
    setTextAnswer('');
  };

  const moveOrderItem = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= orderedItems.length) return;
    const copy = [...orderedItems];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setOrderedItems(copy);
  };

  const currentRound = session.rounds[session.currentRoundIndex];
  const roundMeta = currentRound ? ROUND_RULES[currentRound.roundType] : null;
  const q = session.currentQuestion;
  const isUrgent = session.timerRunning && session.timerRemainingSec <= 5 && session.timerRemainingSec > 0;
  const isSprintRound = Boolean(roundMeta?.multiQuestionWithinTimer);
  const useVerbalControls =
    isSprintRound && session.settings.verbalRapidFireDefault !== false && !showTypedSprint;
  const winSummary = determineWinner(session.teams);

  if (session.challengeV2) return <ChallengeV2Surface session={session} role={session.hostSecret?'host':'audience'} onUpdate={setSession} onExit={onExit}/>;

  if (session.settings.showMode) {
    return <ShowArena session={session} audio={soundEnabled} connected={connected} canControl={Boolean(session.hostSecret)}
      busy={actionPending || submitting} error={showError} onAction={sendHostAction} onAnswer={handleSubmitAnswer}
      onBuzz={handleBuzz} onExit={onExit} onReplay={onPlayAgain} onSound={onToggleSound}
      onOpenBot={onOpenBot}
      onHost={session.hostSecret && onOpenHostPanel ? () => onOpenHostPanel(session.code) : undefined} />;
  }

  // ================= VS FACEOFF SCREEN =================
  if (session.phase === 'vs') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#09143A] via-[#10215A] to-[#081131] text-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-4xl rounded-3xl bg-[#101E52] border border-sky-400/30 p-8 text-center space-y-8 shadow-2xl">
          <div className="space-y-2">
            <p className="text-xs font-bold text-sky-300">
              {session.bankName} · رمز الجلسة: <span className="font-mono text-amber-300">{session.code}</span>
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-white">{session.title}</h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-6">
            <div className="animate-vs-right rounded-2xl bg-[#09143A] border border-white/10 p-6 flex flex-col items-center gap-3">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-slate-950 font-black text-2xl"
                style={{ backgroundColor: session.teams[0]?.color || '#38BDF8' }}
              >
                ١
              </div>
              <div className="text-xl font-black text-white">{session.teams[0]?.name}</div>
              <div className="text-xs text-slate-400">مستعد للمواجهة</div>
            </div>

            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-400 to-violet-600 flex items-center justify-center text-white font-black text-2xl shadow-lg">
                VS
              </div>
              <span className="text-xs text-slate-300 font-bold">{session.rounds.length} جولات متنوعة</span>
            </div>

            {session.teams[1] ? (
              <div className="animate-vs-left rounded-2xl bg-[#09143A] border border-white/10 p-6 flex flex-col items-center gap-3">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-slate-950 font-black text-2xl"
                  style={{ backgroundColor: session.teams[1].color }}
                >
                  ٢
                </div>
                <div className="text-xl font-black text-white">{session.teams[1].name}</div>
                <div className="text-xs text-slate-400">مستعد للمواجهة</div>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#09143A] border border-white/10 p-6 flex flex-col items-center gap-2">
                <Trophy className="w-10 h-10 text-amber-400" />
                <div className="font-extrabold text-white">تحدٍ فردي ضد الوقت</div>
                <div className="text-xs text-slate-400">اجمع أعلى نقاط خلال ٣٠ ثانية</div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => sendHostAction('start_match')}
              className="py-4 px-10 rounded-2xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-lg inline-flex items-center gap-3 transition-colors"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>أنا مستعد — ابدأ الجولة الأولى</span>
            </button>
            <button
              type="button"
              onClick={() => setShowVsQr((v) => !v)}
              className="py-4 px-5 rounded-2xl bg-[#132666] hover:bg-[#1B317A] border border-emerald-400/40 text-emerald-200 font-bold text-sm inline-flex items-center gap-2"
            >
              <QrCode className="w-4 h-4" />
              <span>{showVsQr ? 'إخفاء QR الجوال' : 'تحكم الأستاذ من الجوال (QR)'}</span>
            </button>
            {onOpenHostPanel && (
              <button
                type="button"
                onClick={() => onOpenHostPanel(session.code)}
                className="py-4 px-6 rounded-2xl bg-[#132666] hover:bg-[#1B317A] border border-amber-400/35 text-amber-200 font-bold text-sm"
              >
                فتح لوحة المشرف والبروجكتر
              </button>
            )}
            <button
              type="button"
              onClick={onExit}
              className="py-4 px-5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-sm inline-flex items-center gap-1.5"
            >
              <ArrowRight className="w-4 h-4" />
              <span>عودة خطوة</span>
            </button>
          </div>

          {showVsQr && (
            <div className="rounded-2xl bg-[#09143A] border border-emerald-400/35 p-5 flex flex-col sm:flex-row items-center justify-center gap-6 text-right">
              <SessionQrBadge
                code={session.code}
                url={`${typeof window !== 'undefined' ? window.location.origin : ''}/?mode=host&code=${session.code}`}
                size="md"
              />
              <div className="space-y-2 max-w-sm">
                <div className="inline-flex items-center gap-1.5 text-emerald-300 font-black text-sm">
                  <Smartphone className="w-4 h-4" />
                  <span>امسح الرمز بكاميرا هاتفك قبل البدء</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  يفتح هذا الرمز لوحة تحكم الأستاذ مباشرة على جوالك (بدء الجولة، الإجابة الصحيحة، المؤقت، وتعديل النقاط) بينما تبقى هذه الشاشة للعرض.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/?mode=host&code=${session.code}`;
                      navigator.clipboard?.writeText(url).catch(() => {});
                      setCopiedVsQr(true);
                      setTimeout(() => setCopiedVsQr(false), 2000);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    {copiedVsQr ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedVsQr ? 'تم نسخ رابط الجوال!' : 'نسخ رابط تحكم الجوال'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <NashmiStageHost session={session} onOpenBot={onOpenBot} placement="classic" />
      </div>
    );
  }

  // ================= MAIN ARENA =================
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#09143A] via-[#0E1E54] to-[#081131] text-slate-50 flex flex-col justify-between p-3 sm:p-6">
      <header className="max-w-6xl w-full mx-auto space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sky-300">رمز الجلسة: {session.code}</span>
            <span aria-hidden="true">·</span>
            <span>{connected ? 'متصل لحظياً' : reconnecting ? 'جاري استعادة الاتصال...' : 'مزامنة محلية'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              aria-label="شرح قوانين الجولة"
              className="w-9 h-9 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-white/10 flex items-center justify-center"
            >
              <Info className="w-4 h-4 text-sky-300" />
            </button>
            <button
              type="button"
              onClick={onToggleSound}
              aria-label={soundEnabled ? 'كتم الصوت' : 'تفعيل الصوت'}
              className="w-9 h-9 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-white/10 flex items-center justify-center"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-sky-300" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            </button>
            <button
              type="button"
              onClick={() => sendHostAction(session.phase === 'paused' ? 'resume_timer' : 'pause_timer')}
              aria-label={session.phase === 'paused' ? 'استئناف' : 'إيقاف مؤقت'}
              className="w-9 h-9 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-white/10 flex items-center justify-center"
            >
              {session.phase === 'paused' ? <Play className="w-4 h-4 text-emerald-300" /> : <Pause className="w-4 h-4 text-slate-200" />}
            </button>
            {onOpenBot && (
              <button
                type="button"
                onClick={onOpenBot}
                className="h-9 px-3 rounded-xl bg-violet-600/80 hover:bg-violet-500 border border-violet-300/30 text-white font-bold whitespace-nowrap"
              >
                نشمي
              </button>
            )}
            {onOpenHostPanel && (
              <button
                type="button"
                onClick={() => onOpenHostPanel(session.code)}
                className="h-9 px-3 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-amber-400/30 text-amber-200 font-bold whitespace-nowrap"
              >
                لوحة المشرف
              </button>
            )}
            <button
              type="button"
              onClick={onExit}
              aria-label="العودة خطوة للخلف"
              className="h-9 px-3 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-white/10 text-slate-200 font-bold inline-flex items-center gap-1 whitespace-nowrap"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">عودة</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmEndOpen(true)}
              aria-label="إنهاء المباراة"
              className="h-9 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200 font-bold inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Power className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">إنهاء</span>
            </button>
          </div>
        </div>

        {/* Round Banner */}
        <div
          className={`rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 ${
            currentRound?.roundType === 'golden'
              ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-slate-950'
              : 'bg-[#6D28D9] text-white'
          }`}
        >
          <span className="text-xs sm:text-sm font-black tabular-nums">
            الجولة {session.currentRoundIndex + 1}/{session.rounds.length}
          </span>
          <span className="text-sm sm:text-lg font-black flex items-center gap-2">
            <span>{currentRound?.titleAr || roundMeta?.nameAr}</span>
            {session.isClutchTime && (
              <span className="text-xs font-black px-2 py-0.5 rounded bg-black/25 text-amber-200">
                وقت الحسم
              </span>
            )}
          </span>
          <span className="text-xs sm:text-sm font-bold tabular-nums">
            سؤال {session.currentQuestionIndexInRound + 1}/{currentRound?.questionsPerRound ?? 1}
          </span>
        </div>

        {/* Team Scores + Central Giant 30s Timer */}
        <div className="grid grid-cols-3 items-center gap-2 sm:gap-4 rounded-2xl bg-[#101E52] border border-sky-400/20 p-3 sm:p-4">
          <div
            className={`rounded-xl p-2.5 sm:p-3 border transition-colors ${
              session.activeTeamIndex === 0
                ? 'bg-[#162B73] border-sky-400'
                : 'bg-[#09143A]/70 border-white/10'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-xs sm:text-base text-white truncate">
                {session.teams[0]?.name}
              </span>
              <span
                className="text-xl sm:text-3xl font-black tabular-nums"
                style={{ color: session.teams[0]?.color || '#38BDF8' }}
              >
                {session.teams[0]?.points ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
              <div className="flex items-center gap-1" aria-label="أخطاء الفريق الأول">
                {Array.from({ length: session.settings.strikesLimit }).map((_, idx) => (
                  <span
                    key={idx}
                    className={`text-xs font-black ${
                      idx < (session.teams[0]?.strikes ?? 0) ? 'text-rose-400' : 'text-slate-600'
                    }`}
                  >
                    ✕
                  </span>
                ))}
              </div>
              {(session.teams[0]?.streak ?? 0) >= 2 && (
                <span className="text-[11px] font-black text-amber-300 inline-flex items-center gap-0.5 tabular-nums">
                  <Flame className="w-3 h-3" /> {session.teams[0].streak}
                </span>
              )}
            </div>
          </div>

          {/* Center Giant Timer */}
          <div className="flex flex-col items-center justify-center">
            <div
              data-testid="countdown-timer"
              className={`px-4 sm:px-6 py-2 rounded-2xl border text-center transition-transform ${
                isUrgent
                  ? 'timer-urgent bg-rose-500/20 border-rose-400 text-rose-300'
                  : 'bg-[#09143A] border-sky-400/40 text-sky-300'
              }`}
            >
              <div className="text-3xl sm:text-5xl font-black tabular-nums leading-none">
                00:{String(session.timerRemainingSec).padStart(2, '0')}
              </div>
              <div className="text-[11px] font-bold mt-1 text-slate-300">
                {session.bidState?.phase === 'bidding'
                  ? 'مرحلة المزايدة (الوقت متوقف)'
                  : session.memoryPhase === 'memorize'
                  ? `احفظ (${session.memoryRemainingSec}ث)`
                  : isSprintRound && session.timerRunning
                  ? 'وقت متواصل للأسئلة'
                  : session.timerRunning
                  ? 'الوقت يجري'
                  : session.timerRemainingSec <= 0
                  ? 'انتهى الوقت'
                  : 'متوقف'}
              </div>
            </div>
          </div>

          {session.teams[1] ? (
            <div
              className={`rounded-xl p-2.5 sm:p-3 border transition-colors ${
                session.activeTeamIndex === 1
                  ? 'bg-[#162B73] border-amber-400'
                  : 'bg-[#09143A]/70 border-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-xs sm:text-base text-white truncate">
                  {session.teams[1].name}
                </span>
                <span
                  className="text-xl sm:text-3xl font-black tabular-nums"
                  style={{ color: session.teams[1].color }}
                >
                  {session.teams[1].points}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <div className="flex items-center gap-1" aria-label="أخطاء الفريق الثاني">
                  {Array.from({ length: session.settings.strikesLimit }).map((_, idx) => (
                    <span
                      key={idx}
                      className={`text-xs font-black ${
                        idx < session.teams[1].strikes ? 'text-rose-400' : 'text-slate-600'
                      }`}
                    >
                      ✕
                    </span>
                  ))}
                </div>
                {session.teams[1].streak >= 2 && (
                  <span className="text-[11px] font-black text-amber-300 inline-flex items-center gap-0.5 tabular-nums">
                    <Flame className="w-3 h-3" /> {session.teams[1].streak}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl p-2.5 sm:p-3 bg-[#09143A]/70 border border-white/10 text-center">
              <div className="text-xs text-slate-400">سلسلة الإجابات</div>
              <div className="text-2xl font-black text-amber-300 tabular-nums">
                {session.teams[0]?.streak ?? 0}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Playfield */}
      <main className="max-w-5xl w-full mx-auto flex-1 flex flex-col justify-center py-4 space-y-4">
        {/* Feedback Banner (with lead_change / streak / correct / wrong emphasis) */}
        {session.lastFeedback && (
          <div
            className={`rounded-xl px-4 py-2.5 text-sm font-bold flex items-center justify-center gap-2 ${
              session.lastFeedback.type === 'lead_change' || session.lastFeedback.type === 'streak'
                ? 'bg-amber-500/25 border border-amber-400/50 text-amber-100'
                : session.lastFeedback.type === 'correct' || session.lastFeedback.type === 'golden'
                ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-200'
                : session.lastFeedback.type === 'wrong'
                ? 'bg-rose-500/20 border border-rose-400/40 text-rose-200'
                : 'bg-white/10 border border-white/15 text-slate-200'
            }`}
          >
            {session.lastFeedback.type === 'wrong' ? (
              <XCircle className="w-4 h-4 shrink-0" />
            ) : session.lastFeedback.type === 'lead_change' || session.lastFeedback.type === 'streak' ? (
              <Zap className="w-4 h-4 shrink-0 text-amber-300" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{session.lastFeedback.message}</span>
          </div>
        )}

        {/* Exhausted Category Notice */}
        {session.exhaustedNotice?.exhausted ? (
          <div className="rounded-2xl bg-[#101E52] border border-amber-400/40 p-6 sm:p-8 text-center space-y-5">
            <h2 className="text-xl font-black text-amber-300">تنبيه: انتهاء الأسئلة غير المعروضة</h2>
            <p className="text-slate-200 max-w-xl mx-auto text-sm leading-relaxed">
              {session.exhaustedNotice.message}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {session.exhaustedNotice.availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => sendHostAction('switch_category', { category: cat })}
                  className="px-4 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-sm"
                >
                  التبديل إلى: {cat}
                </button>
              ))}
              <button
                type="button"
                onClick={() => sendHostAction('approve_cycle_reset')}
                className="px-4 py-2.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-amber-200 font-bold text-sm inline-flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>أوافق على إعادة دورة الأسئلة</span>
              </button>
              <button
                type="button"
                onClick={() => sendHostAction('next_round')}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm"
              >
                الانتقال للجولة التالية
              </button>
            </div>
          </div>
        ) : q ? (
          <div className="rounded-3xl bg-[#101E52] border border-sky-400/30 p-5 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sky-300">{q.category}</span>
                {q.sourcePage && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>مرجع الدرس: صفحة {q.sourcePage}</span>
                  </>
                )}
                {q.roundType === 'who_am_i' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-bold text-amber-300 tabular-nums">
                      قيمة الإجابة الآن: {Math.max(1, 3 - (q.revealedClues.length - 1)) * (currentRound?.multiplier ?? 1)} نقاط
                    </span>
                  </>
                )}
              </div>
              <span>
                الدور الحالي:{' '}
                <strong className="text-white">
                  {session.teams[session.buzzedTeamIndex ?? session.activeTeamIndex]?.name}
                </strong>
              </span>
            </div>

            {/* Memory Memorize Phase */}
            {q.roundType === 'memory' && q.memoryPhase === 'memorize' ? (
              <div className="space-y-4 text-center py-4">
                <h2 className="text-xl sm:text-2xl font-black text-amber-300">
                  احفظ هذه العناصر خلال {q.memoryRemainingSec} ثوانٍ!
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {(q.memoryItems || []).map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl bg-[#09143A] border border-sky-400/40 p-4 flex flex-col items-center gap-2"
                    >
                      <span className="text-xs font-mono text-sky-300 font-bold">#{idx + 1}</span>
                      <span className="text-base font-extrabold text-white">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <h2
                  data-testid="question-prompt"
                  className="text-xl sm:text-3xl font-black text-white text-center leading-relaxed text-balance"
                >
                  {q.prompt}
                </h2>

                {/* Rapid-Fire / True-False Mosque Verbal Quick Controls */}
                {useVerbalControls && !session.answerRevealed && session.timerRemainingSec > 0 && (
                  <div className="rounded-2xl bg-[#09143A] border border-sky-400/30 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-sky-300">
                        تحكم المقدم الشفهي السريع — الوقت متواصل ({session.timerRemainingSec}ث)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowTypedSprint(true)}
                        className="text-slate-300 underline hover:text-white font-bold"
                      >
                        تبديل إلى الإدخال الكتابي
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => sendHostAction('award_team', { teamIndex: session.activeTeamIndex })}
                        className="py-3.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm"
                      >
                        صحيحة (+{currentRound?.multiplier ?? 1})
                      </button>
                      <button
                        type="button"
                        onClick={() => sendHostAction('skip_question')}
                        className="py-3.5 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-sm"
                      >
                        تخطي
                      </button>
                      <button
                        type="button"
                        onClick={() => sendHostAction('strike_team', { teamIndex: session.activeTeamIndex })}
                        className="py-3.5 px-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-sm"
                      >
                        خاطئة
                      </button>
                    </div>
                  </div>
                )}

                {isSprintRound && showTypedSprint && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setShowTypedSprint(false)}
                      className="text-xs text-sky-300 underline font-bold"
                    >
                      العودة للوضع الشفهي السريع
                    </button>
                  </div>
                )}

                {/* Who Am I Progressive Clues */}
                {q.roundType === 'who_am_i' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {q.revealedClues.map((clue, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl bg-[#09143A] border border-violet-400/30 px-4 py-3 text-sm sm:text-base text-slate-100 flex items-center gap-3"
                        >
                          <span className="font-mono font-bold text-violet-300 shrink-0">دليل {idx + 1}:</span>
                          <span>{clue}</span>
                        </div>
                      ))}
                    </div>
                    {q.revealedClues.length < q.cluesCount && !session.answerRevealed && (
                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => sendHostAction('reveal_next_clue')}
                          className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <HelpCircle className="w-4 h-4" />
                          <span>إظهار الدليل التالي ({q.revealedClues.length}/{q.cluesCount})</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Buzzer Duel Lock */}
                {q.roundType === 'buzzer' && session.buzzedTeamIndex === null && !session.answerRevealed && (
                  <div className="space-y-3 py-2">
                    {session.failedBuzzTeams.length > 0 && (
                      <p className="text-xs text-center font-bold text-amber-300">
                        أُغلق الجرس على{' '}
                        {session.failedBuzzTeams.map((i) => session.teams[i]?.name).join(' و ')} — الفرصة متاحة الآن للفريق المنافس!
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {session.teams.map((t) => {
                        const locked = session.failedBuzzTeams.includes(t.index) || session.timerRemainingSec <= 0;
                        return (
                          <button
                            key={t.index}
                            type="button"
                            disabled={locked}
                            onClick={() => handleBuzz(t.index)}
                            className={`py-6 px-6 rounded-2xl border-2 font-black text-xl flex items-center justify-center gap-3 transition-transform ${
                              locked
                                ? 'bg-slate-800/70 border-slate-600 text-slate-400 cursor-not-allowed'
                                : 'border-white/20 hover:scale-[1.01] active:scale-[0.98] text-slate-950'
                            }`}
                            style={!locked ? { backgroundColor: t.color } : undefined}
                          >
                            <Bell className="w-6 h-6" />
                            <span>
                              {session.failedBuzzTeams.includes(t.index)
                                ? `أُغلق على ${t.name}`
                                : `جرس ${t.name} (${t.index === 0 ? 'A' : 'L'})`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* MCQ / True-False / Odd-One-Out Options */}
                {(q.roundType === 'multiple_choice' ||
                  q.roundType === 'true_false' ||
                  q.roundType === 'odd_one_out') &&
                  !useVerbalControls && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {q.options.map((opt, idx) => {
                        const isCorrectOpt = session.answerRevealed && q.revealedCorrectIndex === idx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={submitting || session.answerRevealed || session.timerRemainingSec <= 0}
                            onClick={() => handleSubmitAnswer(idx)}
                            className={`min-h-[56px] p-4 rounded-2xl border text-right font-bold text-base sm:text-lg transition-colors flex items-center justify-between gap-3 ${
                              isCorrectOpt
                                ? 'bg-emerald-500/25 border-emerald-400 text-emerald-100'
                                : 'bg-[#09143A] hover:bg-[#15286B] border-sky-400/25 text-white disabled:opacity-60'
                            }`}
                          >
                            <span>{opt}</span>
                            <span className="text-xs font-mono text-sky-300 shrink-0">{idx + 1}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                {/* Order Items */}
                {q.roundType === 'order_items' && (
                  <div className="space-y-3">
                    {q.orderCriteria && (
                      <p className="text-xs text-center text-amber-300 font-bold">
                        المعيار: {q.orderCriteria}
                      </p>
                    )}
                    <div className="space-y-2 max-w-xl mx-auto">
                      {orderedItems.map((item, idx) => (
                        <div
                          key={item}
                          className="rounded-xl bg-[#09143A] border border-sky-400/25 px-4 py-2.5 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-bold text-sky-300">{idx + 1}.</span>
                            <span className="font-bold text-white">{item}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0 || session.answerRevealed}
                              onClick={() => moveOrderItem(idx, -1)}
                              aria-label={`نقل ${item} للأعلى`}
                              className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === orderedItems.length - 1 || session.answerRevealed}
                              onClick={() => moveOrderItem(idx, 1)}
                              aria-label={`نقل ${item} للأسفل`}
                              className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {!session.answerRevealed && (
                      <div className="text-center">
                        <button
                          type="button"
                          disabled={submitting || session.timerRemainingSec <= 0}
                          onClick={() => handleSubmitAnswer(orderedItems)}
                          className="px-8 py-3 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black disabled:opacity-50"
                        >
                          اعتماد الترتيب
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* List Multiple Input (with duplicate-prevention feedback) */}
                {q.roundType === 'list_multiple' && !session.answerRevealed && (
                  <div className="space-y-3 max-w-xl mx-auto">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={textAnswer}
                        onChange={(e) => {
                          setTextAnswer(e.target.value);
                          setListDupWarning(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && textAnswer.trim()) {
                            e.preventDefault();
                            handleAddListChip();
                          }
                        }}
                        placeholder="اكتب عنصراً ثم اضغط Enter لإضافته، أو افصل بفاصلة..."
                        className="flex-1 rounded-xl bg-[#09143A] border border-slate-600 focus:border-sky-400 px-4 py-3 text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddListChip}
                        className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold"
                      >
                        إضافة
                      </button>
                    </div>
                    {listDupWarning && <p className="text-xs text-amber-300 font-bold">{listDupWarning}</p>}
                    {listChips.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {listChips.map((chip, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setListChips((prev) => prev.filter((_, i) => i !== idx))}
                            className="px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sm text-sky-100"
                          >
                            {chip} ✕
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={
                        submitting ||
                        session.timerRemainingSec <= 0 ||
                        (listChips.length === 0 && !textAnswer.trim())
                      }
                      onClick={() => {
                        const finalItems = textAnswer.trim() ? [...listChips, textAnswer.trim()] : listChips;
                        handleSubmitAnswer(finalItems);
                      }}
                      className="w-full py-3.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black disabled:opacity-50"
                    >
                      تأكيد الإجابات ({listChips.length + (textAnswer.trim() ? 1 : 0)})
                    </button>
                  </div>
                )}

                {/* Bid Challenge (مين يزوّد) Interactive Playfield */}
                {q.roundType === 'bid_challenge' && session.bidState && (
                  <div className="rounded-2xl bg-[#09143A] border border-amber-400/35 p-4 sm:p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-amber-300">
                          {session.bidState.phase === 'bidding'
                            ? 'المرحلة ١: المزايدة على العدد'
                            : session.bidState.phase === 'executing'
                            ? 'المرحلة ٢: تنفيذ التحدي خلال 30 ثانية'
                            : 'المرحلة ٣: حسم التحدي'}
                        </div>
                        <div className="text-sm font-black text-white mt-0.5">
                          المزايد الحالي:{' '}
                          <span style={{ color: session.teams[session.bidState.bidderTeamIndex]?.color || '#38BDF8' }}>
                            {session.teams[session.bidState.bidderTeamIndex]?.name}
                          </span>{' '}
                          · الالتزام:{' '}
                          <span className="text-amber-300 font-mono text-lg">{session.bidState.currentBid}</span>{' '}
                          (الحد الأقصى {session.bidState.maxPossible})
                        </div>
                      </div>
                      <div className="px-3.5 py-2 rounded-xl bg-[#101E52] border border-sky-400/30 text-sm font-black tabular-nums text-sky-300">
                        {session.bidState.acceptedAnswers.length} / {session.bidState.currentBid} إجابة فريدة
                      </div>
                    </div>

                    {session.bidState.phase === 'bidding' ? (
                      <div className="space-y-3">
                        <div className="text-xs text-slate-300">
                          الدور على{' '}
                          <strong className="text-white">
                            {session.teams[session.bidState.turnTeamIndex]?.name}
                          </strong>{' '}
                          لرفع العدد أو تحدي{' '}
                          <strong className="text-amber-300">
                            {session.teams[session.bidState.bidderTeamIndex]?.name}
                          </strong>{' '}
                          ليبدأ عداد الـ30 ثانية:
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                          <button
                            type="button"
                            disabled={bidBusy || session.bidState.currentBid + 1 > session.bidState.maxPossible}
                            onClick={() =>
                              handleBidAction('bid_raise', {
                                teamIndex: session.bidState!.turnTeamIndex,
                                increment: 1,
                              })
                            }
                            className="px-5 py-3 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-sm disabled:opacity-45"
                          >
                            +1 زايد (إلى {session.bidState.currentBid + 1})
                          </button>
                          <button
                            type="button"
                            disabled={bidBusy || session.bidState.currentBid + 2 > session.bidState.maxPossible}
                            onClick={() =>
                              handleBidAction('bid_raise', {
                                teamIndex: session.bidState!.turnTeamIndex,
                                increment: 2,
                              })
                            }
                            className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black text-sm disabled:opacity-45"
                          >
                            +2 زايد (إلى {session.bidState.currentBid + 2})
                          </button>
                          <button
                            type="button"
                            disabled={bidBusy}
                            onClick={() => handleBidAction('bid_challenge', {})}
                            className="px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm"
                          >
                            {session.teams.length > 1
                              ? `تحدّاه عند (${session.bidState.currentBid}) — ابدأ الـ30ث`
                              : `ابدأ التنفيذ (${session.bidState.currentBid}) — 30ث`}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-400 transition-all duration-300"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (session.bidState.acceptedAnswers.length / Math.max(1, session.bidState.currentBid)) *
                                    100
                                )
                              )}%`,
                            }}
                          />
                        </div>

                        {session.bidState.acceptedAnswers.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {session.bidState.acceptedAnswers.map((ans, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-xs font-bold text-emerald-100"
                              >
                                {idx + 1}. {ans}
                              </span>
                            ))}
                          </div>
                        )}

                        {(bidError || session.bidState.lastDuplicateWarning) && (
                          <p className="text-xs font-bold text-amber-300">
                            {bidError || session.bidState.lastDuplicateWarning}
                          </p>
                        )}

                        {!session.answerRevealed && (
                          <div className="space-y-2">
                            {session.timerRemainingSec > 0 && (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  if (bidAnswerText.trim()) {
                                    handleBidAction('bid_record_answer', {
                                      answerText: bidAnswerText.trim(),
                                      hostConfirmed: false,
                                    });
                                  }
                                }}
                                className="flex flex-col sm:flex-row gap-2"
                              >
                                <label htmlFor="bid-answer-input" className="sr-only">
                                  أضف إجابة فريدة لتحدي مين يزوّد
                                </label>
                                <input
                                  id="bid-answer-input"
                                  type="text"
                                  autoFocus
                                  value={bidAnswerText}
                                  onChange={(e) => {
                                    setBidAnswerText(e.target.value);
                                    setBidError(null);
                                  }}
                                  placeholder="اكتب إجابة واحدة فريدة واضغط Enter..."
                                  className="flex-1 rounded-xl bg-[#101E52] border border-sky-400/40 focus:border-sky-300 px-4 py-3 text-sm text-white outline-none"
                                />
                                <button
                                  type="submit"
                                  disabled={bidBusy || !bidAnswerText.trim()}
                                  className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm disabled:opacity-50"
                                >
                                  تسجيل الإجابة
                                </button>
                              </form>
                            )}
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => sendHostAction('bid_complete')}
                                className="px-4 py-2 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-200 text-xs font-black"
                              >
                                {session.timerRemainingSec <= 0 ? 'حسم نتيجة التحدي وإعلان النقاط' : 'إنهاء وحسم التحدي الآن'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Text Answer Input */}
                {((q.roundType === 'rapid_fire' && !useVerbalControls) ||
                  q.roundType === 'fill_blank' ||
                  q.roundType === 'who_am_i' ||
                  q.roundType === 'memory' ||
                  q.roundType === 'golden' ||
                  (q.roundType === 'buzzer' && session.buzzedTeamIndex !== null)) &&
                  !session.answerRevealed && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (textAnswer.trim()) handleSubmitAnswer(textAnswer);
                      }}
                      className="flex flex-col sm:flex-row gap-2 max-w-xl mx-auto"
                    >
                      <label htmlFor="arena-answer-input" className="sr-only">
                        اكتب الإجابة
                      </label>
                      <input
                        id="arena-answer-input"
                        type="text"
                        autoFocus
                        value={textAnswer}
                        onChange={(e) => setTextAnswer(e.target.value)}
                        placeholder="اكتب إجابتك هنا..."
                        className="flex-1 rounded-xl bg-[#09143A] border border-sky-400/40 focus:border-sky-300 px-4 py-3.5 text-base text-white outline-none"
                      />
                      <button
                        type="submit"
                        disabled={submitting || !textAnswer.trim() || session.timerRemainingSec <= 0}
                        className="px-7 py-3.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black disabled:opacity-50"
                      >
                        تأكيد الإجابة
                      </button>
                    </form>
                  )}

                {/* Revealed Answer & Explanation */}
                {session.answerRevealed && (
                  <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/40 p-4 sm:p-5 space-y-2 text-center">
                    <div className="text-xs font-bold text-emerald-300">الإجابة الصحيحة المعتمدة</div>
                    <div className="text-lg sm:text-xl font-black text-white">
                      {q.revealedAcceptableAnswers?.join(' · ') || q.revealedAnswerText}
                    </div>
                    {q.revealedOddReason && (
                      <p className="text-sm text-amber-200 font-bold">سبب الاختلاف: {q.revealedOddReason}</p>
                    )}
                    {q.revealedExplanation && <p className="text-sm text-slate-200">{q.revealedExplanation}</p>}
                  </div>
                )}
              </>
            )}

            {/* Quick Bottom Action Strip */}
            <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {!session.answerRevealed && (
                  <button
                    type="button"
                    onClick={() => sendHostAction('reveal_answer')}
                    className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs sm:text-sm font-bold inline-flex items-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" />
                    <span>إظهار الإجابة</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => sendHostAction('skip_question')}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs sm:text-sm font-bold inline-flex items-center gap-1.5"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>تخطي</span>
                </button>
                <button
                  type="button"
                  disabled={objectionSent}
                  onClick={() => {
                    setObjectionSent(true);
                    sendHostAction('flag_objection', { reason: 'مراجعة من المتسابق أثناء اللعب' });
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Flag className="w-4 h-4" />
                  <span>{objectionSent ? 'تم إرسال الاعتراض' : 'إبلاغ / اعتراض'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => sendHostAction('next_question')}
                className="px-6 py-3 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-sm"
              >
                {session.currentQuestionIndexInRound + 1 < (currentRound?.questionsPerRound ?? 1)
                  ? 'السؤال التالي'
                  : session.currentRoundIndex + 1 < session.rounds.length
                  ? 'ملخص الجولة والانتقال للتالية'
                  : 'إنهاء المسابقة وعرض الفائز'}
              </button>
            </div>
          </div>
        ) : null}
      </main>
      <NashmiStageHost session={session} onOpenBot={onOpenBot} placement="classic" />

      {/* Pre-round Rules Intro Modal */}
      {showRulesModal && roundMeta && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl bg-[#101E52] border border-sky-400/40 p-6 text-center space-y-4 shadow-2xl">
            <div className="text-xs font-bold text-amber-300">
              قواعد الجولة {session.currentRoundIndex + 1}
            </div>
            <h2 className="text-2xl font-black text-white">{currentRound?.titleAr || roundMeta.nameAr}</h2>
            <p className="text-sm text-slate-200 leading-relaxed">{roundMeta.rulesBulletAr}</p>
            <div className="text-xs text-sky-300 font-bold tabular-nums">
              مدة التحدي: {currentRound?.durationSec ?? roundMeta.defaultDurationSec} ثانية
              {isSprintRound ? ' (العداد متواصل دون توقف)' : ''}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleDismissIntro}
                className="flex-1 py-3 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black"
              >
                فهمت — ابدأ التحدي
              </button>
              <button
                type="button"
                onClick={handleDismissIntro}
                className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold"
              >
                تخطي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm End Match Modal (never window.confirm) */}
      {confirmEndOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-3xl bg-[#101E52] border border-rose-400/40 p-6 text-center space-y-4">
            <h2 className="text-xl font-black text-white">تأكيد إنهاء المباراة</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              هل تريد إنهاء المباراة الحالية وإعلان النتيجة النهائية فوراً؟
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmEndOpen(false);
                  sendHostAction('end_match');
                }}
                className="flex-1 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-sm"
              >
                نعم، أنهِ المباراة
              </button>
              <button
                type="button"
                onClick={() => setConfirmEndOpen(false)}
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Round Summary Modal */}
      {session.phase === 'round_summary' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl bg-[#101E52] border border-sky-400/40 p-7 text-center space-y-6">
            <h2 className="text-2xl font-black text-white">انتهت {currentRound?.titleAr || roundMeta?.nameAr}!</h2>
            <div className="space-y-2">
              {session.teams.map((t) => (
                <div key={t.index} className="flex items-center justify-between p-3 rounded-xl bg-[#09143A]">
                  <span className="font-bold text-white">{t.name}</span>
                  <span className="text-xl font-black tabular-nums" style={{ color: t.color }}>
                    {t.points}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => sendHostAction('next_round')}
              className="w-full py-3.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-base"
            >
              الانتقال إلى الجولة التالية
            </button>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {session.phase === 'paused' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-3xl bg-[#101E52] border border-sky-400/40 p-6 text-center space-y-4">
            <h2 className="text-2xl font-black text-white">تم إيقاف المسابقة مؤقتاً</h2>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => sendHostAction('resume_timer')}
                className="w-full py-3 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black"
              >
                استئناف اللعب
              </button>
              <button
                type="button"
                onClick={onPlayAgain}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold"
              >
                إعداد جولة جديدة
              </button>
              <button
                type="button"
                onClick={onExit}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold"
              >
                العودة خطوة للخلف
              </button>
              <button
                type="button"
                onClick={onGoHome || onExit}
                className="w-full py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold"
              >
                الشاشة الرئيسية
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Victory / Overtime Modal */}
      {session.phase === 'finished' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl bg-white text-slate-900 p-7 text-center space-y-5 shadow-2xl">
            <div className="flex items-center justify-center gap-2 -mt-12">
              <Sparkles className="w-8 h-8 text-amber-400 fill-amber-400" />
              <Trophy className="w-12 h-12 text-amber-500 fill-amber-400" />
              <Sparkles className="w-8 h-8 text-amber-400 fill-amber-400" />
            </div>

            <div className="rounded-xl bg-[#6D28D9] text-white py-2.5 px-5 inline-block font-black text-xl">
              {winSummary.isTie ? 'تعادل بطولي!' : 'أنت الفائز!'}
            </div>

            <div className="flex justify-center">
              <PlayerAvatar avatarId="star" size="lg" />
            </div>

            <div>
              <h2 className="text-2xl font-black text-slate-900">
                {winSummary.isTie
                  ? session.teams.map((t) => t.name).join(' و ')
                  : session.teams[winSummary.winnerIndices[0]]?.name}
              </h2>
              <p className="text-sm text-slate-600 mt-1">تهانينا! أداء متميز في تحدي الـ30 ثانية</p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-4 space-y-2">
              <div className="text-xs font-bold text-slate-500">النتيجة النهائية</div>
              {session.teams.map((t) => (
                <div key={t.index} className="flex items-center justify-between text-base font-extrabold">
                  <span className="text-slate-800">{t.name}</span>
                  <span className="tabular-nums text-indigo-700">{t.points} نقطة</span>
                </div>
              ))}
            </div>

            {winSummary.isTie && session.teams.length > 1 && (
              <button
                type="button"
                onClick={() => sendHostAction('start_overtime')}
                className="w-full py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black"
              >
                جولة كسر التعادل الحاسمة (سؤال جرس واحد)
              </button>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-start="true"
                onClick={onPlayAgain}
                className="flex-1 py-3.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black"
              >
                لعب جولة جديدة
              </button>
              <button
                type="button"
                onClick={onExit}
                className="px-4 py-3.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold"
              >
                عودة خطوة
              </button>
              {onGoHome && (
                <button
                  type="button"
                  onClick={onGoHome}
                  className="px-4 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  الرئيسية
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
