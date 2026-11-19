import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { normalizeArabicText, normalizeChallengeItem } from '../../shared/gameRules';
import type { QuestionRecord } from '../../shared/types';
import type { SlotV2, SectionV2 } from '../../shared/challengeV2';
import { getChallengeV2Candidates, type SelectionRequest } from '../questionSelection';

export function pairSignature(q: QuestionRecord): string {
  const capacity = ['list_multiple', 'bid_challenge'].includes(q.roundType)
    ? new Set(q.acceptableAnswers.map(normalizeChallengeItem)).size : 0;
  return JSON.stringify([q.roundType, q.category, q.difficultyLevel, capacity, q.bidMinimum??null, q.bidMaximum??null]);
}

export function prepareMatchV2(db: Database.Database, filters: Omit<SelectionRequest, 'roundType'>, cards: boolean): SlotV2[] {
  const all = getChallengeV2Candidates(db, filters);
  // Shuffle once before planning; scores never participate in selection.
  for (let i = all.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [all[i], all[j]] = [all[j], all[i]]; }
  const used = new Set<string>();
  const concepts = new Set<string>();
  const prompts = new Set<string>();
  const available = (q: QuestionRecord) => !used.has(q.id) && (!q.conceptId || !concepts.has(q.conceptId)) && !prompts.has(normalizeArabicText(q.prompt));
  const take = (q: QuestionRecord) => { used.add(q.id); if (q.conceptId) concepts.add(q.conceptId); prompts.add(normalizeArabicText(q.prompt)); return structuredClone(q); };
  const plain = (q: QuestionRecord) => ['rapid_fire', 'fill_blank', 'buzzer'].includes(q.roundType) && !q.unsuitableForTimed && q.acceptableAnswers.length > 0;
  const pool = all.filter(q => filters.difficulty === 'mixed' || q.difficulty === filters.difficulty);
  const plan: SlotV2[] = [];
  const slot = (section: SectionV2, encounter: number, team: number | null, points: number, questions: QuestionRecord[]) => {
    const s: SlotV2 = { id: crypto.randomUUID(), section, encounter, team, points, questions };
    if (cards && section !== 'buzzer' && section !== 'tiebreak') {
      const replacement = all.find(q => available(q) && pairSignature(q) === pairSignature(questions[0]) && (section !== 'impossible' || Boolean(q.sourceExcerpt?.trim())));
      if (!replacement) throw new Error(`لا يوجد بديل مكافئ للبطاقات في فقرة ${section}. عطّل البطاقات أو وسّع الفئات.`);
      s.replacement = take(replacement);
    }
    plan.push(s);
  };
  const paired = (section: 'knowledge' | 'comeback', encounter: number, points: number) => {
    const valid = section === 'knowledge'
      ? (q: QuestionRecord) => q.roundType === 'list_multiple' && q.acceptableAnswers.length >= 3 && !q.unsuitableForTimed
      : plain;
    const first = pool.find(q => {
      if(!available(q)||!valid(q))return false;
      const group=pool.filter(p=>available(p)&&pairSignature(p)===pairSignature(q));
      const distinct=new Set(group.map(p=>p.conceptId||normalizeArabicText(p.prompt)));
      return distinct.size >= (cards?4:2);
    });
    if (!first && section==='knowledge') {
      const candidate=pool.find(q=>available(q)&&q.roundType==='rapid_fire'&&!q.unsuitableForTimed&&
        new Set(pool.filter(p=>available(p)&&!p.unsuitableForTimed&&pairSignature(p)===pairSignature(q)).map(p=>p.conceptId||normalizeArabicText(p.prompt))).size >= (cards?14:12));
      if(candidate){
        const groups:[QuestionRecord[],QuestionRecord[]]=[[],[]];
        for(let i=0;i<12;i++){
          const q=pool.find(p=>available(p)&&!p.unsuitableForTimed&&pairSignature(p)===pairSignature(candidate));
          if(!q)throw new Error('لا توجد سلسلة رشاش متكافئة كافية.');
          groups[i%2].push(take(q));
        }
        slot(section,encounter,0,points,groups[0]);slot(section,encounter,1,points,groups[1]);
        return;
      }
    }
    if (!first) throw new Error(`لا توجد أزواج متكافئة كافية لفقرة ${section === 'knowledge' ? 'ماذا تعرف' : 'التعويض'}. وسّع الفئات أو غيّر البنك.`);
    const a = take(first);
    const other = pool.find(p => available(p) && pairSignature(p) === pairSignature(a));
    if (!other) throw new Error('لا يوجد زوج مكافئ؛ لم تبدأ المباراة.');
    const b = take(other);
    slot(section, encounter, 0, points, [a]); slot(section, encounter, 1, points, [b]);
  };
  const shared = (section: SectionV2, n: number, points: number, predicate: (q: QuestionRecord) => boolean, source = pool) => {
    for (let i = 0; i < n; i++) {
      const q = source.find(q => available(q) && predicate(q) && (!cards || ['buzzer','tiebreak'].includes(section) || source.some(p=>available(p)&&p.id!==q.id&&(!q.conceptId||p.conceptId!==q.conceptId)&&pairSignature(p)===pairSignature(q)&&predicate(p))));
      if (!q) throw new Error(`الأسئلة المعتمدة غير كافية لفقرة ${section}. لا يتم استبدال النوع أو تكرار الأسئلة تلقائيًا.`);
      slot(section, i, null, points, [take(q)]);
    }
  };
  paired('knowledge', 0, 3); paired('knowledge', 1, 3);
  shared('auction', 2, 3, q => q.roundType === 'bid_challenge' && (q.bidMaximum ?? 0) > (q.bidMinimum ?? 1));
  shared('buzzer', 6, 2, plain);
  shared('identity', 2, 3, q => q.roundType === 'who_am_i' && q.clues.length >= 3);
  shared('impossible', 2, 4, q => plain(q) && q.difficultyLevel === 5 && Boolean(q.sourceExcerpt?.trim()) , all);
  paired('comeback', 0, 3); paired('comeback', 1, 2);
  shared('tiebreak', 4, 1, plain);
  return plan;
}
