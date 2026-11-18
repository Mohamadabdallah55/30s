import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Crown, Lock, Zap } from 'lucide-react';
import type { GameSessionView } from '../shared/types';
import { determineWinner, ROUND_RULES } from '../shared/gameRules';
import { soundFx } from '../utils/sound';
import { RoundArt, TrophyArt, showRounds } from './ShowArt';

export function useShowCountdown(endsAt?: number | null) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 75);
    return () => clearInterval(tick);
  }, [endsAt]);
  return endsAt ? Math.max(1, Math.min(3, Math.ceil((endsAt - now) / 1000))) : 0;
}

export function useShowSound(session: GameSessionView | null, countdown: number) {
  const last = useRef('');
  const lastStartedRound = useRef<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const round = session.rounds[session.currentRoundIndex];
    soundFx.setRoundContext(round?.roundType, round?.goldenTargetType);

    if (session.phase === 'round_intro' || session.phase === 'playing') {
      const roundKey = `${session.code}-${session.currentRoundIndex}`;
      if (lastStartedRound.current !== roundKey) {
        lastStartedRound.current = roundKey;
        soundFx.roundStart(round?.roundType, round?.goldenTargetType);
      }
    }

    const key = session.phase === 'countdown' ? `count-${session.currentRoundIndex}-${countdown}`
      : session.phase === 'finished' ? 'winner'
      : session.phase === 'round_summary' ? `summary-${session.currentRoundIndex}`
      : session.timerRunning && session.timerRemainingSec <= 5 ? `tick-${session.currentQuestion?.id}-${session.timerRemainingSec}`
      : session.phase === 'playing' && session.timerRemainingSec === 0 ? `time-up-${session.currentRoundIndex}` : '';
    if (!key || last.current === key) return;
    last.current = key;
    if (key === 'winner') {
      const winner = determineWinner(session.teams);
      soundFx.victory(winner.isTie);
    } else if (key.startsWith('summary-')) {
      if (session.teams.some((t) => t.points > 0)) {
        soundFx.applause(0.85, 'light');
      }
    } else if (key.startsWith('count-')) soundFx.countdown(countdown, round?.roundType);
    else if (key.startsWith('time-up')) soundFx.timeUp();
    else soundFx.tickUrgent(round?.roundType);
  }, [session, countdown]);
}

export function ScoreRibbon({ session }: { session: GameSessionView }) {
  const round = session.rounds[session.currentRoundIndex];
  const urgent = session.timerRunning && session.timerRemainingSec > 0 && session.timerRemainingSec <= 5;
  const seconds = Math.max(0, session.timerRemainingSec);
  return <div className="show-scoreboard">
    {[0, 1].map((index) => {
      const team = session.teams[index];
      return <div key={index} className={`show-score show-score--${index} ${!team ? 'show-score--empty' : ''}`} data-active={(session.buzzedTeamIndex ?? session.activeTeamIndex) === index}>
        {team && <><span>{team.name}</span><strong key={team.points} dir="ltr">{team.points}</strong></>}
      </div>;
    })}
    <div className={`show-clock ${urgent ? 'show-clock--urgent' : ''}`}>
      <span>{session.memoryPhase === 'memorize' ? 'احفظ' : `الجولة ${session.currentRoundIndex + 1}/${session.rounds.length}`}</span>
      <strong dir="ltr">{session.memoryPhase === 'memorize' ? session.memoryRemainingSec : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`}</strong>
      <div className="show-timebar" aria-hidden="true"><i style={{ width: Math.min(100, (seconds / Math.max(1, round?.durationSec ?? 30)) * 100) + '%' }} /></div>
    </div>
  </div>;
}

export function ShowIntermission({ session, countdown }: { session: GameSessionView; countdown: number }) {
  const round = session.rounds[session.currentRoundIndex];
  if (session.phase === 'vs' || session.phase === 'lobby') {
    return <section className="show-faceoff">
      <p>استعدّوا للمواجهة</p>
      <div className="show-faceoff__teams">
        {session.teams.map((team, index) => <div key={team.index} className={`show-faceoff__team show-faceoff__team--${index}`}><Zap aria-hidden="true" /><strong>{team.name}</strong></div>)}
        {session.teams.length > 1 && <b className="show-versus" dir="ltr">VS</b>}
      </div>
      <p>{session.rounds.length} جولات</p>
    </section>;
  }
  if (session.phase === 'round_intro' || session.phase === 'countdown') {
    const type = round?.roundType ?? 'rapid_fire';
    return <section className={`show-intro ${type === 'golden' ? 'show-intro--gold' : ''}`} style={{ '--round-color': showRounds[type].color } as React.CSSProperties}>
      {session.phase === 'countdown' ? <b className="show-count" key={countdown} aria-label={String(countdown)}>{countdown}</b> : <RoundArt type={type} />}
      <div><span>الجولة {session.currentRoundIndex + 1}</span><h1>{round?.titleAr}</h1>
      <p>{showRounds[type].tag}</p>
      <small>{ROUND_RULES[round?.goldenTargetType ?? type].rulesBulletAr}</small>
      {type === 'golden' && <b className="show-multiplier" dir="ltr">×2</b>}</div>
    </section>;
  }
  if (session.phase === 'round_summary' || session.phase === 'finished') {
    const winner = determineWinner(session.teams);
    const final = session.phase === 'finished';
    return <section className={`show-result ${final ? 'show-result--final' : ''}`}>
      {final ? <TrophyArt /> : <Crown size={42} aria-hidden="true" />}
      <p>{final ? 'النتيجة النهائية' : 'نتيجة الجولة'}</p>
      <h1>{winner.isTie ? 'تعادل!' : `${final ? 'الفائز' : 'بالصدارة'} · ${session.teams[winner.winnerIndices[0]]?.name}`}</h1>
      <div className="show-result__points">{session.teams.map((team) => <div key={team.index}><b>{team.points}</b><span>{team.name}</span></div>)}</div>
    </section>;
  }
  return null;
}

export function ChallengeDisplay({ session, controls = false }: { session: GameSessionView; controls?: boolean }) {
  const q = session.currentQuestion;
  const round = session.rounds[session.currentRoundIndex];
  const type = q?.roundType ?? round?.goldenTargetType ?? round?.roundType ?? 'rapid_fire';
  const art = showRounds[type];
  const feedback = session.lastFeedback;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const timeout = setTimeout(() => setNow(Date.now()), feedback?.type ? 2200 : 1000);
    const revealTimeout = session.sprintReveal ? setTimeout(() => setNow(Date.now()), Math.max(0, session.sprintReveal.untilMs - Date.now()) + 30) : undefined;
    return () => { clearTimeout(timeout); clearTimeout(revealTimeout); };
  }, [feedback?.atMs, session.sprintReveal?.untilMs]);
  const liveFeedback = feedback && now - feedback.atMs < 2200 ? feedback : null;
  if (!q) return <div className="show-question show-question--empty"><h2>بنك الجولة خلص</h2><p>{session.exhaustedNotice?.message ?? 'بانتظار السؤال التالي.'}</p></div>;

  const revealed = session.answerRevealed;
  const memory = q.roundType === 'memory' && q.memoryPhase === 'memorize';
  const isFill = type === 'fill_blank' && /_{2,}|…{2,}/.test(q.prompt);
  const promptParts = isFill ? q.prompt.split(/(_{2,}|…{2,})/) : [q.prompt];
  const isStreak = liveFeedback?.type === 'streak';
  return <section className="show-challenge" data-round={type} style={{ '--round-color': art.color } as React.CSSProperties}>
    <div className="show-challenge__label"><RoundArt type={type} /><b>{round?.titleAr ?? ROUND_RULES[type].nameAr}</b>
      <span>{memory ? 'مرحلة الحفظ' : type === 'memory' ? 'مرحلة التذكّر' : `${session.currentQuestionIndexInRound + 1} / ${round?.questionsPerRound ?? 1}`}</span>
      {round?.roundType === 'golden' && <strong dir="ltr">×2</strong>}
    </div>
    <div key={q.id} className={`show-question ${memory ? 'show-question--memory' : ''}`} data-feedback={liveFeedback?.type ?? ''}>
      {memory ? <><h2>احفظهم قبل ما يختفوا!</h2>
        <div className="show-memory-cards">{q.memoryItems?.map((item, index) => <span key={index} style={{ '--step': index } as React.CSSProperties}>{item}</span>)}</div>
      </> : <>
        <h2>{promptParts.map((part, index) => /^_{2,}|^…{2,}/.test(part) ?
          <span className="show-blank" key={index}>{revealed ? q.revealedAnswerText : '؟'}</span> : part)}</h2>
        {type === 'who_am_i' && <div className="show-clues">
          {q.revealedClues.map((clue, index) => <div key={index}><b>{index + 1}</b>{clue}</div>)}
          <span>{Math.max(1, 4 - q.revealedClues.length) * (round?.multiplier ?? 1)} نقاط للإجابة الآن</span>
        </div>}
        {(!controls || revealed) && q.options.length > 0 && ['multiple_choice', 'true_false', 'odd_one_out', 'order_items'].includes(type) && <div className={`show-options show-options--${type}`}>
          {q.options.map((option, index) => <div key={index} data-correct={revealed && q.revealedCorrectIndex === index} style={{ '--step': index } as React.CSSProperties}>
            <b>{type === 'true_false' ? (index === 0 ? '✓' : '×') : ['أ', 'ب', 'ج', 'د', 'هـ'][index] ?? index + 1}</b>{option}
          </div>)}
        </div>}
        {type === 'list_multiple' && session.listProgress && <div className="show-list" aria-label={`${session.listProgress.accepted} من ${session.listProgress.required}`}>
          {Array.from({ length: session.listProgress.required }, (_, index) => <span key={index} data-filled={index < session.listProgress!.accepted}>{index < session.listProgress!.accepted ? <Check /> : index + 1}</span>)}
        </div>}
        {type === 'bid_challenge' && session.bidState && <div className="show-bid">
          <span>{session.teams[session.bidState.bidderTeamIndex]?.name}<small>صاحب المزايدة</small></span>
          <strong key={session.bidState.currentBid}>{session.bidState.currentBid}</strong>
          <span>{session.bidState.phase === 'bidding' ? session.teams[session.bidState.turnTeamIndex]?.name : session.bidState.acceptedAnswers.length + ' إجابات'}<small>{session.bidState.phase === 'bidding' ? 'الدور عليه' : 'مقبولة'}</small></span>
        </div>}
        {type === 'buzzer' && <div className="show-buzz-state">{session.buzzedTeamIndex === null ? <Bell /> : <Lock />}{
          session.buzzedTeamIndex === null ? 'مين رح يسبق عالجرس؟' : `الجرس مع ${session.teams[session.buzzedTeamIndex]?.name}`
        }</div>}
        {type === 'memory' && !revealed && <div className="show-recall"><Lock size={22} /> {q.memoryRequireOrder ? 'العناصر اختفت. اذكرها بنفس الترتيب!' : 'العناصر اختفت. شو بتتذكّر؟'}</div>}
        {revealed && <div className="show-reveal"><b>{q.revealedAcceptableAnswers?.join(' · ') || q.revealedAnswerText}</b>
          {(q.revealedOddReason || q.revealedExplanation) && <p>{q.revealedOddReason || q.revealedExplanation}</p>}
        </div>}
      </>}
    </div>
    <div className="show-feedback" aria-live="polite">
      {liveFeedback?.type && <span key={liveFeedback.atMs} data-kind={liveFeedback.type}>
        {isStreak ? `COMBO ×${session.teams[liveFeedback.teamIndex ?? 0]?.streak ?? 3}` : liveFeedback.type === 'lead_change' ? 'انقلبت النتيجة!' : liveFeedback.type === 'wrong' ? 'أوووف… قربت!' : liveFeedback.type === 'skip' ? 'يلا عاللي بعده' : 'يا سلام عليك!'}
        {liveFeedback.pointsDelta > 0 && <b dir="ltr">+{liveFeedback.pointsDelta}</b>}
      </span>}
      {session.sprintReveal && session.sprintReveal.untilMs > now && !revealed && <small>{session.sprintReveal.text}</small>}
      {!liveFeedback && session.timerRemainingSec === 0 && <span>خلص الوقت!</span>}
    </div>
  </section>;
}
