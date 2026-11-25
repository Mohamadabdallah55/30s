import { ChallengeV2Surface } from './ChallengeV2Surface';
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Ban,
  Bell,
  Check,
  Copy,
  Download,
  Eye,
  History,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { determineWinner, ROUND_RULES } from '../shared/gameRules';
import type { GameSessionView } from '../shared/types';
import { apiFetch, getAuthToken, useSessionSocket } from '../utils/api';
import { SessionQrBadge } from './BrandEmblem';

import { RoundArt, ShowMark } from './ShowArt';
import { ScoreRibbon, ShowIntermission, useShowCountdown } from './ShowPresentation';

interface HostConsoleProps {
  code: string;
  onBack: () => void;
  onOpenProjector: (code: string) => void;
  onOpenAuth: () => void;
  onOpenBot?: () => void;
  authProfileId?: string;
}

export function HostConsole({ code, onBack, onOpenProjector, onOpenAuth, onOpenBot, authProfileId }: HostConsoleProps) {
  const [session, setSession] = useState<GameSessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [bidAnswerInput, setBidAnswerInput] = useState('');
  const [extraListItem, setExtraListItem] = useState('');
  const [matchedItems, setMatchedItems] = useState(1);
  const [localAnswerVisible, setLocalAnswerVisible] = useState(false);
  const actionInFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [qrMode, setQrMode] = useState<'host' | 'projector'>('host');

  const countdown = useShowCountdown(session?.countdownEndsAtMs);
  const { connected, reconnecting } = useSessionSocket(code, 'host', (next) => {
    setSession(next);
  }, authProfileId);

  useEffect(() => {
    setError(null);
    apiFetch<{ session: GameSessionView }>(`/api/sessions/${code}?role=host`)
      .then((res) => setSession(res.session))
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل لوحة المشرف'));
  }, [code, authProfileId]);

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    if (actionInFlight.current || !session?.hostSecret) return;
    actionInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ session: GameSessionView }>(`/api/sessions/${code}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, payload: { questionId: session.currentQuestion?.id, ...payload } }),
      });
      setSession(res.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء');
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  };

  useEffect(() => { setMatchedItems(1); setExtraListItem(''); setLocalAnswerVisible(false); }, [session?.currentQuestion?.id, session?.currentQuestionIndexInRound, session?.currentRoundIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName)) return;
      if (!session || session.challengeV2 || session.phase === 'finished' || e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (session.phase === 'vs') {
          act('start_match');
        } else {
          act(session.timerRunning ? 'pause_timer' : 'start_timer');
        }
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        act(session.phase === 'round_summary' ? 'next_round' : 'next_question');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (!session.answerRevealed) setLocalAnswerVisible(visible => !visible);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session?.code, session?.phase, session?.timerRunning, session?.answerRevealed, Boolean(session?.hostSecret)]);

  const copyLink = (key: string, url: string) => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const exportMatch = async (format: 'csv' | 'json') => {
    const token = getAuthToken();
    const res = await fetch(`/api/sessions/${code}/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `match-${code}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (session?.challengeV2) return <ChallengeV2Surface session={session} role={session.hostSecret?'host':'audience'} onUpdate={setSession} onExit={onBack}/>;

  if (error && !session) {
    return (
      <div className="min-h-screen bg-[#09143A] text-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-[#101E52] border border-rose-400/30 p-6 text-center space-y-4">
          <p className="text-rose-200 font-bold">{error}</p>
          <button type="button" onClick={onBack} className="px-5 py-2.5 rounded-xl bg-sky-400 text-slate-950 font-bold">
            العودة
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#09143A] text-slate-200 flex items-center justify-center p-6">
        <span>جاري تحميل لوحة تحكم المشرف...</span>
      </div>
    );
  }

  if (!session.hostSecret) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#09143A] p-6 text-center text-white">
        <p className="mb-4">سجّل الدخول بحساب المشرف للتحكم في هذه المباراة.</p>
        <button type="button" onClick={onOpenAuth} className="rounded-xl bg-sky-400 p-3 font-bold text-slate-950">تسجيل الدخول</button>
        <button type="button" onClick={onBack} className="mr-3 rounded-xl bg-white/10 p-3">عودة</button>
      </div>
    );
  }

  const projectorUrl = `${window.location.origin}/?mode=projector&code=${session.code}`;
  const hostPhoneUrl = `${window.location.origin}/?mode=host&code=${session.code}`;
  const round = session.rounds[session.currentRoundIndex];
  const roundMeta = round ? ROUND_RULES[round.roundType] : null;
  const q = session.currentQuestion;
  const secret = session.hostSecret;
  const winSummary = determineWinner(session.teams);
  const inPlay = session.phase === 'playing' || session.phase === 'paused';
  const canScore = inPlay && q && !session.answerRevealed &&
    session.memoryPhase !== 'memorize' && !session.bidState;
  const sprint = Boolean(roundMeta?.multiQuestionWithinTimer || (round?.goldenTargetType && ROUND_RULES[round.goldenTargetType].multiQuestionWithinTimer));
  const canSkip = session.settings.showMode && sprint && session.timerRunning && !session.answerRevealed && q;
  const lastQuestion = (session.settings.showMode && (sprint || !q)) || session.currentQuestionIndexInRound + 1 >= (round?.questionsPerRound ?? 1);
  const lastRound = session.currentRoundIndex + 1 >= session.rounds.length;
  const primary = session.phase === 'vs' || session.phase === 'lobby'
    ? { label: 'بدء المباراة', action: 'start_match' }
    : session.phase === 'round_intro'
    ? { label: 'يلا، ابدأ العدّ', action: 'round_countdown' }
    : session.phase === 'countdown'
    ? { label: 'تجاوز العدّ', action: 'skip_intro' }
    : session.phase === 'round_summary'
    ? { label: 'ابدأ الجولة التالية', action: 'next_round' }
    : inPlay && !(session.settings.showMode && session.bidState && !session.answerRevealed)
    ? { label: canSkip ? 'تخطّى للسؤال التالي' : !lastQuestion ? 'السؤال التالي' : lastRound ? 'إعلان النتيجة' : 'عرض نتيجة الجولة', action: 'next_question' }
    : null;

  const accuracy =
    session.stats && session.stats.totalAnswered > 0
      ? Math.round((session.stats.totalCorrect / session.stats.totalAnswered) * 100)
      : 0;

  return (
    <div className="show-host v2-live-stage lesson-live-stage min-h-screen text-slate-50">
      <div className="w-full mx-auto space-y-3">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="px-3.5 py-2 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-white/10 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <ArrowRight className="w-4 h-4" />
              <span>عودة خطوة</span>
            </button>
            <div>
              <h1 className="text-lg font-black text-white">شاشة المباراة</h1>
              <div className="text-xs text-slate-300 flex items-center gap-2">
                <span>
                  الرمز: <strong className="font-mono text-amber-300">{session.code}</strong>
                </span>
                <span>·</span>
                <span>{connected ? 'متصل لحظياً' : reconnecting ? 'إعادة اتصال...' : 'في انتظار المزامنة'}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => act('update_settings', { soundEnabled: !session.settings.soundEnabled })}
              className="px-3 py-2 rounded-xl bg-[#132666] border border-white/10 text-xs font-bold inline-flex items-center gap-1.5"
            >
              {session.settings.soundEnabled ? <Volume2 className="w-4 h-4 text-sky-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
              <span>{session.settings.soundEnabled ? 'صوت البروجكتر مفعل' : 'صامت'}</span>
            </button>
            <button
              type="button"
              onClick={() => copyLink('projector', projectorUrl)}
              className="px-3 py-2 rounded-xl bg-[#132666] border border-white/10 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Copy className="w-4 h-4 text-sky-300" />
              <span>{copiedKey === 'projector' ? 'تم نسخ رابط الجمهور' : 'نسخ رابط شاشة الجمهور'}</span>
            </button>
            {onOpenBot && (
              <button
                type="button"
                onClick={onOpenBot}
                className="px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 border border-white/10 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <span>يزن</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenProjector(session.code)}
              className="px-4 py-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-black inline-flex items-center gap-1.5"
            >
              <MonitorPlay className="w-4 h-4" />
              <span>عرض الجمهور (اختياري)</span>
            </button>
          </div>
        </div>


        {(session.phase === 'vs' || session.phase === 'round_intro' || session.phase === 'countdown') && <div className="show-host__intermission"><ShowIntermission session={session} countdown={countdown} /></div>}
        {error && <p role="alert" className="rounded-xl bg-rose-500/20 p-3 text-rose-100">{error}</p>}
        {session.phase === 'round_summary' || session.phase === 'finished' ? (
          <div className="rounded-xl bg-[#101E52] p-4 text-center">
            <h2 className="text-lg font-black">{session.phase === 'finished'
              ? winSummary.isTie ? 'تعادل' : `الفائز: ${session.teams[winSummary.winnerIndices[0]]?.name}`
              : 'نتيجة الجولة'}</h2>
            <p>{session.teams.map((team) => `${team.name}: ${team.points}`).join(' · ')}</p>
          </div>
        ) : null}
        {primary && (
          <div className="sticky top-0 z-20 rounded-xl bg-[#09143A] p-2">
            <button type="button" disabled={busy} onClick={() => act(primary.action)}
              className="w-full rounded-xl bg-sky-400 px-4 py-3 text-lg font-black text-slate-950 disabled:opacity-50">
              {primary.label}
            </button>
            {session.phase === 'round_intro' && <button type="button" className="show-link" onClick={() => act('skip_intro')}>تجاوز المقدّمة</button>}
          </div>
        )}

        {inPlay && session.settings.showMode && <details className="show-host__jump">
          <summary>تغيير الجولة</summary>
          <div>{session.rounds.map((item, index) => <button type="button" key={index} disabled={busy || index === session.currentRoundIndex}
            onClick={() => { if (window.confirm('تنتقل إلى هذه الجولة الآن؟')) act('jump_round', { roundIndex: index }); }}>
            {index + 1} · {item.titleAr}</button>)}</div>
        </details>}
        <div className="v2-live-layout">
          <aside className="v2-live-rail"><div className="v2-live-score">{session.teams.map(team => <div key={team.index} className="v2-live-team" style={{borderColor:team.color}} data-active={(session.buzzedTeamIndex ?? session.activeTeamIndex) === team.index}><span>{team.name}</span><strong dir="ltr">{team.points}</strong></div>)}</div><div className="v2-live-status rounded-2xl bg-[#29183E] text-center border-2 border-[#FFE45A]"><h1 className="font-black">{round?.titleAr || roundMeta?.nameAr}</h1><div className="font-black tabular-nums text-amber-300" aria-label="الوقت المتبقي">{String(Math.floor(session.timerRemainingSec / 60)).padStart(2, "0")}:{String(session.timerRemainingSec % 60).padStart(2, "0")}</div><p>الجولة {session.currentRoundIndex + 1} / {session.rounds.length}</p></div><div className="v2-live-progress">{session.rounds.map((item,index) => <span key={index} data-current={index === session.currentRoundIndex}>{item.titleAr}</span>)}</div></aside>
          {/* Left: Active Question, Secret Answer & Analytics */}
          <div className="v2-live-body">
            {/* Round & Timer Controls */}
            <div className="show-host__tools v2-live-controls rounded-2xl bg-[#101E52] border border-sky-400/25 p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-violet-300 font-bold flex items-center gap-2">
                  <span>
                    الجولة {session.currentRoundIndex + 1}/{session.rounds.length} · {round?.titleAr || roundMeta?.nameAr}
                  </span>
                  {roundMeta?.multiQuestionWithinTimer && (
                    <span className="text-sky-300">(العداد متواصل)</span>
                  )}
                </div>

              </div>

              <div className="flex flex-wrap gap-2">
                {inPlay && q && !session.answerRevealed && session.bidState?.phase !== 'bidding' && session.memoryPhase !== 'memorize' && (
                  <button type="button" disabled={busy} onClick={() => act(session.timerRunning ? 'pause_timer' : 'start_timer')}
                    className="rounded-xl bg-white/10 px-4 py-3 text-sm font-bold">
                    {session.timerRunning ? 'أوقف المؤقت' : 'شغّل المؤقت'}
                  </button>
                )}
                {inPlay && q && !session.answerRevealed && session.bidState?.phase !== 'bidding' && session.memoryPhase !== 'memorize' && (
                  <button type="button" disabled={busy} onClick={() => act('reset_timer')}
                    className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">
                    إعادة المؤقت
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy || !secret?.undoStackCount}
                  onClick={() => act('undo')}
                  className="px-3.5 py-2.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/30 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Undo2 className="w-4 h-4" />
                  <span>تراجع ({secret?.undoStackCount ?? 0})</span>
                </button>
              </div>
            </div>

            {session.exhaustedNotice?.exhausted && inPlay && (
              <div className="rounded-2xl bg-amber-500/15 border border-amber-400/40 p-5 space-y-3">
                <p className="font-bold text-amber-200 text-sm">{session.exhaustedNotice.message}</p>
                <div className="flex flex-wrap gap-2">
                  {session.exhaustedNotice.availableCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => act('switch_category', { category: cat })}
                      className="px-3 py-2 rounded-xl bg-sky-400 text-slate-950 text-xs font-bold"
                    >
                      اختر فئة: {cat}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => act('approve_cycle_reset')}
                    className="px-3 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold"
                  >
                    موافقة على إعادة دورة الأسئلة
                  </button>
                </div>
              </div>
            )}

            {/* Question + Secret Answer for Referee */}
            {q && inPlay && (
              <div className="rounded-2xl bg-[#101E52] border border-sky-400/25 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                  <span>{q.category}</span>
                  {session.buzzedTeamIndex !== null && (
                    <span className="font-black text-amber-300">
                      الجرس مع: {session.teams[session.buzzedTeamIndex]?.name}
                    </span>
                  )}
                  <span className="tabular-nums">
                    سؤال {session.currentQuestionIndexInRound + 1}/{round?.questionsPerRound ?? 1}
                  </span>
                </div>

                <div className="v2-live-question rounded-3xl bg-[#FFF9ED] text-[#29183E] text-center">
                  <div className="text-xs mb-1 flex items-center gap-2"><RoundArt type={q.roundType} /> السؤال المعروض للجمهور</div>
                  <h2 className="font-black">{q.prompt}</h2>
                  {q.revealedClues.map((clue,i) => <p key={i} className="rounded-xl bg-violet-100 p-3">{clue}</p>)}
                  {session.memoryPhase === "memorize" && q.memoryItems?.length ? <div className="flex flex-wrap gap-2 justify-center">{q.memoryItems.map((item,i)=><span key={i} className="rounded-lg bg-violet-100 p-2">{item}</span>)}</div> : null}
                  {q.options.length > 0 && <div className="grid grid-cols-2 gap-2 w-full">{q.options.map((option,i)=><span key={i} className="rounded-lg border border-violet-300 p-2">{option}</span>)}</div>}
                  {session.memoryPhase !== "memorize" && <button type="button" aria-expanded={localAnswerVisible || session.answerRevealed} className="show-button show-button--yellow v2-live-reveal" onClick={()=>setLocalAnswerVisible(v=>!v)}>{localAnswerVisible || session.answerRevealed ? "الإجابة الصحيحة" : "كشف الإجابة"}</button>}
                </div>

                {/* Secret Host Answer Block */}
                {(localAnswerVisible || session.answerRevealed) && session.memoryPhase !== "memorize" && <div className="v2-live-revealed">
                  <div className="text-xs font-bold">الإجابة الصحيحة</div>
                  <div className="text-xl font-black">
                    {secret?.acceptableAnswers?.join('  |  ') || (typeof secret.correctIndex === "number" ? q.options[secret.correctIndex] : "") || '—'}
                  </div>
                  {secret?.oddReason && (
                    <div className="text-xs text-amber-200">سبب الاختلاف: {secret.oddReason}</div>
                  )}
                  {secret?.explanation && <div className="text-xs text-slate-200">التوضيح: {secret.explanation}</div>}
                  {secret?.sourceExcerpt && (
                    <div className="text-xs text-sky-200 pt-1 border-t border-emerald-400/20">
                      {secret.sourcePage ? `صفحة ${secret.sourcePage}` : 'المصدر'}: «{secret.sourceExcerpt}»
                    </div>
                  )}
                </div>}

                {q.roundType === 'buzzer' && session.settings.showMode && session.buzzedTeamIndex === null && session.timerRunning &&
                  <div className="show-host__items"><strong>سجّل أول ضغطة</strong><div>{session.teams.map((team) =>
                    <button type="button" key={team.index} disabled={busy || session.failedBuzzTeams.includes(team.index)}
                      onClick={async () => {
                        try {
                          await apiFetch(`/api/sessions/${session.code}/buzz`, { method: 'POST', body: JSON.stringify({ teamIndex: team.index }) });
                        } catch (err) { setError(err instanceof Error ? err.message : 'الجرس مش متاح.'); }
                      }}><Bell size={16} /> {team.name}</button>)}</div></div>}
                {session.bidState && !session.answerRevealed && session.bidState.acceptedAnswers.length > 0 &&
                  <div className="show-host__items"><strong>تصحيح العدّ</strong><div>{session.bidState.acceptedAnswers.map((answer) =>
                    <button type="button" key={answer} disabled={busy} onClick={() => act('bid_remove_answer', { answerText: answer })}>إزالة {answer}</button>)}</div></div>}
                {/* Bid Challenge Referee Controls */}
                {q.roundType === 'bid_challenge' && session.bidState && (
                  <div className="rounded-xl bg-[#09143A] border border-amber-400/35 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-black text-amber-300">
                        تحكم المشرف — مين يزوّد ({session.bidState.acceptedAnswers.length}/{session.bidState.currentBid})
                      </span>
                      <span className="text-slate-300">
                        المزايد:{' '}
                        <strong className="text-white">
                          {session.teams[session.bidState.bidderTeamIndex]?.name}
                        </strong>
                      </span>
                    </div>

                    {session.bidState.phase === 'bidding' ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            act('bid_raise', { teamIndex: session.bidState!.turnTeamIndex, increment: 1 })
                          }
                          className="px-3.5 py-2 rounded-xl bg-sky-400 text-slate-950 text-xs font-black"
                        >
                          +1 مزايدة ({session.teams[session.bidState.turnTeamIndex]?.name})
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            act('bid_raise', { teamIndex: session.bidState!.turnTeamIndex, increment: 2 })
                          }
                          className="px-3.5 py-2 rounded-xl bg-violet-600 text-white text-xs font-black"
                        >
                          +2 مزايدة
                        </button>
                        <button
                          type="button"
                          onClick={() => act('bid_challenge', {})}
                          className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-black"
                        >
                          تحدّاه الآن (ابدأ الـ30ث)
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {localAnswerVisible && secret?.acceptableAnswers && secret.acceptableAnswers.length > 0 && !session.answerRevealed && (
                          <div className="space-y-1">
                            <div className="text-[11px] text-slate-400">
                              نقرة سريعة لتسجيل ما يذكره المتسابق شفهياً:
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {secret.acceptableAnswers.map((ans) => {
                                const already = session.bidState!.acceptedAnswers.includes(ans);
                                return (
                                  <button
                                    key={ans}
                                    type="button"
                                    disabled={already}
                                    onClick={() => act('bid_record_answer', { answerText: ans, hostConfirmed: true })}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                      already
                                        ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 opacity-60'
                                        : 'bg-[#101E52] border-sky-400/30 hover:border-sky-300 text-white'
                                    }`}
                                  >
                                    {already ? `✓ ${ans}` : `+ ${ans}`}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {!session.answerRevealed && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (bidAnswerInput.trim()) {
                                act('bid_record_answer', {
                                  answerText: bidAnswerInput.trim(),
                                  hostConfirmed: true,
                                });
                                setBidAnswerInput('');
                              }
                            }}
                            className="flex gap-2"
                          >
                            <input
                              type="text"
                              value={bidAnswerInput}
                              onChange={(e) => setBidAnswerInput(e.target.value)}
                              placeholder="أو اكتب إجابة مقبولة يدوياً..."
                              className="flex-1 rounded-lg bg-[#101E52] border border-slate-600 px-3 py-2 text-xs text-white outline-none"
                            />
                            <button
                              type="submit"
                              disabled={!bidAnswerInput.trim()}
                              className="px-3.5 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-black disabled:opacity-50"
                            >
                              اعتماد
                            </button>
                            <button
                              type="button"
                              onClick={() => act('bid_complete', {})}
                              className="px-3.5 py-2 rounded-lg bg-amber-400 text-slate-950 text-xs font-black"
                            >
                              حسم التحدي
                            </button>
                          </form>
                        )}
                        {session.bidState.lastDuplicateWarning && (
                          <div className="text-xs font-bold text-amber-300">
                            {session.bidState.lastDuplicateWarning}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {inPlay && localAnswerVisible && session.settings.showMode && q.roundType === 'list_multiple' && (
                  <div className="show-host__items">
                    <strong>القطع المقبولة {session.listProgress?.accepted ?? 0}/{session.listProgress?.required ?? 3}</strong>
                    <div>{[...new Set([...secret.acceptableAnswers, ...(secret.acceptedItems ?? [])])].map((item) => <button type="button" key={item} aria-pressed={secret.acceptedItems?.includes(item) ?? false}
                      disabled={busy || session.answerRevealed} onClick={() => act('list_toggle_item', { item })}>{item}</button>)}</div>
                    {secret.acceptsOtherAnswers && !session.answerRevealed && (
                      <div className="flex items-center gap-2">
                        <input aria-label="إجابة أخرى اعتمدها المشرف" className="rounded bg-[#09143A] p-2" maxLength={160}
                          value={extraListItem} onChange={e => setExtraListItem(e.target.value)} />
                        <button type="button" disabled={busy || !extraListItem.trim()}
                          onClick={() => { void act('list_toggle_item', { item: extraListItem }); setExtraListItem(''); }}>احتساب إجابة أخرى</button>
                      </div>
                    )}
                  </div>
                )}
                {canScore && !session.settings.showMode && q.roundType === 'list_multiple' && (
                  <label className="flex items-center gap-2 text-sm">
                    عدد الإجابات الصحيحة
                    <select className="rounded bg-[#09143A] p-2" value={matchedItems} onChange={(e) => setMatchedItems(Number(e.target.value))}>
                      {Array.from({ length: Math.min(secret.requiredCount ?? 3, secret.acceptableAnswers.length) }, (_, index) => (
                        <option key={index} value={index + 1}>{index + 1}</option>
                      ))}
                    </select>
                  </label>
                )}
                {canScore && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {session.teams.map((t) => (
                    <button
                      key={t.index}
                      type="button"
                      disabled={busy || (session.settings.showMode && q.roundType === 'buzzer' && session.buzzedTeamIndex !== t.index) ||
                        (session.settings.showMode && q.roundType === 'list_multiple' && !session.listProgress?.accepted)}
                      onClick={() => act('award_team', { teamIndex: t.index, matchedListCount: q.roundType === 'list_multiple' ? matchedItems : undefined })}
                      className="py-4 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base inline-flex items-center justify-center gap-1.5 whitespace-nowrap truncate"
                    >
                      <Check className="w-4 h-4 shrink-0" />
                      <span className="truncate">صح: {t.name}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => act('strike_team', { teamIndex: session.buzzedTeamIndex ?? session.activeTeamIndex })}
                    className="py-4 px-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-base inline-flex items-center justify-center gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    <span>غلط</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => act('reveal_answer')}
                    className="py-3 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" />
                    <span>إظهار للجمهور</span>
                  </button>
                </div>}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <div className="flex flex-wrap gap-2">
                    {q.roundType === 'who_am_i' && session.revealedClueCount < q.cluesCount && (
                      <button
                        type="button"
                        onClick={() => act('reveal_next_clue')}
                        className="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold"
                      >
                        كشف الدليل التالي
                      </button>
                    )}
                    {!session.settings.hostControlled && (
                      <button type="button" onClick={() => act('skip_question')}
                        className="px-3 py-2 rounded-xl bg-white/10 text-xs font-bold inline-flex items-center gap-1">
                        <SkipForward className="w-4 h-4" /> تخطي السؤال
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => act('exclude_question', { reason: 'استبعاد بواسطة المشرف' })}
                      className="px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Ban className="w-4 h-4" />
                      <span>استبعاد سؤال غير مناسب</span>
                    </button>
                  </div>

                </div>
              </div>
            )}

            <details className="rounded-2xl bg-[#101E52] p-4">
              <summary className="cursor-pointer font-bold">سجل النقاط والتصدير</summary>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-[#101E52] border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-white">تحليلات المباراة والتصدير</h2>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => exportMatch('csv')}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => exportMatch('json')}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> JSON
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-[#09143A] p-2.5">
                    <div className="text-slate-400">المحاولات</div>
                    <div className="text-lg font-black tabular-nums text-white mt-0.5">
                      {session.stats?.totalAnswered ?? 0}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#09143A] p-2.5">
                    <div className="text-slate-400">الصحيحة</div>
                    <div className="text-lg font-black tabular-nums text-emerald-300 mt-0.5">
                      {session.stats?.totalCorrect ?? 0}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#09143A] p-2.5">
                    <div className="text-slate-400">الدقة</div>
                    <div className="text-lg font-black tabular-nums text-sky-300 mt-0.5">{accuracy}%</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-[#101E52] border border-white/10 p-4 space-y-2">
                <h2 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <History className="w-4 h-4 text-sky-300" />
                  <span>سجل تدقيق النقاط ({session.scoreAuditLog?.length ?? 0})</span>
                </h2>
                {!session.scoreAuditLog?.length ? (
                  <p className="text-xs text-slate-400">لم تُسجّل تغييرات نقاط بعد.</p>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto text-xs">
                    {[...session.scoreAuditLog].reverse().map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-[#09143A] px-2.5 py-1.5"
                      >
                        <span className="truncate text-slate-200">
                          <strong>{entry.teamName}</strong> · {entry.reason}
                        </span>
                        <span
                          className={`font-mono font-bold shrink-0 tabular-nums ${
                            entry.delta > 0 ? 'text-emerald-300' : entry.delta < 0 ? 'text-rose-300' : 'text-slate-400'
                          }`}
                        >
                          {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>
            </details>
          </div>

          {/* Right: Score Adjustments, Phone Buzzers, Participant Swap, QR & Objections */}
          <details className="v2-live-advanced rounded-2xl bg-[#101E52] p-4 space-y-3"><summary className="font-black cursor-pointer">إعدادات إضافية وروابط الأجهزة</summary><div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
            <div className="rounded-2xl bg-[#101E52] border border-sky-400/25 p-4 space-y-3">
              <h2 className="text-sm font-extrabold text-white">تعديل النقاط المباشر</h2>
              {session.teams.map((t) => (
                <div key={t.index} className="rounded-xl bg-[#09143A] p-3 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">{t.name}</span>
                    <span className="text-2xl font-black tabular-nums" style={{ color: t.color }}>
                      {t.points}
                    </span>
                  </div>
                  {t.participantNames.length > 0 && session.teams.length > 1 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {t.participantNames.map((pName, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() =>
                            act('swap_participant', {
                              fromTeamIndex: t.index,
                              toTeamIndex: t.index === 0 ? 1 : 0,
                              participantIndex: pIdx,
                            })
                          }
                          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] text-slate-200 inline-flex items-center gap-1"
                        >
                          <span>{pName}</span>
                          <ArrowLeftRight className="w-3 h-3 text-sky-300" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5" dir="ltr">
                    <button
                      type="button"
                      onClick={() => act('adjust_points', { teamIndex: t.index, delta: 5 })}
                      className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-bold tabular-nums inline-flex items-center justify-center gap-0.5 whitespace-nowrap"
                    >
                      <Plus className="w-3 h-3" /> 5
                    </button>
                    <button
                      type="button"
                      onClick={() => act('adjust_points', { teamIndex: t.index, delta: 1 })}
                      className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-bold tabular-nums whitespace-nowrap"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => act('adjust_points', { teamIndex: t.index, delta: -1 })}
                      className="flex-1 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold tabular-nums whitespace-nowrap"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => act('adjust_points', { teamIndex: t.index, delta: -5 })}
                      className="flex-1 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold tabular-nums whitespace-nowrap"
                    >
                      -5
                    </button>
                  </div>
                </div>
              ))}

              <div className="pt-2 space-y-2">
                {session.phase === 'finished' && winSummary.isTie && session.teams.length > 1 && (
                  <button
                    type="button"
                    onClick={() => act('start_overtime')}
                    className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black"
                  >
                    بدء جولة كسر التعادل الحاسمة
                  </button>
                )}
                {session.phase !== 'finished' ? (
                  <button
                    type="button"
                    onClick={() => setConfirmEndOpen(true)}
                    className="w-full py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold"
                  >
                    إنهاء المباراة وإعلان النتيجة
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => act('resume_match')}
                    className="w-full py-2.5 rounded-xl bg-sky-400 text-slate-950 text-xs font-black"
                  >
                    استئناف المباراة
                  </button>
                )}
              </div>
            </div>

            {/* Phone Buzzer Links for Teams */}
            <div className="rounded-2xl bg-[#101E52] border border-sky-400/25 p-4 space-y-2.5">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-amber-300" />
                <span>روابط الفرق · الجرس والإجابة</span>
              </h2>
              <div className="space-y-2">
                {session.teams.map((t) => {
                  const teamKey = secret.teamKeys?.[t.index];
                  const buzzUrl = `${window.location.origin}/?mode=buzzer&code=${session.code}&team=${t.index}${teamKey ? '#key=' + teamKey : ''}`;
                  const key = `buzz-${t.index}`;
                  return (
                    <button
                      key={t.index}
                      type="button"
                      onClick={() => copyLink(key, buzzUrl)}
                      className="w-full px-3 py-2 rounded-xl bg-[#09143A] hover:bg-[#132666] border border-white/10 text-xs font-bold flex items-center justify-between gap-2"
                    >
                      <span className="truncate">رابط فريق {t.name}</span>
                      <span className="text-sky-300 shrink-0">
                        {copiedKey === key ? 'تم النسخ!' : 'نسخ الرابط'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* QR Linking (Host Phone & Projector) */}
            <div className="rounded-2xl bg-[#101E52] border border-sky-400/25 p-4 text-center space-y-3">
              <h2 className="text-sm font-extrabold text-white">ربط الجوال والبروجكتر (QR)</h2>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#09143A] text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setQrMode('host')}
                  className={`py-1.5 rounded-lg transition-colors ${
                    qrMode === 'host' ? 'bg-emerald-400 text-slate-950' : 'text-slate-300'
                  }`}
                >
                  جوال الأستاذ
                </button>
                <button
                  type="button"
                  onClick={() => setQrMode('projector')}
                  className={`py-1.5 rounded-lg transition-colors ${
                    qrMode === 'projector' ? 'bg-sky-400 text-slate-950' : 'text-slate-300'
                  }`}
                >
                  شاشة الجمهور
                </button>
              </div>
              <SessionQrBadge
                code={session.code}
                url={qrMode === 'host' ? hostPhoneUrl : projectorUrl}
                size="md"
              />
              <div className="font-mono text-lg font-black text-amber-300 tracking-widest">{session.code}</div>
              <button
                type="button"
                onClick={() =>
                  copyLink(qrMode === 'host' ? 'host' : 'projector-qr', qrMode === 'host' ? hostPhoneUrl : projectorUrl)
                }
                className="w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold inline-flex items-center justify-center gap-1"
              >
                <Copy className="w-3 h-3" />
                <span>
                  {copiedKey === (qrMode === 'host' ? 'host' : 'projector-qr')
                    ? 'تم النسخ!'
                    : qrMode === 'host'
                    ? 'نسخ رابط تحكم الأستاذ'
                    : 'نسخ رابط الجمهور'}
                </span>
              </button>
            </div>

            {/* Objections Review */}
            <div className="rounded-2xl bg-[#101E52] border border-sky-400/25 p-4 space-y-2">
              <h2 className="text-sm font-extrabold text-white">
                اعتراضات الأسئلة ({secret?.objections.filter((o) => o.status === 'pending').length ?? 0})
              </h2>
              {!secret?.objections.length ? (
                <p className="text-xs text-slate-400">لا توجد اعتراضات مسجلة في هذه الجلسة.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {secret.objections.map((obj) => (
                    <div key={obj.id} className="rounded-xl bg-[#09143A] p-2.5 text-xs space-y-1.5">
                      <div className="font-bold text-white line-clamp-2">{obj.questionPrompt}</div>
                      <div className="text-slate-400">{obj.reason}</div>
                      {obj.status === 'pending' ? (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => act('resolve_objection', { objectionId: obj.id, decision: 'valid' })}
                            className="px-2 py-1 rounded bg-emerald-500/25 text-emerald-200 font-bold"
                          >
                            السؤال سليم
                          </button>
                          <button
                            type="button"
                            onClick={() => act('resolve_objection', { objectionId: obj.id, decision: 'exclude' })}
                            className="px-2 py-1 rounded bg-rose-500/25 text-rose-200 font-bold"
                          >
                            استبعاد وأرشفة
                          </button>
                        </div>
                      ) : (
                        <div className="text-sky-300 font-bold">تمت المعالجة</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div></details>
        </div>
        <div className="text-center text-[11px] text-slate-400 pt-1">
          اختصارات المشرف: Space بدء/إيقاف المؤقت · N السؤال التالي · R إظهار الإجابة
        </div>
      </div>

      {/* Confirm End Match Modal */}
      {confirmEndOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-3xl bg-[#101E52] border border-rose-400/40 p-6 text-center space-y-4">
            <h2 className="text-xl font-black text-white">تأكيد إنهاء المباراة</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              هل تريد إنهاء المباراة الآن وإعلان النتيجة على شاشة الجمهور؟
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmEndOpen(false);
                  act('end_match');
                }}
                className="flex-1 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-sm"
              >
                تأكيد الإنهاء
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
    </div>
  );
}
