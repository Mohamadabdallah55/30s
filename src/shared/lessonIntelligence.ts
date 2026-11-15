import {
  ALL_ROUND_TYPES,
  ROUND_RULES,
  normalizeAgeGroup,
} from './gameRules';
import type {
  AgeGroup,
  CanonicalAgeGroup,
  Difficulty,
  LessonCapacityEstimate,
  LessonDistributionMode,
  LessonGenerationMode,
  LessonGenerationPlanPreview,
  LessonKnowledgeMap,
  PedagogicalCognitiveLevel,
  RoundSuitabilityItem,
  RoundSuitabilityTier,
  RoundType,
} from './types';

export const COGNITIVE_LEVEL_LABELS: Record<PedagogicalCognitiveLevel, string> = {
  remember: 'تذكر',
  understand: 'فهم',
  apply: 'تطبيق',
  analyze: 'تحليل',
  infer: 'ربط واستنتاج',
};

export const SUITABILITY_TIER_LABELS: Record<RoundSuitabilityTier, string> = {
  excellent: 'ممتازة لهذا الدرس',
  suitable: 'مناسبة',
  adaptable: 'ممكنة بعد تعديل',
  unsuitable: 'غير مناسبة',
};

export function mapSkillToCognitiveLevel(raw?: string): PedagogicalCognitiveLevel {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'remember' || /recall|تذكر|حفظ|مباشر/.test(val)) return 'remember';
  if (val === 'understand' || /فهم|استيعاب|comprehen/.test(val)) return 'understand';
  if (val === 'apply' || /تطبيق|hypothetical|افتراض|موقف/.test(val)) return 'apply';
  if (val === 'infer' || /infer|ربط|استنتاج|استدلال|chron|comparison/.test(val)) return 'infer';
  if (val === 'analyze' || /analy|تحليل|نقد|تفسير/.test(val)) return 'analyze';
  return 'understand';
}

export interface RawAnalysisInput {
  readabilityOk: boolean;
  readabilityNote?: string;
  actualPageCount: number;
  isReligiousContent?: boolean;
  topics: Array<{ title: string; pageNumbers?: number[]; keyConcepts?: string[] } | string>;
  pageSummaries?: Array<{
    page: number;
    summary: string;
    factsVsHypotheticals?: string;
    tablesOrComparisons?: string;
    timelineEvents?: string;
  }>;
  pageTexts?: Array<{ page: number; text: string }>;
  objectives?: string[];
  estimatedMaxDistinctQuestions?: number;
  coverageSummary?: string;
  // Rich 15-dimension fields (optional in compact/legacy outputs)
  mainConcepts?: Array<{ id?: string; title: string; summary?: string; pages?: number[] }>;
  subConcepts?: Array<{ title: string; parentConcept?: string; pages?: number[] }>;
  directFacts?: Array<{ text: string; page?: number }>;
  causesAndEffects?: Array<{ cause: string; effect: string; page?: number }>;
  eventsAndFigures?: Array<{ name: string; roleOrEvent: string; timeHint?: string; page?: number }>;
  listsAndClassifications?: Array<{ title: string; items: string[]; page?: number }>;
  comparisons?: Array<{ title: string; sides: string[]; page?: number }>;
  analyticalPoints?: Array<{ point: string; page?: number }>;
  educationalValues?: string[];
  gameablePoints?: Array<{ idea: string; suggestedRound?: string; page?: number }>;
  suitableAgeGroups?: string[];
  contentDiversityScore?: number;
  contentDiversityNote?: string;
}

export function buildKnowledgeMapFromAnalysis(params: {
  title: string;
  subject: string;
  ageGroup: AgeGroup;
  analysis: RawAnalysisInput;
}): LessonKnowledgeMap {
  const { title, subject, analysis } = params;
  const pageCount = Math.max(1, Number(analysis.actualPageCount || 1));

  // 4. Main concepts
  const mainConcepts =
    analysis.mainConcepts && analysis.mainConcepts.length > 0
      ? analysis.mainConcepts.map((mc, idx) => ({
          id: mc.id || `mc-${idx + 1}`,
          title: mc.title.trim(),
          summary: (mc.summary || mc.title).trim(),
          pages: mc.pages && mc.pages.length > 0 ? mc.pages : [Math.min(pageCount, idx + 1)],
        }))
      : (analysis.topics || []).map((t, idx) => {
          if (typeof t === 'string') {
            return {
              id: `mc-${idx + 1}`,
              title: t.trim(),
              summary: t.trim(),
              pages: [Math.min(pageCount, idx + 1)],
            };
          }
          return {
            id: `mc-${idx + 1}`,
            title: t.title.trim(),
            summary: (t.keyConcepts || []).join('، ') || t.title.trim(),
            pages: t.pageNumbers && t.pageNumbers.length > 0 ? t.pageNumbers : [Math.min(pageCount, idx + 1)],
          };
        });

  // 5. Sub concepts
  const subConcepts =
    analysis.subConcepts && analysis.subConcepts.length > 0
      ? analysis.subConcepts.map((sc) => ({
          title: sc.title.trim(),
          parentConcept: (sc.parentConcept || mainConcepts[0]?.title || title).trim(),
          pages: sc.pages && sc.pages.length > 0 ? sc.pages : [1],
        }))
      : (analysis.topics || []).flatMap((t, idx) => {
          if (typeof t === 'string' || !t.keyConcepts?.length) return [];
          return t.keyConcepts.map((kc) => ({
            title: kc.trim(),
            parentConcept: t.title.trim(),
            pages: t.pageNumbers && t.pageNumbers.length > 0 ? t.pageNumbers : [Math.min(pageCount, idx + 1)],
          }));
        });

  // 6. Direct facts
  const directFacts =
    analysis.directFacts && analysis.directFacts.length > 0
      ? analysis.directFacts
          .filter((f) => f.text?.trim())
          .map((f) => ({ text: f.text.trim(), page: Math.max(1, f.page || 1) }))
      : (analysis.pageSummaries || [])
          .filter((ps) => ps.summary?.trim())
          .map((ps) => ({ text: ps.summary.trim(), page: ps.page }));

  // 7. Causes and effects
  const causesAndEffects =
    analysis.causesAndEffects && analysis.causesAndEffects.length > 0
      ? analysis.causesAndEffects
          .filter((c) => c.cause?.trim() && c.effect?.trim())
          .map((c) => ({ cause: c.cause.trim(), effect: c.effect.trim(), page: Math.max(1, c.page || 1) }))
      : (analysis.pageSummaries || [])
          .filter((ps) => /سبب|نتيجة|أدى|بسبب|ترتب|أثر/.test(ps.summary))
          .map((ps) => ({
            cause: `معطى الصفحة ${ps.page}`,
            effect: ps.summary.trim(),
            page: ps.page,
          }));

  // 8. Events and figures
  const eventsAndFigures =
    analysis.eventsAndFigures && analysis.eventsAndFigures.length > 0
      ? analysis.eventsAndFigures
          .filter((e) => e.name?.trim())
          .map((e) => ({
            name: e.name.trim(),
            roleOrEvent: (e.roleOrEvent || '').trim(),
            timeHint: e.timeHint?.trim() || undefined,
            page: Math.max(1, e.page || 1),
          }))
      : (analysis.pageSummaries || [])
          .filter((ps) => ps.timelineEvents && ps.timelineEvents.trim().length > 2)
          .map((ps) => ({
            name: `محطة زمنية — ص${ps.page}`,
            roleOrEvent: ps.timelineEvents!.trim(),
            timeHint: `ص${ps.page}`,
            page: ps.page,
          }));

  // 9. Lists & classifications
  const listsAndClassifications =
    analysis.listsAndClassifications && analysis.listsAndClassifications.length > 0
      ? analysis.listsAndClassifications
          .filter((l) => l.title?.trim() && Array.isArray(l.items) && l.items.length >= 2)
          .map((l) => ({
            title: l.title.trim(),
            items: l.items.map((x) => x.trim()).filter(Boolean),
            page: Math.max(1, l.page || 1),
          }))
      : mainConcepts
          .filter((mc) => {
            const subCount = subConcepts.filter((sc) => sc.parentConcept === mc.title).length;
            return subCount >= 3;
          })
          .map((mc) => ({
            title: mc.title,
            items: subConcepts.filter((sc) => sc.parentConcept === mc.title).map((sc) => sc.title),
            page: mc.pages[0] ?? 1,
          }));

  // 10. Comparisons
  const comparisons =
    analysis.comparisons && analysis.comparisons.length > 0
      ? analysis.comparisons
          .filter((c) => c.title?.trim())
          .map((c) => ({
            title: c.title.trim(),
            sides: (c.sides || []).map((s) => s.trim()).filter(Boolean),
            page: Math.max(1, c.page || 1),
          }))
      : (analysis.pageSummaries || [])
          .filter((ps) => ps.tablesOrComparisons && ps.tablesOrComparisons.trim().length > 2)
          .map((ps) => ({
            title: `مقارنة الصفحة ${ps.page}`,
            sides: [ps.tablesOrComparisons!.trim()],
            page: ps.page,
          }));

  // 11. Analytical points
  const analyticalPoints =
    analysis.analyticalPoints && analysis.analyticalPoints.length > 0
      ? analysis.analyticalPoints
          .filter((a) => a.point?.trim())
          .map((a) => ({ point: a.point.trim(), page: Math.max(1, a.page || 1) }))
      : (analysis.objectives || []).map((obj, idx) => ({
          point: obj.trim(),
          page: Math.min(pageCount, idx + 1),
        }));

  // 12. Educational values
  const educationalValues =
    analysis.educationalValues && analysis.educationalValues.length > 0
      ? analysis.educationalValues.map((v) => v.trim()).filter(Boolean)
      : analysis.isReligiousContent
      ? ['الالتزام بالمنهج العلمي والتثبت من النص الشرعي والتاريخي']
      : ['تنمية مهارة الاستيعاب الدقيق والتحليل المنهجي'];

  // 13. Gameable points
  const gameablePoints =
    analysis.gameablePoints && analysis.gameablePoints.length > 0
      ? analysis.gameablePoints
          .filter((g) => g.idea?.trim())
          .map((g) => ({
            idea: g.idea.trim(),
            suggestedRound: (ALL_ROUND_TYPES.includes(g.suggestedRound as RoundType)
              ? g.suggestedRound
              : 'multiple_choice') as RoundType,
            page: Math.max(1, g.page || 1),
          }))
      : mainConcepts.slice(0, 6).map((mc) => ({
          idea: `محور ${mc.title}`,
          suggestedRound: 'multiple_choice' as RoundType,
          page: mc.pages[0] ?? 1,
        }));

  // 14. Suitable age groups
  const suitableAgeGroups: CanonicalAgeGroup[] =
    analysis.suitableAgeGroups && analysis.suitableAgeGroups.length > 0
      ? Array.from(new Set(analysis.suitableAgeGroups.map((ag) => normalizeAgeGroup(ag))))
      : [normalizeAgeGroup(params.ageGroup), 'family'];

  // 15. Diversity calculation
  const dimensionSignals = [
    mainConcepts.length >= 2,
    subConcepts.length >= 3,
    directFacts.length >= 3,
    causesAndEffects.length >= 1,
    eventsAndFigures.length >= 2,
    listsAndClassifications.length >= 1,
    comparisons.length >= 1,
    analyticalPoints.length >= 2,
  ].filter(Boolean).length;

  const computedDiversity = Math.min(
    98,
    Math.max(18, Math.round((dimensionSignals / 8) * 70 + Math.min(pageCount, 15) * 1.8))
  );
  const contentDiversityScore =
    typeof analysis.contentDiversityScore === 'number' && analysis.contentDiversityScore > 0
      ? Math.min(100, Math.max(10, Math.round(analysis.contentDiversityScore)))
      : computedDiversity;

  const contentDiversityNote =
    analysis.contentDiversityNote?.trim() ||
    (contentDiversityScore >= 75
      ? 'محتوى ثري ومتنوع يجمع بين الحقائق المباشرة والتسلسل الزمني والعلاقات السببية والمقارنات.'
      : contentDiversityScore >= 45
      ? 'محتوى متوسط التنوع يدعم الأسئلة المباشرة والفهم وبعض أسئلة التحليل.'
      : 'محتوى مركز أو مختصر؛ يُفضل الاكتفاء بعدد أسئلة محافظ ومباشر دون تكرار.');

  return {
    title: title.trim() || 'درس تعليمي',
    subject: subject.trim() || 'عام',
    readablePageCount: pageCount,
    mainConcepts,
    subConcepts,
    directFacts,
    causesAndEffects,
    eventsAndFigures,
    listsAndClassifications,
    comparisons,
    analyticalPoints,
    educationalValues,
    gameablePoints,
    suitableAgeGroups,
    contentDiversityScore,
    contentDiversityNote,
  };
}

const SYNTHETIC_FALLBACK_PREFIXES = [
  'معطى الصفحة ',
  'محطة زمنية — ص',
  'مقارنة الصفحة ',
  'محور ',
];

function isSyntheticFallbackText(text: string): boolean {
  const trimmed = text.trim();
  return SYNTHETIC_FALLBACK_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function normalizeAtomStem(text: string): string {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.split(' ').filter((w) => w.length > 1).slice(0, 5).join(' ');
}

export function deduplicateKnowledgeAtoms(km: LessonKnowledgeMap): {
  uniqueDirectFacts: number;
  uniqueMainConcepts: number;
  uniqueSubConcepts: number;
  uniqueCauses: number;
  uniqueFigures: number;
  uniqueListWeight: number;
  uniqueComparisons: number;
  uniqueAnalytical: number;
  uniqueGameable: number;
  totalUniqueAtoms: number;
} {
  const seen = new Set<string>();
  const register = (page: number | undefined, rawText: string): boolean => {
    const trimmed = rawText.trim();
    if (!trimmed || isSyntheticFallbackText(trimmed)) return false;
    const stem = normalizeAtomStem(trimmed);
    if (!stem) return false;
    const key = `${Math.max(1, page || 1)}::${stem}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  let uniqueDirectFacts = 0;
  for (const f of km.directFacts) {
    if (register(f.page, f.text)) uniqueDirectFacts++;
  }

  let uniqueCauses = 0;
  for (const c of km.causesAndEffects) {
    if (isSyntheticFallbackText(c.cause)) continue;
    if (register(c.page, `${c.cause} ${c.effect}`)) uniqueCauses++;
  }

  let uniqueFigures = 0;
  for (const e of km.eventsAndFigures) {
    if (isSyntheticFallbackText(e.name)) continue;
    if (register(e.page, `${e.name} ${e.roleOrEvent}`)) uniqueFigures++;
  }

  let uniqueListWeight = 0;
  for (const l of km.listsAndClassifications) {
    if (register(l.page, `${l.title} ${l.items.slice(0, 2).join(' ')}`)) {
      uniqueListWeight += Math.min(2.5, Math.max(1, l.items.length * 0.6));
    }
  }

  let uniqueComparisons = 0;
  for (const c of km.comparisons) {
    if (isSyntheticFallbackText(c.title)) continue;
    if (register(c.page, `${c.title} ${c.sides.join(' ')}`)) uniqueComparisons++;
  }

  let uniqueAnalytical = 0;
  for (const a of km.analyticalPoints) {
    if (register(a.page, a.point)) uniqueAnalytical++;
  }

  let uniqueMainConcepts = 0;
  for (const mc of km.mainConcepts) {
    if (register(mc.pages[0], mc.title)) uniqueMainConcepts++;
  }

  let uniqueSubConcepts = 0;
  for (const sc of km.subConcepts) {
    if (register(sc.pages[0], sc.title)) uniqueSubConcepts++;
  }

  let uniqueGameable = 0;
  for (const g of km.gameablePoints) {
    if (isSyntheticFallbackText(g.idea)) continue;
    if (register(g.page, g.idea)) uniqueGameable++;
  }

  const totalUniqueAtoms =
    uniqueDirectFacts * 1.0 +
    uniqueMainConcepts * 1.1 +
    uniqueSubConcepts * 0.7 +
    uniqueCauses * 1.1 +
    uniqueFigures * 0.95 +
    uniqueListWeight +
    uniqueComparisons * 1.0 +
    uniqueAnalytical * 1.0 +
    uniqueGameable * 0.35;

  return {
    uniqueDirectFacts,
    uniqueMainConcepts,
    uniqueSubConcepts,
    uniqueCauses,
    uniqueFigures,
    uniqueListWeight,
    uniqueComparisons,
    uniqueAnalytical,
    uniqueGameable,
    totalUniqueAtoms,
  };
}

export function estimateLessonCapacity(params: {
  knowledgeMap: LessonKnowledgeMap;
  ageGroup: AgeGroup;
  difficulty: Difficulty;
  reportedMaxDistinct?: number;
  pageTexts?: Array<{ page: number; text: string }>;
  selectedRoundTypes?: RoundType[];
  suitability?: RoundSuitabilityItem[];
  verifiedCount?: number;
  rejectedCount?: number;
  receivedCount?: number;
}): LessonCapacityEstimate {
  const km = params.knowledgeMap;
  const normAge = normalizeAgeGroup(params.ageGroup);

  const dedup = deduplicateKnowledgeAtoms(km);
  const factAtoms = Math.max(2, dedup.totalUniqueAtoms);

  // Structural page support (no 1.25x inflation)
  const pageSupport = km.readablePageCount * (km.contentDiversityScore >= 65 ? 2.6 : 1.8);
  let rawPotential = Math.round(
    Math.min(95, Math.max(3, Math.min(factAtoms, pageSupport + factAtoms * 0.35)))
  );

  // Anchor conservatively to model's reportedMaxDistinct instead of letting double-counted atoms exceed it
  if (typeof params.reportedMaxDistinct === 'number' && params.reportedMaxDistinct > 0) {
    const reported = Math.min(100, Math.max(2, Math.round(params.reportedMaxDistinct)));
    const minSignal = Math.min(rawPotential, reported);
    const maxSignal = Math.max(rawPotential, reported);
    rawPotential = Math.min(
      Math.max(4, Math.round(reported * 1.05)),
      Math.round(minSignal * 0.65 + maxSignal * 0.25)
    );
  }

  // Factor actual extracted page text volume so sparse slide decks stay realistic
  let totalExtractedWords = 0;
  let isSparseText = false;
  if (Array.isArray(params.pageTexts) && params.pageTexts.length > 0) {
    totalExtractedWords = params.pageTexts.reduce(
      (sum, p) => sum + String(p.text || '').trim().split(/\s+/).filter(Boolean).length,
      0
    );
    if (totalExtractedWords > 0) {
      const avgWordsPerPage = totalExtractedWords / Math.max(1, km.readablePageCount);
      const wordSupport = Math.max(4, Math.round(totalExtractedWords / 28));
      if (wordSupport < rawPotential) {
        const blendWeight = avgWordsPerPage < 28 ? 0.4 : 0.28;
        rawPotential = Math.max(
          4,
          Math.round(rawPotential * (1 - blendWeight) + wordSupport * blendWeight)
        );
        if (avgWordsPerPage < 32) {
          isSparseText = true;
        }
      }
    }
  }

  // Age group modifier: younger tiers filter out overly dense abstract inference
  const ageFactor: Record<CanonicalAgeGroup, number> = {
    kids_7_10: 0.72,
    preteen_11_13: 0.85,
    teen_14_17: 0.96,
    adults_18_plus: 1.04,
    family: 0.92,
  };

  // Difficulty modifier: hard questions require analytical/causal/comparative depth
  const deepAtoms =
    dedup.uniqueCauses + dedup.uniqueComparisons + dedup.uniqueAnalytical + dedup.uniqueFigures * 0.5;
  let diffFactor = 1.0;
  if (params.difficulty === 'hard') {
    diffFactor = deepAtoms >= 5 ? 0.94 : 0.7;
  } else if (params.difficulty === 'easy') {
    diffFactor = 0.92;
  }

  let estimatedMaxCount = Math.max(
    4,
    Math.min(100, Math.round(rawPotential * ageFactor[normAge] * diffFactor))
  );

  // Factor selected rounds capacity when rounds & suitability are known
  let constrainedByRounds = false;
  if (
    Array.isArray(params.selectedRoundTypes) &&
    params.selectedRoundTypes.length > 0 &&
    Array.isArray(params.suitability) &&
    params.suitability.length > 0
  ) {
    const selectedSet = new Set(params.selectedRoundTypes);
    const activeItems = params.suitability.filter(
      (s) => selectedSet.has(s.roundType) && s.selectable && !s.isMultiplier
    );
    if (activeItems.length > 0) {
      const roundCapacitySum = activeItems.reduce(
        (sum, s) => sum + Math.max(1, s.expectedValidCount),
        0
      );
      const roundCeiling = Math.max(3, Math.round(roundCapacitySum * 0.85));
      if (roundCeiling < estimatedMaxCount) {
        estimatedMaxCount = Math.max(3, roundCeiling);
        constrainedByRounds = true;
      }
    }
  }

  const suggestedCount = Math.max(
    2,
    Math.min(estimatedMaxCount, Math.round(estimatedMaxCount * 0.65))
  );
  const conservativeCount = Math.max(
    2,
    Math.min(suggestedCount, Math.round(estimatedMaxCount * 0.4))
  );

  // Confidence score calibrated by diversity, atom density, and real post-generation rejection ratio
  let confidence = Math.round(
    45 +
      (km.contentDiversityScore / 100) * 30 +
      Math.min(18, (dedup.uniqueMainConcepts + dedup.uniqueDirectFacts) * 1.1)
  );
  if (dedup.uniqueDirectFacts + dedup.uniqueMainConcepts < 4 && km.readablePageCount <= 2) {
    confidence -= 15;
  }
  if (
    typeof params.receivedCount === 'number' &&
    params.receivedCount > 0 &&
    typeof params.rejectedCount === 'number'
  ) {
    const rejectionRate = params.rejectedCount / params.receivedCount;
    confidence -= Math.round(rejectionRate * 35);
    if (typeof params.verifiedCount === 'number' && params.verifiedCount >= suggestedCount && rejectionRate < 0.15) {
      confidence += 6;
    }
  }
  confidence = Math.max(25, Math.min(97, confidence));

  const isShort = estimatedMaxCount < 14;
  const notes: string[] = [];
  if (normAge === 'kids_7_10') {
    notes.push('تم تضييق التقدير ليناسب بساطة الفهم لدى البراعم (7–10 سنوات) دون تعقيد.');
  } else if (params.difficulty === 'hard' && deepAtoms < 5) {
    notes.push('الأسئلة المتقدمة التحليلية محدودة لقلّة العلاقات السببية والمقارنات العميقة في النص.');
  }
  if (isSparseText) {
    notes.push('كثافة النص المستخرج في الصفحات محدودة؛ لذا خُفّض الحد الأدنى والمقترح ليكون قابلاً للتحقيق دون تكرار.');
  }
  if (constrainedByRounds) {
    notes.push('تم ضبط السقف بناءً على سعة الجولات المختارة حالياً فقط.');
  }
  const extraNote = notes.join(' ');

  const explanationAr = isShort
    ? `محتوى الدرس مركّز ومحدود (${km.readablePageCount} صفحات، ${km.mainConcepts.length} محاور رئيسية)؛ لذا التقدير محافظ لتفادي التكرار أو اختلاق معلومات. ${extraNote}`.trim()
    : `يحتوي الدرس على ${km.readablePageCount} صفحة مقروءة و${km.mainConcepts.length} محاور رئيسية و${dedup.uniqueDirectFacts} حقيقة فريدة و${dedup.uniqueCauses + dedup.uniqueComparisons + dedup.uniqueAnalytical} نقاط تحليلية/مقارنات؛ مما يتيح الوصول للحد الأدنى المضمون (${conservativeCount}) والتدرج بأمان. ${extraNote}`.trim();

  return {
    conservativeCount,
    suggestedCount,
    estimatedMaxCount,
    upperBoundDisclaimerAr:
      'الحد الأعلى التقديري سقف استرشادي أقصى وليس عدداً مضموناً؛ قد يتوقف التوليد مبكراً عند استنفاد مادة النص منعاً للتكرار.',
    confidenceScore: confidence,
    explanationAr,
    recalculatedForAge: normAge,
    recalculatedForDifficulty: params.difficulty,
  };
}

export function evaluateRoundSuitability(params: {
  knowledgeMap: LessonKnowledgeMap;
  ageGroup: AgeGroup;
  difficulty: Difficulty;
}): RoundSuitabilityItem[] {
  const km = params.knowledgeMap;
  const normAge = normalizeAgeGroup(params.ageGroup);

  const factsAndConcepts = km.directFacts.length + km.mainConcepts.length + km.subConcepts.length;
  const analyticalAndCausal = km.causesAndEffects.length + km.analyticalPoints.length + km.comparisons.length;
  const timedEventsCount = km.eventsAndFigures.filter((e) => Boolean(e.timeHint || e.roleOrEvent)).length;
  const chronologicalCount = km.eventsAndFigures.filter((e) => Boolean(e.timeHint)).length;
  const validLists = km.listsAndClassifications.filter((l) => l.items.length >= 2);
  const auctionLists = km.listsAndClassifications.filter((l) => l.items.length >= 3);
  const namedEntities = km.eventsAndFigures.length + km.mainConcepts.filter((m) => m.summary.length > 8).length;

  const toTier = (count: number, excellentAt: number, suitableAt: number): RoundSuitabilityTier => {
    if (count >= excellentAt) return 'excellent';
    if (count >= suitableAt) return 'suitable';
    if (count >= 1) return 'adaptable';
    return 'unsuitable';
  };

  const results: RoundSuitabilityItem[] = [];

  for (const rt of ALL_ROUND_TYPES) {
    const meta = ROUND_RULES[rt];
    let tier: RoundSuitabilityTier = 'suitable';
    let expectedValidCount = 0;
    let distinctContribution = 0;
    let isMultiplier = false;
    let reusesQuestions = false;
    let suitableDifficulty: Difficulty = params.difficulty;
    let cognitiveSkillsAr: string[] = ['فهم', 'تذكر'];
    let reasonAr = '';
    let recommendedSelected = false;

    switch (rt) {
      case 'multiple_choice': {
        expectedValidCount = Math.max(2, Math.round(factsAndConcepts * 0.9 + analyticalAndCausal * 0.7));
        distinctContribution = expectedValidCount;
        tier = toTier(expectedValidCount, 6, 3);
        cognitiveSkillsAr = ['فهم', 'تحليل', 'تمييز البدائل'];
        reasonAr = 'تناسب جميع الدروس وتدعم المشتتات الدقيقة من مفاهيم النص ومقارناته.';
        recommendedSelected = tier === 'excellent' || tier === 'suitable';
        break;
      }
      case 'true_false': {
        expectedValidCount = Math.max(2, Math.round(km.directFacts.length + km.causesAndEffects.length * 0.8 + km.mainConcepts.length));
        distinctContribution = expectedValidCount;
        tier = toTier(expectedValidCount, 5, 2);
        cognitiveSkillsAr = ['تذكر', 'تمييز الحقيقة من الخطأ'];
        reasonAr = `توجد ${km.directFacts.length} حقيقة مباشرة قابلة للتحقق السريع بالصح والخطأ.`;
        recommendedSelected = tier === 'excellent' || tier === 'suitable';
        break;
      }
      case 'rapid_fire': {
        if (normAge === 'kids_7_10' && factsAndConcepts < 4) {
          expectedValidCount = 1;
          tier = 'adaptable';
          reasonAr = 'المحتوى محدود وقد يكون الإيقاع السريع (30ث) ضاغطاً على فئة البراعم.';
        } else {
          expectedValidCount = Math.max(0, Math.round(km.directFacts.length + km.eventsAndFigures.length * 0.6));
          distinctContribution = expectedValidCount;
          tier = toTier(expectedValidCount, 6, 3);
          reasonAr =
            tier === 'unsuitable'
              ? 'لا تتوفر حقائق سريعة ومباشرة كافية لجولة الرشاش السريع.'
              : 'مناسبة للأسئلة المباشرة القصيرة سريعة الإجابة خلال 30 ثانية.';
        }
        cognitiveSkillsAr = ['تذكر سريع', 'استحضار المفاهيم'];
        recommendedSelected = tier === 'excellent' || (tier === 'suitable' && normAge !== 'kids_7_10');
        break;
      }
      case 'fill_blank': {
        expectedValidCount = Math.max(0, Math.round(km.directFacts.length * 0.7 + km.subConcepts.length * 0.5));
        distinctContribution = expectedValidCount;
        tier = toTier(expectedValidCount, 4, 2);
        cognitiveSkillsAr = ['تذكر دقيق', 'فهم المصطلح'];
        reasonAr =
          tier === 'unsuitable'
            ? 'لا توجد مصطلحات أو عبارات محددة واضحة لإكمال الفراغ بدقة.'
            : 'تثبت المصطلحات والمفاهيم الأساسية بإجابة قصيرة محددة.';
        recommendedSelected = tier === 'excellent' || tier === 'suitable';
        break;
      }
      case 'who_am_i': {
        expectedValidCount = Math.min(8, Math.max(0, namedEntities));
        distinctContribution = expectedValidCount;
        tier = namedEntities >= 3 ? (km.eventsAndFigures.length >= 2 ? 'excellent' : 'suitable') : namedEntities >= 1 ? 'adaptable' : 'unsuitable';
        cognitiveSkillsAr = ['ربط واستنتاج', 'تطبيق'];
        reasonAr =
          tier === 'unsuitable'
            ? 'يفتقر النص إلى شخصيات أو مفاهيم محددة تقبل 3 أدلة متدرجة.'
            : `رُصد ${namedEntities} عنصر/شخصية يمكن بناء 3 أدلة متدرجة لكل منها.`;
        recommendedSelected = tier === 'excellent' || tier === 'suitable';
        break;
      }
      case 'list_multiple': {
        expectedValidCount = validLists.length + (km.mainConcepts.length >= 3 && km.subConcepts.length >= 4 ? 1 : 0);
        distinctContribution = expectedValidCount;
        tier = validLists.length >= 2 ? 'excellent' : expectedValidCount >= 1 ? 'suitable' : 'unsuitable';
        cognitiveSkillsAr = ['فهم', 'تصنيف واسترجاع متعدد'];
        reasonAr =
          tier === 'unsuitable'
            ? 'لا توجد قوائم أو تصنيفات متعددة العناصر مثبتة في النص.'
            : `تتوفر ${expectedValidCount} قوائم/تصنيفات متعددة العناصر داخل الدرس.`;
        recommendedSelected = tier === 'excellent' || tier === 'suitable';
        break;
      }
      case 'odd_one_out': {
        const groupBasis = validLists.length + km.comparisons.length;
        expectedValidCount = Math.max(0, groupBasis);
        distinctContribution = expectedValidCount;
        tier = groupBasis >= 2 ? 'excellent' : groupBasis === 1 ? 'suitable' : km.subConcepts.length >= 4 ? 'adaptable' : 'unsuitable';
        cognitiveSkillsAr = ['تحليل', 'تصنيف واستنتاج الفارق'];
        reasonAr =
          tier === 'unsuitable'
            ? 'لا توجد مجموعات متجانسة أو مقارنات تسمح باستخراج عنصر مختلف بسبب واضح.'
            : 'تقيس قدرة الطالب على ربط المجموعة واكتشاف العنصر المختلف مع التعليل.';
        recommendedSelected = tier === 'excellent' || tier === 'suitable';
        break;
      }
      case 'order_items': {
        const seqBasis = chronologicalCount >= 2 ? chronologicalCount : timedEventsCount >= 3 ? 2 : 0;
        expectedValidCount = seqBasis > 0 ? Math.max(1, Math.floor(seqBasis / 2) + 1) : 0;
        distinctContribution = expectedValidCount;
        tier = chronologicalCount >= 4 ? 'excellent' : seqBasis > 0 ? 'suitable' : 'unsuitable';
        suitableDifficulty = 'medium';
        cognitiveSkillsAr = ['تحليل التسلسل الزمني', 'ربط واستنتاج'];
        reasonAr =
          tier === 'unsuitable'
            ? 'لا يتضمن النص تسلسلاً زمنياً أو خطوات مرتبة صالحة للترتيب دون اختلاق.'
            : `يتضمن الدرس ${Math.max(chronologicalCount, timedEventsCount)} محطات زمنية/متتابعة صالحة للترتيب.`;
        recommendedSelected = tier === 'excellent' || tier === 'suitable';
        break;
      }
      case 'memory': {
        const memPools = validLists.length + (km.eventsAndFigures.length >= 3 ? 1 : 0) + (km.directFacts.length >= 4 ? 1 : 0);
        expectedValidCount = Math.max(0, memPools);
        distinctContribution = expectedValidCount;
        tier = memPools >= 3 ? 'excellent' : memPools >= 1 ? 'suitable' : 'unsuitable';
        cognitiveSkillsAr = ['تذكر بصري', 'استرجاع منظم'];
        reasonAr =
          tier === 'unsuitable'
            ? 'لا تتوفر حزم عناصر مترابطة كافية لعرضها ثم اختبار استرجاعها.'
            : 'تناسب استحضار العناصر والحقائق المترابطة بعد عرضها لفترة قصيرة.';
        recommendedSelected = tier === 'excellent';
        break;
      }
      case 'bid_challenge': {
        expectedValidCount = auctionLists.length;
        distinctContribution = expectedValidCount;
        tier = auctionLists.length >= 2 ? 'excellent' : auctionLists.length === 1 ? 'suitable' : 'unsuitable';
        suitableDifficulty = params.difficulty === 'easy' ? 'medium' : params.difficulty;
        cognitiveSkillsAr = ['استرجاع متعدد', 'تقدير المعرفة', 'تطبيق'];
        reasonAr =
          tier === 'unsuitable'
            ? 'جولة «مين يزوّد» تتطلب قوائم ومجموعات موثقة من 3 عناصر فأكثر لإجراء المزايدة دون اختلاق.'
            : `تتوفر ${auctionLists.length} قوائم موسعة موثقة تدعم المزايدة العددية بين الفريقين.`;
        recommendedSelected = tier === 'excellent' || tier === 'suitable';
        break;
      }
      case 'buzzer': {
        const compatCount = Math.round(factsAndConcepts * 0.5 + analyticalAndCausal * 0.5);
        expectedValidCount = compatCount;
        distinctContribution = 0; // Reuses compatible direct/analytical Q&A without inflating unique count
        reusesQuestions = true;
        tier = compatCount >= 4 ? 'excellent' : compatCount >= 2 ? 'suitable' : 'unsuitable';
        cognitiveSkillsAr = ['سرعة البديهة', 'تحليل واستنتاج'];
        reasonAr =
          tier === 'unsuitable'
            ? 'الأسئلة المتاحة قليلة جداً لتشغيل مواجهة الجرس التنافسية.'
            : 'جولة مواجهة تعيد توظيف الأسئلة المباشرة والتحليلية الصالحة لرفع حماس التنافس دون زيادة مصطنعة في العدد الفريد.';
        recommendedSelected = tier === 'excellent';
        break;
      }
      case 'golden': {
        expectedValidCount = Math.max(0, Math.min(4, Math.floor(factsAndConcepts / 3)));
        distinctContribution = 0; // Multiplier round (×2)
        isMultiplier = true;
        tier = factsAndConcepts >= 4 ? 'suitable' : 'adaptable';
        cognitiveSkillsAr = ['ربط واستنتاج', 'حسم النقاط ×2'];
        reasonAr = 'جولة مضاعفة للنقاط (×2) تُطبّق على نوع جولة مختار ولا تُحتسب كزيادة مستقلة في مخزون الأسئلة الفريدة.';
        recommendedSelected = false;
        break;
      }
    }

    results.push({
      roundType: rt,
      nameAr: meta.nameAr,
      descriptionAr: meta.shortDescAr,
      tier,
      tierLabelAr: SUITABILITY_TIER_LABELS[tier],
      expectedValidCount,
      distinctContribution,
      isMultiplier,
      reusesQuestions,
      suitableDifficulty,
      cognitiveSkillsAr,
      reasonAr,
      recommendedSelected,
      selectable: tier !== 'unsuitable',
    });
  }

  return results;
}

export function buildLessonGenerationPlanPreview(params: {
  knowledgeMap: LessonKnowledgeMap;
  capacity: LessonCapacityEstimate;
  suitability: RoundSuitabilityItem[];
  mode: LessonGenerationMode;
  distributionMode: LessonDistributionMode;
  customCount?: number;
  selectedRoundTypes?: RoundType[];
  difficulty: Difficulty;
}): LessonGenerationPlanPreview {
  const { knowledgeMap, capacity, suitability, mode, distributionMode, difficulty } = params;

  const eligibleRoundSet = new Set(
    suitability.filter((s) => s.selectable && !s.isMultiplier).map((s) => s.roundType)
  );

  let chosenRounds = (params.selectedRoundTypes ?? []).filter((rt) => eligibleRoundSet.has(rt));
  if (chosenRounds.length === 0) {
    const recommended = suitability
      .filter((s) => s.recommendedSelected && !s.isMultiplier)
      .map((s) => s.roundType);
    chosenRounds =
      recommended.length > 0
        ? recommended
        : suitability.filter((s) => s.selectable && !s.isMultiplier).slice(0, 3).map((s) => s.roundType);
  }
  if (chosenRounds.length === 0) {
    chosenRounds = ['multiple_choice', 'true_false'];
  }

  const rawTarget =
    mode === 'suggested'
      ? capacity.suggestedCount
      : mode === 'max_quality'
      ? capacity.estimatedMaxCount
      : Math.max(3, Math.min(100, Math.round(params.customCount ?? capacity.suggestedCount)));

  const targetCount = Math.max(2, Math.min(100, rawTarget));

  // Weighted round distribution matching suitability capacity
  const weights = chosenRounds.map((rt) => {
    const s = suitability.find((x) => x.roundType === rt);
    const tierBoost = s?.tier === 'excellent' ? 1.5 : s?.tier === 'suitable' ? 1.0 : 0.6;
    const capWeight = distributionMode === 'ai' ? Math.max(1, (s?.expectedValidCount ?? 2) * tierBoost) : 1;
    return { rt, weight: capWeight };
  });
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0) || 1;

  const counts = new Map<RoundType, number>();
  let allocated = 0;
  for (let i = 0; i < weights.length; i++) {
    const item = weights[i];
    const portion =
      i === weights.length - 1
        ? Math.max(1, targetCount - allocated)
        : Math.max(1, Math.round((item.weight / totalWeight) * targetCount));
    const capped = Math.min(portion, targetCount - allocated);
    if (capped > 0) {
      counts.set(item.rt, capped);
      allocated += capped;
    }
  }
  while (allocated < targetCount) {
    const first = weights[allocated % weights.length].rt;
    counts.set(first, (counts.get(first) ?? 0) + 1);
    allocated++;
  }

  const roundDistribution = Array.from(counts.entries()).map(([rt, count]) => ({
    roundType: rt,
    nameAr: ROUND_RULES[rt].nameAr,
    count,
    percentage: Math.round((count / Math.max(1, targetCount)) * 100),
  }));

  // Difficulty distribution
  const difficultyDistribution: Record<Difficulty, number> =
    difficulty === 'hard'
      ? {
          easy: Math.round(targetCount * 0.1),
          medium: Math.round(targetCount * 0.3),
          hard: Math.max(1, targetCount - Math.round(targetCount * 0.1) - Math.round(targetCount * 0.3)),
        }
      : difficulty === 'easy'
      ? {
          easy: Math.max(1, Math.round(targetCount * 0.65)),
          medium: Math.round(targetCount * 0.3),
          hard: Math.max(0, targetCount - Math.max(1, Math.round(targetCount * 0.65)) - Math.round(targetCount * 0.3)),
        }
      : {
          easy: Math.round(targetCount * 0.25),
          medium: Math.max(1, Math.round(targetCount * 0.5)),
          hard: Math.max(0, targetCount - Math.round(targetCount * 0.25) - Math.max(1, Math.round(targetCount * 0.5))),
        };

  // Cognitive distribution balanced by lesson diversity & difficulty
  const rememberPct = difficulty === 'easy' ? 0.38 : difficulty === 'medium' ? 0.22 : 0.12;
  const understandPct = difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.28 : 0.18;
  const applyPct = knowledgeMap.educationalValues.length > 0 ? 0.16 : 0.1;
  const analyzePct = difficulty === 'hard' ? 0.3 : 0.22;
  const cognitiveDistribution: Record<PedagogicalCognitiveLevel, number> = {
    remember: Math.round(targetCount * rememberPct),
    understand: Math.round(targetCount * understandPct),
    apply: Math.round(targetCount * applyPct),
    analyze: Math.round(targetCount * analyzePct),
    infer: 0,
  };
  const assignedCog =
    cognitiveDistribution.remember +
    cognitiveDistribution.understand +
    cognitiveDistribution.apply +
    cognitiveDistribution.analyze;
  cognitiveDistribution.infer = Math.max(0, targetCount - assignedCog);

  const coveredTopics = knowledgeMap.mainConcepts.map((c) => c.title);
  const limitedTopics =
    targetCount < knowledgeMap.mainConcepts.length
      ? knowledgeMap.mainConcepts.slice(targetCount).map((c) => c.title)
      : [];

  const batchSize = difficulty === 'hard' ? 6 : 8;
  const estimatedBatches = Math.max(1, Math.ceil(targetCount / batchSize));
  const estimatedApiRequests = estimatedBatches * 2; // 1 generation + 1 flash-lite verification per batch

  return {
    mode,
    distributionMode,
    targetCount,
    selectedRoundTypes: chosenRounds,
    roundDistribution,
    difficultyDistribution,
    cognitiveDistribution,
    coveredTopics,
    limitedTopics,
    estimatedBatches,
    estimatedApiRequests,
    quotaNoteAr: `تقدير الاستهلاك: نحو ${estimatedBatches} دفعات (${estimatedApiRequests} طلبات ضمن الحصة المجانية — التحليل محفوظ مسبقاً ولن يُعاد).`,
  };
}
