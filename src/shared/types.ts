export type UserRole = 'admin' | 'teacher' | 'player' | 'guest';

export type CanonicalAgeGroup =
  | 'kids_7_10'
  | 'preteen_11_13'
  | 'teen_14_17'
  | 'adults_18_plus'
  | 'family';

export type LegacyAgeGroup = 'kids' | 'youth' | 'adults';

export type AgeGroup = CanonicalAgeGroup | LegacyAgeGroup;

export type Difficulty = 'easy' | 'medium' | 'hard';
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export type QuestionStatus = 'published' | 'needs_review' | 'archived' | 'rejected';

export type RoundType =
  | 'rapid_fire'      // الرشاش: أسئلة قصيرة متتالية خلال 30 ثانية
  | 'list_multiple'   // اذكر ثلاثة أو خمسة: تحديات تعداد تقبل إجابات متعددة صحيحة
  | 'true_false'      // صح أو خطأ: قرارات سريعة متتابعة
  | 'multiple_choice' // اختيار من متعدد: أربعة خيارات وإجابة واحدة
  | 'fill_blank'      // أكمل الفراغ: إجابة لفظية أو كتابية
  | 'who_am_i'        // من أنا؟: أدلة تظهر تدريجيًا
  | 'odd_one_out'     // اكتشف المختلف: اختيار العنصر المختلف وسبب الاختلاف
  | 'order_items'     // رتب العناصر: ترتيب وفق معيار معلن
  | 'memory'          // الذاكرة: عرض عناصر ثم إخفاؤها وقياس التذكر
  | 'buzzer'          // المواجهة بالجرس: أول فريق يضغط يحصل على فرصة الإجابة
  | 'golden'          // الجولة الذهبية: مضاعف ×2 يطبق على جولة مختارة
  | 'bid_challenge';  // مين يزوّد: مزايدة عددية ذكية ثم تنفيذ خلال 30 ثانية

export type AllowedAiModel = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export type LessonErrorCategory =
  | 'rate_limit'
  | 'quota_exhausted'
  | 'timeout'
  | 'network_interruption'
  | 'invalid_json'
  | 'validation_failure'
  | 'database_failure'
  | 'file_parsing_error'
  | 'insufficient_content';

export interface BidChallengeState {
  phase: 'bidding' | 'executing' | 'judging';
  currentBid: number;
  bidderTeamIndex: number;
  startingTeamIndex: number;
  turnTeamIndex: number;
  maxPossible: number;
  challenged: boolean;
  acceptedAnswers: string[];
  lastDuplicateWarning?: string | null;
}

export interface RoundRuleMeta {
  type: RoundType;
  nameAr: string;
  shortDescAr: string;
  rulesBulletAr: string;
  defaultDurationSec: number;
  basePoints: number;
  multiplier: number;
  multiQuestionWithinTimer: boolean;
  questionsPerRound: number;
  memoryRevealSec?: number;
}

export interface ProfilePublic {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  ageGroup: AgeGroup;
  avatarId: string;
  totalQuestionsSeen: number;
  totalCorrect: number;
  xp: number;
  achievements: string[];
  categoriesPlayed: Record<string, number>;
  difficultiesPlayed: Record<Difficulty, number>;
  createdAt: string;
}

export interface QuestionBank {
  id: string;
  name: string;
  description: string;
  category: string;
  sourceType: 'general' | 'lesson' | 'imported';
  lessonId?: string | null;
  version: number;
  isActive: boolean;
  publishedCount?: number;
  needsReviewCount?: number;
  createdAt: string;
}

export type PedagogicalCognitiveLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'infer';
export type RoundSuitabilityTier = 'excellent' | 'suitable' | 'adaptable' | 'unsuitable';
export type LessonGenerationMode = 'suggested' | 'max_quality' | 'custom';
export type LessonDistributionMode = 'ai' | 'manual';
export type QuestionImprovementAction =
  | 'easier'
  | 'harder'
  | 'more_analytical'
  | 'shorter'
  | 'clearer'
  | 'convert_round'
  | 'new_idea';

export interface LessonKnowledgeMap {
  title: string;
  subject: string;
  readablePageCount: number;
  mainConcepts: Array<{ id: string; title: string; summary: string; pages: number[] }>;
  subConcepts: Array<{ title: string; parentConcept: string; pages: number[] }>;
  directFacts: Array<{ text: string; page: number }>;
  causesAndEffects: Array<{ cause: string; effect: string; page: number }>;
  eventsAndFigures: Array<{ name: string; roleOrEvent: string; timeHint?: string; page: number }>;
  listsAndClassifications: Array<{ title: string; items: string[]; page: number }>;
  comparisons: Array<{ title: string; sides: string[]; page: number }>;
  analyticalPoints: Array<{ point: string; page: number }>;
  educationalValues: string[];
  gameablePoints: Array<{ idea: string; suggestedRound: RoundType; page: number }>;
  suitableAgeGroups: CanonicalAgeGroup[];
  contentDiversityScore: number;
  contentDiversityNote: string;
}

export interface LessonCapacityEstimate {
  conservativeCount: number;
  suggestedCount: number;
  estimatedMaxCount: number;
  upperBoundDisclaimerAr: string;
  confidenceScore: number;
  explanationAr: string;
  recalculatedForAge: CanonicalAgeGroup;
  recalculatedForDifficulty: Difficulty;
}

export interface RoundSuitabilityItem {
  roundType: RoundType;
  nameAr: string;
  descriptionAr: string;
  tier: RoundSuitabilityTier;
  tierLabelAr: string;
  expectedValidCount: number;
  distinctContribution: number;
  isMultiplier?: boolean;
  reusesQuestions?: boolean;
  suitableDifficulty: Difficulty;
  cognitiveSkillsAr: string[];
  reasonAr: string;
  recommendedSelected: boolean;
  selectable: boolean;
}

export interface LessonGenerationPlanPreview {
  mode: LessonGenerationMode;
  distributionMode: LessonDistributionMode;
  targetCount: number;
  selectedRoundTypes: RoundType[];
  roundDistribution: Array<{ roundType: RoundType; nameAr: string; count: number; percentage: number }>;
  difficultyDistribution: Record<Difficulty, number>;
  cognitiveDistribution: Record<PedagogicalCognitiveLevel, number>;
  coveredTopics: string[];
  limitedTopics: string[];
  estimatedBatches: number;
  estimatedApiRequests: number;
  quotaNoteAr: string;
}

export interface RegenerationSettings {
  alternativeCount: number;
  preferredRoundTypes: RoundType[];
  targetDifficulty?: Difficulty;
  prioritizeUndercoveredTopics: boolean;
  applyMode: 'preview' | 'auto';
}

export interface QuestionAlternativeCandidate {
  candidateId: string;
  roundType: RoundType;
  prompt: string;
  options: string[];
  acceptableAnswers: string[];
  correctIndex?: number | null;
  explanation: string;
  clues?: string[];
  orderCriteria?: string;
  memoryItems?: string[];
  oddReason?: string;
  sourcePage: number;
  sourceExcerpt: string;
  learningObjective: string;
  cognitiveLevel: PedagogicalCognitiveLevel;
  difficulty: Difficulty;
  answerCorrectnessReason: string;
  gradingCriterion: string;
  isHypotheticalScenario: boolean;
}

export interface RejectedQuestionLog {
  prompt: string;
  roundType: string;
  reason: string;
  sourcePage?: number;
  timestamp: string;
}

export interface QuestionRecord {
  id: string;
  bankId: string;
  externalId?: string | null;
  roundType: RoundType;
  category: string;
  ageGroup: AgeGroup;
  difficulty: Difficulty;
  difficultyLevel?: DifficultyLevel;
  unsuitableForTimed?: boolean;
  prompt: string;
  options: string[];
  acceptableAnswers: string[];
  requiredCount?: number | null;
  correctIndex?: number | null;
  explanation?: string;
  clues: string[];
  orderCriteria?: string;
  memoryItems: string[];
  memoryRevealSeconds?: number;
  memoryRequireOrder?: boolean;
  bidMinimum?: number | null;
  bidMaximum?: number | null;
  acceptsOtherAnswers?: boolean;
  conceptId?: string | null;
  oddReason?: string;
  isReligious: boolean;
  status: QuestionStatus;
  sourcePage?: number | null;
  sourceExcerpt?: string | null;
  confidenceScore?: number | null;
  learningObjective?: string;
  cognitiveLevel?: PedagogicalCognitiveLevel;
  answerCorrectnessReason?: string;
  gradingCriterion?: string;
  isHypotheticalScenario?: boolean;
  rejectionReason?: string;
  createdAt: string;
}

/**
 * Audience-safe view: never leaks correct answers, acceptableAnswers, or explanation
 * before `answerRevealed === true`.
 */
export interface AudienceQuestionView {
  id: string;
  bankId: string;
  roundType: RoundType;
  category: string;
  ageGroup: AgeGroup;
  difficulty: Difficulty;
  difficultyLevel?: DifficultyLevel;
  prompt: string;
  options: string[];
  cluesCount: number;
  requiredCount?: number;
  revealedClues: string[];
  orderCriteria?: string;
  memoryRequireOrder?: boolean;
  memoryItems?: string[]; // Hidden once memory phase ends
  memoryPhase: 'memorize' | 'recall' | 'none';
  memoryRemainingSec: number;
  sourcePage?: number | null;
  isReligious: boolean;
  // Revealed only when answerRevealed is true:
  revealedAnswerText?: string;
  revealedAcceptableAnswers?: string[];
  revealedCorrectIndex?: number | null;
  revealedExplanation?: string;
  revealedOddReason?: string;
}

export interface TeamState {
  index: number;
  name: string;
  color: string;
  points: number;
  strikes: number;
  streak: number;
  participantIds: string[];
  participantNames: string[];
}

export interface RoundConfig {
  roundNumber: number;
  roundType: RoundType;
  goldenTargetType?: RoundType; // When roundType === 'golden', specifies the underlying round style doubled by ×2
  titleAr: string;
  durationSec: number;
  basePoints: number;
  multiplier: number;
  questionsPerRound: number;
  memoryRevealSec?: number;
}

export interface SessionSettings {
  hostControlled?: boolean;
  showMode?: boolean;
  soundEnabled: boolean;
  calmMode: boolean; // Quiet mosque default
  reducedMotion: boolean;
  allowGuestMode: boolean;
  defaultTimerSec: number;
  strikesLimit: number;
  verbalRapidFireDefault?: boolean; // Rapid fire verbal host-tap default in mosque
  buzzerWrongRule?: 'pass_to_other' | 'penalty_and_pass';
  adaptiveDifficulty?: boolean;
  targetDifficultyLevel?: DifficultyLevel;
}

export interface ScoreAuditEntry {
  id: string;
  teamIndex: number;
  teamName: string;
  delta: number;
  reason: string;
  roundTitle: string;
  timestamp: string;
}

export interface UndoActionSnapshot {
  id: string;
  descriptionAr: string;
  teamScores: Array<{ points: number; strikes: number; streak: number }>;
  questionIndex: number;
  roundIndex: number;
  answerRevealed: boolean;
  timestamp: string;
}

export interface QuestionObjection {
  id: string;
  questionId: string;
  questionPrompt: string;
  teamIndex: number;
  reason: string;
  status: 'pending' | 'resolved_valid' | 'resolved_excluded';
  createdAt: string;
}

export type SessionPhase =
  | 'lobby'
  | 'vs'
  | 'round_intro'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'round_summary'
  | 'finished';

export interface GameSessionView {
  id: string;
  code: string;
  title: string;
  bankId: string;
  bankName: string;
  lessonId?: string | null;
  ageGroup: AgeGroup;
  difficulty: Difficulty | 'mixed';
  category: string;
  categories?: string[];
  phase: SessionPhase;
  teams: TeamState[];
  activeTeamIndex: number;
  buzzedTeamIndex: number | null;
  failedBuzzTeams: number[]; // Teams locked out for the current question after an incorrect buzz answer
  rounds: RoundConfig[];
  currentRoundIndex: number;
  currentQuestionIndexInRound: number;
  timerRemainingSec: number;
  timerRunning: boolean;
  timerEndsAtMs: number | null;
  countdownEndsAtMs?: number | null;
  listProgress?: { accepted: number; required: number };
  sprintReveal?: { text: string; untilMs: number };
  answerRevealed: boolean;
  hasShownIntro?: boolean;
  isClutchTime?: boolean;
  overtimeTieBreaker?: boolean;
  leadChangedAtMs?: number | null;
  lastFeedback: {
    type: 'correct' | 'wrong' | 'skip' | 'golden' | 'streak' | 'lead_change' | null;
    message: string;
    pointsDelta: number;
    teamIndex: number | null;
    atMs: number;
  } | null;
  revealedClueCount: number;
  memoryPhase: 'memorize' | 'recall' | 'none';
  memoryRemainingSec: number;
  bidState?: BidChallengeState | null;
  exhaustedNotice: {
    exhausted: boolean;
    message: string;
    availableCategories: string[];
  } | null;
  settings: SessionSettings;
  currentQuestion: AudienceQuestionView | null;
  stats?: {
    totalAnswered: number;
    totalCorrect: number;
    rapidFireAnsweredInRound: number;
  };
  scoreAuditLog?: ScoreAuditEntry[];
  // Host-only fields (strictly stripped for audience/player payloads):
  hostSecret?: {
    acceptableAnswers: string[];
    requiredCount?: number | null;
    acceptedItems?: string[];
    acceptsOtherAnswers?: boolean;
    teamKeys?: string[];
    correctIndex?: number | null;
    explanation?: string;
    oddReason?: string;
    sourceExcerpt?: string | null;
    sourcePage?: number | null;
    undoStackCount: number;
    objections: QuestionObjection[];
  };
  updatedAt: string;
}

export type LessonPipelineStage =
  | 'uploaded'
  | 'document_parsing'
  | 'arabic_analysis'
  | 'learning_objectives'
  | 'analyzed'
  | 'distribution_plan'
  | 'question_generation'
  | 'grounding_verification'
  | 'deduplication'
  | 'schema_validation'
  | 'teacher_review'
  | 'session_ready'
  | 'batch_paused'
  | 'cancelled'
  | 'failed';

export interface PipelineStageLog {
  stage: LessonPipelineStage;
  labelAr: string;
  status: 'pending' | 'running' | 'completed' | 'warning' | 'failed';
  detail: string;
  timestamp: string;
}

export interface DiagnosticLogEntry {
  timestamp: string;
  batchIndex?: number;
  batchSize?: number;
  finishReason?: string;
  outputChars?: number;
  candidateTokens?: number;
  elapsedMs?: number;
  cacheHit?: boolean;
  message: string;
}

export interface LessonBatchSummary {
  id: string;
  lessonId: string;
  bankId: string;
  title: string;
  subject: string;
  ageGroup: AgeGroup;
  difficulty: Difficulty;
  filename: string;
  pageCount: number;
  isScannedPdf: boolean;
  pipelineStage: LessonPipelineStage;
  stageLogs: PipelineStageLog[];
  topics: string[];
  objectives: string[];
  coverageSummary: string;
  requestedCount: number;
  receivedCount: number;
  acceptedCount: number;
  generatedCount: number;
  verifiedCount: number;
  rejectedCount: number;
  needsReviewCount: number;
  publishedCount: number;
  completedBatches: number;
  failedBatches: number;
  totalBatches: number;
  currentBatchSize: number;
  failedBatchIndex: number | null;
  lastBatchStatus: 'idle' | 'completed' | 'paused' | 'failed' | 'cancelled';
  errorCategory?: LessonErrorCategory | null;
  modelUsed?: AllowedAiModel;
  startedAt?: string | null;
  endedAt?: string | null;
  fileAvailable?: boolean;
  statusMessageAr: string;
  insufficientContentNote: string;
  diagnosticLogs: DiagnosticLogEntry[];
  isProcessing: boolean;
  cacheHit?: boolean;
  elapsedMs?: number;
  errorMessage?: string | null;
  knowledgeMap?: LessonKnowledgeMap | null;
  capacityEstimate?: LessonCapacityEstimate | null;
  roundSuitability?: RoundSuitabilityItem[];
  generationPlanPreview?: LessonGenerationPlanPreview | null;
  generationMode?: LessonGenerationMode;
  distributionMode?: LessonDistributionMode;
  stopReasonAr?: string | null;
  topicCoverage?: Array<{ title: string; coveredCount: number; pages: number[] }>;
  coveragePercentage?: number;
  topicsCoveredCount?: number;
  roundDistributionActual?: Record<string, number>;
  difficultyDistributionActual?: Record<string, number>;
  cognitiveDistributionActual?: Record<string, number>;
  rejectedDetails?: RejectedQuestionLog[];
  createdAt: string;
}

export interface MatchPreset {
  id: string;
  titleAr: string;
  subtitleAr: string;
  teamCount: 1 | 2;
  ageGroup: CanonicalAgeGroup;
  difficulty: Difficulty | 'mixed';
  difficultyLevel: DifficultyLevel;
  timerSec: number;
  roundTypes: RoundType[];
  sourcePreference?: 'general' | 'lesson';
}
