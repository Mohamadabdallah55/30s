import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Bell, Pause, Play, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { normalizeChallengeItem } from '../shared/gameRules';
import type { GameSessionView } from '../shared/types';
import { NashmiMascot, ShowMark } from './ShowArt';
import { ChallengeDisplay, ScoreRibbon, ShowIntermission, useShowCountdown } from './ShowPresentation';

type Action = (action: string, payload?: Record<string, unknown>) => Promise<void>;

interface ShowArenaProps {
  session: GameSessionView;
  audio: boolean;
  connected: boolean;
  canControl: boolean;
  busy: boolean;
  error: string;
  onAction: Action;
  onAnswer: (answer: string | number | string[]) => Promise<void>;
  onBuzz: (index: number) => Promise<void>;
  onExit: () => void;
  onReplay: () => void;
  onSound: () => void;
  onHost?: () => void;
  onOpenBot?: () => void;
}

function PlayerInputs({ session, busy, canControl, onAnswer, onAction, onBuzz }: Pick<ShowArenaProps, 'session' | 'busy' | 'canControl' | 'onAnswer' | 'onAction' | 'onBuzz'>) {
  const q = session.currentQuestion!;
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [order, setOrder] = useState(q.options);
  const [duplicate, setDuplicate] = useState(false);
  const ended = session.answerRevealed || session.timerRemainingSec <= 0 || q.memoryPhase === 'memorize' || session.phase === 'paused';
  if (ended || !canControl) return null;

  const type = q.roundType;
  const botCfg = session.settings.botOpponent;
  const botIdx = botCfg?.enabled ? botCfg.teamIndex : -1;
  const isBotsTurn = Boolean(
    botCfg?.enabled &&
      (session.bidState
        ? session.bidState.phase === 'bidding'
          ? session.bidState.turnTeamIndex === botIdx
          : session.bidState.bidderTeamIndex === botIdx
        : type === 'buzzer'
        ? session.buzzedTeamIndex === botIdx
        : session.activeTeamIndex === botIdx)
  );

  if (isBotsTurn) {
    return (
      <div className="nashmi-turn-wait" role="status" aria-live="polite">
        <NashmiMascot size={30} mood="thinking" />
        <span>
          {session.bidState
            ? session.bidState.phase === 'bidding'
              ? 'دور نشمي بالمزايدة… عم يقرّر!'
              : 'دور نشمي بتنفيذ التحدي… راقب إجاباته!'
            : 'دور نشمي… عم بفكّر بالإجابة!'}
        </span>
      </div>
    );
  }

  const active = session.teams[session.buzzedTeamIndex ?? session.activeTeamIndex];
  const button = (label: ReactNode, onClick: () => void, variant = 'cream', disabled = false) =>
    <button type="button" className={`show-button show-button--${variant}`} disabled={busy || disabled} onClick={onClick}>{label}</button>;

  if (session.bidState) {
    const bid = session.bidState;
    const accepted = bid.acceptedAnswers;
    if (bid.phase === 'bidding') return <div className="show-arena__actions">
      {button(`رفع إلى ${bid.currentBid + 1}`, () => onAction('bid_raise', { teamIndex: bid.turnTeamIndex }), 'yellow', bid.currentBid >= bid.maxPossible)}
      {button('بتحدّاك!', () => onAction('bid_challenge'))}
    </div>;
    return <div className="show-arena__answer">
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim() || busy) return;
        void onAction('bid_record_answer', { answerText: text, hostConfirmed: false });
        setText('');
      }}>
        <input aria-label="عنصر المزايدة" placeholder="اكتب عنصرًا" value={text} onChange={(event) => setText(event.target.value)} />
        <button className="show-button show-button--yellow" disabled={busy || !text.trim()}>سجّل</button>
      </form>
      {accepted.filter(Boolean).map((item) => <button type="button" key={item} className="show-link" onClick={() => onAction('bid_remove_answer', { answerText: item })}>{item} ×</button>)}
      {button('احسم التحدّي', () => onAction('bid_complete'))}
    </div>;
  }

  if (type === 'buzzer' && session.buzzedTeamIndex === null) {
    const buzzTeams = botCfg?.enabled ? session.teams.filter((t) => t.index !== botIdx) : session.teams;
    return <div className="show-arena__actions">
      {buzzTeams.map((team) => <button key={team.index} type="button" className="show-button show-button--pink" disabled={busy || session.failedBuzzTeams.includes(team.index)} onClick={() => onBuzz(team.index)}><Bell /> {botCfg?.enabled ? `جرس ${team.name} (اضغط قبل نشمي!)` : team.name}</button>)}
    </div>;
  }

  if (type === 'order_items') {
    function move(index: number, offset: number) {
      const target = index + offset;
      if (target < 0 || target >= order.length) return;
      const next = [...order];
      [next[index], next[target]] = [next[target], next[index]];
      setOrder(next);
    }
    return <div className="show-order-input">
      {order.map((item, index) => <div key={item}><b>{index + 1}</b><span>{item}</span>
        <button type="button" aria-label={`ارفع ${item}`} disabled={index === 0 || busy} onClick={() => move(index, -1)}><ArrowUp size={17} /></button>
        <button type="button" aria-label={`نزّل ${item}`} disabled={index === order.length - 1 || busy} onClick={() => move(index, 1)}><ArrowDown size={17} /></button>
      </div>)}
      {button('ثبّت الترتيب', () => onAnswer(order), 'yellow')}
    </div>;
  }

  if (q.options.length > 0 && ['multiple_choice', 'true_false', 'odd_one_out'].includes(type)) {
    return <div className={`show-answer-options show-answer-options--${type}`}>
      {q.options.map((option, index) => <button key={index} type="button" data-selected={selected === index} disabled={busy}
        onClick={() => { setSelected(index); void onAnswer(index); }}><b>{['أ', 'ب', 'ج', 'د', 'هـ'][index] ?? index + 1}</b>{option}</button>)}
    </div>;
  }

  const collect = type === 'list_multiple' || type === 'memory';
  function addItem(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (!collect) { void onAnswer(value); return; }
    if (items.some((item) => normalizeChallengeItem(item) === normalizeChallengeItem(value))) {
      setDuplicate(true);
      return;
    }
    if (items.length >= 20) return;
    setDuplicate(false);
    setItems([...items, value]);
    setText('');
  }

  return <div className="show-arena__answer">
    {type === 'who_am_i' && q.revealedClues.length < q.cluesCount && button('بدّي تلميح', () => onAction('reveal_next_clue'))}
    <form onSubmit={addItem}>
      <input aria-label="إجابتك" placeholder={collect ? 'اكتب عنصرًا…' : `إجابة ${active?.name ?? 'الفريق'}…`} maxLength={160} value={text} onChange={(event) => { setText(event.target.value); setDuplicate(false); }} />
      <button className="show-button show-button--yellow" disabled={busy || !text.trim()}>{collect ? 'أضف' : 'ثبّت الإجابة'}</button>
    </form>
    {collect && <><div className="show-collected">{items.map((item) =>
      <button type="button" key={item} onClick={() => setItems(items.filter((entry) => entry !== item))}>{item} ×</button>)}</div>
      {duplicate && <p role="status">هاد العنصر انذكر من قبل.</p>}
      {button('سلّم العناصر', () => onAnswer(text.trim() ? [...items, text.trim()] : items), 'cream', !items.length && !text.trim())}</>}
  </div>;
}

export function ShowArena(props: ShowArenaProps) {
  const { session, busy, canControl, onAction } = props;
  const countdown = useShowCountdown(session.countdownEndsAtMs);
  const playing = session.phase === 'playing' || session.phase === 'paused';
  const q = session.currentQuestion;
  const botActive = Boolean(session.settings.botOpponent?.enabled);
  const footer = session.phase === 'vs' ? ['يلا نبلّش!', 'start_match']
    : session.phase === 'round_intro' ? ['ابدأ العدّ', 'round_countdown']
    : session.phase === 'countdown' ? ['تجاوز العدّ', 'skip_intro']
    : session.phase === 'round_summary' ? ['الجولة التالية', 'next_round']
    : session.phase === 'playing' && !session.answerRevealed && session.timerRemainingSec > 0 && q && !session.bidState ? ['تخطّى السؤال', 'next_question']
    : session.phase === 'playing' && (!session.bidState || session.answerRevealed) ? ['كمّل التحدّي', 'next_question'] : null;
  return <div className="show-stage show-arena" dir="rtl" data-phase={session.phase}>
    <header className="show-stage__head"><ShowMark /><span>{props.connected ? 'مباراة مباشرة' : 'عم نرجّع الاتصال…'} <bdi>#{session.code}</bdi></span>
      {props.onOpenBot && (
        <button type="button" className="show-nashmi-btn" aria-label="اسأل نشمي — البوت الأردني" onClick={props.onOpenBot}>
          <NashmiMascot size={24} />
          <span className="hidden sm:inline">نشمي</span>
        </button>
      )}
      <button type="button" className="show-stage__sound" aria-pressed={props.audio} aria-label="صوت اللعبة" onClick={props.onSound}>{props.audio ? <Volume2 /> : <VolumeX />}</button>
      <button type="button" className="show-stage__sound" aria-label="الرجوع" onClick={props.onExit}><ArrowRight /></button>
    </header>
    <main className="show-stage__main">
      {session.phase !== 'vs' && <ScoreRibbon session={session} />}
      {botActive && session.botChat && (
        <div className="nashmi-arena-chat" role="status" aria-live="polite" key={session.botChat.id}>
          <div className="nashmi-arena-chat__lead">
            <NashmiMascot size={32} mood={session.botChat.mood} />
            <div>
              <strong>نشمي:</strong>
              <span>{session.botChat.text}</span>
            </div>
          </div>
        </div>
      )}
      {playing ? <ChallengeDisplay session={session} controls /> : <ShowIntermission session={session} countdown={countdown} />}
      {playing && q && <PlayerInputs key={q.id} {...props} />}
      {playing && session.bidState?.phase !== 'bidding' && !session.answerRevealed && session.timerRemainingSec === 0 && canControl && session.bidState &&
        <button type="button" className="show-button show-button--yellow" disabled={busy} onClick={() => onAction('bid_complete')}>احسم المزايدة</button>}
      {props.error && <p className="show-error" role="alert">{props.error}</p>}
      {canControl && <div className="show-arena__actions">
        {footer && <button type="button" className="show-button show-button--yellow" disabled={busy} onClick={() => onAction(footer[1])}>
          {footer[1] === 'next_question' ? <SkipForward size={18} /> : <Play size={18} />} {footer[0]}</button>}
        {session.phase === 'round_intro' && <button className="show-button show-button--cream" type="button" onClick={() => onAction('skip_intro')} disabled={busy}>تجاوز المقدّمة</button>}
        {playing && q && !session.answerRevealed && session.timerRemainingSec > 0 && session.memoryPhase !== 'memorize' && session.bidState?.phase !== 'bidding' &&
          <button type="button" className="show-button show-button--cream" disabled={busy} onClick={() => onAction(session.timerRunning ? 'pause_timer' : 'resume_timer')}><Pause size={18} /> {session.timerRunning ? 'وقّف الوقت' : 'كمّل الوقت'}</button>}
        {props.onHost && session.phase !== 'finished' && !botActive && <button type="button" className="show-button show-button--cream" onClick={props.onHost}>لوحة الحكم</button>}
        {session.phase === 'finished' && <button type="button" className="show-button show-button--yellow" onClick={props.onReplay}>مباراة جديدة</button>}
      </div>}
    </main>
  </div>;
}
