import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnowledgeMapFromAnalysis,
  buildLessonGenerationPlanPreview,
  estimateLessonCapacity,
  evaluateRoundSuitability,
} from './lessonIntelligence';

test('Short/low-sequence lesson blocks order_items and bid_challenge and gives realistic conservative capacity', () => {
  const km = buildKnowledgeMapFromAnalysis({
    title: 'آداب المسجد',
    subject: 'الفقه والآداب',
    ageGroup: 'kids_7_10',
    analysis: {
      readabilityOk: true,
      actualPageCount: 2,
      isReligiousContent: true,
      topics: [{ title: 'دخول المسجد', pageNumbers: [1], keyConcepts: ['الدعاء', 'الهدوء'] }],
      pageSummaries: [{ page: 1, summary: 'يستحب تقديم الرجل اليمنى عند دخول المسجد مع السكينة.' }],
      directFacts: [
        { text: 'يستحب تقديم الرجل اليمنى عند دخول المسجد', page: 1 },
        { text: 'المحافظة على نظافة المسجد وهدوئه', page: 2 },
      ],
      objectives: ['تطبيق سنة دخول المسجد'],
      eventsAndFigures: [],
      listsAndClassifications: [],
    },
  });

  const cap = estimateLessonCapacity({
    knowledgeMap: km,
    ageGroup: 'kids_7_10',
    difficulty: 'easy',
  });

  assert.ok(cap.conservativeCount <= cap.suggestedCount);
  assert.ok(cap.suggestedCount <= cap.estimatedMaxCount);
  assert.ok(cap.estimatedMaxCount <= 20, `Short 2-page PDF should have modest ceiling, got ${cap.estimatedMaxCount}`);
  assert.ok(cap.upperBoundDisclaimerAr.includes('ليس عدداً مضموناً'));

  const suitability = evaluateRoundSuitability({
    knowledgeMap: km,
    ageGroup: 'kids_7_10',
    difficulty: 'easy',
  });

  assert.equal(suitability.length, 12);
  const orderRound = suitability.find((r) => r.roundType === 'order_items')!;
  const bidRound = suitability.find((r) => r.roundType === 'bid_challenge')!;
  const goldenRound = suitability.find((r) => r.roundType === 'golden')!;
  const mcqRound = suitability.find((r) => r.roundType === 'multiple_choice')!;

  assert.equal(orderRound.tier, 'unsuitable');
  assert.equal(orderRound.selectable, false);
  assert.equal(bidRound.tier, 'unsuitable');
  assert.equal(bidRound.selectable, false);
  assert.equal(goldenRound.isMultiplier, true);
  assert.equal(goldenRound.distinctContribution, 0);
  assert.ok(mcqRound.selectable);
});

test('Changing age group and difficulty recalculates capacity and filters unsuitable rounds in plan preview', () => {
  const km = buildKnowledgeMapFromAnalysis({
    title: 'صلح الحديبية',
    subject: 'السيرة النبوية',
    ageGroup: 'adults_18_plus',
    analysis: {
      readabilityOk: true,
      actualPageCount: 17,
      isReligiousContent: true,
      topics: [
        { title: 'رؤيا العمرة', pageNumbers: [1, 2], keyConcepts: ['ذي الحليفة', 'الهدي'] },
        { title: 'بيعة الرضوان', pageNumbers: [4, 5, 6], keyConcepts: ['عثمان', 'الشجرة'] },
        { title: 'بنود الصلح', pageNumbers: [8, 9, 10], keyConcepts: ['الهدنة', 'عشر سنين'] },
      ],
      directFacts: Array.from({ length: 12 }, (_, i) => ({ text: `حقيقة ${i + 1}`, page: i + 1 })),
      causesAndEffects: [
        { cause: 'إشاعة مقتل عثمان', effect: 'بيعة الرضوان', page: 5 },
        { cause: 'هدنة عشر سنين', effect: 'تفرغ المسلمين للدعوة', page: 10 },
      ],
      eventsAndFigures: [
        { name: 'الخروج من المدينة', roleOrEvent: 'بداية رحلة العمرة', timeHint: 'ذي القعدة 6 هـ', page: 1 },
        { name: 'عروة بن مسعود', roleOrEvent: 'مفاوض قريش', timeHint: 'المرحلة الثانية', page: 4 },
        { name: 'عثمان بن عفان', roleOrEvent: 'مبعوث النبي صلى الله عليه وسلم', timeHint: 'قبل البيعة', page: 5 },
        { name: 'سهيل بن عمرو', roleOrEvent: 'توقيع البنود', timeHint: 'ختام المفاوضات', page: 8 },
      ],
      listsAndClassifications: [
        { title: 'شروط صلح الحديبية', items: ['وضع الحرب 10 سنين', 'تأجيل العمرة لعام قادم', 'دخول القبائل في الأحلاف', 'رد من جاء مسلماً دون إذن وليه'], page: 8 },
      ],
      comparisons: [{ title: 'نظرة الصحابة مقابل النتائج البعيدة', sides: ['الظاهر', 'المآل'], page: 11 }],
      analyticalPoints: [
        { point: 'اعتراف قريش بكيان المسلمين سياسياً', page: 9 },
        { point: 'التمهيد لفتح مكة', page: 12 },
      ],
      educationalValues: ['طاعة النبي صلى الله عليه وسلم وحكمة التفاوض'],
    },
  });

  const adultsHardCap = estimateLessonCapacity({ knowledgeMap: km, ageGroup: 'adults_18_plus', difficulty: 'hard' });
  const kidsEasyCap = estimateLessonCapacity({ knowledgeMap: km, ageGroup: 'kids_7_10', difficulty: 'easy' });
  assert.ok(adultsHardCap.estimatedMaxCount > kidsEasyCap.estimatedMaxCount);

  const suitability = evaluateRoundSuitability({ knowledgeMap: km, ageGroup: 'adults_18_plus', difficulty: 'hard' });
  assert.equal(suitability.find((r) => r.roundType === 'order_items')?.selectable, true);
  assert.equal(suitability.find((r) => r.roundType === 'bid_challenge')?.selectable, true);

  const plan = buildLessonGenerationPlanPreview({
    knowledgeMap: km,
    capacity: adultsHardCap,
    suitability,
    mode: 'suggested',
    distributionMode: 'ai',
    selectedRoundTypes: ['multiple_choice', 'order_items', 'bid_challenge', 'who_am_i'],
    difficulty: 'hard',
  });

  assert.equal(plan.targetCount, adultsHardCap.suggestedCount);
  assert.equal(plan.roundDistribution.reduce((s, r) => s + r.count, 0), plan.targetCount);
  const cogTotal = Object.values(plan.cognitiveDistribution).reduce((s, n) => s + n, 0);
  assert.equal(cogTotal, plan.targetCount);
});

test('Overlapping fallbacks and sparse pageTexts calibrate conservativeCount realistically below reportedMaxDistinct and honor selected rounds', () => {
  const pageSummaries = Array.from({ length: 17 }, (_, i) => ({
    page: i + 1,
    summary: `ملخص صلح الحديبية الصفحة ${i + 1} يتضمن سبب الخروج والمفاوضات.`,
    tablesOrComparisons: i % 2 === 0 ? `مقارنة الموقف صفحة ${i + 1}` : '',
    timelineEvents: `الحدث الزمني في الصفحة ${i + 1}`,
  }));
  const pageTexts = Array.from({ length: 17 }, (_, i) => ({
    page: i + 1,
    text: `الشريحة ${i + 1}: أحداث صلح الحديبية في السنة السادسة للهجرة وبنود الهدنة.`,
  }));

  const km = buildKnowledgeMapFromAnalysis({
    title: 'صلح الحديبية — شرائح مختصرة',
    subject: 'السيرة النبوية',
    ageGroup: 'adults_18_plus',
    analysis: {
      readabilityOk: true,
      actualPageCount: 17,
      isReligiousContent: true,
      topics: [
        { title: 'رؤيا العمرة', pageNumbers: [1, 2, 3], keyConcepts: ['الإحرام', 'ذي الحليفة'] },
        { title: 'المفاوضات', pageNumbers: [4, 5, 6, 7], keyConcepts: ['عثمان', 'بيعة الرضوان'] },
        { title: 'البنود والفتح', pageNumbers: [8, 9, 10, 11], keyConcepts: ['هدنة عشر سنين', 'سورة الفتح'] },
      ],
      pageSummaries,
      pageTexts,
      objectives: ['رؤيا العمرة', 'بيعة الرضوان'],
      estimatedMaxDistinctQuestions: 30,
    },
  });

  const suitability = evaluateRoundSuitability({
    knowledgeMap: km,
    ageGroup: 'adults_18_plus',
    difficulty: 'medium',
  });

  const fullCap = estimateLessonCapacity({
    knowledgeMap: km,
    ageGroup: 'adults_18_plus',
    difficulty: 'medium',
    reportedMaxDistinct: 30,
    pageTexts,
    suitability,
  });

  assert.ok(fullCap.conservativeCount <= 16, `Expected conservativeCount <= 16, got ${fullCap.conservativeCount}`);
  assert.ok(fullCap.conservativeCount < fullCap.suggestedCount);
  assert.ok(fullCap.suggestedCount <= fullCap.estimatedMaxCount);
  assert.ok(fullCap.estimatedMaxCount <= 32, `Expected estimatedMaxCount <= 32, got ${fullCap.estimatedMaxCount}`);

  // Narrowing to only 1 limited round lowers estimatedMaxCount accordingly
  const narrowCap = estimateLessonCapacity({
    knowledgeMap: km,
    ageGroup: 'adults_18_plus',
    difficulty: 'medium',
    reportedMaxDistinct: 30,
    pageTexts,
    selectedRoundTypes: ['who_am_i'],
    suitability,
  });
  assert.ok(
    narrowCap.estimatedMaxCount < fullCap.estimatedMaxCount,
    `Narrow round selection (${narrowCap.estimatedMaxCount}) should be lower than full (${fullCap.estimatedMaxCount})`
  );
});

