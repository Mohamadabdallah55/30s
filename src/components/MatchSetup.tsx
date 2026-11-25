import { ChallengeV2Setup } from './ChallengeV2Setup';
import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Play, Settings2, Sparkles, Users } from 'lucide-react';
import {
  AGE_GROUP_LABELS,
  ALL_ROUND_TYPES,
  buildDefaultRoundConfigs,
  CANONICAL_AGE_GROUPS,
  DIFFICULTY_LABELS,
  DIFFICULTY_LEVEL_LABELS,
  estimateMatchStats,
  levelToDifficulty,
  MATCH_PRESETS,
  ROUND_RULES,
} from '../shared/gameRules';
import type {
  AgeGroup,
  BotSkillLevel,
  Difficulty,
  DifficultyLevel,
  GameSessionView,
  MatchPreset,
  ProfilePublic,
  QuestionBank,
  RoundConfig,
  RoundType,
} from '../shared/types';
import { BOT_SKILL_PROFILES, JORDANIAN_BOT_DEFAULT_NAME } from '../shared/jordanianBot';
import { apiFetch } from '../utils/api';

import { NashmiMascot, RoundArt, ShowMark, showRounds } from './ShowArt';

interface MatchSetupProps {
  user: ProfilePublic | null;
  initialBankId?: string;
  initialRound?: RoundType;
  initialOpponentMode?: 'solo' | 'two_teams' | 'bot';
  soundEnabled: boolean;
  reducedMotion: boolean;
  onQuickPlay: () => Promise<void>;
  onOpenLessonStudio: () => void;
  onOpenBot?: () => void;
  initialLessonId?: string | null;
  onBack: () => void;
  onOpenAuth: () => void;
  onSessionCreated: (session: GameSessionView, launchMode: 'arena' | 'host_and_projector') => void;
}

const VARIETY_BANK_ID = 'bank-import-thirty-seconds-v1';
const ORIGINAL_BANK_ID = 'bank-general-mosque';

const TEAM_COLORS = [
  { label: 'سماوي', value: '#38BDF8' },
  { label: 'ذهبي', value: '#F59E0B' },
  { label: 'زمردي', value: '#10B981' },
  { label: 'بنفسجي', value: '#A78BFA' },
];

const GOLDEN_TARGETS: RoundType[] = [
  'multiple_choice',
  'rapid_fire',
  'buzzer',
  'who_am_i',
  'fill_blank',
  'true_false',
];

export function MatchSetup({
  user,
  initialBankId,
  initialRound,
  initialOpponentMode,
  soundEnabled,
  reducedMotion,
  onQuickPlay,
  onOpenLessonStudio,
  onOpenBot,
  initialLessonId,
  onBack,
  onSessionCreated,
  onOpenAuth,
}: MatchSetupProps) {
  const [engineMode,setEngineMode]=useState<'challenge_v2'|'custom'>(!initialLessonId&&!initialRound&&(!initialOpponentMode||initialOpponentMode==='two_teams')?'challenge_v2':'custom');
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>(initialLessonId ? 'lesson' : 'classic');
  const [bankId, setBankId] = useState(initialBankId ?? VARIETY_BANK_ID);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(user?.ageGroup || 'family');
  const [difficulty, setDifficulty] = useState<Difficulty | 'mixed'>('mixed');
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyLevel>(3);
  const [adaptiveDifficulty, setAdaptiveDifficulty] = useState(false);

  const [opponentMode, setOpponentMode] = useState<'solo' | 'two_teams' | 'bot'>(initialOpponentMode ?? 'two_teams');
  const [botSkill, setBotSkill] = useState<BotSkillLevel>('balanced');
  const teamCount: 1 | 2 = opponentMode === 'solo' ? 1 : 2;
  const isVsBot = opponentMode === 'bot';
  const [team1Name, setTeam1Name] = useState(user ? `فريق ${user.displayName}` : 'فريق الأنصار');
  const [team1Color, setTeam1Color] = useState('#38BDF8');
  const [team2Name, setTeam2Name] = useState('فريق المهاجرين');
  const [team2Color, setTeam2Color] = useState('#F59E0B');

  const [selectedRounds, setSelectedRounds] = useState<RoundType[]>(initialRound ? [initialRound] : [
    'rapid_fire',
    'buzzer',
  ]);
  const [goldenTargetType, setGoldenTargetType] = useState<RoundType>('multiple_choice');
  const [basePoints, setBasePoints] = useState<number | undefined>();
  const [questionLimit, setQuestionLimit] = useState<number | undefined>(3);
  const [timerSec, setTimerSec] = useState(30);
  const [verbalRapidFireDefault, setVerbalRapidFireDefault] = useState(initialOpponentMode !== 'bot');
  const [buzzerWrongRule, setBuzzerWrongRule] = useState<'pass_to_other' | 'penalty_and_pass'>('pass_to_other');
  const [launchMode, setLaunchMode] = useState<'arena' | 'host_and_projector'>(
    initialOpponentMode === 'bot' ? 'arena' : 'host_and_projector'
  );

  const varietyBank = banks.find((bank) => bank.id === VARIETY_BANK_ID && (bank.publishedCount ?? 0) > 0);
  const activeBank = banks.find((bank) => bank.id === bankId);
  const defaultBankId = initialBankId ?? varietyBank?.id ?? ORIGINAL_BANK_ID;
  const importedBank = bankId.startsWith('bank-import-');
  const [availability, setAvailability] = useState<{
    totalPublishedInFilter: number;
    unseenInFilter: number;
    byRoundType: Record<string, { total: number; unseen: number }>;
    byCategory?: Record<string, { total: number; unseen: number }>;
  } | null>(null);

  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    apiFetch<{ banks: QuestionBank[] }>('/api/banks')
      .then(({ banks: loadedBanks }) => {
        if (!current) return;
        setBanks(loadedBanks);
        const selected = initialBankId ?? (loadedBanks.some((bank) => bank.id === VARIETY_BANK_ID && (bank.publishedCount ?? 0) > 0)
          ? VARIETY_BANK_ID : ORIGINAL_BANK_ID);
        setBankId(selected);
      })
      .catch(() => {});
    return () => { current = false; };
  }, [initialBankId]);

  useEffect(() => {
    const qs = new URLSearchParams({
      bankId,
      ageGroup: String(ageGroup),
      difficulty: adaptiveDifficulty ? 'mixed' : String(difficulty),
      category: selectedCategories.length === 1 ? selectedCategories[0] : 'الكل',
    });
    if (selectedCategories.length > 0) {
      qs.set('categories', selectedCategories.join(','));
    }
    let current = true;
    setAvailability(null);
    apiFetch<{
      totalPublishedInFilter: number;
      unseenInFilter: number;
      byRoundType: Record<string, { total: number; unseen: number }>;
      byCategory?: Record<string, { total: number; unseen: number }>;
    }>(`/api/questions/availability?${qs.toString()}`)
      .then((res) => {
        if (!current) return;
        setAvailability(res);
        if (selectedCategories.length === 0) setCategoryOptions(Object.keys(res.byCategory ?? {}));
        if (importedBank) {
          setSelectedRounds((previous) => {
            const viable = previous.filter((type) => (res.byRoundType[type === 'golden' ? goldenTargetType : type]?.unseen ?? 0) > 0);
            return viable;
          });
        }
      })
      .catch(() => {});
    return () => { current = false; };
  }, [bankId, ageGroup, difficulty, adaptiveDifficulty, selectedCategories, user?.id, importedBank, goldenTargetType]);

  const applyPreset = (preset: MatchPreset) => {
    setActivePresetId(preset.id);
    if (!isVsBot) {
      setOpponentMode(preset.teamCount === 1 ? 'solo' : 'two_teams');
    }
    setAgeGroup(preset.ageGroup);
    setDifficulty(preset.difficulty);
    setDifficultyLevel(preset.difficultyLevel);
    setTimerSec(preset.timerSec);
    setSelectedRounds(preset.roundTypes);
    if (preset.sourcePreference === 'lesson') {
      setSelectedCategories([]);
      const lessonBank = banks.find((b) => b.sourceType === 'lesson' && (b.publishedCount ?? 0) > 0);
      if (lessonBank) setBankId(lessonBank.id);
    } else if (preset.id !== 'custom') {
      setBankId(defaultBankId);
      setSelectedCategories([]);
    }
  };

  const handleSelectTeamColor = (teamIdx: 1 | 2, nextColor: string) => {
    if (teamIdx === 1) {
      if (teamCount === 2 && nextColor === team2Color) {
        setTeam2Color(team1Color);
      }
      setTeam1Color(nextColor);
    } else {
      if (nextColor === team1Color) {
        setTeam1Color(team2Color);
      }
      setTeam2Color(nextColor);
    }
  };

  const toggleRound = (rt: RoundType) => {
    setActivePresetId('custom');
    setSelectedRounds((prev) => {
      if (prev.includes(rt)) {
        return prev.filter((r) => r !== rt);
      }
      return [...prev, rt];
    });
  };

  const colorConflict = teamCount === 2 && team1Color === team2Color;

  const countsRemaining = new Map<RoundType, number>();
  const selectableRounds = ALL_ROUND_TYPES.filter((type) => {
    if (!availability) return true;
    return (availability.byRoundType[type === 'golden' ? goldenTargetType : type]?.unseen ?? 0) > 0;
  });
  const previewRoundConfigs = buildDefaultRoundConfigs(selectedRounds, {
    ...Object.fromEntries(selectedRounds.map((type) => [type, { basePoints, questionsPerRound: questionLimit, ...(type === 'golden' ? { goldenTargetType } : {}) }])),
  }).map((round) => {
    const type = round.goldenTargetType ?? round.roundType;
    const requested = round.questionsPerRound;
    const available = countsRemaining.get(type) ?? availability?.byRoundType[type]?.unseen ?? requested;
    const limit = Math.min(available, requested);
    countsRemaining.set(type, available - limit);
    return { ...round, durationSec: timerSec, questionsPerRound: limit };
  });
  const matchEstimate = estimateMatchStats(previewRoundConfigs);
  const reducedCount = previewRoundConfigs.some((round) => round.questionsPerRound < (questionLimit ?? ROUND_RULES[round.roundType].questionsPerRound));
  const unavailableRound = previewRoundConfigs.find((round) => round.questionsPerRound === 0);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVsBot && launchMode === 'host_and_projector' && !user) {
      onOpenAuth();
      return;
    }
    if (!availability || !selectedRounds.length || unavailableRound) {
      setError(unavailableRound ? `ما ضلّ أسئلة جديدة لـ «${unavailableRound.titleAr}» مع هالاختيار. غيّر الجولة أو قلّل العدد.` : 'اختار جولة فيها أسئلة متاحة.');
      return;
    }
    if (colorConflict) {
      setError('اختر لونين مختلفين للفريقين لتجنب التباس العرض.');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const teams = [
        {
          name: team1Name.trim() || 'الفريق الأول',
          color: team1Color,
          participantIds: user ? [user.id] : [],
          participantNames: user ? [user.displayName] : [],
        },
        ...(teamCount === 2
          ? [
              {
                name: isVsBot ? JORDANIAN_BOT_DEFAULT_NAME : team2Name.trim() || 'الفريق الثاني',
                color: team2Color,
                participantIds: [],
                participantNames: [],
              },
            ]
          : []),
      ];

      const roundOverrides: Partial<Record<RoundType, Partial<RoundConfig>>> = {};
      for (const rt of selectedRounds) {
        roundOverrides[rt] = {
          durationSec: timerSec,
          basePoints,
          questionsPerRound: questionLimit,
          ...(rt === 'golden' ? { goldenTargetType } : {}),
        };
      }

      const effectiveLaunchMode = isVsBot ? 'arena' : launchMode;
      const res = await apiFetch<{ session: GameSessionView }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          title: isVsBot ? 'تحدّي يزن (البوت الأردني)' : 'تحدي الـ30 ثانية — مسجد ابن تيمية',
          bankId,
          lessonId: initialLessonId ?? null,
          ageGroup,
          difficulty,
          category: selectedCategories.length === 1 ? selectedCategories[0] : 'الكل',
          categories: selectedCategories,
          teams,
          roundTypes: selectedRounds,
          roundOverrides,
          settings: {
            engineMode: initialLessonId?'educational':'custom',
            showMode: true,
            soundEnabled,
            reducedMotion,
            hostControlled: effectiveLaunchMode === 'host_and_projector',
            defaultTimerSec: timerSec,
            verbalRapidFireDefault: isVsBot ? false : verbalRapidFireDefault,
            buzzerWrongRule,
            adaptiveDifficulty,
            targetDifficultyLevel: difficultyLevel,
            ...(isVsBot
              ? {
                  botOpponent: {
                    enabled: true,
                    teamIndex: 1,
                    skill: botSkill,
                    personaName: JORDANIAN_BOT_DEFAULT_NAME,
                  },
                }
              : {}),
          },
        }),
      });
      onSessionCreated(res.session, effectiveLaunchMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر بدء المسابقة');
    } finally {
      setCreating(false);
    }
  };

  if(engineMode==='challenge_v2') return <ChallengeV2Setup banks={banks} user={user} soundEnabled={soundEnabled} reducedMotion={reducedMotion} onBack={onBack} onCustom={()=>setEngineMode('custom')} onLesson={onOpenLessonStudio} onOpenAuth={onOpenAuth} onSessionCreated={onSessionCreated}/>;

  const field = "block w-full min-w-0 rounded-xl border-2 border-[#29183e] bg-[#fff9ed] px-3 py-2.5 text-[#29183e] font-bold";
  const primaryRounds: RoundType[] = ['rapid_fire','list_multiple','bid_challenge','buzzer','who_am_i','multiple_choice'];
  const additionalRounds = ALL_ROUND_TYPES.filter(type=>!primaryRounds.includes(type));
  const roundCard = (type: RoundType) => {
    const chosen = selectedRounds.includes(type);
    const available = availability?.byRoundType[type === 'golden' ? goldenTargetType : type]?.unseen;
    return <button key={type} type="button" aria-pressed={chosen} disabled={available===0&&!chosen} onClick={()=>toggleRound(type)}
      className={`custom-setup-round ${chosen?'custom-setup-round--selected':''}`}>
      <RoundArt type={type}/><span>{type==='bid_challenge'?'المزاد':type==='buzzer'?'الجرس':ROUND_RULES[type].nameAr}</span>
      {chosen&&<Check size={18} aria-hidden="true"/>}{available===0&&<small>غير متاح</small>}
    </button>;
  };
  return <div className="show-setup custom-setup" dir="rtl">
    <main className="custom-setup-shell">
      <header className="custom-setup-header"><ShowMark/><button type="button" className="show-button show-button--cream" onClick={onBack}><ArrowRight size={18}/> رجوع</button></header>
      <div className="custom-setup-title"><h1>تحدّي مخصص</h1><p>اختار الفريقين والجولات، وابدأ من نفس الشاشة.</p></div>
      <nav className="custom-setup-tabs"><button type="button" className="show-button show-button--cream" onClick={()=>setEngineMode('challenge_v2')}>المباراة الرسمية</button><button type="button" className="show-button show-button--cream" onClick={onOpenLessonStudio}>الدرس الذكي</button></nav>
      <form onSubmit={handleStart} className="custom-setup-form">
        <section className="custom-setup-panel">
          <h2>الفرق</h2>
          <div className="custom-setup-pair"><label>الفريق الأول<input className={field} value={team1Name} maxLength={48} onChange={e=>setTeam1Name(e.target.value)}/></label>
          {teamCount===2&&!isVsBot&&<label>الفريق الثاني<input className={field} value={team2Name} maxLength={48} onChange={e=>setTeam2Name(e.target.value)}/></label>}
          {isVsBot&&<label>الخصم<div className={field}>{JORDANIAN_BOT_DEFAULT_NAME}</div></label>}</div>
          <label className="mt-3 block">موضوع الأسئلة<select className={field} value={selectedCategories[0]??''} onChange={e=>setSelectedCategories(e.target.value?[e.target.value]:[])}><option value="">كل المواضيع</option>{[...new Set([...categoryOptions,...selectedCategories])].map(c=><option key={c} value={c}>{c}</option>)}</select></label>
        </section>
        <section className="custom-setup-panel">
          <div className="custom-setup-heading"><h2>الجولات</h2><span>{selectedRounds.length} مختارة</span></div>
          <div className="custom-setup-rounds">{primaryRounds.map(roundCard)}</div>
          <details className="custom-setup-more"><summary>أنواع أخرى</summary><div className="custom-setup-rounds">{additionalRounds.map(roundCard)}</div></details>
          {selectedRounds.includes('golden')&&<label className="block">نوع الجولة الذهبية<select className={field} value={goldenTargetType} onChange={e=>setGoldenTargetType(e.target.value as RoundType)}>{GOLDEN_TARGETS.map(t=><option key={t} value={t}>{ROUND_RULES[t].nameAr}</option>)}</select></label>}
        </section>
        <section className="custom-setup-panel">
          <h2>عدد الأسئلة والوقت</h2>
          <div className="custom-setup-pair"><label>أسئلة لكل جولة<select className={field} value={questionLimit??3} onChange={e=>setQuestionLimit(Number(e.target.value))}>{[1,2,3,5,8].map(n=><option key={n} value={n}>{n} {n===1?'سؤال':'أسئلة'}</option>)}</select></label>
          <label>الوقت<select className={field} value={timerSec} onChange={e=>setTimerSec(Number(e.target.value))}>{[20,30,45,60].map(n=><option key={n} value={n}>{n} ثانية</option>)}</select></label></div>
          <details className="custom-setup-more"><summary>إعدادات إضافية (اختيارية)</summary>
            <div className="custom-setup-pair">
              <label>طريقة اللعب<select className={field} value={opponentMode} onChange={e=>setOpponentMode(e.target.value as typeof opponentMode)}><option value="two_teams">فريقان</option><option value="solo">فردي</option><option value="bot">ضد يزن</option></select></label>
              <label>الصعوبة<select className={field} value={difficulty} onChange={e=>setDifficulty(e.target.value as Difficulty|'mixed')}><option value="mixed">متنوعة</option>{(['easy','medium','hard'] as const).map(d=><option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}</select></label>
              <label>بنك الأسئلة<select className={field} value={bankId} onChange={e=>{setBankId(e.target.value);setSelectedCategories([]);setCategoryOptions([]);}}>{banks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
              <label>الفئة العمرية<select className={field} value={ageGroup} onChange={e=>setAgeGroup(e.target.value as AgeGroup)}>{CANONICAL_AGE_GROUPS.map(a=><option key={a} value={a}>{AGE_GROUP_LABELS[a]}</option>)}</select></label>
              <label>النقاط<select className={field} value={basePoints??''} onChange={e=>setBasePoints(e.target.value?Number(e.target.value):undefined)}><option value="">حسب الجولة</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
              {!isVsBot&&<label>التحكيم<select className={field} value={launchMode} onChange={e=>setLaunchMode(e.target.value as typeof launchMode)}><option value="host_and_projector">شفهي (كشف وصح أو غلط)</option><option value="arena">إجابات تفاعلية</option></select></label>}
              {isVsBot&&<label>مستوى يزن<select className={field} value={botSkill} onChange={e=>setBotSkill(e.target.value as BotSkillLevel)}>{(['relaxed','balanced','fierce'] as const).map(skill=><option key={skill} value={skill}>{skill==='relaxed'?'سهل':skill==='balanced'?'متوسط':'صعب'}</option>)}</select></label>}
              <label>خطأ الجرس<select className={field} value={buzzerWrongRule} onChange={e=>setBuzzerWrongRule(e.target.value as typeof buzzerWrongRule)}><option value="pass_to_other">تنتقل الفرصة</option><option value="penalty_and_pass">خصم نقطة وانتقال الفرصة</option></select></label>
            </div>
          </details>
        </section>
        <div className="custom-setup-start">
          <div><strong>{selectedRounds.length} جولات · {matchEstimate.requiredQuestions} سؤال مخطط</strong><small>{availability?'العدد حسب الأسئلة الجديدة المتاحة':'نتحقق من توفر الأسئلة…'}{reducedCount&&availability?' · خُفّض العدد ليتناسب مع البنك':''}</small></div>
          {error&&<p role="alert" className="text-rose-200">{error}</p>}
          {unavailableRound&&availability&&<p role="alert" className="text-amber-200">لا توجد أسئلة جديدة تكفي لجولة {unavailableRound.titleAr}.</p>}
          <button className="show-button show-button--yellow" type="submit" disabled={creating||!availability||!selectedRounds.length||Boolean(unavailableRound)||colorConflict}><Play size={20}/>{creating?'جارٍ التجهيز…':'ابدأ اللعب'}</button>
        </div>
      </form>
    </main>
  </div>;
}
