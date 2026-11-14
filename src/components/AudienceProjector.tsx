import React, { useEffect, useState } from 'react';
import { ArrowRight, Bell, Trophy, Zap } from 'lucide-react';
import { determineWinner, ROUND_RULES } from '../shared/gameRules';
import type { GameSessionView } from '../shared/types';
import { apiFetch, useSessionSocket } from '../utils/api';
import { soundFx } from '../utils/sound';
import { ChallengeLogoEmblem, SessionQrBadge } from './BrandEmblem';

interface AudienceProjectorProps {
  code: string;
  onExit: () => void;
}

export function AudienceProjector({ code, onExit }: AudienceProjectorProps) {
  const [session, setSession] = useState<GameSessionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { reconnecting } = useSessionSocket(code, 'audience', (next) => {
    setSession(next);
  });

  useEffect(() => {
    apiFetch<{ session: GameSessionView }>(`/api/sessions/${code}?role=audience`)
      .then((res) => setSession(res.session))
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر الاتصال بشاشة العرض'));
  }, [code]);

  useEffect(() => {
    if (session) {
      soundFx.enabled = session.settings.soundEnabled;
      soundFx.calmMode = session.settings.calmMode;
    }
  }, [session?.settings.soundEnabled, session?.settings.calmMode]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#09143A] text-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-[#101E52] p-8 text-center space-y-4">
          <p className="text-rose-200 font-bold">{error}</p>
          <button type="button" onClick={onExit} className="px-5 py-2.5 rounded-xl bg-sky-400 text-slate-950 font-bold">
            العودة
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#09143A] text-slate-200 flex items-center justify-center text-lg">
        جاري مزامنة شاشة العرض (البروجكتر)...
      </div>
    );
  }

  const round = session.rounds[session.currentRoundIndex];
  const roundMeta = round ? ROUND_RULES[round.roundType] : null;
  const q = session.currentQuestion;
  const isUrgent = session.timerRunning && session.timerRemainingSec <= 5 && session.timerRemainingSec > 0;
  const winSummary = determineWinner(session.teams);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#09143A] via-[#0F215E] to-[#081131] text-slate-50 flex flex-col justify-between p-6 lg:p-10">
      {/* Clean 16:9 Header */}
      <header className="flex items-center justify-between gap-6">
        <ChallengeLogoEmblem size="sm" />
        <div className="flex items-center gap-4 text-sm text-slate-300">
          <span>{session.title}</span>
          <span>·</span>
          <span className="font-mono font-bold text-amber-300">#{session.code}</span>
          {reconnecting && <span className="text-rose-300 font-bold">جاري استعادة الاتصال...</span>}
          <button
            type="button"
            onClick={onExit}
            aria-label="عودة خطوة"
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>عودة خطوة</span>
          </button>
        </div>
      </header>

      {/* Main 16:9 Stage */}
      <main className="flex-1 flex flex-col justify-center max-w-6xl w-full mx-auto space-y-6 py-4">
        {/* Teams + Timer Banner */}
        <div className="grid grid-cols-3 items-center gap-6 rounded-3xl bg-[#101E52]/95 border border-sky-400/30 p-5">
          <div className={`text-right rounded-2xl p-2 ${session.buzzedTeamIndex === 0 ? 'ring-2 ring-amber-400 bg-amber-400/10' : ''}`}>
            <div className="text-lg sm:text-2xl font-black text-white">{session.teams[0]?.name}</div>
            <div
              className="text-4xl sm:text-6xl font-black tabular-nums mt-1"
              style={{ color: session.teams[0]?.color || '#38BDF8' }}
            >
              {session.teams[0]?.points ?? 0}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {Array.from({ length: session.settings.strikesLimit }).map((_, idx) => (
                <span
                  key={idx}
                  className={`text-sm font-black ${
                    idx < (session.teams[0]?.strikes ?? 0) ? 'text-rose-400' : 'text-slate-600'
                  }`}
                >
                  ✕
                </span>
              ))}
            </div>
          </div>

          <div className="text-center">
            <div
              className={`inline-block px-8 py-4 rounded-3xl border-2 ${
                isUrgent
                  ? 'timer-urgent bg-rose-500/25 border-rose-400 text-rose-200'
                  : 'bg-[#09143A] border-sky-400/50 text-sky-300'
              }`}
            >
              <div className="text-5xl sm:text-7xl font-black tabular-nums leading-none">
                00:{String(session.timerRemainingSec).padStart(2, '0')}
              </div>
              {roundMeta?.multiQuestionWithinTimer && session.timerRunning && (
                <div className="text-xs font-bold text-slate-300 mt-1">الوقت متواصل</div>
              )}
            </div>
          </div>

          {session.teams[1] ? (
            <div className={`text-left rounded-2xl p-2 ${session.buzzedTeamIndex === 1 ? 'ring-2 ring-amber-400 bg-amber-400/10' : ''}`}>
              <div className="text-lg sm:text-2xl font-black text-white">{session.teams[1].name}</div>
              <div
                className="text-4xl sm:text-6xl font-black tabular-nums mt-1"
                style={{ color: session.teams[1].color }}
              >
                {session.teams[1].points}
              </div>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                {Array.from({ length: session.settings.strikesLimit }).map((_, idx) => (
                  <span
                    key={idx}
                    className={`text-sm font-black ${
                      idx < session.teams[1].strikes ? 'text-rose-400' : 'text-slate-600'
                    }`}
                  >
                    ✕
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-left text-slate-300 text-lg font-bold">تحدي الوقت</div>
          )}
        </div>

        {/* Lead-change / Streak / Buzz spotlight banner */}
        {session.lastFeedback &&
          (session.lastFeedback.type === 'lead_change' || session.lastFeedback.type === 'streak') && (
            <div className="rounded-2xl bg-amber-500/25 border border-amber-400 px-6 py-3 text-center text-xl font-black text-amber-100 flex items-center justify-center gap-3">
              <Zap className="w-6 h-6 text-amber-300" />
              <span>{session.lastFeedback.message}</span>
            </div>
          )}

        {session.buzzedTeamIndex !== null && !session.answerRevealed && (
          <div className="rounded-2xl bg-sky-500/20 border border-sky-400 px-6 py-3 text-center text-xl font-black text-white flex items-center justify-center gap-3">
            <Bell className="w-6 h-6 text-amber-300" />
            <span>الفرصة الآن لـ: {session.teams[session.buzzedTeamIndex]?.name}</span>
          </div>
        )}

        {/* Phase-specific Display */}
        {session.phase === 'vs' ? (
          <div className="rounded-3xl bg-[#101E52] border border-violet-400/40 p-8 sm:p-10 text-center space-y-6">
            <div className="text-xl font-bold text-sky-300">استعدوا لانطلاق المواجهة — رمز الجلسة: <span className="font-mono text-amber-300">{session.code}</span></div>
            <div className="flex items-center justify-center gap-8 sm:gap-10 text-3xl sm:text-5xl font-black text-white">
              <span className="animate-vs-right">{session.teams[0]?.name}</span>
              <span className="w-20 h-20 rounded-full bg-violet-600 flex items-center justify-center text-2xl shrink-0">VS</span>
              {session.teams[1] && <span className="animate-vs-left">{session.teams[1].name}</span>}
            </div>
            <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-center gap-6">
              <div className="flex flex-col items-center gap-2">
                <SessionQrBadge
                  code={session.code}
                  url={`${window.location.origin}/?mode=host&code=${session.code}`}
                  size="sm"
                />
                <span className="text-xs font-bold text-emerald-300">تحكم الأستاذ (جوال)</span>
              </div>
              {session.teams.map((t) => (
                <div key={t.index} className="flex flex-col items-center gap-2">
                  <SessionQrBadge
                    code={session.code}
                    url={`${window.location.origin}/?mode=buzzer&code=${session.code}&team=${t.index}`}
                    size="sm"
                  />
                  <span className="text-xs font-bold text-sky-200">جرس: {t.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : session.phase === 'finished' ? (
          <div className="rounded-3xl bg-white text-slate-900 p-12 text-center space-y-4">
            <Trophy className="w-16 h-16 text-amber-500 mx-auto" />
            <h1 className="text-4xl font-black">
              {winSummary.isTie ? 'تعادل بطولي!' : `الفائز: ${session.teams[winSummary.winnerIndices[0]]?.name}`}
            </h1>
            <p className="text-xl text-slate-600 font-bold">
              {session.teams.map((t) => `${t.name}: ${t.points}`).join('  |  ')}
            </p>
          </div>
        ) : q ? (
          <div className="rounded-3xl bg-[#101E52] border border-sky-400/35 p-8 sm:p-12 space-y-6 text-center">
            <div className="inline-flex items-center gap-3 px-6 py-2 rounded-xl bg-[#6D28D9] text-white font-black text-lg">
              <span>{round?.titleAr || roundMeta?.nameAr}</span>
              {session.isClutchTime && <span className="text-amber-300 text-sm">· وقت الحسم</span>}
            </div>

            {q.roundType === 'memory' && q.memoryPhase === 'memorize' ? (
              <div className="space-y-4">
                <h2 className="text-2xl font-black text-amber-300">احفظ العناصر ({q.memoryRemainingSec}ث)</h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {(q.memoryItems || []).map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl bg-[#09143A] border border-sky-400/40 p-5 text-xl font-black text-white"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-3xl sm:text-5xl font-black text-white leading-relaxed text-balance">
                  {q.prompt}
                </h1>

                {q.roundType === 'who_am_i' && (
                  <div className="max-w-3xl mx-auto space-y-2 text-right">
                    <div className="text-center text-sm font-black text-amber-300 tabular-nums">
                      قيمة الإجابة الآن: {Math.max(1, 3 - (q.revealedClues.length - 1)) * (round?.multiplier ?? 1)} نقاط
                    </div>
                    {q.revealedClues.map((clue, idx) => (
                      <div key={idx} className="rounded-xl bg-[#09143A] border border-violet-400/40 p-4 text-xl font-bold">
                        <span className="text-violet-300 ml-2">دليل {idx + 1}:</span>
                        <span>{clue}</span>
                      </div>
                    ))}
                  </div>
                )}

                {q.roundType === 'bid_challenge' && session.bidState && (
                  <div className="max-w-4xl mx-auto rounded-2xl bg-[#09143A] border border-amber-400/40 p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="text-right">
                        <div className="text-sm font-bold text-amber-300">
                          {session.bidState.phase === 'bidding' ? 'المزايدة الجارية' : 'التنفيذ المباشر (٣٠ ثانية)'}
                        </div>
                        <div className="text-2xl font-black text-white">
                          المزايد: {session.teams[session.bidState.bidderTeamIndex]?.name}
                        </div>
                      </div>
                      <div className="text-center px-6 py-3 rounded-2xl bg-[#101E52] border border-sky-400/40">
                        <div className="text-xs text-slate-300">المطلوب / المُنجَز</div>
                        <div className="text-3xl font-black text-sky-300 tabular-nums">
                          {session.bidState.phase === 'bidding'
                            ? `${session.bidState.currentBid} إجابات`
                            : `${session.bidState.acceptedAnswers.length} / ${session.bidState.currentBid}`}
                        </div>
                      </div>
                    </div>

                    {session.bidState.acceptedAnswers.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-2.5">
                        {session.bidState.acceptedAnswers.map((ans, idx) => (
                          <span
                            key={idx}
                            className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/45 text-lg font-extrabold text-emerald-100"
                          >
                            {idx + 1}. {ans}
                          </span>
                        ))}
                      </div>
                    )}

                    {session.bidState.lastDuplicateWarning && (
                      <div className="text-sm font-bold text-amber-300">
                        {session.bidState.lastDuplicateWarning}
                      </div>
                    )}
                  </div>
                )}

                {q.options.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 max-w-4xl mx-auto">
                    {q.options.map((opt, idx) => (
                      <div
                        key={idx}
                        className={`p-5 rounded-2xl border text-2xl font-extrabold ${
                          session.answerRevealed && q.revealedCorrectIndex === idx
                            ? 'bg-emerald-500/30 border-emerald-400 text-emerald-100'
                            : 'bg-[#09143A] border-white/15 text-white'
                        }`}
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                )}

                {session.answerRevealed && (
                  <div className="rounded-2xl bg-emerald-500/20 border border-emerald-400 p-6 max-w-3xl mx-auto">
                    <div className="text-sm text-emerald-300 font-bold mb-1">الإجابة الصحيحة</div>
                    <div className="text-3xl font-black text-white">
                      {q.revealedAcceptableAnswers?.join(' · ') || q.revealedAnswerText}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </main>

      <footer className="text-center text-xs text-slate-400">
        مسجد ابن تيمية · شاشة الجمهور المتزامنة
      </footer>
    </div>
  );
}
