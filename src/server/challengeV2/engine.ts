import crypto from 'node:crypto';
import type { CoreV2, EventV2, SlotV2, StateV2, ViewV2 } from '../../shared/challengeV2';
import { SECTIONS_V2 } from '../../shared/challengeV2';
import { normalizeChallengeItem } from '../../shared/gameRules';
import { awardV2, closeV2, settleAuction, settleKnowledge, turnClock } from './sections';

const uid = () => crypto.randomUUID();
export const currentSlotV2 = (s: StateV2) => {
  const i=s.core.slotIndex;
  const slot=s.plan[i];
  if(slot.section==='comeback' && s.core.comebackFirst===1) return s.plan[i+(slot.team===0?1:-1)];
  return slot;
};
export const currentQuestionV2 = (s: StateV2) => {
  const slot = currentSlotV2(s);
  return s.core.swapped.includes(slot.id+':'+s.core.questionIndex) ? slot.replacement! : slot.questions[s.core.questionIndex];
};
export function createStateV2(plan: SlotV2[], cardsEnabled: boolean): StateV2 {
  const core: CoreV2 = { stage:'ready', comebackFirst:0, slotIndex:0, questionIndex:0, turnId:uid(), questionInstanceId:uid(), team:null,
    clue:0, deadline:null, remainingMs:0, paused:false, timerKind:'transition', scores:[0,0],
    cards:[{time:false,swap:false},{time:false,swap:false}], attempts:[], ledger:[], objections:[], accepted:[], counts:{},
    guessed:[], failed:[], bid:0, bidder:0, bidTurn:0, bidMax:0, shown:[], swapped:[], notice:'' };
  return {version:2,revision:0,cardsEnabled,plan,core,receipts:[],undo:[]};
}
const sharedKnowledge=(slot:SlotV2)=>slot.section==='knowledge'&&slot.team===null;
const strikeKey=(slot:SlotV2,team:number)=>slot.id+':strike:'+team;
function rotateKnowledge(s:StateV2,team:number,correct:boolean,now:number) {
  const c=s.core,slot=currentSlotV2(s),q=currentQuestionV2(s);
  if(!correct){
    const key=strikeKey(slot,team);
    c.counts[key]=(c.counts[key]??0)+1;
    if(c.counts[key]>=3){awardV2(c,slot,team,-1,'ثلاثة أخطاء في ماذا تعرف');closeV2(c);return;}
  }
  if(!q.acceptsOtherAnswers&&c.accepted.length>=new Set(q.acceptableAnswers.map(normalizeChallengeItem)).size){closeV2(c);return;}
  c.team=1-team;c.turnId=uid();c.stage='answering';turnClock(c,now,10000,'answer');
}
function loadSlot(s: StateV2, now: number) {
  const c=s.core, slot=currentSlotV2(s), q=currentQuestionV2(s);
  Object.assign(c,{stage:'reading',questionIndex:0,team:sharedKnowledge(slot)?slot.encounter%2:slot.team,turnId:uid(),questionInstanceId:uid(),clue:0,
    deadline:null,remainingMs:0,paused:false,accepted:[],guessed:[],failed:[],notice:''});
  c.shown.push(q.id);
  c.bid=q.bidMinimum ?? 1; c.bidder=slot.encounter%2; c.bidTurn=1-c.bidder;
  c.bidMax=Math.min(q.bidMaximum ?? q.acceptableAnswers.length,q.acceptableAnswers.length);
  turnClock(c,now,12000,'reading');
}
function finishTurn(s: StateV2) {
  const c=s.core, slot=currentSlotV2(s);
  if(slot.section==='knowledge'&&!sharedKnowledge(slot))settleKnowledge(c,slot,s.plan);
  if(slot.section==='auction')settleAuction(c,slot);
  closeV2(c);
}
function wrong(s: StateV2, now: number) {
  const c=s.core, slot=currentSlotV2(s), team=c.team!;
  if(['buzzer','tiebreak'].includes(slot.section)) {
    if(!c.failed.includes(team))c.failed.push(team);
    if(c.failed.length===1){c.team=1-team;c.turnId=uid();c.stage='answering';turnClock(c,now,5000,'answer');}
    else closeV2(c);
  } else if(slot.section==='identity') {
    c.team=null;c.stage='answering'; turnClock(c,now,Math.max(1,c.remainingMs),'hint');
  } else if(slot.section==='impossible') {
    if(!c.failed.includes(team))c.failed.push(team);
    if(c.failed.length<2){c.team=null;c.turnId=uid();c.stage='buzz_open';turnClock(c,now,10000,'answer');}
    else closeV2(c);
  } else if(slot.section==='comeback')closeV2(c);
}
function nextClue(s: StateV2, now: number) {
  const c=s.core;
  if(c.clue>=2){closeV2(c);return;}
  c.clue++; c.guessed=[]; c.team=null;c.turnId=uid();c.stage='answering';turnClock(c,now,15000,'hint');
}
export function tickV2(s: StateV2, now: number): boolean {
  const c=s.core;
  if(c.paused || c.deadline===null || now<c.deadline)return false;
  const before = structuredClone(c);
  before.remainingMs = 1;
  s.undo.push(before);
  if (s.undo.length > 80) s.undo.shift();
  c.remainingMs=0;c.deadline=null;
  if(c.stage==='reading') { c.notice='انتهت القراءة؛ افتح التحدي من لوحة المقدم.'; }
  else if(c.stage==='bidding') { c.stage='answering';c.team=c.bidder;c.turnId=uid();turnClock(c,now,30000,'answer'); }
  else if(c.stage==='buzz_open'){closeV2(c);}
  else if(c.stage==='answering') {
    const pending=c.attempts.some(a=>a.slotId===currentSlotV2(s).id&&a.correct===null);
    if(pending){c.stage='judging';c.notice='انتهى الوقت؛ حكّم الإجابات المسجلة قبل الصفر فقط.';}
    else if(sharedKnowledge(currentSlotV2(s))&&c.team!==null)rotateKnowledge(s,c.team,false,now);
    else if(['knowledge','auction'].includes(currentSlotV2(s).section))finishTurn(s);
    else if(currentSlotV2(s).section==='identity')nextClue(s,now);
    else if(c.team!==null)wrong(s,now);
    else closeV2(c);
  }
  s.revision++;
  return true;
}
export function applyEventV2(s: StateV2, e: EventV2, actor: {host:boolean;team?:number}, now=Date.now()): StateV2 {
  if(s.receipts.includes(e.id))return s;
  const n=structuredClone(s);
  tickV2(n,now);
  let c=n.core;
  if(c.deadline!==null)c.remainingMs=Math.max(0,c.deadline-now);
  if(!e.id || e.id.length>100 || !Number.isInteger(e.revision) || e.revision!==n.revision || e.turnId!==c.turnId || e.questionInstanceId!==c.questionInstanceId)
    throw new Error('وصل إجراء قديم؛ انتظر تحديث المباراة وحاول مرة ثانية.');
  if(!actor.host && !['buzz','submit','raise','challenge','extra_time','swap','object'].includes(e.action))throw new Error('هذا الإجراء للمقدم فقط.');
  const team=actor.host ? e.team ?? c.team : actor.team;
  if(team!=null && team!==0&&team!==1)throw new Error('فريق غير صالح.');
  const need: (valid: unknown, message?: string) => asserts valid = (valid, message='الإجراء غير متاح في المرحلة الحالية.') => {if(!valid)throw new Error(message);};
  const slot=currentSlotV2(n), q=currentQuestionV2(n);
  const active=()=>need(!c.paused&&c.stage==='answering'&&c.deadline!==null&&now<c.deadline,'انتهى وقت تقديم الإجابات أو لم يبدأ.');
  if(e.action==='judge_spoken') {
    need(actor.host&&typeof e.correct==='boolean','التحكيم الشفهي للمقدم فقط.');
    const submitted=applyEventV2(n,{...e,id:uid(),action:'submit'},actor,now);
    const attempt=submitted.core.attempts.at(-1)!;
    const judged=applyEventV2(submitted,{id:uid(),revision:submitted.revision,turnId:submitted.core.turnId,
      questionInstanceId:submitted.core.questionInstanceId,action:e.correct?'mark_correct':'mark_wrong',attemptId:attempt.id},actor,now);
    // A spoken judgment is one transaction and one undo, with no intermediate public state.
    judged.undo=submitted.undo;judged.revision=n.revision+1;judged.receipts=[...n.receipts,e.id];
    return judged;
  }
  if(e.action==='undo') {
    need(actor.host&&n.undo.length,'لا توجد عملية قابلة للتراجع.');
    const previous=n.undo.pop()!;
    n.core=previous;c=n.core;c.turnId=uid();c.questionInstanceId=uid();
    c.paused=c.paused || c.deadline!==null; c.deadline=null; c.notice='تم التراجع عن الحالة والنقاط والإجابات. استأنف الوقت عند الجاهزية.';
  } else {
    need(!['finished','cancelled'].includes(c.stage),'انتهت المباراة.');
    n.undo.push(structuredClone(c)); if(n.undo.length>80)n.undo.shift();
    switch(e.action) {
      case 'start': need(c.stage==='ready');loadSlot(n,now);break;
      case 'begin':
        need(c.stage==='reading'&&!c.paused);
        if(slot.section==='auction'){c.stage='bidding';c.team=null;turnClock(c,now,5000,'decision');}
        else if(['buzzer','tiebreak','impossible'].includes(slot.section))throw new Error('افتح الجرس بعد القراءة.');
        else {c.stage='answering';turnClock(c,now,slot.section==='identity'?15000:sharedKnowledge(slot)?10000:30000,slot.section==='identity'?'hint':'answer');}
        break;
      case 'open_buzzer': need(c.stage==='reading'&&!c.paused&&['buzzer','tiebreak','impossible'].includes(slot.section));
        c.stage='buzz_open';c.team=null;turnClock(c,now,15000,'answer');break;
      case 'buzz':
        need(c.stage==='buzz_open'&&!c.paused&&team!=null&&!c.failed.includes(team));
        c.team=team;c.turnId=uid();c.stage='answering';turnClock(c,now,slot.section==='impossible'?30000:10000,'answer');break;
      case 'submit': {
        active();need(team!=null&&(c.team===team||slot.section==='identity'),'الدور لفريق آخر.');
        need(typeof e.text==='string'&&e.text.trim().length>0&&e.text.length<=600,'اكتب الإجابة أو اسم العنصر.');
        if(slot.section==='identity')need(!c.guessed.includes(team),'استخدمت محاولتك في هذا التلميح.');
        need(!c.attempts.some(a=>a.slotId===slot.id&&a.correct===null&&a.team===team),'حكّم المحاولة المسجلة أولًا.');
        c.attempts.push({id:uid(),slotId:slot.id,questionId:q.id,turnId:c.turnId,team,text:e.text.trim(),submittedAt:now,clue:c.clue,correct:null,points:0});
        if(slot.section==='identity') {c.guessed.push(team);c.team=team;}
        if(!['knowledge','auction'].includes(slot.section)) {
          c.remainingMs=Math.max(0,(c.deadline??now)-now);c.deadline=null;c.stage='judging';
        }
        break;
      }
      case 'mark_correct': case 'mark_wrong': {
        need(actor.host);
        const a=c.attempts.find(a=>a.id===e.attemptId&&a.slotId===slot.id&&a.correct===null);
        need(a,'سجّل محاولة قبل تحكيمها.');
        const correct=e.action==='mark_correct';
        a!.correct=correct;
        if(['knowledge','auction'].includes(slot.section)) {
          if(correct){
            const canonical=q.acceptableAnswers.find(v=>normalizeChallengeItem(v)===normalizeChallengeItem(a!.text)) ??
              Object.entries(q.answerAliases??{}).find(([,aliases])=>aliases.some(v=>normalizeChallengeItem(v)===normalizeChallengeItem(a!.text)))?.[0];
            need(canonical||q.acceptsOtherAnswers,'الإجابة خارج القائمة المعتمدة.');
            const item=canonical??a!.text;
            if(q.roundType==='rapid_fire'&&slot.section==='knowledge') {
              need(!c.attempts.some(other=>other.id!==a!.id&&other.questionId===q.id&&other.correct),'السؤال محسوب بالفعل.');
              c.accepted.push(item);
            } else {
              need(!c.accepted.some(v=>normalizeChallengeItem(v)===normalizeChallengeItem(item)),'هذا الاسم محسوب بالفعل.');
              c.accepted.push(item);
            }
          }
          if(sharedKnowledge(slot)) {rotateKnowledge(n,a!.team,correct,now);break;}
          if(slot.section==='knowledge'&&q.roundType==='rapid_fire'&&c.stage==='answering') {
            if(c.questionIndex+1<slot.questions.length){c.questionIndex++;c.questionInstanceId=uid();c.shown.push(currentQuestionV2(n).id);}
            else finishTurn(n);
          }
          if(c.stage==='judging'&&!c.attempts.some(a=>a.slotId===slot.id&&a.correct===null))finishTurn(n);
        } else if(correct) {
          const points=slot.section==='identity'?3-a!.clue:slot.section==='buzzer'&&c.failed.length?1:slot.points;
          a!.points=points;awardV2(c,slot,a!.team,points,'إجابة صحيحة');closeV2(c);
        } else wrong(n,now);
        break;
      }
      case 'cancel_attempt': {
        const pending=c.attempts.find(a=>a.id===e.attemptId&&a.correct===null&&a.slotId===slot.id);
        need(pending);
        c.attempts = c.attempts.filter(a => a.id !== pending.id);
        if (!['knowledge','auction'].includes(slot.section)) {
          if (slot.section === 'identity') {
            c.guessed = c.guessed.filter(team => team !== pending.team);
            c.team = null;
          }
          c.stage = 'answering';
          turnClock(c, now, Math.max(1, c.remainingMs), slot.section === 'identity' ? 'hint' : 'answer');
        }
        else if(c.stage==='judging'&&!c.attempts.some(a=>a.slotId===slot.id&&a.correct===null))finishTurn(n);
        break;
      }
      case 'raise':need(c.stage==='bidding'&&!c.paused&&team===c.bidTurn,'المزايدة لفريق آخر.');
        need(Number.isInteger(e.value)&&e.value!>c.bid&&e.value!<=c.bidMax,'راجع سقف المزايدة.');
        c.bid=e.value!;c.bidder=team!;c.bidTurn=1-team!;c.turnId=uid();turnClock(c,now,5000,'decision');
        if(c.bid===c.bidMax){c.stage='answering';c.team=c.bidder;turnClock(c,now,30000,'answer');}break;
      case 'challenge':need(c.stage==='bidding'&&!c.paused&&team===c.bidTurn);
        c.stage='answering';c.team=c.bidder;c.turnId=uid();turnClock(c,now,30000,'answer');break;
      case 'next_clue': need(slot.section==='identity'&&c.stage==='answering'&&!c.paused);nextClue(n,now);break;
      case 'skip':
        need(['reading','answering','buzz_open'].includes(c.stage)&&!c.paused);
        need(!c.attempts.some(a=>a.slotId===slot.id&&a.correct===null),'حكّم المحاولات قبل التجاوز.');
        if(slot.section==='knowledge'&&q.roundType==='rapid_fire'&&c.stage==='answering'&&c.questionIndex+1<slot.questions.length){c.questionIndex++;c.questionInstanceId=uid();c.shown.push(currentQuestionV2(n).id);}
        else if(c.stage==='reading')closeV2(c);else if(['knowledge','auction'].includes(slot.section))finishTurn(n);else closeV2(c);break;
      case 'advance': {
        need(c.stage==='result');
        // Pair order was fixed before play. Only the order of the comeback teams depends on standings.
        if(slot.section==='impossible'&&n.plan[c.slotIndex+1]?.section==='comeback'&&c.scores[1]<c.scores[0]) {
          c.comebackFirst=1;
        }
        const next=n.plan[c.slotIndex+1];
        if(!next||(next.section==='tiebreak'&&c.scores[0]!==c.scores[1])){c.stage='finished';c.notice=c.scores[0]===c.scores[1]?'تعادل بعد استنفاد أسئلة الحسم المحضّرة.':'خلصت المباراة!';break;}
        c.slotIndex++;c.questionIndex=0;loadSlot(n,now);break;
      }
      case 'pause':need(!c.paused&&c.deadline!==null);c.remainingMs=Math.max(0,c.deadline!-now);c.deadline=null;c.paused=true;break;
      case 'resume':need(c.paused&&c.remainingMs>0);c.deadline=now+c.remainingMs;c.paused=false;break;
      case 'extra_time': case 'swap': {
        need(n.cardsEnabled&&team!=null&&!['buzzer','tiebreak'].includes(slot.section),'البطاقات غير مسموحة هنا.');
        need(c.team===team&&['reading','answering'].includes(c.stage)&&!c.paused,'البطاقة لصاحب الدور فقط.');
        if(e.action==='extra_time'){
          need(!c.cards[team].time&&c.stage==='answering');c.cards[team].time=true;c.deadline!+=10000;c.remainingMs+=10000;
        }else{
          need(!c.cards[team].swap&&slot.replacement&&!c.swapped.includes(slot.id+':'+c.questionIndex)&&!c.attempts.some(a=>a.slotId===slot.id&&a.questionId===q.id),'التبديل قبل الإجابة فقط.');
          need(slot.section!=='auction' || (slot.replacement!.bidMaximum??0)>=c.bid,'البديل لا يدعم المزايدة الحالية.');
          c.cards[team].swap=true;c.swapped.push(slot.id+':'+c.questionIndex);c.shown.push(slot.replacement!.id);c.questionInstanceId=uid();c.turnId=uid();
          c.bidMax=Math.min(slot.replacement!.bidMaximum??slot.replacement!.acceptableAnswers.length,slot.replacement!.acceptableAnswers.length);
        }
        break;
      }
      case 'object':need(team!=null&&typeof e.text==='string'&&e.text.trim().length>0&&e.text.length<=600);
        need(!c.objections.some(o=>o.team===team&&o.questionId===q.id&&!o.resolved),'الاعتراض مسجل بالفعل.');
        c.objections.push({id:uid(),questionId:q.id,team,reason:e.text!.trim(),resolved:false});break;
      case 'resolve_objection': {const o=c.objections.find(o=>o.id===e.objectionId&&!o.resolved);need(o);o!.resolved=true;break;}
      case 'cancel':c.stage='cancelled';c.deadline=null;c.paused=false;c.notice='ألغى المقدم المباراة؛ النتائج السابقة محفوظة.';break;
      default:throw new Error('إجراء غير معروف.');
    }
  }
  n.revision++;n.receipts.push(e.id);
  return n;
}

export function viewStateV2(s: StateV2, host: boolean, now=Date.now()): ViewV2 {
  const c=s.core, slot=currentSlotV2(s), section=SECTIONS_V2[slot.section];
  return {revision:s.revision,stage:c.stage,section:slot.section,sectionTitle:section.title,rules:slot.section==='knowledge'&&!sharedKnowledge(slot)?'لكل فريق 30 ثانية مستقلة؛ الفوز 3 نقاط والتعادل نقطة لكل فريق.':section.rules,
    slotId:slot.id,encounter:slot.encounter,slotIndex:c.slotIndex,totalSlots:s.plan.filter(s=>s.section!=='tiebreak').length,
    turnId:c.turnId,questionInstanceId:c.questionInstanceId,team:c.team,clue:c.clue,guessed:c.guessed,failed:c.failed,
    points:slot.section==='identity'?3-c.clue:slot.points,deadline:c.deadline,
    remainingMs:c.deadline?Math.max(0,c.deadline-now):c.remainingMs,paused:c.paused,timerKind:c.timerKind,
    bid:c.bid,bidder:c.bidder,bidTurn:c.bidTurn,bidMax:c.bidMax,acceptedCount:c.accepted.length,
    ...(sharedKnowledge(slot)?{knowledgeStrikes:[c.counts[strikeKey(slot,0)]??0,c.counts[strikeKey(slot,1)]??0] as [number,number]}:{}),
    cardsEnabled:s.cardsEnabled,cards:c.cards,notice:c.notice,
    plan:Object.entries(SECTIONS_V2).filter(([key])=>key!=='tiebreak').map(([key,meta])=>({section:key as SlotV2['section'],title:meta.title,questions:s.plan.filter(s=>s.section===key).length})),
    ...(host?{host:{attempts:c.attempts.filter(a=>a.slotId===slot.id),ledger:c.ledger,objections:c.objections,accepted:c.accepted,undoCount:s.undo.length}}:{}),
  };
}
