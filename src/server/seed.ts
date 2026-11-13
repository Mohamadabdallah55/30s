import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { buildQuestionHash } from '../shared/questionSchema';
import { difficultyToLevel, normalizeAgeGroup } from '../shared/gameRules';
import type { AgeGroup, Difficulty, DifficultyLevel, RoundType } from '../shared/types';

interface SeedQuestionInput {
  externalId: string;
  roundType: RoundType;
  category: string;
  ageGroup: AgeGroup;
  difficulty: Difficulty;
  difficultyLevel?: DifficultyLevel;
  unsuitableForTimed?: boolean;
  prompt: string;
  options?: string[];
  acceptableAnswers: string[];
  correctIndex?: number | null;
  explanation?: string;
  clues?: string[];
  orderCriteria?: string;
  memoryItems?: string[];
  memoryRevealSeconds?: number;
  oddReason?: string;
  isReligious?: boolean;
}

const SEED_QUESTIONS: SeedQuestionInput[] = [
  // 1. rapid_fire (الرشاش)
  {
    externalId: 'RF-01',
    roundType: 'rapid_fire',
    category: 'القرآن الكريم',
    ageGroup: 'family',
    difficulty: 'easy',
    prompt: 'ما هي السورة التي تُسمى قلب القرآن عند كثير من أهل العلم؟',
    acceptableAnswers: ['يس', 'سورة يس'],
    explanation: 'سورة يس من السور المكية العظيمة.',
    isReligious: true,
  },
  {
    externalId: 'RF-02',
    roundType: 'rapid_fire',
    category: 'السيرة النبوية',
    ageGroup: 'kids',
    difficulty: 'easy',
    prompt: 'ما اسم الغار الذي تعبّد فيه النبي ﷺ قبل البعثة؟',
    acceptableAnswers: ['حراء', 'غار حراء'],
    explanation: 'غار حراء في جبل النور بمكة المكرمة.',
    isReligious: true,
  },
  {
    externalId: 'RF-03',
    roundType: 'rapid_fire',
    category: 'القرآن الكريم',
    ageGroup: 'youth',
    difficulty: 'medium',
    prompt: 'كم عدد أجزاء القرآن الكريم؟',
    acceptableAnswers: ['30', 'ثلاثون', 'ثلاثين'],
    isReligious: true,
  },
  {
    externalId: 'RF-04',
    roundType: 'rapid_fire',
    category: 'الفقه والآداب',
    ageGroup: 'kids',
    difficulty: 'easy',
    prompt: 'كم عدد الصلوات المفروضة في اليوم والليلة؟',
    acceptableAnswers: ['5', 'خمس', 'خمس صلوات'],
    isReligious: true,
  },
  {
    externalId: 'RF-05',
    roundType: 'rapid_fire',
    category: 'الثقافة العربية',
    ageGroup: 'youth',
    difficulty: 'easy',
    prompt: 'ما هي عاصمة المملكة الأردنية الهاشمية؟',
    acceptableAnswers: ['عمان'],
    isReligious: false,
  },
  {
    externalId: 'RF-06',
    roundType: 'rapid_fire',
    category: 'العلوم والطبيعة',
    ageGroup: 'family',
    difficulty: 'easy',
    prompt: 'ما هو الكوكب الأقرب إلى الشمس؟',
    acceptableAnswers: ['عطارد'],
    isReligious: false,
  },
  {
    externalId: 'RF-07',
    roundType: 'rapid_fire',
    category: 'السيرة النبوية',
    ageGroup: 'adults',
    difficulty: 'medium',
    prompt: 'من هو الصحابي الذي أشار بحفر الخندق في غزوة الأحزاب؟',
    acceptableAnswers: ['سلمان الفارسي', 'سلمان'],
    isReligious: true,
  },
  {
    externalId: 'RF-08',
    roundType: 'rapid_fire',
    category: 'القرآن الكريم',
    ageGroup: 'kids',
    difficulty: 'easy',
    prompt: 'ما هي أطول سورة في القرآن الكريم؟',
    acceptableAnswers: ['البقرة', 'سورة البقرة'],
    isReligious: true,
  },

  // 2. list_multiple (اذكر ثلاثة أو خمسة)
  {
    externalId: 'LM-01',
    roundType: 'list_multiple',
    category: 'الفقه والآداب',
    ageGroup: 'kids',
    difficulty: 'easy',
    prompt: 'اذكر ثلاثة من أركان الإسلام الخمسة:',
    acceptableAnswers: ['الشهادتان', 'الصلاة', 'إقامة الصلاة', 'الزكاة', 'إيتاء الزكاة', 'الصوم', 'صوم رمضان', 'الحج', 'حج البيت'],
    explanation: 'أركان الإسلام خمسة: الشهادتان، الصلاة، الزكاة، الصوم، والحج لمن استطاع إليه سبيلاً.',
    isReligious: true,
  },
  {
    externalId: 'LM-02',
    roundType: 'list_multiple',
    category: 'السيرة النبوية',
    ageGroup: 'youth',
    difficulty: 'medium',
    prompt: 'اذكر ثلاثة من الخلفاء الراشدين الأربعة:',
    acceptableAnswers: ['أبو بكر الصديق', 'أبو بكر', 'عمر بن الخطاب', 'عمر', 'عثمان بن عفان', 'عثمان', 'علي بن أبي طالب', 'علي'],
    explanation: 'الخلفاء الراشدون هم أبو بكر وعمر وعثمان وعلي رضي الله عنهم.',
    isReligious: true,
  },
  {
    externalId: 'LM-03',
    roundType: 'list_multiple',
    category: 'القرآن الكريم',
    ageGroup: 'family',
    difficulty: 'medium',
    prompt: 'اذكر ثلاث سور تبدأ بـ (الحمد لله):',
    acceptableAnswers: ['الفاتحة', 'الأنعام', 'الكهف', 'سبأ', 'فاطر'],
    explanation: 'السور الخمس التي تبدأ بالحمد لله: الفاتحة، الأنعام، الكهف، سبأ، وفاطر.',
    isReligious: true,
  },

  // 3. true_false (صح أو خطأ)
  {
    externalId: 'TF-01',
    roundType: 'true_false',
    category: 'القرآن الكريم',
    ageGroup: 'kids',
    difficulty: 'easy',
    prompt: 'سورة الإخلاص تعدل ثلث القرآن في الأجر والثواب.',
    options: ['صح', 'خطأ'],
    acceptableAnswers: ['صح'],
    correctIndex: 0,
    explanation: 'ثبت في الصحيحين أن سورة الإخلاص تعدل ثلث القرآن.',
    isReligious: true,
  },
  {
    externalId: 'TF-02',
    roundType: 'true_false',
    category: 'السيرة النبوية',
    ageGroup: 'youth',
    difficulty: 'easy',
    prompt: 'وقعت غزوة بدر الكبرى في السنة الرابعة للهجرة.',
    options: ['صح', 'خطأ'],
    acceptableAnswers: ['خطأ'],
    correctIndex: 1,
    explanation: 'وقعت غزوة بدر الكبرى في السنة الثانية للهجرة في شهر رمضان.',
    isReligious: true,
  },
  {
    externalId: 'TF-03',
    roundType: 'true_false',
    category: 'الفقه والآداب',
    ageGroup: 'family',
    difficulty: 'easy',
    prompt: 'يُسنّ تقديم الرجل اليمنى عند دخول المسجد.',
    options: ['صح', 'خطأ'],
    acceptableAnswers: ['صح'],
    correctIndex: 0,
    explanation: 'من السنة دخول المسجد بالرجل اليمنى والخروج باليسرى مع ذكر الدعاء المأثور.',
    isReligious: true,
  },
  {
    externalId: 'TF-04',
    roundType: 'true_false',
    category: 'العلوم والطبيعة',
    ageGroup: 'kids',
    difficulty: 'easy',
    prompt: 'تتنفس الأسماك الأكسجين المذاب في الماء عن طريق الخياشيم.',
    options: ['صح', 'خطأ'],
    acceptableAnswers: ['صح'],
    correctIndex: 0,
    isReligious: false,
  },
  {
    externalId: 'TF-05',
    roundType: 'true_false',
    category: 'القرآن الكريم',
    ageGroup: 'adults',
    difficulty: 'medium',
    prompt: 'سورة التوبة تبدأ بالبسملة مثل سائر سور القرآن.',
    options: ['صح', 'خطأ'],
    acceptableAnswers: ['خطأ'],
    correctIndex: 1,
    explanation: 'سورة التوبة هي السورة الوحيدة التي لا تبدأ بالبسملة في المصحف.',
    isReligious: true,
  },
  {
    externalId: 'TF-06',
    roundType: 'true_false',
    category: 'الثقافة العربية',
    ageGroup: 'youth',
    difficulty: 'medium',
    prompt: 'تقع مدينة القيروان التاريخية في دولة تونس.',
    options: ['صح', 'خطأ'],
    acceptableAnswers: ['صح'],
    correctIndex: 0,
    isReligious: false,
  },

  // 4. multiple_choice (اختيار من متعدد)
  {
    externalId: 'MC-01',
    roundType: 'multiple_choice',
    category: 'السيرة النبوية',
    ageGroup: 'kids',
    difficulty: 'easy',
    prompt: 'من هو مؤذن النبي ﷺ الأول في المدينة المنورة؟',
    options: ['بلال بن رباح', 'أبو ذر الغفاري', 'سعد بن معاذ', 'خالد بن الوليد'],
    acceptableAnswers: ['بلال بن رباح'],
    correctIndex: 0,
    explanation: 'بلال بن رباح رضي الله عنه هو مؤذن رسول الله ﷺ.',
    isReligious: true,
  },
  {
    externalId: 'MC-02',
    roundType: 'multiple_choice',
    category: 'القرآن الكريم',
    ageGroup: 'youth',
    difficulty: 'medium',
    prompt: 'ما السورة التي ذُكرت فيها البسملة مرتين؟',
    options: ['سورة النمل', 'سورة الكهف', 'سورة يوسف', 'سورة القصص'],
    acceptableAnswers: ['سورة النمل'],
    correctIndex: 0,
    explanation: 'وردت البسملة في مطلع سورة النمل وفي كتاب سليمان عليه السلام في الآية 30.',
    isReligious: true,
  },
  {
    externalId: 'MC-03',
    roundType: 'multiple_choice',
    category: 'الفقه والآداب',
    ageGroup: 'adults',
    difficulty: 'medium',
    prompt: 'كم عدد ركعات صلاة الخسوف أو الكسوف في الهيئة المشهورة؟',
    options: ['ركعتان في كل ركعة ركوعان', 'أربع ركعات بتسليمة واحدة', 'ثلاث ركعات كالوتر', 'ركعة واحدة'],
    acceptableAnswers: ['ركعتان في كل ركعة ركوعان'],
    correctIndex: 0,
    explanation: 'صلاة الكسوف ركعتان، في كل ركعة قيامان وقراءتان وركوعان وسجدتان.',
    isReligious: true,
  },
  {
    externalId: 'MC-04',
    roundType: 'multiple_choice',
    category: 'العلوم والطبيعة',
    ageGroup: 'family',
    difficulty: 'easy',
    prompt: 'ما الغاز الأكثر نسبة في الغلاف الجوي للأرض؟',
    options: ['النيتروجين', 'الأكسجين', 'ثاني أكسيد الكربون', 'الهيدروجين'],
    acceptableAnswers: ['النيتروجين'],
    correctIndex: 0,
    explanation: 'يشكل النيتروجين نحو 78% من الغلاف الجوي.',
    isReligious: false,
  },
  {
    externalId: 'MC-05',
    roundType: 'multiple_choice',
    category: 'الثقافة العربية',
    ageGroup: 'youth',
    difficulty: 'medium',
    prompt: 'من هو مؤسس علم الجبر وصاحب كتاب "الجبر والمقابلة"؟',
    options: ['محمد بن موسى الخوارزمي', 'ابن سينا', 'الحسن بن الهيثم', 'جابر بن حيان'],
    acceptableAnswers: ['محمد بن موسى الخوارزمي'],
    correctIndex: 0,
    isReligious: false,
  },

  // 5. fill_blank (أكمل الفراغ)
  {
    externalId: 'FB-01',
    roundType: 'fill_blank',
    category: 'القرآن الكريم',
    ageGroup: 'kids',
    difficulty: 'easy',
    prompt: 'أكمل الآية الكريمة: ﴿وَقُل رَّبِّ زِدْنِي ........﴾',
    acceptableAnswers: ['علما', 'عِلْمًا'],
    explanation: 'سورة طه الآية 114.',
    isReligious: true,
  },
  {
    externalId: 'FB-02',
    roundType: 'fill_blank',
    category: 'الفقه والآداب',
    ageGroup: 'family',
    difficulty: 'easy',
    prompt: 'أكمل الحديث الشريف: «إنما الأعمال بالنيات، وإنما لكل امرئ ما ........»',
    acceptableAnswers: ['نوى'],
    explanation: 'حديث عمر بن الخطاب رضي الله عنه المتفق عليه.',
    isReligious: true,
  },
  {
    externalId: 'FB-03',
    roundType: 'fill_blank',
    category: 'السيرة النبوية',
    ageGroup: 'youth',
    difficulty: 'medium',
    prompt: 'أول مسجد بُني في الإسلام في المدينة المنورة هو مسجد ........',
    acceptableAnswers: ['قباء', 'مسجد قباء'],
    explanation: 'أسّسه النبي ﷺ عند وصوله إلى قباء في الهجرة.',
    isReligious: true,
  },

  // 6. who_am_i (من أنا؟)
  {
    externalId: 'WHO-01',
    roundType: 'who_am_i',
    category: 'السيرة النبوية',
    ageGroup: 'family',
    difficulty: 'medium',
    prompt: 'استنتج الشخصية التاريخية الإسلامية من الأدلة المتتابعة:',
    clues: [
      'ولدت في مكة وكنت رفيق النبي ﷺ في الهجرة داخل غار ثور.',
      'أنفقت مالي في سبيل الله وأعتقت بلال بن رباح رضي الله عنه.',
      'لُقبتُ بالصديق وكنت أول الخلفاء الراشدين.',
    ],
    acceptableAnswers: ['أبو بكر الصديق', 'ابو بكر', 'أبو بكر'],
    explanation: 'عبد الله بن أبي قحافة، أبو بكر الصديق رضي الله عنه.',
    isReligious: true,
  },
  {
    externalId: 'WHO-02',
    roundType: 'who_am_i',
    category: 'القرآن الكريم',
    ageGroup: 'kids',
    difficulty: 'easy',
    prompt: 'من أنا من أنبياء الله عليهم السلام؟',
    clues: [
      'أُلقيت في اليمّ صغيرًا ثم التقطني آل فرعون.',
      'أرسلني الله إلى فرعون وأيدني بآية العصا.',
      'فلق الله لي البحر بعصاي عندما خرجت ببني إسرائيل.',
    ],
    acceptableAnswers: ['موسى', 'النبي موسى', 'موسى عليه السلام'],
    explanation: 'نبي الله موسى كليم الله عليه السلام.',
    isReligious: true,
  },
  {
    externalId: 'WHO-03',
    roundType: 'who_am_i',
    category: 'العلوم والطبيعة',
    ageGroup: 'youth',
    difficulty: 'medium',
    prompt: 'من أنا من علماء الحضارة الإسلامية؟',
    clues: [
      'وُلدت في البصرة وعشت في القرن الرابع والخامس الهجري.',
      'وضعت أساس المنهج التجريبي في البصريات.',
      'ألّفت كتاب "المناظر" وفسّرت كيفية حدوث الإبصار.',
    ],
    acceptableAnswers: ['ابن الهيثم', 'الحسن بن الهيثم'],
    explanation: 'الحسن بن الهيثم رائد علم البصريات الحديث.',
    isReligious: false,
  },

  // 7. odd_one_out (اكتشف المختلف)
  {
    externalId: 'ODD-01',
    roundType: 'odd_one_out',
    category: 'القرآن الكريم',
    ageGroup: 'youth',
    difficulty: 'medium',
    prompt: 'اختر السورة المختلفة من حيث مكان النزول (مكية أم مدنية):',
    options: ['سورة البقرة', 'سورة آل عمران', 'سورة النساء', 'سورة الكهف'],
    acceptableAnswers: ['سورة الكهف'],
    correctIndex: 3,
    oddReason: 'سورة الكهف مكية، بينما البقرة وآل عمران والنساء سور مدنية.',
    explanation: 'السور الثلاث الأولى مدنية، والكهف مكية.',
    isReligious: true,
  },
  {
    externalId: 'ODD-02',
    roundType: 'odd_one_out',
    category: 'الفقه والآداب',
    ageGroup: 'kids',
    difficulty: 'easy',
    prompt: 'اختر العبادة التي تختلف عن الصلوات الخمس المفروضة:',
    options: ['صلاة الفجر', 'صلاة الظهر', 'صلاة الضحى', 'صلاة العصر'],
    acceptableAnswers: ['صلاة الضحى'],
    correctIndex: 2,
    oddReason: 'صلاة الضحى نافلة مستحبة، أما البقية فهي صلوات مفروضة.',
    explanation: 'صلاة الضحى سنة مؤكدة وليست من الفرائض الخمس.',
    isReligious: true,
  },

  // 8. order_items (رتب العناصر)
  {
    externalId: 'ORD-01',
    roundType: 'order_items',
    category: 'السيرة النبوية',
    ageGroup: 'family',
    difficulty: 'medium',
    prompt: 'رتّب أحداث السيرة النبوية التالية من الأقدم إلى الأحدث:',
    orderCriteria: 'الترتيب الزمني من الأقدم إلى الأحدث',
    options: ['غزوة الخندق', 'الهجرة إلى المدينة', 'فتح مكة', 'غزوة بدر الكبرى'],
    acceptableAnswers: ['الهجرة إلى المدينة', 'غزوة بدر الكبرى', 'غزوة الخندق', 'فتح مكة'],
    explanation: 'الهجرة (1هـ) -> بدر (2هـ) -> الخندق (5هـ) -> فتح مكة (8هـ).',
    isReligious: true,
  },
  {
    externalId: 'ORD-02',
    roundType: 'order_items',
    category: 'القرآن الكريم',
    ageGroup: 'kids',
    difficulty: 'easy',
    prompt: 'رتّب السور التالية حسب ترتيبها في المصحف الشريف:',
    orderCriteria: 'من البداية إلى النهاية في المصحف',
    options: ['سورة الناس', 'سورة الفاتحة', 'سورة الإخلاص', 'سورة البقرة'],
    acceptableAnswers: ['سورة الفاتحة', 'سورة البقرة', 'سورة الإخلاص', 'سورة الناس'],
    explanation: 'الفاتحة (1)، البقرة (2)، الإخلاص (112)، الناس (114).',
    isReligious: true,
  },

  // 9. memory (تحدي الذاكرة)
  {
    externalId: 'MEM-01',
    roundType: 'memory',
    category: 'الفقه والآداب',
    ageGroup: 'kids',
    difficulty: 'easy',
    prompt: 'ما هي السُّنّة التي كانت في الترتيب الثالث ضمن آداب المسجد المعروضة؟',
    memoryItems: ['الوضوء في البيت', 'التبكير إلى المسجد', 'دخول المسجد باليمنى', 'صلاة تحية المسجد', 'السكينة والوقار'],
    memoryRevealSeconds: 8,
    acceptableAnswers: ['دخول المسجد باليمنى', 'الدخول باليمنى', 'اليمنى'],
    explanation: 'العنصر الثالث كان: دخول المسجد باليمنى.',
    isReligious: true,
  },
  {
    externalId: 'MEM-02',
    roundType: 'memory',
    category: 'السيرة النبوية',
    ageGroup: 'youth',
    difficulty: 'medium',
    prompt: 'أي غزوة أو محطة كانت في الترتيب الرابع في البطاقة المعروضة؟',
    memoryItems: ['بدر', 'أحد', 'الخندق', 'الحديبية', 'خيبر'],
    memoryRevealSeconds: 7,
    acceptableAnswers: ['الحديبية', 'صلح الحديبية'],
    explanation: 'الترتيب الرابع كان: الحديبية.',
    isReligious: true,
  },

  // 10. buzzer (المواجهة بالجرس)
  {
    externalId: 'BUZ-01',
    roundType: 'buzzer',
    category: 'القرآن الكريم',
    ageGroup: 'family',
    difficulty: 'medium',
    prompt: 'ما اسم الصحابي الجليل الوحيد الذي ذُكر اسمه صريحًا في القرآن الكريم؟',
    acceptableAnswers: ['زيد بن حارثة', 'زيد'],
    explanation: 'ورد اسمه في سورة الأحزاب الآية 37.',
    isReligious: true,
  },
  {
    externalId: 'BUZ-02',
    roundType: 'buzzer',
    category: 'السيرة النبوية',
    ageGroup: 'youth',
    difficulty: 'easy',
    prompt: 'بماذا لُقّب النبي ﷺ قبل البعثة لصدقه وأمانته؟',
    acceptableAnswers: ['الصادق الأمين', 'الأمين'],
    isReligious: true,
  },
  {
    externalId: 'BUZ-03',
    roundType: 'buzzer',
    category: 'الثقافة العربية',
    ageGroup: 'adults',
    difficulty: 'medium',
    prompt: 'ما أطول نهر في قارة أفريقيا والعالم العربي؟',
    acceptableAnswers: ['نهر النيل', 'النيل'],
    isReligious: false,
  },

  // 11. golden (الجولة الذهبية - نقاط مضاعفة)
  {
    externalId: 'GLD-01',
    roundType: 'golden',
    category: 'القرآن الكريم',
    ageGroup: 'family',
    difficulty: 'hard',
    prompt: 'في أي سورة وردت أطول آية في القرآن الكريم (آية الدَّين) وما رقمها؟',
    acceptableAnswers: ['البقرة 282', 'سورة البقرة 282', 'البقرة'],
    explanation: 'آية الدَّين هي الآية رقم 282 في سورة البقرة.',
    isReligious: true,
  },
  {
    externalId: 'GLD-02',
    roundType: 'golden',
    category: 'السيرة النبوية',
    ageGroup: 'adults',
    difficulty: 'hard',
    prompt: 'ما الاسم الكامل للإمام المجدد الذي سُمي المسجد باسمه (تاريخ وفاته 728هـ)؟',
    acceptableAnswers: ['أحمد بن عبد الحليم بن تيمية', 'تقي الدين أحمد بن تيمية', 'أحمد بن تيمية'],
    explanation: 'شيخ الإسلام تقي الدين أحمد بن عبد الحليم بن عبد السلام بن تيمية الحراني (661–728هـ).',
    isReligious: true,
  },
  {
    externalId: 'GLD-03',
    roundType: 'golden',
    category: 'الفقه والآداب',
    ageGroup: 'kids_7_10',
    difficulty: 'medium',
    difficultyLevel: 2,
    prompt: 'ما الدعاء الذي يُقال عند الخروج من المسجد؟',
    acceptableAnswers: ['اللهم إني أسألك من فضلك', 'أسألك من فضلك'],
    explanation: 'عند الدخول: اللهم افتح لي أبواب رحمتك، وعند الخروج: اللهم إني أسألك من فضلك.',
    isReligious: true,
  },
  // Additional rich seeds across all 5 canonical age groups & levels (1..5)
  {
    externalId: 'RF-09',
    roundType: 'rapid_fire',
    category: 'السيرة النبوية',
    ageGroup: 'preteen_11_13',
    difficulty: 'easy',
    difficultyLevel: 2,
    prompt: 'ما اسم الناقة التي هاجر عليها النبي ﷺ إلى المدينة؟',
    acceptableAnswers: ['القصواء', 'قصواء'],
    isReligious: true,
  },
  {
    externalId: 'RF-10',
    roundType: 'rapid_fire',
    category: 'القرآن الكريم',
    ageGroup: 'preteen_11_13',
    difficulty: 'medium',
    difficultyLevel: 3,
    prompt: 'ما السورة التي تسمى الفاتحة وأم الكتاب؟',
    acceptableAnswers: ['الفاتحة', 'سورة الفاتحة'],
    isReligious: true,
  },
  {
    externalId: 'RF-11',
    roundType: 'rapid_fire',
    category: 'العلوم والطبيعة',
    ageGroup: 'teen_14_17',
    difficulty: 'medium',
    difficultyLevel: 3,
    prompt: 'ما العنصر الكيميائي الذي رمزه Fe؟',
    acceptableAnswers: ['الحديد', 'حديد'],
    isReligious: false,
  },
  {
    externalId: 'RF-12',
    roundType: 'rapid_fire',
    category: 'الثقافة العربية',
    ageGroup: 'adults_18_plus',
    difficulty: 'hard',
    difficultyLevel: 4,
    prompt: 'ما اسم الكتاب الشهير الذي ألفه ابن خلدون كمقدمة لتاريخه؟',
    acceptableAnswers: ['المقدمة', 'مقدمة ابن خلدون'],
    isReligious: false,
  },
  {
    externalId: 'TF-07',
    roundType: 'true_false',
    category: 'السيرة النبوية',
    ageGroup: 'preteen_11_13',
    difficulty: 'easy',
    difficultyLevel: 2,
    prompt: 'استمرت الدعوة السرية في مكة ثلاث سنوات.',
    options: ['صح', 'خطأ'],
    acceptableAnswers: ['صح'],
    correctIndex: 0,
    explanation: 'استمرت الدعوة السرية ثلاث سنوات قبل الجهر بها.',
    isReligious: true,
  },
  {
    externalId: 'TF-08',
    roundType: 'true_false',
    category: 'العلوم والطبيعة',
    ageGroup: 'teen_14_17',
    difficulty: 'medium',
    difficultyLevel: 3,
    prompt: 'يدور القمر حول الأرض مرة كل سبعة أيام تقريباً.',
    options: ['صح', 'خطأ'],
    acceptableAnswers: ['خطأ'],
    correctIndex: 1,
    explanation: 'يدور القمر حول الأرض في نحو 29.5 يوماً (الشهر القمري).',
    isReligious: false,
  },
  {
    externalId: 'MC-06',
    roundType: 'multiple_choice',
    category: 'السيرة النبوية',
    ageGroup: 'preteen_11_13',
    difficulty: 'medium',
    difficultyLevel: 3,
    prompt: 'في أي سنة هجرية وقع صلح الحديبية؟',
    options: ['السنة السادسة للهجرة', 'السنة الثانية للهجرة', 'السنة الثامنة للهجرة', 'السنة العاشرة للهجرة'],
    acceptableAnswers: ['السنة السادسة للهجرة'],
    correctIndex: 0,
    explanation: 'وقع صلح الحديبية في ذي القعدة من السنة السادسة للهجرة.',
    isReligious: true,
  },
  {
    externalId: 'MC-07',
    roundType: 'multiple_choice',
    category: 'الفقه والآداب',
    ageGroup: 'kids_7_10',
    difficulty: 'easy',
    difficultyLevel: 1,
    prompt: 'ماذا نقول عند العطاس؟',
    options: ['الحمد لله', 'سبحان الله', 'أستغفر الله', 'ما شاء الله'],
    acceptableAnswers: ['الحمد لله'],
    correctIndex: 0,
    explanation: 'يحمد العاطس ربه بقول: الحمد لله، فيرد عليه من سمعه: يرحمك الله.',
    isReligious: true,
  },
  {
    externalId: 'FB-04',
    roundType: 'fill_blank',
    category: 'القرآن الكريم',
    ageGroup: 'preteen_11_13',
    difficulty: 'medium',
    difficultyLevel: 3,
    prompt: 'أكمل الآية: ﴿إِنَّ مَعَ الْعُسْرِ ........﴾',
    acceptableAnswers: ['يسرا', 'يُسْرًا'],
    explanation: 'سورة الشرح الآية 6.',
    isReligious: true,
  },
  {
    externalId: 'BUZ-04',
    roundType: 'buzzer',
    category: 'القرآن الكريم',
    ageGroup: 'preteen_11_13',
    difficulty: 'easy',
    difficultyLevel: 2,
    prompt: 'ما هي السورة التي تُعرف بعروس القرآن أو تعادل ثلث القرآن؟ (اذكر التي تعادل ثلث القرآن)',
    acceptableAnswers: ['الإخلاص', 'سورة الإخلاص', 'قل هو الله أحد'],
    isReligious: true,
  },
  {
    externalId: 'GLD-04',
    roundType: 'golden',
    category: 'السيرة النبوية',
    ageGroup: 'teen_14_17',
    difficulty: 'hard',
    difficultyLevel: 5,
    prompt: 'من هو الصحابي الذي كلفه النبي ﷺ بحفظ وثائق وكتابة بنود صلح الحديبية؟',
    acceptableAnswers: ['علي بن أبي طالب', 'علي'],
    explanation: 'علي بن أبي طالب رضي الله عنه كتب بنود صلح الحديبية.',
    isReligious: true,
  },
];

export function seedDatabase(db: Database.Database): void {
  const existingProfileCount = (db.prepare('SELECT COUNT(*) as c FROM profiles').get() as { c: number }).c;
  if (existingProfileCount === 0) {
    const insertProfile = db.prepare(`
      INSERT INTO profiles (id, username, display_name, email, password_hash, role, age_group, avatar_id, xp, achievements_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertProfile.run(
      'prof-admin-1',
      'admin_mosque',
      'إدارة مسجد ابن تيمية',
      'admin@ibntaymiyyah.org',
      bcrypt.hashSync('2026', 8),
      'admin',
      'adults_18_plus',
      'minaret',
      500,
      JSON.stringify(['مدير المنصة'])
    );
    insertProfile.run(
      'prof-teacher-1',
      'ustadh_ahmad',
      'الأستاذ أحمد الحافظ',
      'teacher@ibntaymiyyah.org',
      bcrypt.hashSync('1447', 8),
      'teacher',
      'adults_18_plus',
      'quran',
      320,
      JSON.stringify(['مُعدّ الدروس الذكية'])
    );
    insertProfile.run(
      'prof-player-1',
      'omar_shibl',
      'عمر البطل',
      null,
      bcrypt.hashSync('1234', 8),
      'player',
      'kids_7_10',
      'crescent',
      140,
      JSON.stringify(['بداية موفقة', 'نجم الحلقات'])
    );
    insertProfile.run(
      'prof-player-2',
      'sara_quran',
      'سارة المتميزة',
      null,
      bcrypt.hashSync('1234', 8),
      'player',
      'teen_14_17',
      'star',
      190,
      JSON.stringify(['بداية موفقة'])
    );
  }

  const existingBankCount = (db.prepare('SELECT COUNT(*) as c FROM question_banks').get() as { c: number }).c;
  if (existingBankCount === 0) {
    const insertBank = db.prepare(`
      INSERT INTO question_banks (id, name, description, category, source_type, version, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertBank.run(
      'bank-general-mosque',
      'البنك العام لمسجد ابن تيمية',
      'أسئلة موثقة ومتنوعة في القرآن الكريم والسيرة النبوية والفقه والثقافة العامة لجميع الفئات.',
      'متنوع',
      'general',
      1,
      1,
      'prof-admin-1'
    );
  }

  const existingQCount = (db.prepare('SELECT COUNT(*) as c FROM questions').get() as { c: number }).c;
  if (existingQCount === 0) {
    const insertQ = db.prepare(`
      INSERT INTO questions (
        id, bank_id, external_id, round_type, category, age_group, difficulty,
        difficulty_level, unsuitable_for_timed,
        prompt, options_json, acceptable_answers_json, correct_index, explanation,
        clues_json, order_criteria, memory_items_json, memory_reveal_seconds,
        odd_reason, is_religious, status, normalized_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      for (const q of SEED_QUESTIONS) {
        const hash = buildQuestionHash(q.prompt, q.acceptableAnswers);
        const normAge = normalizeAgeGroup(q.ageGroup);
        const diffLevel = q.difficultyLevel ?? difficultyToLevel(q.difficulty);
        insertQ.run(
          `q-${crypto.randomUUID().slice(0, 8)}`,
          'bank-general-mosque',
          q.externalId,
          q.roundType,
          q.category,
          normAge,
          q.difficulty,
          diffLevel,
          q.unsuitableForTimed ? 1 : 0,
          q.prompt,
          JSON.stringify(q.options ?? []),
          JSON.stringify(q.acceptableAnswers),
          q.correctIndex ?? null,
          q.explanation ?? '',
          JSON.stringify(q.clues ?? []),
          q.orderCriteria ?? '',
          JSON.stringify(q.memoryItems ?? []),
          q.memoryRevealSeconds ?? 8,
          q.oddReason ?? '',
          q.isReligious ? 1 : 0,
          'published',
          hash
        );
      }
    });
    tx();
  }
}
