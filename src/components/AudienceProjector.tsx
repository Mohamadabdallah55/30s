import { ChallengeV2Surface } from './ChallengeV2Surface';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Volume2, VolumeX } from 'lucide-react';
import type { GameSessionView } from '../shared/types';
import { apiFetch, useSessionSocket } from '../utils/api';
import { soundFx } from '../utils/sound';
import { ShowMark } from './ShowArt';
import { ChallengeDisplay, ScoreRibbon, ShowIntermission, useShowCountdown, useShowSound } from './ShowPresentation';
import { AudienceControlQr } from './AudienceControlQr';

export function AudienceProjector({ code, onExit, onOpenHost }: { code: string; onExit: () => void; onOpenHost?: () => void }) {
  const [session, setSession] = useState<GameSessionView | null>(null);
  const [error, setError] = useState('');
  const [soundAllowed, setSoundAllowed] = useState(false);
  const feedback = useRef(0);
  const buzzer = useRef<number | null>(null);
  const { reconnecting } = useSessionSocket(code, 'audience', (next) => {
    setError('');
    setSession(next);
  });

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ session: GameSessionView }>(`/api/sessions/${code}?role=audience`, { signal: controller.signal })
      .then(({ session: state }) => setSession((current) => current?.code === code ? current : state))
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [code]);

  useEffect(() => {
    const previous = { enabled: soundFx.enabled, calmMode: soundFx.calmMode };
    soundFx.enabled = soundAllowed && Boolean(session?.settings.soundEnabled);
    soundFx.calmMode = session?.settings.calmMode ?? true;
    return () => { Object.assign(soundFx, previous); };
  }, [soundAllowed, session?.settings.soundEnabled, session?.settings.calmMode]);

  const countdown = useShowCountdown(session?.countdownEndsAtMs);
  useShowSound(session, countdown);
  useEffect(() => {
    if (!session) return;
    const rt = session.rounds[session.currentRoundIndex]?.roundType;
    if (session.buzzedTeamIndex !== null && buzzer.current !== session.buzzedTeamIndex) soundFx.buzz();
    buzzer.current = session.buzzedTeamIndex;
    const last = session.lastFeedback;
    if (!last || last.atMs === feedback.current) return;
    feedback.current = last.atMs;
    if (Date.now() - last.atMs > 2400) return;
    if (last.type === 'wrong') soundFx.wrong(rt);
    else if (last.type === 'streak') soundFx.combo();
    else if (last.type === 'lead_change') soundFx.lead();
    else if (last.type === 'correct' || last.type === 'golden') soundFx.correct(rt);
  }, [session]);

  if (session?.challengeV2) return <ChallengeV2Surface session={session} role="audience" onExit={onExit} onOpenHost={onOpenHost}/>;

  if (!session) return <div className="show-stage show-stage--loading"><ShowMark /><p role="status">{error || 'لحظة… عم نربط شاشة الجمهور.'}</p>{error && <button className="show-button show-button--cream" onClick={onExit}>الرجوع</button>}</div>;
  const playing = session.phase === 'playing' || session.phase === 'paused';
  const vs = session.phase === 'vs' || session.phase === 'lobby';
  return (
    <div className={`show-stage audience-wide-stage ${session.settings.reducedMotion ? 'reduce-motion' : ''}`} dir="rtl" data-phase={session.phase}>
      <header className="show-stage__head">
        <ShowMark />
        <span>{reconnecting ? 'جارٍ إعادة الاتصال…' : 'شاشة الجمهور'} <bdi>#{code}</bdi></span>
        {session.settings.soundEnabled && <button className="show-stage__sound" type="button" aria-pressed={soundAllowed} aria-label={soundAllowed ? 'كتم العرض' : 'تفعيل صوت العرض'} onClick={() => {
          if (!soundAllowed) soundFx.unlock();
          setSoundAllowed(!soundAllowed);
        }}>{soundAllowed ? <Volume2 /> : <VolumeX />}</button>}
        <button className="show-stage__sound" type="button" aria-label="الرجوع" onClick={onExit}><ArrowRight /></button>
      </header>
      <main className="audience-wide-grid">
        <aside className="audience-wide-rail">
          {!vs && <ScoreRibbon session={session}/>}
          <AudienceControlQr code={code} onOpenHost={onOpenHost}/>
        </aside>
        <div className="audience-wide-content">
          {playing ? <ChallengeDisplay session={session} /> : <ShowIntermission session={session} countdown={countdown} />}
        </div>
      </main>
      {/* The audience question owns the full main area; no floating mascot here. */}
    </div>
  );
}
