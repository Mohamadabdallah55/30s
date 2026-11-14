import React, { useCallback, useEffect, useState } from 'react';
import { AdminBank } from './components/AdminBank';
import { AudienceProjector } from './components/AudienceProjector';
import { AuthModal } from './components/AuthModal';
import { GameArena } from './components/GameArena';
import { HostConsole } from './components/HostConsole';
import { LessonStudio } from './components/LessonStudio';
import { MatchSetup } from './components/MatchSetup';
import { PlayerProfile } from './components/PlayerProfile';
import { TeamBuzzer } from './components/TeamBuzzer';
import { TitleHub } from './components/TitleHub';
import type { GameSessionView, ProfilePublic } from './shared/types';
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
  const [studioLessonId, setStudioLessonId] = useState<string | null>(null);
  const [buzzerTeamIndex, setBuzzerTeamIndex] = useState<number>(0);

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
          window.history.pushState({ appScreen: next }, '', window.location.href);
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
  }, []);

  // Sync browser/phone hardware Back button with step-by-step navigation
  useEffect(() => {
    const onPopState = () => {
      goBackOneStep();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [goBackOneStep]);

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
          bankId: 'bank-general-mosque',
          ageGroup: 'family',
          difficulty: 'mixed',
          category: 'الكل',
          roundTypes: ['multiple_choice', 'rapid_fire', 'who_am_i', 'buzzer', 'golden'],
          skipVs: true,
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
        const res = await apiFetch<{ session: GameSessionView }>(`/api/sessions/${norm}?role=player`);
        setActiveSession(res.session);
        setSessionCode(norm);
        navigateTo('arena');
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
      navigateTo('host');
    } else {
      navigateTo('arena');
    }
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
          calmMode={calmMode}
          reducedMotion={reducedMotion}
          onToggleSound={handleToggleSound}
          onToggleReducedMotion={() => setReducedMotion((p) => !p)}
          onStartSetup={() => navigateTo('setup')}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenProfile={() => navigateTo('profile')}
          onOpenLessonStudio={() => navigateTo('lesson_studio')}
          onOpenAdminBank={() => navigateTo('admin_bank')}
          onJoinSession={handleJoinSession}
        />
      )}

      {screen === 'setup' && (
        <MatchSetup
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
          onPlayAgain={() => navigateTo('setup')}
          onExit={goBackOneStep}
          onGoHome={goHome}
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
          authProfileId={user?.id}
        />
      )}

      {screen === 'projector' && sessionCode && (
        <AudienceProjector code={sessionCode} onExit={goBackOneStep} />
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
            navigateTo('host');
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
    </div>
  );
}
