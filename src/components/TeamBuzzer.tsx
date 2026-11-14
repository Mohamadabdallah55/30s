import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Lock, Send, Trophy, Users, XCircle } from 'lucide-react';
import { ROUND_RULES } from '../shared/gameRules';
import type { GameSessionView } from '../shared/types';
import { apiFetch, getAuthToken, useSessionSocket } from '../utils/api';
import { soundFx } from '../utils/sound';

interface TeamBuzzerProps {
  code: string;
  initialTeamIndex?: number;
  onExit: () => void;
}

export function TeamBuzzer({ code, initialTeamIndex = 0, onExit }: TeamBuzzerProps) {
  const [session, setSession] = useState<GameSessionView | null>(null);
  const [teamIndex, setTeamIndex] = useState<number>(initialTeamIndex);
  const [textAnswer, setTextAnswer] = useState('');
  const [buzzing, setBuzzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const { connected, reconnecting } = useSessionSocket(code, 'player', (next) => {
    setSession(next);
  });

  useEffect(() => {
    apiFetch<{ session: GameSessionView }>(`/api/sessions/${code}?role=player`)
      .then((res) => {
        setSession(res.session);
        if (initialTeamIndex >= res.session.teams.length) {
          setTeamIndex(0);
        }
      })
      .catch((err) => setStatusError(err instanceof Error ? err.message : 'تعذر الاتصال بالجلسة'));
  }, [code, initialTeamIndex]);

  useEffect(() => {
    setTextAnswer('');
    setStatusError(null);
  }, [session?.currentQuestion?.id, session?.buzzedTeamIndex]);

  const teamKey = new URLSearchParams(window.location.hash.slice(1)).get('key');

  const handleBuzz = async () => {
    if (!session || buzzing) return;
    setBuzzing(true);
    setStatusError(null);
    soundFx.buzz();
    try {
      const res = await apiFetch<{ session: GameSessionView }>(`/api/sessions/${code}/buzz`, {
        method: 'POST',
        body: JSON.stringify({ teamIndex, teamKey, questionId: session?.currentQuestion?.id }),
      });
      setSession(res.session);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'تعذر ضغط الجرس الآن');
    } finally {
      setBuzzing(false);
    }
  };

  const handleSubmitPhoneAnswer = async (submitted: string | number) => {
    if (!session || submitting || session.answerRevealed) return;
    setSubmitting(true);
    setStatusError(null);
    try {
      const res = await apiFetch<{ view: GameSessionView }>(`/api/sessions/${code}/answer`, {
        method: 'POST',
        body: JSON.stringify({ teamIndex, submitted, teamKey, questionId: session.currentQuestion?.id }),
      });
      setSession(res.view);
      setTextAnswer('');
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'انتهى الوقت أو لم يُقبل الإرسال');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoneBidAction = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!session || submitting) return;
    setSubmitting(true);
    setStatusError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/sessions/${code}/bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action, payload }),
      });
      const json = (await res.json()) as { session?: GameSessionView; error?: string };
      if (json.session) setSession(json.session);
      if (!res.ok) {
        setStatusError(json.error || 'تعذر تنفيذ المزايدة');
      } else if (action === 'bid_record_answer') {
        setTextAnswer('');
      }
    } catch {
      setStatusError('تعذر الاتصال بالجلسة');
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-[#09143A] text-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl bg-[#101E52] border border-sky-400/25 p-6 text-center space-y-4">
          <p className="text-sm font-bold text-slate-200">
            {statusError || `جاري ربط جرس الهاتف بالجلسة #${code}...`}
          </p>
          <button
            type="button"
            onClick={onExit}
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white"
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  const myTeam = session.teams[teamIndex] || session.teams[0];
  const round = session.rounds[session.currentRoundIndex];
  const roundMeta = round ? ROUND_RULES[round.roundType] : null;
  const q = session.currentQuestion;

  const isFailedLocked = session.failedBuzzTeams.includes(teamIndex);
  const isMyBuzz = session.buzzedTeamIndex === teamIndex;
  const isOtherBuzz = session.buzzedTeamIndex !== null && session.buzzedTeamIndex !== teamIndex;
  const otherTeamName =
    session.buzzedTeamIndex !== null ? session.teams[session.buzzedTeamIndex]?.name || 'فريق آخر' : '';

  const canBuzz =
    (!(session.settings.hostControlled || session.settings.showMode) || (Boolean(teamKey) && session.timerRunning && q?.roundType === 'buzzer')) &&
    session.phase === 'playing' &&
    !session.answerRevealed &&
    session.timerRemainingSec > 0 &&
    session.memoryPhase !== 'memorize' &&
    !isFailedLocked &&
    session.buzzedTeamIndex === null;

  const canAnswerOnPhone =
    (!(session.settings.hostControlled || session.settings.showMode) || Boolean(teamKey && q?.roundType === 'multiple_choice')) &&
    session.phase === 'playing' &&
    !session.answerRevealed &&
    session.timerRemainingSec > 0 &&
    q &&
    (isMyBuzz || (q.roundType !== 'buzzer' && session.activeTeamIndex === teamIndex));

  return (
    <div className="show-phone min-h-screen text-slate-50 flex flex-col justify-between p-4 sm:p-6">
      {/* Compact Header */}
      <header className="max-w-md w-full mx-auto flex items-center justify-between gap-2">
        <div className="text-xs text-slate-300 flex items-center gap-2">
          <span dir="ltr" className="font-mono font-bold text-amber-300">
            #{session.code}
          </span>
          <span aria-hidden="true">·</span>
          <span>{connected ? 'متصل' : reconnecting ? 'إعادة اتصال...' : 'مزامنة'}</span>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold"
        >
          عودة خطوة
        </button>
      </header>

      <main className="max-w-md w-full mx-auto flex-1 flex flex-col justify-center space-y-4 py-4">
        {/* Team Switcher (for quick phone setup) */}
        {session.teams.length > 1 && !session.settings.showMode && (
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#101E52] border border-white/10">
            {session.teams.map((t) => (
              <button
                key={t.index}
                type="button"
                onClick={() => setTeamIndex(t.index)}
                className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-between gap-2 transition-colors ${
                  teamIndex === t.index ? 'bg-[#09143A] text-white border border-sky-400/50' : 'text-slate-400'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Users className="w-3.5 h-3.5 shrink-0" style={{ color: t.color }} />
                  <span className="truncate">{t.name}</span>
                </span>
                <span className="tabular-nums font-mono" style={{ color: t.color }}>
                  {t.points}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Team Score + Timer Banner */}
        <div className="rounded-2xl bg-[#101E52] border border-sky-400/25 p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-400">فريقك</div>
            <div className="text-lg font-black text-white">{myTeam.name}</div>
            <div className="text-sm font-black tabular-nums" style={{ color: myTeam.color }}>
              {myTeam.points} نقطة
            </div>
          </div>
          <div
            className={`px-4 py-2 rounded-2xl border text-center ${
              session.timerRunning && session.timerRemainingSec <= 5
                ? 'timer-urgent bg-rose-500/20 border-rose-400 text-rose-200'
                : 'bg-[#09143A] border-sky-400/35 text-sky-300'
            }`}
          >
            <div className="text-3xl font-black tabular-nums leading-none">
              00:{String(session.timerRemainingSec).padStart(2, '0')}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">{roundMeta?.nameAr || 'الجولة'}</div>
          </div>
        </div>

        {/* Question Prompt */}
        {session.phase === 'finished' ? (
          <div className="rounded-3xl bg-[#101E52] border border-amber-400/40 p-6 text-center space-y-3">
            <Trophy className="w-12 h-12 text-amber-400 mx-auto" />
            <h1 className="text-xl font-black text-white">انتهت المسابقة!</h1>
            <p className="text-sm text-slate-300">
              {session.teams.map((t) => `${t.name}: ${t.points}`).join(' · ')}
            </p>
          </div>
        ) : (
          <div className="rounded-3xl bg-[#101E52] border border-sky-400/30 p-5 space-y-5">
            {q ? (
              <div className="text-center space-y-1">
                <div className="text-xs font-bold text-sky-300">{q.category}</div>
                <h1 className="text-lg font-extrabold text-white leading-relaxed">{q.prompt}</h1>
              </div>
            ) : (
              <div className="text-center text-sm text-slate-300 py-2">
                {session.phase === 'vs' ? 'استعدوا... المسابقة على وشك البدء' : 'بانتظار عرض السؤال...'}
              </div>
            )}

            {/* Bid Challenge (مين يزوّد) Phone Controls OR Giant Tactile Buzzer */}
            {(session.settings.hostControlled || session.settings.showMode) && q?.roundType !== 'buzzer' ? (
              <p className="rounded-xl bg-[#101E52] p-4 text-center text-slate-200">{canAnswerOnPhone ? 'اختار إجابتك من الخيارات.' : 'تابع السؤال على شاشة الجمهور وأجب شفهيًا للمشرف.'}</p>
            ) : q?.roundType === 'bid_challenge' && session.bidState && !session.answerRevealed ? (
              <div className="rounded-2xl bg-[#09143A] border border-amber-400/35 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-300">
                    {session.bidState.phase === 'bidding' ? 'المزايدة الجارية' : 'تحدي الـ30 ثانية'}
                  </span>
                  <span className="font-black text-sky-300 tabular-nums">
                    {session.bidState.phase === 'bidding'
                      ? `الالتزام: ${session.bidState.currentBid}`
                      : `${session.bidState.acceptedAnswers.length} / ${session.bidState.currentBid}`}
                  </span>
                </div>

                {session.bidState.phase === 'bidding' ? (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-300">
                      المزايد الحالي: {session.teams[session.bidState.bidderTeamIndex]?.name}
                    </div>
                    {(session.bidState.turnTeamIndex === teamIndex || session.teams.length === 1) ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={submitting || session.bidState.currentBid + 1 > session.bidState.maxPossible}
                          onClick={() => handlePhoneBidAction('bid_raise', { teamIndex, increment: 1 })}
                          className="py-3 rounded-xl bg-sky-400 text-slate-950 font-black text-sm disabled:opacity-45"
                        >
                          +1 زايد
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handlePhoneBidAction('bid_challenge', {})}
                          className="py-3 rounded-xl bg-amber-400 text-slate-950 font-black text-sm"
                        >
                          تحدّاه!
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-center text-slate-400 py-2">
                        الدور مع الفريق المنافس...
                      </div>
                    )}
                  </div>
                ) : session.bidState.bidderTeamIndex === teamIndex && session.timerRemainingSec > 0 ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (textAnswer.trim()) {
                        handlePhoneBidAction('bid_record_answer', {
                          answerText: textAnswer.trim(),
                          hostConfirmed: false,
                        });
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      placeholder="أرسل إجابة فريدة..."
                      className="flex-1 rounded-xl bg-[#101E52] border border-sky-400/30 px-3 py-2.5 text-sm text-white outline-none"
                    />
                    <button
                      type="submit"
                      disabled={submitting || !textAnswer.trim()}
                      aria-label="إرسال إجابة المزايدة"
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                ) : (
                  <div className="text-xs text-center text-slate-300 py-2">
                    المزايد الآن: {session.teams[session.bidState.bidderTeamIndex]?.name}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                disabled={!canBuzz || buzzing}
                onClick={handleBuzz}
                data-testid="phone-buzzer-btn"
                style={
                  canBuzz
                    ? { backgroundColor: myTeam.color, color: '#09143A' }
                    : undefined
                }
                className={`w-full min-h-[180px] rounded-3xl font-black text-2xl flex flex-col items-center justify-center gap-3 transition-transform active:scale-[0.97] border-2 ${
                  isMyBuzz
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-100'
                    : isFailedLocked
                    ? 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                    : isOtherBuzz
                    ? 'bg-slate-800/80 border-slate-600 text-slate-300'
                    : canBuzz
                    ? 'border-white/30 shadow-xl'
                    : 'bg-[#09143A] border-white/10 text-slate-500'
                }`}
              >
                {isMyBuzz ? (
                  <>
                    <CheckCircle2 className="w-12 h-12 text-emerald-300" />
                    <span>الجرس معكم الآن!</span>
                    <span className="text-xs font-bold text-emerald-200">تحدث بالإجابة أو أرسلها أدناه</span>
                  </>
                ) : isFailedLocked ? (
                  <>
                    <XCircle className="w-12 h-12 text-rose-300" />
                    <span className="text-lg">تم إغلاق فرصتك في هذا السؤال</span>
                    <span className="text-xs font-medium text-rose-200">انتقلت الفرصة للفريق المنافس</span>
                  </>
                ) : isOtherBuzz ? (
                  <>
                    <Lock className="w-10 h-10 text-amber-300" />
                    <span className="text-lg">تم قفل الجرس على فريق آخر</span>
                    <span className="text-xs font-bold text-amber-200">المتحدث: {otherTeamName}</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-12 h-12" />
                    <span>{canBuzz ? 'اضغط الجرس الآن!' : 'الجرس غير متاح حالياً'}</span>
                  </>
                )}
              </button>
            )}

            {statusError && (
              <p className="text-xs text-rose-300 text-center font-bold">{statusError}</p>
            )}

            {/* Quick Phone Answer Controls when team holds the turn */}
            {canAnswerOnPhone && q && q.roundType !== 'bid_challenge' && (
              <div className="pt-3 border-t border-white/10 space-y-2.5">
                {q.options.length > 0 &&
                (q.roundType === 'multiple_choice' || q.roundType === 'true_false' || q.roundType === 'odd_one_out') ? (
                  <div className="grid grid-cols-1 gap-2">
                    {q.options.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={submitting}
                        onClick={() => handleSubmitPhoneAnswer(idx)}
                        className="py-3 px-4 rounded-xl bg-[#09143A] hover:bg-[#162B73] border border-sky-400/30 text-sm font-bold text-white text-right"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (textAnswer.trim()) handleSubmitPhoneAnswer(textAnswer.trim());
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      placeholder="اكتب إجابتك هنا (اختياري)..."
                      className="flex-1 rounded-xl bg-[#09143A] border border-sky-400/30 px-3 py-2.5 text-sm text-white outline-none"
                    />
                    <button
                      type="submit"
                      disabled={submitting || !textAnswer.trim()}
                      aria-label="إرسال الإجابة"
                      className="px-4 py-2.5 rounded-xl bg-sky-400 text-slate-950 font-black inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="text-center text-[11px] text-slate-400">
        جرس المواجهة الفوري · مسجد ابن تيمية
      </footer>
    </div>
  );
}
