import { useEffect, useRef, useState } from 'react';
import {
  HostReactionEngine,
  resolveNashmiVisualMood,
  type HostReaction,
  type NashmiHostMood,
} from '../shared/jordanianBot';
import type { GameSessionView, RoundType } from '../shared/types';
import { soundFx } from '../utils/sound';

export const showRounds: Record<RoundType, { color: string; tag: string; art: string }> = {
  rapid_fire: { color: '#FFE45A', tag: 'شدّ حيلك… الرشّاش بلّش!', art: 'M28 6 11 26h12l-3 16 18-22H25z M7 12h10M4 19h10M6 34h7' },
  list_multiple: { color: '#4EDB9A', tag: 'عدّهم قبل ما يطير الوقت!', art: 'M8 12h7v7H8zM8 22h7v7H8zM8 32h7v7H8zM22 15h17M22 25h17M22 35h13' },
  bid_challenge: { color: '#FF68A0', tag: 'عندك أكثر؟ أثبت كلامك!', art: 'm9 36 14-14m-8-5 9-9 12 12-9 9zM9 36l5 5 14-14m2 10h13m-8-23 5-3m-2 8h6' },
  true_false: { color: '#4EDB9A', tag: 'معها ولا ضدّها؟', art: 'm6 23 7 7 12-15m4 12 11 11m0-11L29 38' },
  multiple_choice: { color: '#42C9FF', tag: 'اختارها واثق!', art: 'M8 8h12v12H8zM28 8h12v12H28zM8 28h12v12H8zM28 34l4 5 9-12' },
  who_am_i: { color: '#C7ABFF', tag: 'مين أنا؟ ركّز بالتلميحات!', art: 'M15 17a9 9 0 1 1 13 8c-4 2-4 5-4 7m0 7h.1M6 8l3 3m30-2 3-3m-4 30 4 4' },
  fill_blank: { color: '#FFE45A', tag: 'ناقصها كلمة… شو هي؟', art: 'M6 36h36M13 26 31 8l7 7-18 18-9 2zM27 12l7 7' },
  odd_one_out: { color: '#FF9AC0', tag: 'واحدة مش من المجموعة.', art: 'M8 8h12v12H8zM28 8h12v12H28zM8 28h12v12H8zM34 26l9 8-9 9-8-9z' },
  order_items: { color: '#42C9FF', tag: 'حطّ كل قطعة بمكانها.', art: 'M8 11h17M8 24h22M8 37h28M36 8v19m-6-5 6 6 6-6' },
  memory: { color: '#C7ABFF', tag: 'احفظها… ورجّعها!', art: 'M8 12l14-5 11 26-14 6zM32 12l9 3-8 23-5-1m-10-14 7 3m-5-7 2 9' },
  buzzer: { color: '#FF68A0', tag: 'أول ضغطة إلها الكلمة.', art: 'M12 31h24l-4-5v-9a8 8 0 0 0-16 0v9zm9 6a3 3 0 0 0 6 0M6 17l3-7m30 0 3 7' },
  golden: { color: '#FFE45A', tag: 'لحظة الحسم وصلت!', art: 'm24 6 5 12 13 1-10 9 3 13-11-7-11 7 3-13-10-9 13-1z' },
};

export function RoundArt({ type, className = '' }: { type: RoundType; className?: string }) {
  const art = showRounds[type];
  return <svg className={className} viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
    <path d={art.art} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function ShowMark() {
  return (
    <span className="show-mark" aria-label="تحدي الـ30 ثانية">
      <span className="show-mark__badge" dir="ltr">
        <svg className="show-mark__eyes" viewBox="0 0 42 18" width="32" height="14" aria-hidden="true">
          <ellipse cx="13" cy="9" rx="7.5" ry="7.5" fill="#FFF9ED" stroke="#29183E" strokeWidth="2.4" />
          <ellipse cx="29" cy="9" rx="7.5" ry="7.5" fill="#FFF9ED" stroke="#29183E" strokeWidth="2.4" />
          <circle cx="14.5" cy="9.5" r="3.4" fill="#29183E" />
          <circle cx="27.5" cy="9.5" r="3.4" fill="#29183E" />
          <circle cx="15.7" cy="8.2" r="1.2" fill="#FFF9ED" />
          <circle cx="28.7" cy="8.2" r="1.2" fill="#FFF9ED" />
        </svg>
        <span className="show-mark__number">30</span>
      </span>
      <span className="show-mark__words">
        <b>تحدّي</b>
        <small>ثانية</small>
      </span>
    </span>
  );
}

export type NashmiMascotMoodInput =
  | NashmiHostMood
  | 'hype'
  | 'happy'
  | 'tease'
  | 'gg';

function normalizeMascotMood(mood: NashmiMascotMoodInput = 'idle'): NashmiHostMood {
  switch (mood) {
    case 'hype':
      return 'hyped';
    case 'happy':
      return 'idle';
    case 'gg':
      return 'celebrating';
    case 'tease':
      return 'teasing';
    default:
      return mood;
  }
}

export function NashmiMascot({
  size = 38,
  mood = 'idle',
  animated = true,
  className = '',
}: {
  size?: number;
  mood?: NashmiMascotMoodInput;
  animated?: boolean;
  className?: string;
}) {
  const m = normalizeMascotMood(mood);
  const badgeFill =
    m === 'tense'
      ? '#FF5484'
      : m === 'celebrating'
      ? '#4EDB9A'
      : m === 'shocked'
      ? '#42C9FF'
      : m === 'teasing'
      ? '#F59E0B'
      : '#874CF5';

  const leftEyeR = m === 'tense' || m === 'shocked' ? 5.1 : 4.2;
  const rightEyeR = m === 'tense' || m === 'shocked' ? 5.1 : 4.2;
  const pupilR = m === 'tense' ? 1.45 : m === 'shocked' ? 1.3 : 1.9;

  return (
    <svg
      className={`nashmi-mascot-svg ${animated ? `nashmi-mascot--${m}` : ''} ${className}`}
      data-mood={m}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      {/* Purple / Dynamic comic speech badge background */}
      <path
        d="M32 5C16.5 5 6 15.8 6 29.8c0 7.1 3 13.4 8 17.8L10 57l11.2-4.6c3.3 1.2 7 1.8 10.8 1.8 15.5 0 26-10.8 26-24.4C58 15.8 47.5 5 32 5Z"
        fill={badgeFill}
        stroke="#29183E"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />

      {/* Celebratory / Hyped Sparkles */}
      {(m === 'celebrating' || m === 'hyped') && (
        <g className="nashmi-svg__sparkles" fill="#FFE45A" stroke="#29183E" strokeWidth="1.5">
          <path d="m13 13 1.5 3.1 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5Z" />
          <path d="m51 12 1.2 2.5 2.7.4-1.9 1.9.4 2.7-2.4-1.3-2.4 1.3.4-2.7-1.9-1.9 2.7-.4Z" />
        </g>
      )}

      {/* Shocked / Tense Alert Bolt */}
      {(m === 'tense' || m === 'shocked') && (
        <g className="nashmi-svg__alert">
          <path d="M51 9.5c2 2.2 2 5.4 0 7.6" fill="none" stroke="#FFE45A" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="51" cy="20.5" r="1.5" fill="#FFE45A" />
        </g>
      )}

      {/* Animated Head Group */}
      <g className="nashmi-svg__head">
        {/* Star head */}
        <path
          d="m32 13 4.8 9.2 10.2 1.6-7.3 7.3 1.7 10.2L32 36.6l-9.4 4.7 1.7-10.2-7.3-7.3 10.2-1.6Z"
          fill="#FFE45A"
          stroke="#29183E"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />

        {/* Jordanian red & black agal/shemagh crest */}
        <path
          d="M22.5 19.5c3-2.8 16-2.8 19 0"
          fill="none"
          stroke="#DC2626"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
        <path
          d="M23.5 17.6c2.7-2.2 14.3-2.2 17 0"
          fill="none"
          stroke="#29183E"
          strokeWidth="2.8"
          strokeLinecap="round"
        />

        {/* Eyebrows for tense / shocked / teasing / thinking */}
        {m === 'tense' || m === 'shocked' ? (
          <g stroke="#29183E" strokeWidth="2" strokeLinecap="round">
            <path d="M23 21.5c1.8-1.4 4.2-1.2 5.8 0" />
            <path d="M35.2 21.5c1.6-1.2 4-1.4 5.8 0" />
          </g>
        ) : m === 'teasing' ? (
          <g stroke="#29183E" strokeWidth="2" strokeLinecap="round">
            <path d="M23.5 22.8h5.5" />
            <path d="M34.8 21.2c2-1.2 4.2-.8 5.8.6" />
          </g>
        ) : m === 'thinking' ? (
          <g stroke="#29183E" strokeWidth="1.9" strokeLinecap="round">
            <path d="M23.5 22.4c1.6-.8 3.6-.8 5.2 0" />
            <path d="M34.8 21.4c1.8-1 4-1 5.6 0" />
          </g>
        ) : null}

        {/* Glasses & Eyes */}
        <g className="nashmi-svg__glasses">
          {m === 'celebrating' ? (
            <>
              <circle cx="26.5" cy="27.5" r="4.3" fill="#FFF9ED" stroke="#29183E" strokeWidth="2.3" />
              <circle cx="37.5" cy="27.5" r="4.3" fill="#FFF9ED" stroke="#29183E" strokeWidth="2.3" />
              <path d="M30.8 27.5h2.4" stroke="#29183E" strokeWidth="2.3" strokeLinecap="round" />
              {/* Happy ^^ eyes */}
              <path d="M24.3 28.4c1.1-1.9 3.3-1.9 4.4 0" fill="none" stroke="#29183E" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M35.3 28.4c1.1-1.9 3.3-1.9 4.4 0" fill="none" stroke="#29183E" strokeWidth="2.2" strokeLinecap="round" />
            </>
          ) : m === 'teasing' ? (
            <>
              <circle cx="26.5" cy="27.5" r="4.2" fill="#FFF9ED" stroke="#29183E" strokeWidth="2.3" />
              <circle cx="37.5" cy="27.5" r="4.2" fill="#FFF9ED" stroke="#29183E" strokeWidth="2.3" />
              <path d="M30.7 27.5h2.6" stroke="#29183E" strokeWidth="2.3" strokeLinecap="round" />
              {/* Left eye winks, right eye peeks sideways */}
              <path d="M24.2 27.8c1.2-1.4 3.4-1.4 4.6 0" fill="none" stroke="#29183E" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="38.3" cy="27.5" r="1.8" fill="#29183E" />
            </>
          ) : (
            <>
              <circle cx="26.5" cy="27.5" r={leftEyeR} fill="#FFF9ED" stroke="#29183E" strokeWidth="2.3" />
              <circle cx="37.5" cy="27.5" r={rightEyeR} fill="#FFF9ED" stroke="#29183E" strokeWidth="2.3" />
              <path d="M30.8 27.5h2.4" stroke="#29183E" strokeWidth="2.3" strokeLinecap="round" />
              <g className="nashmi-svg__pupils">
                <circle cx={m === 'thinking' ? '27.8' : '26.5'} cy={m === 'thinking' ? '26.8' : '27.6'} r={pupilR} fill="#29183E" />
                <circle cx={m === 'thinking' ? '38.8' : '37.5'} cy={m === 'thinking' ? '26.8' : '27.6'} r={pupilR} fill="#29183E" />
                <circle cx={m === 'thinking' ? '27.1' : '25.8'} cy="26.7" r=".7" fill="#FFF9ED" />
                <circle cx={m === 'thinking' ? '38.1' : '36.8'} cy="26.7" r=".7" fill="#FFF9ED" />
              </g>
            </>
          )}
        </g>

        {/* Rosy cheeks on hyped/celebrating */}
        {(m === 'hyped' || m === 'celebrating') && (
          <g fill="#FF68A0" opacity=".65">
            <circle cx="21.5" cy="31.5" r="1.8" />
            <circle cx="42.5" cy="31.5" r="1.8" />
          </g>
        )}

        {/* Mouth expressions */}
        {m === 'celebrating' || m === 'hyped' ? (
          <path d="M27.2 32.8c2.2 3.2 7.4 3.2 9.6 0Z" fill="#29183E" stroke="#29183E" strokeWidth="1.5" strokeLinejoin="round" />
        ) : m === 'shocked' ? (
          <ellipse cx="32" cy="34.2" rx="2.5" ry="2.9" fill="#29183E" />
        ) : m === 'tense' ? (
          <path d="M28 34.4c1.3-1.2 2.7 1.2 4 0 1.3-1.2 2.7 1.2 4 0" fill="none" stroke="#29183E" strokeWidth="2.1" strokeLinecap="round" />
        ) : m === 'teasing' ? (
          <path d="M28.2 34.3c2.1 1.4 5.5.8 7.3-1.2" fill="none" stroke="#29183E" strokeWidth="2.2" strokeLinecap="round" />
        ) : m === 'thinking' ? (
          <path d="M29.2 34.2h5.4" fill="none" stroke="#29183E" strokeWidth="2.2" strokeLinecap="round" />
        ) : (
          <path d="M27.6 33.4c2.1 2.2 6.7 2.2 8.8 0" fill="none" stroke="#29183E" strokeWidth="2.3" strokeLinecap="round" />
        )}
      </g>
    </svg>
  );
}

const HOST_MOOD_BADGES: Record<NashmiHostMood, string> = {
  idle: 'نشمي مباشر',
  hyped: 'حماس عالي!',
  thinking: 'بيترقّب…',
  tense: 'آخر 5 ثوانٍ!',
  celebrating: 'احتفال!',
  shocked: 'يا ساتر!',
  teasing: 'ركّزوا!',
};

export function NashmiStageHost({
  session,
  onOpenBot,
  placement = 'stage',
}: {
  session: GameSessionView;
  onOpenBot?: () => void;
  placement?: 'stage' | 'classic';
}) {
  const engineRef = useRef<HostReactionEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new HostReactionEngine();
  }

  const [reaction, setReaction] = useState<HostReaction | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const lastSoundIdRef = useRef<string | null>(null);

  const feedbackAt = session.lastFeedback?.atMs ?? 0;
  const botChatId = session.botChat?.id ?? '';
  const questionId = session.currentQuestion?.id ?? '';
  const bidPhase = session.bidState?.phase ?? '';
  const bidAmount = session.bidState?.currentBid ?? -1;

  useEffect(() => {
    const now = Date.now();
    setNowMs(now);
    const result = engineRef.current!.step(session, { nowMs: now });
    if (result.emitted) {
      setReaction(result.emitted);
      if (lastSoundIdRef.current !== result.emitted.id) {
        lastSoundIdRef.current = result.emitted.id;
        // Avoid stepping on roundStart chord when entering round_intro
        if (result.emitted.kind !== 'round_start') {
          soundFx.hostCue(result.emitted.soundMood);
        }
      }
    }
  }, [
    session.code,
    session.phase,
    session.currentRoundIndex,
    questionId,
    session.timerRemainingSec,
    session.timerRunning,
    session.answerRevealed,
    session.buzzedTeamIndex,
    feedbackAt,
    botChatId,
    bidPhase,
    bidAmount,
    session.teams,
  ]);

  useEffect(() => {
    if (!reaction) return;
    const timeout = setTimeout(() => {
      setNowMs(Date.now());
    }, 4600);
    return () => clearTimeout(timeout);
  }, [reaction?.id]);

  const mood = resolveNashmiVisualMood(session, reaction, nowMs);
  const bubbleFresh = Boolean(reaction && nowMs - reaction.atMs <= 7200);
  const bubbleText =
    mood === 'tense' && !bubbleFresh
      ? `باقي ${session.timerRemainingSec} ثوانٍ بس! أسرعوا يا نشامى!`
      : bubbleFresh && reaction
      ? reaction.text
      : session.settings.botOpponent?.enabled && session.botChat
      ? session.botChat.text
      : null;

  const speakerLabel = session.settings.botOpponent?.enabled
    ? session.settings.botOpponent.personaName || 'نشمي'
    : 'نشمي · المذيع';

  return (
    <aside
      className={`nashmi-stage-host nashmi-stage-host--${mood} nashmi-stage-host--${placement}`}
      data-testid="nashmi-stage-host"
      data-mood={mood}
      aria-live="polite"
    >
      {bubbleText && (
        <div
          className="nashmi-stage-host__bubble"
          data-testid="nashmi-stage-bubble"
          key={reaction?.id ?? `${mood}-${bubbleText}`}
        >
          <span className="nashmi-stage-host__speaker">{speakerLabel}</span>
          <p>{bubbleText}</p>
        </div>
      )}

      {onOpenBot ? (
        <button
          type="button"
          className="nashmi-stage-host__avatar"
          onClick={onOpenBot}
          aria-label="اسأل نشمي المذيع الأردني"
        >
          <NashmiMascot size={62} mood={mood} />
          <span className="nashmi-stage-host__badge">{HOST_MOOD_BADGES[mood]}</span>
        </button>
      ) : (
        <div className="nashmi-stage-host__avatar" aria-label={`نشمي المذيع — ${HOST_MOOD_BADGES[mood]}`}>
          <NashmiMascot size={62} mood={mood} />
          <span className="nashmi-stage-host__badge">{HOST_MOOD_BADGES[mood]}</span>
        </div>
      )}
    </aside>
  );
}

export function TrophyArt() {
  return <svg className="show-trophy" viewBox="0 0 180 150" aria-hidden="true">
    <g stroke="#29183E" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
      <path fill="#FF68A0" d="M30 30H10v12c0 20 14 35 36 35l4-16C33 60 29 47 30 30zm120 0h20v12c0 20-14 35-36 35l-4-16c17-1 21-14 20-31z"/>
      <path fill="#874CF5" d="M53 116h74l10 22H43z"/>
      <path fill="#FFE45A" d="M30 18h120v27c0 31-21 55-52 58v15H82v-15C51 100 30 76 30 45z"/>
      <path fill="#FFF9ED" d="m90 33 8 16 17 3-12 13 3 17-16-8-16 8 3-17-12-13 17-3z" strokeWidth="4"/>
    </g>
  </svg>;
}

