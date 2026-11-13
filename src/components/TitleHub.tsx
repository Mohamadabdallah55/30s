import React, { useEffect, useState } from 'react';
import {
  Bell,
  BookOpenCheck,
  Database,
  MonitorPlay,
  Play,
  RotateCw,
  Shield,
  Sliders,
  Sparkles,
  UserCircle2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ProfilePublic, QuestionBank } from '../shared/types';
import { apiFetch } from '../utils/api';
import { ChallengeLogoEmblem, PlayerAvatar } from './BrandEmblem';

interface ResumableSessionItem {
  code: string;
  title: string;
  phase: string;
  teams: Array<{ name: string; points: number; color: string }>;
  roundIndex: number;
  totalRounds: number;
  updatedAt: string;
  canHostControl: boolean;
}

interface TitleHubProps {
  user: ProfilePublic | null;
  soundEnabled: boolean;
  calmMode: boolean;
  reducedMotion: boolean;
  onToggleSound: () => void;
  onToggleReducedMotion: () => void;
  onStartSetup: () => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onOpenLessonStudio: () => void;
  onOpenAdminBank: () => void;
  onJoinSession: (code: string, mode: 'projector' | 'host' | 'buzzer' | 'arena', teamIdx?: number) => void;
}

export function TitleHub({
  user,
  soundEnabled,
  calmMode,
  reducedMotion,
  onToggleSound,
  onToggleReducedMotion,
  onStartSetup,
  onOpenAuth,
  onOpenProfile,
  onOpenLessonStudio,
  onOpenAdminBank,
  onJoinSession,
}: TitleHubProps) {
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [publishedTotal, setPublishedTotal] = useState<number | null>(null);
  const [resumable, setResumable] = useState<ResumableSessionItem[]>([]);

  useEffect(() => {
    apiFetch<{ banks: QuestionBank[] }>('/api/banks')
      .then((res) => {
        const sum = res.banks.reduce((acc, b) => acc + (b.publishedCount ?? 0), 0);
        setPublishedTotal(sum);
      })
      .catch(() => {});

    apiFetch<{ sessions: ResumableSessionItem[] }>('/api/sessions/resumable')
      .then((res) => setResumable(res.sessions))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onStartSetup();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStartSetup]);

  const handleJoin = (mode: 'projector' | 'host' | 'buzzer') => {
    const clean = joinCode.trim().toUpperCase();
    if (clean.length < 4) {
      setJoinError('أدخل رمز الجلسة المكون من 6 أحرف');
      return;
    }
    setJoinError(null);
    onJoinSession(clean, mode, 0);
  };

  const isStaff = user?.role === 'admin' || user?.role === 'teacher';
  const latestResumable = resumable[0];

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#081235] via-[#0F215E] to-[#07102E] text-slate-50 flex flex-col justify-between">
      {/* Subtle geometric concentric arcs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <svg className="w-full h-full opacity-20" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
          <circle cx="1180" cy="140" r="360" fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeOpacity="0.35" />
          <circle cx="1180" cy="140" r="230" fill="none" stroke="#7C3AED" strokeWidth="1.5" strokeOpacity="0.4" />
          <circle cx="240" cy="760" r="380" fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeOpacity="0.25" />
          <circle cx="240" cy="760" r="240" fill="none" stroke="#F59E0B" strokeWidth="1" strokeOpacity="0.25" />
        </svg>
      </div>

      {/* Top Utility Strip */}
      <div className="relative z-10 max-w-6xl w-full mx-auto flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 pt-5">
        <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-300">
          <span className="font-black text-amber-300">مسجد ابن تيمية</span>
          <span aria-hidden="true">·</span>
          <span>مكتبة الألعاب التعليمية الدائمة</span>
          {publishedTotal !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums text-sky-200 font-bold">{publishedTotal} سؤال معتمد</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'كتم الصوت' : 'تفعيل الصوت'}
            className="h-10 px-3 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-white/10 text-xs font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-sky-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            <span>{soundEnabled ? (calmMode ? 'صوت هادئ' : 'الصوت مفعل') : 'صامت للمسجد'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleReducedMotion}
            aria-label="تبديل تقليل الحركة"
            className={`h-10 px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              reducedMotion
                ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                : 'bg-[#132666] hover:bg-[#1B317A] border-white/10 text-slate-300'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span className="hidden sm:inline">{reducedMotion ? 'حركة مخففة' : 'حركة قياسية'}</span>
          </button>

          {user ? (
            <button
              type="button"
              onClick={onOpenProfile}
              className="h-10 px-3 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-sky-400/30 text-xs font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <PlayerAvatar avatarId={user.avatarId} size="sm" />
              <span>{user.displayName}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <UserCircle2 className="w-4 h-4 text-sky-300" />
              <span>دخول / حساب جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Hero & Live Controls */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-8 py-8">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Hero Showcase Column */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-right space-y-6">
            <ChallengeLogoEmblem size="lg" />

            <div className="space-y-3 max-w-2xl">
              <h1 className="text-3xl sm:text-5xl font-black text-white leading-[1.2] text-balance">
                منصة المسابقات الذكية لحلقات وطلاب وعائلات مسجد ابن تيمية
              </h1>
              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                ١١ نمط تحدٍ تفاعلي بين الفرق والأفراد خلال ٣٠ ثانية، تحكّم لحظي للمشرف وشاشة عرض سينمائية للبروجكتر، مع استوديو تحويل دروس PDF إلى مسابقات موثّقة.
              </p>
            </div>

            {/* Clean Typographic Value Line (No pills) */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-3 gap-y-1 text-xs sm:text-sm text-sky-200 font-bold">
              <span>١١ نوع جولة متجددة</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span>منع تكرار الأسئلة لكل حساب</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span>مزامنة لحظية وجرس هاتف</span>
            </div>

            {/* Up to 3 Primary Action CTAs */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 w-full">
              <button
                type="button"
                data-start="true"
                onClick={onStartSetup}
                className="w-full sm:w-auto min-w-[210px] py-4 px-8 rounded-2xl bg-sky-400 hover:bg-sky-300 active:scale-[0.98] text-slate-950 font-black text-lg inline-flex items-center justify-center gap-3 shadow-lg shadow-sky-500/20 transition-transform whitespace-nowrap shrink-0"
              >
                <Play className="w-6 h-6 fill-current" />
                <span>مباراة جديدة</span>
              </button>

              <button
                type="button"
                onClick={onOpenLessonStudio}
                className="w-full sm:w-auto py-4 px-6 rounded-2xl bg-[#6D28D9] hover:bg-[#7C3AED] text-white font-extrabold text-base inline-flex items-center justify-center gap-2.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-5 h-5 text-amber-300" />
                <span>تحدي الدرس الذكي (PDF)</span>
              </button>

              {latestResumable && (
                <button
                  type="button"
                  onClick={() =>
                    onJoinSession(latestResumable.code, latestResumable.canHostControl ? 'arena' : 'projector')
                  }
                  className="w-full sm:w-auto py-4 px-5 rounded-2xl bg-[#132666] hover:bg-[#1B317A] border border-amber-400/40 text-amber-200 font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCw className="w-4 h-4" />
                  <span>استكمال مباراة ({latestResumable.code})</span>
                </button>
              )}
            </div>

            {!user && (
              <p className="text-xs text-slate-400">
                يمكنك البدء فوراً كضيف، أو{' '}
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="text-sky-300 underline hover:text-sky-200 font-bold"
                >
                  تسجيل الدخول بحساب دائم
                </button>{' '}
                لحفظ نقاطك ومنع تكرار الأسئلة عبر الأجهزة.
              </p>
            )}
          </div>

          {/* Right Column: Multi-Device Connect + Resumable + Account/Bank */}
          <div className="lg:col-span-5 space-y-4">
            {/* Multi-Device Join Card */}
            <div className="rounded-2xl bg-[#101E52]/95 border border-sky-400/25 p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <MonitorPlay className="w-5 h-5 text-sky-400" />
                  <span>ربط الشاشات وجرس الهاتف</span>
                </h2>
                <span className="text-xs text-slate-400">مزامنة فورية</span>
              </div>

              <div className="flex gap-2">
                <label htmlFor="session-join-code" className="sr-only">
                  رمز الجلسة
                </label>
                <input
                  id="session-join-code"
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="أدخل رمز الجلسة (مثال: A7K92P)"
                  maxLength={8}
                  dir="auto"
                  className="flex-1 rounded-xl bg-[#09143A] border border-slate-600 focus:border-sky-400 px-3.5 py-2.5 text-sm font-mono uppercase text-white text-center outline-none"
                />
              </div>
              {joinError && <p className="text-xs text-rose-300">{joinError}</p>}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleJoin('projector')}
                  className="py-2.5 px-3 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-white/10 text-xs font-bold text-white transition-colors whitespace-nowrap"
                >
                  شاشة الجمهور (16:9)
                </button>
                <button
                  type="button"
                  onClick={() => handleJoin('host')}
                  className="py-2.5 px-3 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-amber-400/30 text-xs font-bold text-amber-200 transition-colors whitespace-nowrap"
                >
                  لوحة المشرف والحكم
                </button>
                <button
                  type="button"
                  onClick={() => handleJoin('buzzer')}
                  className="py-2.5 px-3 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-sky-400/30 text-xs font-bold text-sky-200 transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>جرس الهاتف</span>
                </button>
              </div>
            </div>

            {/* Resumable Active Sessions List */}
            {resumable.length > 0 && (
              <div className="rounded-2xl bg-[#101E52]/95 border border-amber-400/25 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-amber-300">مباريات جارية يمكن استكمالها</span>
                  <span className="text-slate-400 tabular-nums">{resumable.length}</span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {resumable.slice(0, 3).map((item) => (
                    <div
                      key={item.code}
                      className="rounded-xl bg-[#09143A] border border-white/10 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">
                          <span className="font-mono text-amber-300 ml-1.5">{item.code}</span>
                          {item.teams.map((t) => `${t.name} (${t.points})`).join(' · ')}
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          الجولة {item.roundIndex + 1}/{item.totalRounds || 1}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onJoinSession(item.code, item.canHostControl ? 'arena' : 'projector')
                        }
                        className="px-3 py-1.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-black whitespace-nowrap shrink-0"
                      >
                        متابعة
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Secondary Functional Hubs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onOpenProfile}
                className="rounded-2xl bg-[#101E52]/95 hover:bg-[#16296D] border border-white/10 p-4 text-right transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between text-sky-300">
                  <BookOpenCheck className="w-5 h-5" />
                  <span className="text-xs text-slate-400">إحصاءات</span>
                </div>
                <div className="font-extrabold text-sm text-white">حسابي والمتصدرون</div>
                <p className="text-xs text-slate-400">سجل الأسئلة، الدقة، والإنجازات</p>
              </button>

              <button
                type="button"
                onClick={isStaff ? onOpenAdminBank : onOpenAuth}
                className="rounded-2xl bg-[#101E52]/95 hover:bg-[#16296D] border border-white/10 p-4 text-right transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between text-amber-300">
                  {isStaff ? <Database className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                  <span className="text-xs text-slate-400">{isStaff ? 'مفعّل' : 'للمشرفين'}</span>
                </div>
                <div className="font-extrabold text-sm text-white">
                  بنك الأسئلة {publishedTotal !== null ? `(${publishedTotal})` : ''}
                </div>
                <p className="text-xs text-slate-400">استيراد JSON/CSV والاعتماد الديني</p>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Clean single-line control hint */}
      <div className="relative z-10 text-center px-4 pb-4 text-xs text-slate-400">
        <span>Enter مباراة جديدة · Space جرس المواجهة · M كتم الصوت · Esc إيقاف مؤقت</span>
      </div>
    </div>
  );
}
