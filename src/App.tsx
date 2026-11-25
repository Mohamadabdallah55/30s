import React, { useCallback, useEffect, useState } from 'react';
import { AdminBank } from './components/AdminBank';
import { AudienceProjector } from './components/AudienceProjector';
import { AuthModal } from './components/AuthModal';
import { GameArena } from './components/GameArena';
import { HostConsole } from './components/HostConsole';
import { JordanianBotDrawer } from './components/JordanianBotDrawer';
import { LessonStudio } from './components/LessonStudio';
import { MatchSetup } from './components/MatchSetup';
import { PlayerProfile } from './components/PlayerProfile';
import { TeamBuzzer } from './components/TeamBuzzer';
import { TitleHub } from './components/TitleHub';
import { JORDANIAN_BOT_DEFAULT_NAME } from './shared/jordanianBot';
import type { GameSessionView, ProfilePublic, RoundType } from './shared/types';
import { apiFetch, getAuthToken, setAuthToken } from './utils/api';
import { soundFx } from './utils/sound';

type AppScreen =
  | 'title'
  | 'setup'
  | 'arena'
  | 'host'
  | 'projector'
  | 'buzzer'
  | 'lesson_studio'
  | 'admin_bank'
  | 'profile';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('title');
  const [historyStack, setHistoryStack] = useState<AppScreen[]>([]);
  const [user, setUser] = useState<ProfilePublic | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<GameSessionView | null>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [setupRound, setSetupRound] = useState<RoundType | undefined>();
  const [studioLessonId, setStudioLessonId] = useState<string | null>(null);
  const [buzzerTeamIndex, setBuzzerTeamIndex] = useState<number>(0);
  const [botDrawerOpen, setBotDrawerOpen] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState(false); // Quiet mosque default
  const [calmMode] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches : false
  );

  const navigateTo = useCallback(
    (next: AppScreen) => {
      setScreen((prev) => {
        if (prev === next) return prev;
        setHistoryStack((stack) => [...stack.slice(-14), prev]);
        try {
          const route = new URL(window.location.href);
          route.search = '';
          if (next !== 'buzzer') route.hash = '';
          window.history.pushState({ appScreen: next }, '', route);
        } catch {
          // Ignore sandbox history restrictions
        }
        return next;
      });
    },
    []
  );

  const goBackOneStep = useCallback(() => {
    setHistoryStack((stack) => {
      const nextStack = [...stack];
      while (nextStack.length > 0) {
        const prev = nextStack.pop()!;
        if (prev === 'arena' && !activeSession) continue;
        if ((prev === 'host' || prev === 'projector' || prev === 'buzzer') && !sessionCode) continue;
        setScreen(prev);
        return nextStack;
      }
      setScreen('title');
      return [];
    });
  }, [activeSession, sessionCode]);

  const goHome = useCallback(() => {
    setHistoryStack([]);
    setScreen('title');
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  // Sync browser/phone hardware Back button with step-by-step navigation
  useEffect(() => {
    const onPopState = () => {
      goBackOneStep();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [goBackOneStep]);

  useEffect(() => {
    if (!sessionCode || !['arena', 'host', 'projector', 'buzzer'].includes(screen)) return;
    const url = new URL(window.location.href);
    if (screen !== 'buzzer') url.hash = '';
    url.search = new URLSearchParams({ mode: screen, code: sessionCode,
      ...(screen === 'buzzer' ? { team: String(buzzerTeamIndex) } : {}) }).toString();
    window.history.replaceState(window.history.state, '', url);
  }, [screen, sessionCode, buzzerTeamIndex]);

  // Sync sound engine state
  useEffect(() => {
    soundFx.enabled = soundEnabled;
    soundFx.calmMode = calmMode;
  }, [soundEnabled, calmMode]);

  // Restore saved token & handle URL parameters (?mode=projector&code=... or ?autostart=1)
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      apiFetch<{ profile: ProfilePublic }>('/api/auth/me')
        .then((res) => setUser(res.profile))
        .catch(() => setAuthToken(null));
    }

    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const code = params.get('code');
    const autostart = params.get('autostart');

    if (mode === 'arena' && code) {
      apiFetch<{ session: GameSessionView }>(`/api/sessions/${encodeURIComponent(code)}?role=host`)
        .then(({ session }) => {
          setActiveSession(session);
          setSessionCode(session.code);
          setScreen(!session.hostSecret ? 'projector' : session.settings.hostControlled ? 'host' : 'arena');
        }).catch(() => { setScreen('title'); });
      return;
    }
    if (mode === 'projector' && code) {
      setSessionCode(code.toUpperCase());
      setScreen('projector');
      return;
    }
    if (mode === 'host' && code) {
      setSessionCode(code.toUpperCase());
      setScreen('host');
      return;
    }
    if (mode === 'buzzer' && code) {
      const teamParam = Number(params.get('team') || '0');
      setSessionCode(code.toUpperCase());
      setBuzzerTeamIndex(Number.isFinite(teamParam) && teamParam >= 0 ? teamParam : 0);
      setScreen('buzzer');
      return;
    }
    if (autostart === '1') {
      apiFetch<{ session: GameSessionView }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          title: 'تحدي الـ30 ثانية — مسجد ابن تيمية',
          bankId: 'bank-import-thirty-seconds-v1',
          ageGroup: 'family',
          difficulty: 'mixed',
          category: 'الكل',
          roundTypes: ['multiple_choice', 'rapid_fire', 'who_am_i', 'buzzer', 'golden'],
          settings: { showMode: true, verbalRapidFireDefault: false },
        }),
      })
        .then((res) => {
          setActiveSession(res.session);
          setSessionCode(res.session.code);
          setScreen('arena');
        })
        .catch(() => {});
    }
  }, []);

  const handleToggleSound = useCallback(() => {
    soundFx.unlock();
    setSoundEnabled((prev) => !prev);
  }, []);

  const handleLogout = () => {
    setAuthToken(null);
    setUser(null);
    goHome();
  };

  const handleJoinSession = async (code: string, mode: 'projector' | 'host' | 'buzzer' | 'arena', teamIdx = 0) => {
    const norm = code.toUpperCase().trim();
    if (mode === 'arena') {
      try {
        const res = await apiFetch<{ session: GameSessionView }>(`/api/sessions/${norm}?role=host`);
        setActiveSession(res.session);
        setSessionCode(norm);
        navigateTo(!res.session.hostSecret ? 'projector' : res.session.settings.hostControlled ? 'host' : 'arena');
      } catch {
        setSessionCode(norm);
        navigateTo('projector');
      }
      return;
    }
    setSessionCode(norm);
    if (mode === 'buzzer') {
      setBuzzerTeamIndex(teamIdx);
    }
    navigateTo(mode);
  };

  const handleSessionCreated = (session: GameSessionView, launchMode: 'arena' | 'host_and_projector') => {
    setActiveSession(session);
    setSessionCode(session.code);
    if (launchMode === 'host_and_projector') {
      navigateTo('projector');
    } else {
      navigateTo('arena');
    }
  };

  const handleQuickPlay = async () => {
    const bankId = 'bank-import-thirty-seconds-v1';
    const availability = await apiFetch<{ byRoundType: Record<string, { unseen: number }> }>(
      '/api/questions/availability?bankId=' + bankId);
    const choices: RoundType[] = ['multiple_choice', 'rapid_fire', 'who_am_i', 'true_false', 'fill_blank'];
    const types = choices.filter((type) => availability.byRoundType[type]?.unseen > 0).slice(0, 3);
    if (!types.length) throw new Error('خلصت الأسئلة الجديدة في بنك التحدي السريع. جرّب بنكًا ثانيًا من الإعداد.');
    const roundOverrides = Object.fromEntries(types.map((type) => [type, {
      questionsPerRound: Math.min(type === 'rapid_fire' ? 5 : 2, availability.byRoundType[type].unseen), durationSec: 30,
    }]));
    const { session } = await apiFetch<{ session: GameSessionView }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'تحدي سريع', bankId, roundTypes: types, roundOverrides,
        settings: { showMode: true, verbalRapidFireDefault: false, soundEnabled, reducedMotion },
      }),
    });
    handleSessionCreated(session, 'arena');
  };

  const handleQuickPlayBot = async () => {
    const choices: RoundType[] = ['multiple_choice', 'rapid_fire', 'who_am_i', 'true_false', 'fill_blank'];
    let bankId = 'bank-import-thirty-seconds-v1';
    let availability = await apiFetch<{ byRoundType: Record<string, { unseen: number }> }>(
      '/api/questions/availability?bankId=' + bankId
    );
    let types = choices.filter((type) => availability.byRoundType[type]?.unseen > 0).slice(0, 3);
    if (!types.length) {
      bankId = 'bank-general-mosque';
      availability = await apiFetch<{ byRoundType: Record<string, { unseen: number }> }>(
        '/api/questions/availability?bankId=' + bankId
      );
      types = choices.filter((type) => availability.byRoundType[type]?.unseen > 0).slice(0, 3);
    }
    if (!types.length) {
      throw new Error('ما ضل أسئلة جديدة متاحة حالياً. جرّب من الإعداد تختار بنك ثاني أو إعادة دورة الأسئلة.');
    }
    const roundOverrides = Object.fromEntries(
      types.map((type) => [
        type,
        {
          questionsPerRound: Math.min(type === 'rapid_fire' ? 4 : 2, availability.byRoundType[type].unseen),
          durationSec: 30,
        },
      ])
    );
    const playerTeamName = user?.displayName ? `فريق ${user.displayName}` : 'فريق النشامى';
    const { session } = await apiFetch<{ session: GameSessionView }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        title: 'تحدّي يزن (البوت الأردني)',
        bankId,
        teams: [
          {
            name: playerTeamName,
            color: '#38BDF8',
            participantIds: user ? [user.id] : [],
            participantNames: user ? [user.displayName] : [],
          },
          {
            name: JORDANIAN_BOT_DEFAULT_NAME,
            color: '#F59E0B',
            participantIds: [],
            participantNames: [],
          },
        ],
        roundTypes: types,
        roundOverrides,
        settings: {
          showMode: true,
          verbalRapidFireDefault: false,
          soundEnabled,
          reducedMotion,
          botOpponent: {
            enabled: true,
            teamIndex: 1,
            skill: 'balanced',
            personaName: JORDANIAN_BOT_DEFAULT_NAME,
          },
        },
      }),
    });
    handleSessionCreated(session, 'arena');
  };

  const handleOpenProjector = (code: string) => {
    window.open(`/?mode=projector&code=${encodeURIComponent(code)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={reducedMotion ? 'reduce-motion' : ''}>
      {screen === 'title' && (
        <TitleHub
          user={user}
          soundEnabled={soundEnabled}
          reducedMotion={reducedMotion}
          onToggleSound={handleToggleSound}
          onToggleReducedMotion={() => setReducedMotion((p) => !p)}
          onStartSetup={(type) => { setSetupRound(type); navigateTo('setup'); }}
          onQuickPlay={handleQuickPlay}
          onQuickPlayBot={handleQuickPlayBot}
          onOpenBot={() => setBotDrawerOpen(true)}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenProfile={() => navigateTo('profile')}
          onOpenLessonStudio={() => navigateTo('lesson_studio')}
          onOpenAdminBank={() => navigateTo('admin_bank')}
          onJoinSession={handleJoinSession}
        />
      )}

      {screen === 'setup' && (
        <MatchSetup
          initialRound={setupRound}
          onOpenLessonStudio={() => navigateTo('lesson_studio')}
          onQuickPlay={handleQuickPlay}
          onOpenBot={() => setBotDrawerOpen(true)}
          soundEnabled={soundEnabled}
          reducedMotion={reducedMotion}
          user={user}
          onBack={goBackOneStep}
          onSessionCreated={handleSessionCreated}
          onOpenAuth={() => setAuthOpen(true)}
        />
      )}

      {screen === 'arena' && activeSession && (
        <GameArena
          initialSession={activeSession}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
          onPlayAgain={() => { setSetupRound(undefined); navigateTo('setup'); }}
          onExit={goBackOneStep}
          onGoHome={goHome}
          onOpenBot={() => setBotDrawerOpen(true)}
          onSessionUpdate={setActiveSession}
          onOpenHostPanel={(code) => {
            setSessionCode(code);
            navigateTo('host');
          }}
        />
      )}

      {screen === 'host' && sessionCode && (
        <HostConsole
          code={sessionCode}
          onBack={goBackOneStep}
          onOpenProjector={handleOpenProjector}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenBot={() => setBotDrawerOpen(true)}
          authProfileId={user?.id}
        />
      )}

      {screen === 'projector' && sessionCode && (
        <AudienceProjector code={sessionCode} onExit={goBackOneStep} onOpenHost={()=>navigateTo('host')} />
      )}

      {screen === 'buzzer' && sessionCode && (
        <TeamBuzzer
          code={sessionCode}
          initialTeamIndex={buzzerTeamIndex}
          onExit={goBackOneStep}
        />
      )}

      {screen === 'lesson_studio' && (
        <LessonStudio
          user={user}
          initialLessonId={studioLessonId}
          onSelectLessonId={setStudioLessonId}
          onBack={goBackOneStep}
          onOpenAuth={() => setAuthOpen(true)}
          onLaunchSession={(session) => {
            setActiveSession(session);
            setSessionCode(session.code);
            navigateTo('projector');
          }}
          onOpenHostPanel={(session) => {
            setActiveSession(session);
            setSessionCode(session.code);
            navigateTo('host');
          }}
          onOpenProjector={(session) => {
            setActiveSession(session);
            setSessionCode(session.code);
            navigateTo('projector');
          }}
        />
      )}

      {screen === 'admin_bank' && (
        <AdminBank
          user={user}
          onBack={goBackOneStep}
          onOpenAuth={() => setAuthOpen(true)}
        />
      )}

      {screen === 'profile' && (
        <PlayerProfile
          user={user}
          onBack={goBackOneStep}
          onOpenAuth={() => setAuthOpen(true)}
          onLogout={handleLogout}
        />
      )}

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={(profile) => setUser(profile)}
      />

      <JordanianBotDrawer
        open={botDrawerOpen}
        onClose={() => setBotDrawerOpen(false)}
        screen={screen}
        activeSession={['arena', 'host', 'projector', 'buzzer'].includes(screen) ? activeSession : null}
        onStartVsBot={handleQuickPlayBot}
      />
    </div>
  );
}
