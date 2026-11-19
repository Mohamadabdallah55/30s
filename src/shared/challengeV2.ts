import type { QuestionRecord } from './types';

export type SectionV2 = 'knowledge' | 'auction' | 'buzzer' | 'identity' | 'impossible' | 'comeback' | 'tiebreak';
export type StageV2 = 'ready' | 'reading' | 'bidding' | 'answering' | 'buzz_open' | 'judging' | 'result' | 'finished' | 'cancelled';
export const SECTIONS_V2: Record<SectionV2, { title: string; rules: string }> = {
  knowledge: { title: 'ماذا تعرف؟', rules: 'مواجهتان؛ لكل فريق 30 ثانية مستقلة. الفوز 3 نقاط والتعادل نقطة لكل فريق.' },
  auction: { title: 'المزاد', rules: '5 ثوانٍ لكل قرار ثم 30 ثانية للتنفيذ. النجاح 3 نقاط، والفشل نقطتان للخصم.' },
  buzzer: { title: 'الجرس', rules: '6 أسئلة. افتح الجرس بعد القراءة. الصحيح نقطتان؛ فرصة الخصم 5 ثوانٍ مقابل نقطة.' },
  identity: { title: 'من أنا؟', rules: 'سؤالان مشتركان. 3 ثم 2 ثم نقطة. محاولة واحدة لكل فريق في مستوى التلميح.' },
  impossible: { title: 'المستحيل', rules: 'سؤالان موثقان من المستوى الخامس، دون اختيارات. 4 نقاط للإجابة الصحيحة.' },
  comeback: { title: 'التعويض', rules: 'سؤالان متكافئان لكل فريق بقيمة 3 ثم 2. يبدأ الفريق المتأخر.' },
  tiebreak: { title: 'كسر التعادل', rules: 'سؤال جرس مشترك لحسم التعادل. دون بطاقات.' },
};
export interface SlotV2 {
  id: string;
  section: SectionV2;
  encounter: number;
  team: number | null;
  points: number;
  questions: QuestionRecord[];
  replacement?: QuestionRecord;
}
export interface AttemptV2 {
  id: string; slotId: string; questionId: string; turnId: string; team: number;
  text: string; submittedAt: number; clue: number; correct: boolean | null; points: number;
}
export interface ScoreV2 { id: string; team: number; points: number; reason: string; slotId: string; }
export interface ObjectionV2 { id: string; questionId: string; team: number; reason: string; resolved: boolean; }
export interface CoreV2 {
  stage: StageV2; comebackFirst: number; slotIndex: number; questionIndex: number; turnId: string; questionInstanceId: string;
  team: number | null; clue: number; deadline: number | null; remainingMs: number; paused: boolean;
  timerKind: 'reading' | 'decision' | 'answer' | 'hint' | 'transition';
  scores: [number, number]; cards: Array<{ time: boolean; swap: boolean }>;
  attempts: AttemptV2[]; ledger: ScoreV2[]; objections: ObjectionV2[];
  accepted: string[]; counts: Record<string, number>; guessed: number[]; failed: number[];
  bid: number; bidder: number; bidTurn: number; bidMax: number;
  shown: string[]; swapped: string[]; notice: string;
}
export interface StateV2 {
  version: 2; revision: number; cardsEnabled: boolean; plan: SlotV2[]; core: CoreV2;
  receipts: string[]; undo: CoreV2[];
}
export type ActionV2 = 'start' | 'advance' | 'begin' | 'open_buzzer' | 'buzz' | 'submit' | 'mark_correct' | 'mark_wrong' |
  'skip' | 'raise' | 'challenge' | 'next_clue' | 'pause' | 'resume' | 'undo' | 'object' | 'resolve_objection' |
  'extra_time' | 'swap' | 'cancel' | 'cancel_attempt';
export interface EventV2 {
  id: string; revision: number; turnId: string; questionInstanceId: string; action: ActionV2;
  team?: number; text?: string; value?: number; attemptId?: string; objectionId?: string;
}
export interface ViewV2 {
  revision: number; stage: StageV2; section: SectionV2; sectionTitle: string; rules: string;
  slotId: string; encounter: number; slotIndex: number; totalSlots: number;
  turnId: string; questionInstanceId: string; team: number | null;
  clue: number; guessed: number[]; failed: number[]; points: number;
  deadline: number | null; remainingMs: number; paused: boolean; timerKind: CoreV2['timerKind'];
  bid: number; bidder: number; bidTurn: number; bidMax: number; acceptedCount: number;
  cardsEnabled: boolean; cards: CoreV2['cards']; notice: string;
  plan: Array<{ section: SectionV2; title: string; questions: number }>;
  host?: { attempts: AttemptV2[]; ledger: ScoreV2[]; objections: ObjectionV2[]; accepted: string[]; undoCount: number };
}
