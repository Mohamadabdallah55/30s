import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  Compass,
  Layers,
  ListChecks,
  Play,
  Sliders,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  AGE_GROUP_LABELS,
  CANONICAL_AGE_GROUPS,
  DIFFICULTY_LABELS,
} from '../../shared/gameRules';
import { COGNITIVE_LEVEL_LABELS } from '../../shared/lessonIntelligence';
import type {
  AgeGroup,
  Difficulty,
  LessonBatchSummary,
  LessonDistributionMode,
  LessonGenerationMode,
  PedagogicalCognitiveLevel,
  RoundSuitabilityTier,
  RoundType,
} from '../../shared/types';

interface LessonPotentialReportProps {
  lesson: LessonBatchSummary;
  selectedRounds: RoundType[];
  generationMode: LessonGenerationMode;
  distributionMode: LessonDistributionMode;
  customCount: number;
  pageRangeHint: string;
  reestimating: boolean;
  startingGeneration: boolean;
  onReestimate: (patch: {
    ageGroup?: AgeGroup;
    difficulty?: Difficulty;
    mode?: LessonGenerationMode;
    distributionMode?: LessonDistributionMode;
    customCount?: number;
    selectedRoundTypes?: RoundType[];
  }) => void;
  onChangeSelectedRounds: (rounds: RoundType[]) => void;
  onChangePageRangeHint: (hint: string) => void;
  onStartGeneration: () => void;
}

const TIER_STYLES: Record<RoundSuitabilityTier, { badge: string; bar: string }> = {
  excellent: {
    badge: 'text-emerald-300 bg-emerald-500/12 border-emerald-400/35',
    bar: 'bg-emerald-400',
  },
  suitable: {
    badge: 'text-sky-300 bg-sky-500/12 border-sky-400/35',
    bar: 'bg-sky-400',
  },
  adaptable: {
    badge: 'text-amber-300 bg-amber-500/12 border-amber-400/35',
    bar: 'bg-amber-400',
  },
  unsuitable: {
    badge: 'text-slate-400 bg-slate-800/70 border-white/10',
    bar: 'bg-slate-600',
  },
};

const COGNITIVE_KEYS: PedagogicalCognitiveLevel[] = ['remember', 'understand', 'apply', 'analyze', 'infer'];
const COGNITIVE_COLORS: Record<PedagogicalCognitiveLevel, string> = {
  remember: '#38BDF8',
  understand: '#818CF8',
  apply: '#10B981',
  analyze: '#F59E0B',
  infer: '#EC4899',
};

export function LessonPotentialReport({
  lesson,
  selectedRounds,
  generationMode,
  distributionMode,
  customCount,
  pageRangeHint,
  reestimating,
  startingGeneration,
  onReestimate,
  onChangeSelectedRounds,
  onChangePageRangeHint,
  onStartGeneration,
}: LessonPotentialReportProps) {
  const km = lesson.knowledgeMap;
  const capacity = lesson.capacityEstimate;
  const suitability = lesson.roundSuitability ?? [];
  const preview = lesson.generationPlanPreview;
  const [kmTab, setKmTab] = useState<'concepts' | 'facts' | 'relations' | 'values'>('concepts');

  const selectableCount = useMemo(
    () =>
      selectedRounds.filter((rt) => {
        const s = suitability.find((x) => x.roundType === rt);
        return s ? s.selectable && !s.isMultiplier : true;
      }).length,
    [selectedRounds, suitability]
  );

  const toggleRound = (rt: RoundType, selectable: boolean) => {
    if (!selectable) return;
    const exists = selectedRounds.includes(rt);
    const next = exists ? selectedRounds.filter((x) => x !== rt) : [...selectedRounds, rt];
    onChangeSelectedRounds(next);
    onReestimate({ selectedRoundTypes: next });
  };

  const cognitiveTotal = useMemo(() => {
    if (!preview) return 1;
    return Math.max(
      1,
      COGNITIVE_KEYS.reduce((s, k) => s + (preview.cognitiveDistribution[k] ?? 0), 0)
    );
  }, [preview]);

  if (!km || !capacity) {
    return (
      <div className="rounded-2xl border border-amber-400/25 bg-[#09143A]/90 p-6 text-center text-amber-200">
        لم تكتمل خريطة المعرفة لهذا الدرس بعد. يرجى إعادة التحليل أو الانتظار لحين اكتماله.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-6"
    >
      {/* Top Executive Header + Instant Age / Difficulty Recalculation */}
      <section className="rounded-3xl border border-sky-400/20 bg-[#09143A]/95 p-5 sm:p-6 shadow-[0_24px_60px_rgba(3,7,18,0.45)]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-white/10 pb-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-300">
              <Sparkles className="w-4 h-4" />
              <span>المرحلة الثالثة — تقرير إمكانيات الدرس وخطة التوليد</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white break-words">{km.title}</h2>
            <p className="text-xs sm:text-sm text-slate-300">
              المادة: <strong className="text-white">{km.subject}</strong> · الصفحات المقروءة:{' '}
              <strong className="tabular-nums text-sky-300">{km.readablePageCount}</strong> · درجة تنوّع المحتوى:{' '}
              <strong className="tabular-nums text-emerald-300">{km.contentDiversityScore}%</strong>
            </p>
          </div>

          {/* Instant Re-estimate Controls (0 PDF re-parsing!) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:w-[440px] shrink-0">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                الفئة العمرية (إعادة تقدير فورية)
              </label>
              <select
                value={lesson.ageGroup}
                disabled={reestimating}
                onChange={(e) => onReestimate({ ageGroup: e.target.value as AgeGroup })}
                className="w-full rounded-xl bg-[#060D24] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-400"
              >
                {CANONICAL_AGE_GROUPS.map((ag) => (
                  <option key={ag} value={ag}>
                    {AGE_GROUP_LABELS[ag]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                مستوى الصعوبة (إعادة تقدير فورية)
              </label>
              <select
                value={lesson.difficulty}
                disabled={reestimating}
                onChange={(e) => onReestimate({ difficulty: e.target.value as Difficulty })}
                className="w-full rounded-xl bg-[#060D24] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-400"
              >
                <option value="easy">{DIFFICULTY_LABELS.easy}</option>
                <option value="medium">{DIFFICULTY_LABELS.medium}</option>
                <option value="hard">{DIFFICULTY_LABELS.hard}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Capacity Estimator Hero Question: كم سؤالاً يمكن استخراجه؟ */}
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-400" />
              <span>كم أكبر عدد ممكن من الأسئلة عالية الجودة من هذا الدرس؟</span>
            </h3>
            <span className="text-xs font-bold text-slate-300 tabular-nums">
              مستوى الثقة التربوية: <strong className="text-emerald-300">{capacity.confidenceScore}%</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-[#060D24]/90 p-4">
              <div className="text-xs font-bold text-slate-400">الحد الأدنى المضمون</div>
              <div className="mt-1 text-3xl font-black text-slate-100 tabular-nums">
                {capacity.conservativeCount} <span className="text-sm font-semibold text-slate-400">سؤالًا</span>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">حد أدنى واقعي يسهل الوصول إليه وتجاوزه دون تكرار أو رفض.</p>
            </div>

            <div className="rounded-2xl border border-emerald-400/35 bg-emerald-950/25 p-4">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                <span>العدد المقترح الأفضل توازناً</span>
                <span>موصى به</span>
              </div>
              <div className="mt-1 text-3xl font-black text-emerald-300 tabular-nums">
                {capacity.suggestedCount} <span className="text-sm font-semibold text-emerald-200/80">سؤالًا</span>
              </div>
              <p className="mt-1.5 text-[11px] text-emerald-100/80">أفضل تغطية للمحاور وتوازن الصعوبة مع الحصة المجانية.</p>
            </div>

            <div className="rounded-2xl border border-amber-400/35 bg-amber-950/20 p-4">
              <div className="text-xs font-bold text-amber-300">الحد الأعلى التقديري</div>
              <div className="mt-1 text-3xl font-black text-amber-300 tabular-nums">
                {capacity.estimatedMaxCount} <span className="text-sm font-semibold text-amber-200/80">سؤالًا</span>
              </div>
              <p className="mt-1.5 text-[11px] text-amber-200/85 leading-relaxed">
                {capacity.upperBoundDisclaimerAr}
              </p>
            </div>
          </div>

          <p className="mt-3 rounded-xl border border-white/10 bg-[#060D24]/70 px-4 py-2.5 text-xs text-slate-200 leading-relaxed">
            <strong className="text-sky-300">تفسير التقدير:</strong> {capacity.explanationAr}
          </p>
        </div>
      </section>

      {/* 15-Dimension Knowledge Map Explorer */}
      <section className="rounded-3xl border border-white/10 bg-[#09143A]/90 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-sky-400" />
              <span>خريطة معرفة الدرس (15 بُعداً معرفياً محفوظاً)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{km.contentDiversityNote}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'concepts', label: `المحاور (${km.mainConcepts.length})` },
                { id: 'facts', label: `الحقائق (${km.directFacts.length})` },
                { id: 'relations', label: `السببية والمقارنات (${km.causesAndEffects.length + km.comparisons.length})` },
                { id: 'values', label: `القيم والمسابقات (${km.educationalValues.length + km.gameablePoints.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setKmTab(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 ${
                  kmTab === t.id
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-[#060D24] text-slate-300 border border-white/10 hover:border-sky-400/40'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {kmTab === 'concepts' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-[#060D24]/85 p-4 space-y-2.5">
              <div className="text-xs font-bold text-sky-300">المفاهيم الرئيسية ({km.mainConcepts.length})</div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {km.mainConcepts.map((mc) => (
                  <div key={mc.id} className="rounded-xl border border-white/10 bg-[#09143A]/70 p-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs font-bold text-white">
                      <span>{mc.title}</span>
                      <span className="text-[11px] text-sky-300 tabular-nums">ص {mc.pages.join('، ')}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">{mc.summary}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#060D24]/85 p-4 space-y-2.5">
              <div className="text-xs font-bold text-indigo-300">
                المفاهيم الفرعية ({km.subConcepts.length}) والأحداث والشخصيات ({km.eventsAndFigures.length})
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 text-xs text-slate-200">
                {km.subConcepts.slice(0, 12).map((sc, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                    <span>
                      {sc.title} <span className="text-slate-400">({sc.parentConcept})</span>
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums">ص {sc.pages[0] ?? 1}</span>
                  </div>
                ))}
                {km.eventsAndFigures.slice(0, 8).map((ev, idx) => (
                  <div key={`ev-${idx}`} className="flex items-center justify-between gap-2 py-1 border-b border-white/5 text-amber-200/90">
                    <span>
                      {ev.name}: <span className="text-slate-300">{ev.roleOrEvent}</span>
                    </span>
                    <span className="text-[11px] text-amber-300 tabular-nums">{ev.timeHint || `ص${ev.page}`}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {kmTab === 'facts' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-[#060D24]/85 p-4 space-y-2 max-h-56 overflow-y-auto">
              <div className="text-xs font-bold text-emerald-300">الحقائق المباشرة ({km.directFacts.length})</div>
              {km.directFacts.map((f, i) => (
                <div key={i} className="text-xs text-slate-200 border-b border-white/5 pb-1.5 flex justify-between gap-2">
                  <span>• {f.text}</span>
                  <span className="text-slate-400 tabular-nums shrink-0">ص {f.page}</span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#060D24]/85 p-4 space-y-2 max-h-56 overflow-y-auto">
              <div className="text-xs font-bold text-sky-300">القوائم والتصنيفات ({km.listsAndClassifications.length})</div>
              {km.listsAndClassifications.length === 0 ? (
                <p className="text-xs text-slate-400">لم تُرصد قوائم موسّعة من 3+ عناصر في هذا الدرس.</p>
              ) : (
                km.listsAndClassifications.map((l, i) => (
                  <div key={i} className="rounded-xl border border-white/10 bg-[#09143A]/70 p-2.5 text-xs">
                    <div className="font-bold text-white flex justify-between">
                      <span>{l.title}</span>
                      <span className="text-sky-300 tabular-nums">ص {l.page}</span>
                    </div>
                    <p className="text-slate-300 mt-1">{l.items.join(' · ')}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {kmTab === 'relations' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-[#060D24]/85 p-4 space-y-2 max-h-56 overflow-y-auto">
              <div className="text-xs font-bold text-amber-300">الأسباب والنتائج ({km.causesAndEffects.length})</div>
              {km.causesAndEffects.length === 0 ? (
                <p className="text-xs text-slate-400">لا توجد علاقات سببية صريحة مسجّلة.</p>
              ) : (
                km.causesAndEffects.map((c, i) => (
                  <div key={i} className="text-xs text-slate-200 border-b border-white/5 pb-1.5">
                    <span className="text-amber-300 font-bold">{c.cause}</span> ← {c.effect} (ص {c.page})
                  </div>
                ))
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#060D24]/85 p-4 space-y-2 max-h-56 overflow-y-auto">
              <div className="text-xs font-bold text-sky-300">المقارنات ({km.comparisons.length})</div>
              {km.comparisons.length === 0 ? (
                <p className="text-xs text-slate-400">لا توجد جداول أو مقارنات صريحة.</p>
              ) : (
                km.comparisons.map((c, i) => (
                  <div key={i} className="text-xs text-slate-200 border-b border-white/5 pb-1.5">
                    <div className="font-bold text-white">{c.title} (ص {c.page})</div>
                    <div className="text-slate-400">{c.sides.join(' مقابل ')}</div>
                  </div>
                ))
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#060D24]/85 p-4 space-y-2 max-h-56 overflow-y-auto">
              <div className="text-xs font-bold text-indigo-300">نقاط قابلة للتحليل ({km.analyticalPoints.length})</div>
              {km.analyticalPoints.map((a, i) => (
                <div key={i} className="text-xs text-slate-200 border-b border-white/5 pb-1.5">
                  • {a.point} <span className="text-slate-400">(ص {a.page})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {kmTab === 'values' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-[#060D24]/85 p-4 space-y-2">
              <div className="text-xs font-bold text-emerald-300">القيم والمبادئ التربوية المستخلصة</div>
              {km.educationalValues.map((v, i) => (
                <div key={i} className="text-xs text-slate-200">
                  • {v}
                </div>
              ))}
              <div className="pt-2 border-t border-white/10 text-xs text-slate-400">
                الفئات العمرية الملائمة: {km.suitableAgeGroups.map((ag) => AGE_GROUP_LABELS[ag]).join(' · ')}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#060D24]/85 p-4 space-y-2">
              <div className="text-xs font-bold text-amber-300">نقاط قابلة للتحويل لمسابقات</div>
              {km.gameablePoints.map((g, i) => (
                <div key={i} className="text-xs text-slate-200 flex justify-between gap-2 border-b border-white/5 pb-1">
                  <span>{g.idea}</span>
                  <span className="text-sky-300 shrink-0">ص {g.page}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Priority 3: Pre-Generation 12-Round Suitability Inspector */}
      <section className="rounded-3xl border border-white/10 bg-[#09143A]/90 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              <span>فحص ملاءمة جميع الجولات الـ12 قبل التوليد</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              اختر الجولات المناسبة لهذا الدرس. لاحظ أن الجولات غير المناسبة أو جولة المضاعفة (×2) لا تضخّم العدد الفريد.
            </p>
          </div>
          <span className="text-xs font-bold text-sky-300 tabular-nums">
            المحددة للتوليد: {selectableCount} جولة
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {suitability.map((item) => {
            const checked = selectedRounds.includes(item.roundType);
            const tierStyle = TIER_STYLES[item.tier];
            return (
              <button
                key={item.roundType}
                type="button"
                disabled={!item.selectable}
                onClick={() => toggleRound(item.roundType, item.selectable)}
                className={`text-right rounded-2xl border p-4 transition flex flex-col justify-between gap-2 ${
                  !item.selectable
                    ? 'border-white/5 bg-[#060D24]/50 opacity-55 cursor-not-allowed'
                    : checked
                    ? 'border-sky-400 bg-sky-950/35 shadow-[0_0_25px_rgba(56,189,248,0.12)]'
                    : 'border-white/10 bg-[#060D24]/85 hover:border-white/25'
                }`}
              >
                <div className="space-y-2 w-full">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                          checked ? 'bg-sky-400 border-sky-400 text-slate-950' : 'border-white/25 bg-[#09143A]'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </span>
                      <span className="text-sm font-black text-white">{item.nameAr}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold shrink-0 ${tierStyle.badge}`}>
                      {item.tierLabelAr}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">{item.reasonAr}</p>
                </div>

                <div className="pt-2 border-t border-white/10 w-full flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span className="tabular-nums">
                    المتوقع:{' '}
                    <strong className="text-white">
                      {item.isMultiplier
                        ? 'مضاعف ×2'
                        : item.reusesQuestions
                        ? `${item.expectedValidCount} (إعادة توظيف)`
                        : `${item.expectedValidCount} سؤالاً`}
                    </strong>
                  </span>
                  <span>{item.cognitiveSkillsAr.slice(0, 2).join(' · ')}</span>
                </div>
              </button>
            );
          })}
        </div>

        {selectableCount === 0 && (
          <div className="rounded-xl border border-red-400/35 bg-red-950/30 px-4 py-3 text-xs font-bold text-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>لا يمكن بدء التوليد دون اختيار جولة مناسبة واحدة على الأقل (الجولات غير المناسبة مستبعدة تلقائياً).</span>
          </div>
        )}
      </section>

      {/* Priority 4: Generation Plan & Visual Distribution Preview */}
      <section className="rounded-3xl border border-indigo-400/25 bg-[#09143A]/95 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-300" />
            <span>معاينة خطة التوليد قبل التشغيل</span>
          </h3>
          {preview && (
            <span className="text-xs text-sky-300 font-bold tabular-nums">{preview.quotaNoteAr}</span>
          )}
        </div>

        {/* Mode & Distribution Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2 lg:col-span-2">
            <div className="text-xs font-bold text-slate-400">وضع عدد الأسئلة</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(
                [
                  {
                    id: 'suggested',
                    title: 'ولّد العدد المقترح',
                    sub: `${capacity.suggestedCount} سؤالاً متوازناً`,
                  },
                  {
                    id: 'max_quality',
                    title: 'ولّد أكبر عدد ممكن بجودة عالية',
                    sub: `حتى ${capacity.estimatedMaxCount} سؤالاً موثقاً`,
                  },
                  {
                    id: 'custom',
                    title: 'تحديد يدوي مخصص',
                    sub: `${customCount} سؤالاً حسب اختيارك`,
                  },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onReestimate({ mode: m.id })}
                  className={`rounded-2xl border p-3 text-right transition ${
                    generationMode === m.id
                      ? 'border-sky-400 bg-sky-500/15 text-white'
                      : 'border-white/10 bg-[#060D24] text-slate-300 hover:border-white/25'
                  }`}
                >
                  <div className="text-xs font-black">{m.title}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">{m.sub}</div>
                </button>
              ))}
            </div>

            {generationMode === 'custom' && (
              <div className="flex items-center gap-3 pt-1">
                <label className="text-xs font-bold text-slate-300 shrink-0">العدد المطلوب:</label>
                <input
                  type="number"
                  min={3}
                  max={100}
                  value={customCount}
                  onChange={(e) => {
                    const val = Math.max(3, Math.min(100, Number(e.target.value || 10)));
                    onReestimate({ mode: 'custom', customCount: val });
                  }}
                  className="w-28 rounded-xl bg-[#060D24] border border-white/15 px-3 py-1.5 text-sm font-bold text-white tabular-nums"
                />
                {customCount > capacity.estimatedMaxCount && (
                  <span className="text-[11px] text-amber-300">
                    يتجاوز الحد المقدر ({capacity.estimatedMaxCount}) — قد يتوقف التوليد مبكراً عند استنفاد النص.
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-400">توزيع الجولات ونطاق الصفحات</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onReestimate({ distributionMode: 'ai' })}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition whitespace-nowrap ${
                  distributionMode === 'ai'
                    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                    : 'border-white/10 bg-[#060D24] text-slate-300'
                }`}
              >
                توزيع ذكي آلي
              </button>
              <button
                type="button"
                onClick={() => onReestimate({ distributionMode: 'manual' })}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition whitespace-nowrap ${
                  distributionMode === 'manual'
                    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                    : 'border-white/10 bg-[#060D24] text-slate-300'
                }`}
              >
                توزيع يدوي متساوٍ
              </button>
            </div>
            <input
              type="text"
              value={pageRangeHint}
              onChange={(e) => onChangePageRangeHint(e.target.value)}
              placeholder="نطاق الصفحات الاختياري (مثلاً: 1-5)"
              className="w-full rounded-xl bg-[#060D24] border border-white/15 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
            />
          </div>
        </div>

        {/* SVG Distribution Preview Charts */}
        {preview && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Round Distribution Bar SVG */}
            <div className="rounded-2xl border border-white/10 bg-[#060D24]/90 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <ListChecks className="w-4 h-4 text-sky-400" />
                  توزيع الأسئلة المتوقع على الجولات ({preview.targetCount} سؤالاً)
                </span>
                <span className="tabular-nums text-sky-300">{preview.estimatedBatches} دفعات</span>
              </div>
              <div className="space-y-2">
                {preview.roundDistribution.map((rd) => (
                  <div key={rd.roundType} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-200 font-semibold">{rd.nameAr}</span>
                      <span className="text-sky-300 font-bold tabular-nums">
                        {rd.count} ({rd.percentage}%)
                      </span>
                    </div>
                    <svg className="w-full h-2 rounded-full overflow-hidden bg-slate-800" viewBox="0 0 100 6" preserveAspectRatio="none">
                      <rect x="0" y="0" width={Math.max(4, rd.percentage)} height="6" rx="3" fill="#38BDF8" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>

            {/* Cognitive & Difficulty Distribution */}
            <div className="rounded-2xl border border-white/10 bg-[#060D24]/90 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-amber-400" />
                  التوازن المعرفي ومستويات الصعوبة
                </span>
                <span className="text-slate-400 tabular-nums">
                  سهل {preview.difficultyDistribution.easy} · متوسط {preview.difficultyDistribution.medium} · صعب{' '}
                  {preview.difficultyDistribution.hard}
                </span>
              </div>

              <div className="space-y-2">
                {COGNITIVE_KEYS.map((ck) => {
                  const val = preview.cognitiveDistribution[ck] ?? 0;
                  const pct = Math.round((val / cognitiveTotal) * 100);
                  return (
                    <div key={ck} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-200 font-semibold">{COGNITIVE_LEVEL_LABELS[ck]}</span>
                        <span className="font-bold text-slate-200 tabular-nums">
                          {val} ({pct}%)
                        </span>
                      </div>
                      <svg className="w-full h-2 rounded-full overflow-hidden bg-slate-800" viewBox="0 0 100 6" preserveAspectRatio="none">
                        <rect x="0" y="0" width={Math.max(3, pct)} height="6" rx="3" fill={COGNITIVE_COLORS[ck]} />
                      </svg>
                    </div>
                  );
                })}
              </div>

              {preview.limitedTopics.length > 0 && (
                <p className="text-[11px] text-amber-300 pt-1">
                  محاور قد تحصل على تغطية محدودة لصغر العدد المختار: {preview.limitedTopics.join('، ')}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
          <div className="text-xs text-slate-300">
            يعتمد التوليد على خريطة المعرفة المحفوظة دون إعادة تحليل ملف PDF.
          </div>
          <button
            type="button"
            disabled={selectableCount === 0 || startingGeneration || reestimating}
            onClick={onStartGeneration}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-l from-sky-400 to-indigo-400 hover:brightness-110 disabled:opacity-45 text-slate-950 font-black px-6 py-3 text-sm transition whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Zap className="w-4 h-4" />
            <span>
              {startingGeneration
                ? 'جارٍ تشغيل خطة التوليد...'
                : `تأكيد خطة التوليد (${preview?.targetCount ?? capacity.suggestedCount} سؤالًا)`}
            </span>
            <Play className="w-4 h-4" />
          </button>
        </div>
      </section>
    </motion.div>
  );
}
