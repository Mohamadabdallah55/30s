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
  Difficulty,
  DifficultyLevel,
  GameSessionView,
  MatchPreset,
  ProfilePublic,
  QuestionBank,
  RoundConfig,
  RoundType,
} from '../shared/types';
import { apiFetch } from '../utils/api';

import { RoundArt, ShowMark, showRounds } from './ShowArt';

interface MatchSetupProps {
  user: ProfilePublic | null;
  initialBankId?: string;
  initialRound?: RoundType;
  soundEnabled: boolean;
  reducedMotion: boolean;
  onQuickPlay: () => Promise<void>;
  onOpenLessonStudio: () => void;
  initialLessonId?: string | null;
  onBack: () => void;
  onOpenAuth: () => void;
  onSessionCreated: (session: GameSessionView, launchMode: 'arena' | 'host_and_projector') => void;
}

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
  initialRound, soundEnabled, reducedMotion, onQuickPlay, onOpenLessonStudio,
  initialLessonId,
  onBack,
  onSessionCreated,
  onOpenAuth,
}: MatchSetupProps) {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>(initialLessonId ? 'lesson' : 'classic');
  const [bankId, setBankId] = useState(initialBankId || 'bank-general-mosque');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(user?.ageGroup || 'family');
  const [difficulty, setDifficulty] = useState<Difficulty | 'mixed'>('mixed');
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyLevel>(3);
  const [adaptiveDifficulty, setAdaptiveDifficulty] = useState(false);

  const [teamCount, setTeamCount] = useState<1 | 2>(2);
  const [team1Name, setTeam1Name] = useState(user ? `فريق ${user.displayName}` : 'فريق الأنصار');
  const [team1Color, setTeam1Color] = useState('#38BDF8');
  const [team2Name, setTeam2Name] = useState('فريق المهاجرين');
  const [team2Color, setTeam2Color] = useState('#F59E0B');

  const [selectedRounds, setSelectedRounds] = useState<RoundType[]>(initialRound ? [initialRound] : [
    'rapid_fire',
    'multiple_choice',
    'who_am_i',
    'buzzer',
    'golden',
  ]);
  const [goldenTargetType, setGoldenTargetType] = useState<RoundType>('multiple_choice');
  const [basePoints, setBasePoints] = useState<number | undefined>();
  const [questionLimit, setQuestionLimit] = useState<number | undefined>();
  const [timerSec, setTimerSec] = useState(30);
  const [verbalRapidFireDefault, setVerbalRapidFireDefault] = useState(true);
  const [buzzerWrongRule, setBuzzerWrongRule] = useState<'pass_to_other' | 'penalty_and_pass'>('pass_to_other');
  const [launchMode, setLaunchMode] = useState<'arena' | 'host_and_projector'>('host_and_projector');

  const importedBank = bankId.startsWith('bank-import-');
  const [availability, setAvailability] = useState<{
    totalPublishedInFilter: number;
    unseenInFilter: number;
    byRoundType: Record<string, { total: number; unseen: number }>;
    byCategory?: Record<string, { total: number; unseen: number }>;
  } | null>(null);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ banks: QuestionBank[]; categories: string[] }>('/api/banks')
      .then((res) => {
        setBanks(res.banks);
        setCategories(res.categories);
        if (initialBankId) setBankId(initialBankId);
      })
      .catch(() => {});
  }, [initialBankId]);

  useEffect(() => {
    if (importedBank) setSelectedRounds([]);
  }, [bankId, importedBank]);

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
        if (importedBank) {
          setSelectedRounds((previous) => {
            const viable = previous.filter((type) => type !== 'golden' && res.byRoundType[type]?.unseen > 0);
            return viable.length ? viable : ALL_ROUND_TYPES.filter((type) => type !== 'golden' && res.byRoundType[type]?.unseen > 0);
          });
        }
      })
      .catch(() => {});
    return () => { current = false; };
  }, [bankId, ageGroup, difficulty, adaptiveDifficulty, selectedCategories, user?.id, importedBank]);

  const applyPreset = (preset: MatchPreset) => {
    setActivePresetId(preset.id);
    setTeamCount(preset.teamCount);
    setAgeGroup(preset.ageGroup);
    setDifficulty(preset.difficulty);
    setDifficultyLevel(preset.difficultyLevel);
    setTimerSec(preset.timerSec);
    setSelectedRounds(preset.roundTypes);
    if (preset.sourcePreference === 'lesson') {
      const lessonBank = banks.find((b) => b.sourceType === 'lesson' && (b.publishedCount ?? 0) > 0);
      if (lessonBank) setBankId(lessonBank.id);
    } else if (preset.id !== 'custom') {
      setBankId(initialBankId || 'bank-general-mosque');
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
        return prev.length > 1 ? prev.filter((r) => r !== rt) : prev;
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
    if (launchMode === 'host_and_projector' && !user) {
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
                name: team2Name.trim() || 'الفريق الثاني',
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

      const res = await apiFetch<{ session: GameSessionView }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          title: 'تحدي الـ30 ثانية — مسجد ابن تيمية',
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
            showMode: true,
            soundEnabled, reducedMotion,
            hostControlled: launchMode === 'host_and_projector',
            defaultTimerSec: timerSec,
            verbalRapidFireDefault,
            buzzerWrongRule,
            adaptiveDifficulty,
            targetDifficultyLevel: difficultyLevel,
          },
        }),
      });
      onSessionCreated(res.session, launchMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر بدء المسابقة');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="show-setup min-h-screen text-slate-50 p-4 sm:p-8">
      <form onSubmit={handleStart} className="max-w-6xl mx-auto space-y-6">
        <div className="show-setup__top">
          <button type="button" className="show-button show-button--cream" onClick={onBack}><ArrowRight size={18} /> عالصفحة الرئيسية</button>
          <ShowMark />
        </div>
        <div className="show-setup__hero">
          <div><h1>جهّز التحدّي</h1><p>اختار الفرق والجولات، وخلّي الحماس يبلّش.</p></div>
          <img src="/assets/show/stopwatch.svg" alt="" width="124" height="118" />
        </div>
        <nav className="show-setup__routes" aria-label="مسارات اللعب">
          <button type="button" disabled={creating} onClick={async () => {
            setCreating(true);
            try { await onQuickPlay(); } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر تجهيز المباراة.'); }
            finally { setCreating(false); }
          }}><RoundArt type="rapid_fire" /> سريع</button>
          <a href="#custom-show"><RoundArt type="multiple_choice" /> مخصص</a>
          <button type="button" onClick={onOpenLessonStudio}><RoundArt type="memory" /> تحدي الدرس</button>
        </nav>

        {/* 6 One-Click Presets */}
        <section aria-label="قوالب المباريات السريعة" className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-extrabold text-sky-300">
            <Sparkles className="w-4 h-4" />
            <span>قوالب الإعداد السريع (اختيار بنقرة واحدة)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {MATCH_PRESETS.map((preset) => {
              const active = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`rounded-2xl border p-3.5 text-right transition-colors ${
                    active
                      ? 'bg-sky-500/20 border-sky-400 text-white'
                      : 'bg-[#101E52] border-white/10 text-slate-200 hover:border-sky-400/40'
                  }`}
                >
                  <div className="font-black text-sm flex items-center justify-between gap-2">
                    <span>{preset.titleAr}</span>
                    <span className="text-[11px] font-mono text-sky-300 tabular-nums">
                      {preset.roundTypes.length} جولات · {preset.timerSec}ث
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{preset.subtitleAr}</p>
                </button>
              );
            })}
          </div>
        </section>

        {error && (
          <div className="rounded-xl bg-rose-500/20 border border-rose-400/40 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <div id="custom-show" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Steps 1 to 5: Teams, Age, Difficulty, Bank */}
          <div className="lg:col-span-5 space-y-5">
            {/* Step 1 & 2: Mode, Names & Distinct Colors */}
            <div className="rounded-2xl bg-[#101E52] border border-sky-400/20 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-sky-400" />
                  <span>الفرق والألوان</span>
                </h2>
                <div className="flex gap-1 p-1 rounded-lg bg-[#09143A]">
                  <button
                    type="button"
                    onClick={() => setTeamCount(1)}
                    className={`px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap ${
                      teamCount === 1 ? 'bg-sky-400 text-slate-950' : 'text-slate-300'
                    }`}
                  >
                    فردي
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeamCount(2)}
                    className={`px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap ${
                      teamCount === 2 ? 'bg-sky-400 text-slate-950' : 'text-slate-300'
                    }`}
                  >
                    فريقان (VS)
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="team1-name" className="block text-xs font-bold text-slate-300 mb-1">
                    اسم الفريق الأول
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="team1-name"
                      type="text"
                      value={team1Name}
                      onChange={(e) => setTeam1Name(e.target.value)}
                      className="flex-1 rounded-xl bg-[#09143A] border border-slate-600 focus:border-sky-400 px-3 py-2.5 text-sm text-white outline-none"
                    />
                    <div className="flex items-center gap-1">
                      {TEAM_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => handleSelectTeamColor(1, c.value)}
                          aria-label={`لون الفريق الأول ${c.label}`}
                          className={`w-7 h-7 rounded-lg border-2 ${
                            team1Color === c.value ? 'border-white scale-110' : 'border-transparent opacity-60'
                          }`}
                          style={{ backgroundColor: c.value }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {teamCount === 2 && (
                  <div>
                    <label htmlFor="team2-name" className="block text-xs font-bold text-slate-300 mb-1">
                      اسم الفريق الثاني
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="team2-name"
                        type="text"
                        value={team2Name}
                        onChange={(e) => setTeam2Name(e.target.value)}
                        className="flex-1 rounded-xl bg-[#09143A] border border-slate-600 focus:border-sky-400 px-3 py-2.5 text-sm text-white outline-none"
                      />
                      <div className="flex items-center gap-1">
                        {TEAM_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => handleSelectTeamColor(2, c.value)}
                            aria-label={`لون الفريق الثاني ${c.label}`}
                            className={`w-7 h-7 rounded-lg border-2 ${
                              team2Color === c.value ? 'border-white scale-110' : 'border-transparent opacity-60'
                            }`}
                            style={{ backgroundColor: c.value }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {colorConflict && (
                  <p className="text-xs text-rose-300 font-bold">
                    تنبيه: لون الفريقين متطابق — اختر لوناً مميزاً لكل فريق.
                  </p>
                )}
              </div>
            </div>

            {/* Steps 3-5: Age Group, Difficulty Level & Bank */}
            <div className="rounded-2xl bg-[#101E52] border border-sky-400/20 p-5 space-y-4">
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-amber-400" />
                <span>3-5. الفئة العمرية، الصعوبة، وبنك الأسئلة</span>
              </h2>

              <div>
                <label htmlFor="setup-age" className="block text-xs font-bold text-slate-300 mb-1">
                  3. الفئة العمرية (5 مستويات معتمدة)
                </label>
                <select
                  id="setup-age"
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
                  className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-3 py-2.5 text-sm text-white outline-none"
                >
                  {CANONICAL_AGE_GROUPS.map((ag) => (
                    <option key={ag} value={ag}>
                      {AGE_GROUP_LABELS[ag]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="setup-diff" className="block text-xs font-bold text-slate-300 mb-1">
                    4. الصعوبة العامة
                  </label>
                  <select
                    id="setup-diff"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as Difficulty | 'mixed')}
                    className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-3 py-2.5 text-sm text-white outline-none"
                  >
                    <option value="mixed">متدرج (الكل)</option>
                    {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
                      <option key={d} value={d}>
                        {DIFFICULTY_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="setup-level" className="block text-xs font-bold text-slate-300 mb-1">
                    المستوى الرقمي (1–5)
                  </label>
                  <select
                    id="setup-level"
                    value={difficultyLevel}
                    onChange={(e) => {
                      const lvl = Number(e.target.value) as DifficultyLevel;
                      setDifficultyLevel(lvl);
                      if (difficulty !== 'mixed') {
                        setDifficulty(levelToDifficulty(lvl));
                      }
                    }}
                    className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-3 py-2.5 text-sm text-white outline-none"
                  >
                    {([1, 2, 3, 4, 5] as DifficultyLevel[]).map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {DIFFICULTY_LEVEL_LABELS[lvl]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adaptiveDifficulty}
                  onChange={(e) => setAdaptiveDifficulty(e.target.checked)}
                  className="w-4 h-4 rounded accent-sky-400"
                />
                <span>تفعيل التدرّج التكيفي التلقائي حسب دقة إجابات الفرق</span>
              </label>

              <div className="space-y-3">
                <div>
                  <label htmlFor="setup-bank" className="block text-xs font-bold text-slate-300 mb-1">
                    مصدر الأسئلة
                  </label>
                  <select
                    id="setup-bank"
                    value={bankId}
                    onChange={(e) => {
                      setBankId(e.target.value);
                      setSelectedCategories([]);
                    }}
                    className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-3 py-2.5 text-sm text-white outline-none"
                  >
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.publishedCount ?? 0} منشور)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-300">
                      حزم الفئات المتاحة (مجانية — اختر واحدة أو أكثر)
                    </span>
                    {selectedCategories.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategories([])}
                        className="text-[11px] font-bold text-sky-300 hover:text-sky-200"
                      >
                        عرض جميع الفئات
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedCategories([])}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        selectedCategories.length === 0
                          ? 'bg-sky-400 border-sky-300 text-slate-950'
                          : 'bg-[#09143A] border-white/10 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      الكل
                    </button>
                    {(importedBank ? Object.keys(availability?.byCategory || {}) : Array.from(new Set([...Object.keys(availability?.byCategory || {}), ...categories]))).map((c) => {
                      const catStats = availability?.byCategory?.[c];
                      const active = selectedCategories.includes(c);
                      const count = catStats?.total;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            setSelectedCategories((prev) =>
                              prev.includes(c) ? prev.filter((item) => item !== c) : [...prev, c]
                            )
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 transition-colors ${
                            active
                              ? 'bg-sky-500/25 border-sky-400 text-white'
                              : count === 0
                              ? 'bg-[#09143A]/60 border-white/5 text-slate-500'
                              : 'bg-[#09143A] border-white/10 text-slate-300 hover:border-white/30'
                          }`}
                        >
                          <span>{c}</span>
                          {typeof count === 'number' && (
                            <span className="text-[10px] font-mono tabular-nums text-sky-300">({count})</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {availability && (
                <div className="rounded-xl bg-[#09143A] border border-sky-400/20 px-3.5 py-2.5 text-xs flex items-center justify-between">
                  <span className="text-slate-300">الأسئلة المتاحة والمناسبة الآن:</span>
                  <span className="font-black text-sky-300 tabular-nums">
                    {availability.totalPublishedInFilter} سؤال منشور
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Steps 6 & 7: 12 Round Types with real counts + Timer & Summary */}
          <div className="lg:col-span-7 rounded-2xl bg-[#101E52] border border-sky-400/20 p-5 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-extrabold text-white">
                  اختار الجولات ({selectedRounds.length} من {ALL_ROUND_TYPES.length} نوعاً)
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedRounds(selectableRounds.filter((type) => type !== 'golden' || (availability?.byRoundType[goldenTargetType]?.unseen ?? 0) > (questionLimit ?? ROUND_RULES[goldenTargetType].questionsPerRound)))}
                  className="text-xs text-sky-300 hover:text-sky-200 font-bold"
                >
                  اختار كل الجولات المتاحة
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ALL_ROUND_TYPES.map((rt) => {
                  const meta = ROUND_RULES[rt];
                  const active = selectedRounds.includes(rt);
                  const countObj =
                    rt === 'golden'
                      ? availability?.byRoundType?.[goldenTargetType]
                      : availability?.byRoundType?.[rt];
                  const countForType = countObj?.unseen;
                  const isEmpty = typeof countForType === 'number' && countForType === 0;

                  return (
                    <button
                      key={rt}
                      type="button"
                      aria-pressed={active}
                      style={{ "--round-color": showRounds[rt].color } as React.CSSProperties}
                      onClick={() => toggleRound(rt)}
                      disabled={isEmpty && !active}
                      className={`show-setup-round p-3 rounded-xl border text-right transition-colors flex items-start justify-between gap-2 ${
                        active
                          ? 'bg-sky-500/20 border-sky-400 text-white'
                          : isEmpty
                          ? 'bg-[#09143A]/60 border-white/5 text-slate-500'
                          : 'bg-[#09143A] border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-extrabold text-sm flex items-center gap-2">
                          <RoundArt type={rt} /><span>{meta.nameAr}</span>
                          {meta.multiplier > 1 && (
                            <span className="text-xs text-amber-300 font-mono">×{meta.multiplier}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{meta.shortDescAr}</p>
                        {typeof countForType === 'number' && (
                          <div
                            className={`text-[11px] mt-1 font-bold tabular-nums ${
                              isEmpty ? 'text-amber-300' : 'text-sky-300'
                            }`}
                          >
                            {isEmpty ? 'لا توجد أسئلة مطابقة للتصفية' : `متوفر: ${countForType} سؤال`}
                          </div>
                        )}
                      </div>
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          active ? 'bg-sky-400 text-slate-950' : 'bg-white/10 text-transparent'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedRounds.includes('golden') && (
                <div className="rounded-xl bg-[#09143A] border border-amber-400/35 p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-extrabold text-amber-300">
                    هدف الجولة الذهبية (مضاعفة النقاط ×2):
                  </span>
                  <select
                    aria-label="نوع الجولة الذهبية"
                    value={goldenTargetType}
                    onChange={(e) => setGoldenTargetType(e.target.value as RoundType)}
                    className="rounded-lg bg-[#101E52] border border-amber-400/40 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    {GOLDEN_TARGETS.map((gt) => (
                      <option key={gt} value={gt}>
                        {ROUND_RULES[gt].nameAr}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Step 7: Timing, Mosque Verbal Default & Match Estimate */}
            <div className="pt-4 border-t border-white/10 space-y-4">
              <h2 className="text-sm font-extrabold text-white">الوقت والنقاط</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="setup-timer" className="block text-xs font-bold text-slate-300 mb-1">
                    مدة السؤال / جولة الـ30ث
                  </label>
                  <select
                    id="setup-timer"
                    value={timerSec}
                    onChange={(e) => setTimerSec(Number(e.target.value))}
                    className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-3 py-2 text-sm text-white outline-none tabular-nums"
                  >
                    <option value={20}>20 ثانية</option>
                    <option value={30}>30 ثانية (القياسي)</option>
                    <option value={45}>45 ثانية</option>
                    <option value={60}>60 ثانية</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="setup-buzzer-rule" className="block text-xs font-bold text-slate-300 mb-1">
                    قاعدة خطأ جولة الجرس
                  </label>
                  <select
                    id="setup-buzzer-rule"
                    value={buzzerWrongRule}
                    onChange={(e) =>
                      setBuzzerWrongRule(e.target.value as 'pass_to_other' | 'penalty_and_pass')
                    }
                    className="w-full rounded-xl bg-[#09143A] border border-slate-600 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="pass_to_other">انتقال الفرصة للمنافس بدون خصم</option>
                    <option value="penalty_and_pass">خصم نقطة واحدة وانتقال الفرصة</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verbalRapidFireDefault}
                  onChange={(e) => setVerbalRapidFireDefault(e.target.checked)}
                  className="w-4 h-4 rounded accent-sky-400"
                />
                <span>وضع الإجابة الشفهية السريعة (أزرار المقدم: صح / تخطي / خطأ) لجولتي الرشاش وصح/خطأ</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold">نقاط الإجابة
                  <select aria-label="نقاط الإجابة" value={basePoints ?? ''} onChange={(e) => setBasePoints(e.target.value ? Number(e.target.value) : undefined)}>
                    <option value="">حسب الجولة</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold">عدد الأسئلة في الجولة
                  <select aria-label="عدد الأسئلة في الجولة" value={questionLimit ?? ''} onChange={(e) => setQuestionLimit(e.target.value ? Number(e.target.value) : undefined)}>
                    <option value="">حسب الجولة</option>{[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>

              {/* Match Summary Box */}
              <div className="rounded-xl bg-[#09143A] border border-white/10 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="font-extrabold text-white">ملخص التحدي المختار</div>
                  <div className="text-slate-400 tabular-nums">
                    {selectedRounds.length} جولات · {matchEstimate.requiredQuestions} سؤال مخطط · {availability ? availability.unseenInFilter + ' سؤال جديد في التصفية' : 'جارٍ حساب المتاح'} · المدة المتوقعة نحو{' '}
                    {matchEstimate.estimatedMinutes} دقيقة
                  </div>
                </div>
                {availability && (unavailableRound || reducedCount) && (
                  <span className="text-amber-300 font-bold inline-flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{unavailableRound ? `ما ضلّ أسئلة لـ «${unavailableRound.titleAr}»` : 'العدد اتعدّل حسب الأسئلة المتاحة'}</span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-300">طريقة العرض والتحكم:</span>
                <div className="flex gap-2 p-1 rounded-xl bg-[#09143A]">
                  <button
                    type="button"
                    onClick={() => setLaunchMode('arena')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      launchMode === 'arena' ? 'bg-sky-400 text-slate-950' : 'text-slate-300'
                    }`}
                  >
                    اللعب التفاعلي المباشر (شاشة واحدة)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLaunchMode('host_and_projector')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      launchMode === 'host_and_projector' ? 'bg-amber-400 text-slate-950' : 'text-slate-300'
                    }`}
                  >
                    تحكم من الهاتف
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={creating || colorConflict || Boolean(importedBank && (!availability || !selectedRounds.length))}
                className="w-full py-4 px-6 rounded-2xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-lg inline-flex items-center justify-center gap-3 transition-colors disabled:opacity-60"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{creating ? 'جارٍ تجهيز المباراة...' : launchMode === 'arena' ? 'ابدأ اللعب' : 'افتح هاتف التحكم'}</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
