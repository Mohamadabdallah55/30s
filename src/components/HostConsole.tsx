import React, { useEffect, useState } from 'react';
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

interface HostConsoleProps {
  code: string;
  onBack: () => void;
  onOpenProjector: (code: string) => void;
}

export function HostConsole({ code, onBack, onOpenProjector }: HostConsoleProps) {
  const [session, setSession] = useState<GameSessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  const { connected, reconnecting } = useSessionSocket(code, 'host', (next) => {
    setSession(next);
  });

  useEffect(() => {
    apiFetch<{ session: GameSessionView }>(`/api/sessions/${code}?role=host`)
      .then((res) => setSession(res.session))
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل لوحة المشرف'));
  }, [code]);

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    try {
      const res = await apiFetch<{ session: GameSessionView }>(`/api/sessions/${code}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, payload }),
      });
      setSession(res.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء');
    }
  };

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

  if (error) {
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

  const projectorUrl = `${window.location.origin}/?mode=projector&code=${session.code}`;
  const round = session.rounds[session.currentRoundIndex];
  const roundMeta = round ? ROUND_RULES[round.roundType] : null;
  const q = session.currentQuestion;
  const secret = session.hostSecret;
  const winSummary = determineWinner(session.teams);
  const accuracy =
    session.stats && session.stats.totalAnswered > 0
      ? Math.round((session.stats.totalCorrect / session.stats.totalAnswered) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-[#09143A] text-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="px-3.5 py-2 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-white/10 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <ArrowRight className="w-4 h-4" />
              <span>الرئيسية</span>
            </button>
            <div>
              <h1 className="text-lg font-black text-white">لوحة تحكم المشرف والحكم</h1>
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
            <button
              type="button"
              onClick={() => onOpenProjector(session.code)}
              className="px-4 py-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-black inline-flex items-center gap-1.5"
            >
              <MonitorPlay className="w-4 h-4" />
              <span>عرض شاشة الجمهور (16:9)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Active Question, Secret Answer & Analytics */}
          <div className="lg:col-span-8 space-y-4">
            {/* Round & Timer Controls */}
            <div className="rounded-2xl bg-[#101E52] border border-sky-400/25 p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs text-violet-300 font-bold flex items-center gap-2">
                  <span>
                    الجولة {session.currentRoundIndex + 1}/{session.rounds.length} · {round?.titleAr || roundMeta?.nameAr}
                  </span>
                  {roundMeta?.multiQuestionWithinTimer && (
                    <span className="text-sky-300">(العداد متواصل)</span>
                  )}
                </div>
                <div className="text-3xl font-black tabular-nums text-sky-300 mt-0.5">
                  00:{String(session.timerRemainingSec).padStart(2, '0')}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {session.phase === 'vs' ? (
                  <button
                    type="button"
                    onClick={() => act('start_match')}
                    className="px-5 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-sm inline-flex items-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>بدء المباراة على الشاشة</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => act(session.timerRunning ? 'pause_timer' : 'start_timer')}
                      className="px-4 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-xs inline-flex items-center gap-1.5"
                    >
                      {session.timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      <span>{session.timerRunning ? 'إيقاف المؤقت' : 'ابدأ / استأنف العد'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => act('reset_timer')}
                      className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>إعادة الـ30ث</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={!secret?.undoStackCount}
                  onClick={() => act('undo')}
                  className="px-3.5 py-2.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/30 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Undo2 className="w-4 h-4" />
                  <span>تراجع ({secret?.undoStackCount ?? 0})</span>
                </button>
              </div>
            </div>

            {session.exhaustedNotice?.exhausted && (
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
            {q && (
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

                <div className="rounded-xl bg-[#09143A] p-4 border border-white/10">
                  <div className="text-xs text-slate-400 mb-1">نص السؤال المعروض للجمهور:</div>
                  <div className="text-lg font-extrabold text-white">{q.prompt}</div>
                </div>

                {/* Secret Host Answer Block */}
                <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 p-4 space-y-2">
                  <div className="text-xs font-bold text-emerald-300">الإجابة الصحيحة (سرية للمشرف فقط):</div>
                  <div className="text-xl font-black text-white">
                    {secret?.acceptableAnswers?.join('  |  ') || '—'}
                  </div>
                  {secret?.oddReason && (
                    <div className="text-xs text-amber-200">سبب الاختلاف: {secret.oddReason}</div>
                  )}
                  {secret?.explanation && <div className="text-xs text-slate-200">التوضيح: {secret.explanation}</div>}
                  {secret?.sourceExcerpt && (
                    <div className="text-xs text-sky-200 pt-1 border-t border-emerald-400/20">
                      مرجع الدرس (صفحة {secret.sourcePage}): «{secret.sourceExcerpt}»
                    </div>
                  )}
                </div>

                {/* Referee Action Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {session.teams.map((t) => (
                    <button
                      key={t.index}
                      type="button"
                      onClick={() => act('award_team', { teamIndex: t.index })}
                      className="py-3 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap truncate"
                    >
                      <Check className="w-4 h-4 shrink-0" />
                      <span className="truncate">صح: {t.name}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => act('strike_team', { teamIndex: session.buzzedTeamIndex ?? session.activeTeamIndex })}
                    className="py-3 px-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-xs inline-flex items-center justify-center gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    <span>خطأ / سترايك</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => act('reveal_answer')}
                    className="py-3 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" />
                    <span>إظهار للجمهور</span>
                  </button>
                </div>

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
                    <button
                      type="button"
                      onClick={() => act('skip_question')}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <SkipForward className="w-4 h-4" />
                      <span>تخطي السؤال</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => act('exclude_question', { reason: 'استبعاد بواسطة المشرف' })}
                      className="px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Ban className="w-4 h-4" />
                      <span>استبعاد سؤال غير مناسب</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => act('next_question')}
                    className="px-5 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-xs"
                  >
                    السؤال / الجولة التالية
                  </button>
                </div>
              </div>
            )}

            {/* Live Match Analytics & Export + Score Audit Log */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>

          {/* Right: Score Adjustments, Phone Buzzers, Participant Swap, QR & Objections */}
          <div className="lg:col-span-4 space-y-4">
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
                <span>روابط جرس الهاتف للفرق</span>
              </h2>
              <div className="space-y-2">
                {session.teams.map((t) => {
                  const buzzUrl = `${window.location.origin}/?mode=buzzer&code=${session.code}&team=${t.index}`;
                  const key = `buzz-${t.index}`;
                  return (
                    <button
                      key={t.index}
                      type="button"
                      onClick={() => copyLink(key, buzzUrl)}
                      className="w-full px-3 py-2 rounded-xl bg-[#09143A] hover:bg-[#132666] border border-white/10 text-xs font-bold flex items-center justify-between gap-2"
                    >
                      <span className="truncate">نسخ جرس: {t.name}</span>
                      <span className="text-sky-300 shrink-0">
                        {copiedKey === key ? 'تم النسخ!' : 'نسخ الرابط'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* QR Linking */}
            <div className="rounded-2xl bg-[#101E52] border border-sky-400/25 p-4 text-center space-y-2">
              <h2 className="text-sm font-extrabold text-white">رمز ربط شاشة الجمهور (QR)</h2>
              <SessionQrBadge code={session.code} url={projectorUrl} />
              <div className="font-mono text-lg font-black text-amber-300 tracking-widest">{session.code}</div>
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
          </div>
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
