import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowLeft, BookOpen, Database, DoorOpen, Play, RotateCw, Sliders, Swords, UserRound, Volume2, VolumeX, Zap } from 'lucide-react';
import type { ProfilePublic, RoundType } from '../shared/types';
import { ALL_ROUND_TYPES, ROUND_RULES } from '../shared/gameRules';
import { apiFetch } from '../utils/api';
import { NashmiMascot, RoundArt, ShowMark, showRounds } from './ShowArt';

interface ResumableSession {
  code: string;
  title: string;
  hostControlled?: boolean;
}

interface TitleHubProps {
  user: ProfilePublic | null;
  soundEnabled: boolean;
  reducedMotion: boolean;
  onToggleSound: () => void;
  onToggleReducedMotion: () => void;
  onStartSetup: (type?: RoundType) => void;
  onQuickPlay: () => Promise<void>;
  onQuickPlayBot: () => Promise<void>;
  onOpenBot: () => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onOpenLessonStudio: () => void;
  onOpenAdminBank: () => void;
  onJoinSession: (code: string, mode: 'projector' | 'host' | 'buzzer' | 'arena') => void;
}

const featured: RoundType[] = ['rapid_fire', 'bid_challenge', 'who_am_i', 'buzzer', 'memory', 'golden'];
const homeRoundNames: Partial<Record<RoundType, string>> = {
  rapid_fire: 'الرشّاش', bid_challenge: 'مين يزوّد؟', who_am_i: 'من أنا؟',
  buzzer: 'الجرس', memory: 'الذاكرة', golden: 'الذهبية',
};

export function TitleHub({
  user, soundEnabled, reducedMotion, onToggleSound, onToggleReducedMotion, onStartSetup,
  onQuickPlay, onQuickPlayBot, onOpenBot, onOpenAuth, onOpenProfile, onOpenLessonStudio, onOpenAdminBank, onJoinSession,
}: TitleHubProps) {
  const [resumable, setResumable] = useState<ResumableSession[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const joinDialog = useRef<HTMLDialogElement>(null);
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  useEffect(() => {
    let active = true;
    apiFetch<{ sessions: ResumableSession[] }>('/api/sessions/resumable')
      .then(({ sessions }) => { if (active) setResumable(sessions); }).catch(() => {});
    return () => { active = false; };
  }, [user]);

  function join(mode: 'host' | 'projector') {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalized)) {
      setError('اكتب رمز المباراة من 6 أحرف أو أرقام.');
      return;
    }
    joinDialog.current?.close();
    onJoinSession(normalized, mode);
  }

  async function quickPlay() {
    if (busy || botBusy) return;
    setBusy(true);
    setError('');
    try { await onQuickPlay(); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذّر تجهيز المباراة.'); }
    finally { setBusy(false); }
  }

  async function quickPlayBot() {
    if (busy || botBusy) return;
    setBotBusy(true);
    setError('');
    try { await onQuickPlayBot(); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذّر تجهيز مباراة نشمي.'); }
    finally { setBotBusy(false); }
  }

  return (
    <div className="show-home" dir="rtl">
      <header className="show-nav show-wrap">
        <ShowMark />
        <div className="show-nav__tools">
          <a href="https://say-it-u1w6.onrender.com/" className="show-account" aria-label="العودة إلى منصة يمكن هاي" style={{textDecoration:'none',background:'#ffdf55',color:'#25152d',whiteSpace:'nowrap'}}><ArrowLeft size={16}/> <span>كل الألعاب</span></a>
          <button type="button" className="show-nashmi-btn" aria-label="اسأل نشمي — البوت الأردني" onClick={onOpenBot}>
            <NashmiMascot size={26} />
            <span className="hidden sm:inline">اسأل نشمي</span>
          </button>
          <button type="button" className="show-icon-button" aria-pressed={soundEnabled} aria-label={soundEnabled ? 'كتم الصوت' : 'تفعيل الصوت الهادئ'} onClick={onToggleSound}>
            {soundEnabled ? <Volume2 /> : <VolumeX />}
          </button>
          <button type="button" className="show-icon-button" aria-pressed={reducedMotion} aria-label="تقليل الحركة" onClick={onToggleReducedMotion}><Sliders /></button>
          <button type="button" className="show-account" onClick={user ? onOpenProfile : onOpenAuth}><UserRound size={18} />{user?.displayName ?? 'دخول'}</button>
        </div>
      </header>

      <main className="show-wrap">
        <section className="show-hero">
          <div className="show-hero__copy">
            <span className="show-hero__label"><span /> لعبة تحدّيات جماعية</span>
            <h1 aria-label="تحدي الـ30 ثانية">
              <span className="show-hero__challenge">تحدّي الـ</span>
              <span className="show-hero__wordmark"><b dir="ltr">30</b><span>ثانية</span></span>
            </h1>
            <p className="show-hero__tag">يا بتبدع… يا بتتلبّك!</p>
            <div className="show-hero__actions">
              <button type="button" className="show-button show-button--yellow" onClick={() => onStartSetup()}><Play fill="currentColor" size={21} /> يلا نبلّش!</button>
              <button type="button" className="show-button show-button--cream" disabled={busy || botBusy} onClick={quickPlay}><Zap size={20} />{busy ? 'لحظة…' : 'تحدي سريع'}</button>
              <button type="button" className="show-button show-button--pink" disabled={busy || botBusy} onClick={quickPlayBot}><Swords size={20} />{botBusy ? 'نشمي عم يجهز…' : 'تحدّى نشمي (بوت)'}</button>
            </div>
            <div className="show-hero__links">
              <button type="button" onClick={onOpenLessonStudio}><BookOpen size={19} /> تحدي الدرس الذكي</button>
              <button type="button" onClick={() => { setError(''); joinDialog.current?.showModal(); }}><DoorOpen size={19} /> انضم للمباراة</button>
              <button type="button" onClick={onOpenBot}><NashmiMascot size={22} /> اسأل نشمي عن القوانين</button>
            </div>
            {error && !joinDialog.current?.open && <p className="show-error" role="alert">{error}</p>}
          </div>
          <div className="show-hero__art" aria-hidden="true"
            onPointerMove={(event) => {
              if (event.pointerType !== 'mouse' || reducedMotion) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              event.currentTarget.style.setProperty('--tilt', String(((event.clientX - bounds.left) / bounds.width - .5) * 9) + 'deg');
            }}
            onPointerLeave={(event) => event.currentTarget.style.removeProperty('--tilt')}>
            <div className="show-hero__halo" />
            <span className="show-hero__speech">جاهز؟</span>
            <img src="/assets/show/stopwatch.svg" alt="" width={520} height={500} fetchPriority="high" />
            <span className="show-hero__time" dir="ltr">00:30</span>
          </div>
        </section>

        <section className="show-lineup" aria-labelledby="lineup-title">
          <div className="show-lineup__head">
            <h2 id="lineup-title">اختار جوّ الجولة</h2>
            <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
              {expanded ? 'عرض أقل' : 'كل الجولات'} <ArrowDownLeft size={17} />
            </button>
          </div>
          <div className="show-lineup__grid">
            {(expanded ? ALL_ROUND_TYPES : featured).map((type) => (
              <button className="show-round-tile" type="button" key={type} style={{ background: showRounds[type].color }} onClick={() => onStartSetup(type)}>
                <RoundArt type={type} />
                <span>{homeRoundNames[type] ?? ROUND_RULES[type].nameAr}</span>
                <ArrowLeft className="show-round-tile__arrow" size={15} />
              </button>
            ))}
          </div>
        </section>

        {resumable.length > 0 && <section className="show-resume" aria-label="مبارياتك الجارية">
          <h2>كمّل من وين وقفت</h2>
          <div>{resumable.slice(0, 3).map((item) => <button type="button" key={item.code} onClick={() => onJoinSession(item.code, item.hostControlled ? 'host' : 'arena')}>
            <RotateCw size={16} /> <span>{item.title}</span> <bdi>{item.code}</bdi>
          </button>)}</div>
        </section>}
      </main>

      <footer className="show-footer show-wrap"><span>مكتبة ألعاب مسجد ابن تيمية · الأردن</span>
        {isStaff && <button type="button" onClick={onOpenAdminBank}><Database size={16} /> بنك الأسئلة</button>}
      </footer>

      <dialog className="show-dialog" ref={joinDialog} onClose={() => setError('')}>
        <form onSubmit={(event) => { event.preventDefault(); join('projector'); }}>
          <h2>انضم للمباراة</h2>
          <label htmlFor="show-code">رمز المباراة</label>
          <input id="show-code" dir="ltr" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={6} autoComplete="off" autoFocus />
          {error && <p role="alert">{error}</p>}
          <div className="show-dialog__actions">
            <button type="submit" className="show-button show-button--yellow">شاشة الجمهور</button>
            <button type="button" className="show-button show-button--cream" onClick={() => join('host')}>هاتف المشرف</button>
            <button type="button" className="show-link" onClick={() => joinDialog.current?.close()}>إغلاق</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
