import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import type { EventV2, SlotV2, StateV2, ActionV2, SectionV2 } from '../../shared/challengeV2';
import type { QuestionRecord } from '../../shared/types';
import { applyEventV2, createStateV2, currentQuestionV2, currentSlotV2, tickV2 } from './engine';

const question=(id:string,type:QuestionRecord['roundType']='rapid_fire'):QuestionRecord=>({
  id,bankId:'test',roundType:type,category:'عام',ageGroup:'family',difficulty:'medium',difficultyLevel:3,
  prompt:id,options:[],acceptableAnswers:['أحمد','محمد','علي'],clues:['أول','ثان','ثالث'],memoryItems:[],
  status:'published',isReligious:false,createdAt:'',sourceExcerpt:'دليل',bidMinimum:2,bidMaximum:3,
});
const slot=(section:SectionV2,i:number,team:number|null=null):SlotV2=>({id:`${section}-${i}-${team}`,section,encounter:i,team,
  points:section==='impossible'?4:section==='buzzer'?2:section==='comeback'?(i===0?3:2):section==='tiebreak'?1:3,
  questions:[question(`${section}-${i}-${team}`,section==='knowledge'?'list_multiple':section==='auction'?'bid_challenge':section==='identity'?'who_am_i':'rapid_fire')]});
function harness(plan:SlotV2[], cards=false) {
  let state=createStateV2(plan,cards),now=1000;
  const event=(action:ActionV2,extra:Partial<EventV2>={}):EventV2=>({id:crypto.randomUUID(),revision:state.revision,turnId:state.core.turnId,questionInstanceId:state.core.questionInstanceId,action,...extra});
  return {get state(){return state;},set state(v:StateV2){state=v;}, get now(){return now;},
    event,act:(action:ActionV2,extra:Partial<EventV2>={},host=true)=>state=applyEventV2(state,event(action,extra),{host,team:extra.team},now),
    run:(e:EventV2,host=true)=>state=applyEventV2(state,e,{host,team:e.team},now),
    advanceTime:(ms:number)=>{now+=ms;return tickV2(state,now);},
    answer:(team:number,correct=true,text='أحمد')=>{
      state=applyEventV2(state,event('submit',{team,text}),{host:true},now);
      const a=state.core.attempts.at(-1)!;
      state=applyEventV2(state,event(correct?'mark_correct':'mark_wrong',{attemptId:a.id}),{host:true},now);
    },
  };
}

test('six sections: independent 30-second turns, auction success/failure, steal, clues, impossible and comeback',()=>{
  const plan=[slot('knowledge',0,0),slot('knowledge',0,1),slot('knowledge',1,0),slot('knowledge',1,1),
    slot('auction',0),slot('auction',1),...Array.from({length:6},(_,i)=>slot('buzzer',i)),slot('identity',0),slot('identity',1),
    slot('impossible',0),slot('impossible',1),slot('comeback',0,0),slot('comeback',0,1),slot('comeback',1,0),slot('comeback',1,1),slot('tiebreak',0)];
  const h=harness(plan);h.act('start');
  for(let i=0;i<4;i++) {
    h.act('begin');assert.equal(h.state.core.deadline!-h.now,30000);
    if(i===0)h.answer(0);
    h.advanceTime(30000);assert.equal(h.state.core.stage,'result');
    h.act('advance');
  }
  assert.deepEqual(h.state.core.scores,[4,1]);
  h.act('begin');h.act('raise',{team:h.state.core.bidTurn,value:3});
  h.answer(h.state.core.bidder,true,'أحمد');h.answer(h.state.core.bidder,true,'محمد');h.answer(h.state.core.bidder,true,'علي');
  h.advanceTime(30000);h.act('advance');
  h.act('begin');const losingBidder=h.state.core.bidder;h.advanceTime(5000);assert.equal(h.state.core.team,losingBidder);
  h.advanceTime(30000);assert.equal(h.state.core.ledger.at(-1)?.points,2);h.act('advance');
  for(let i=0;i<6;i++){
    h.act('open_buzzer');h.act('buzz',{team:0});
    h.answer(0,false);assert.equal(h.state.core.team,1);assert.equal(h.state.core.deadline!-h.now,5000);
    h.answer(1);assert.equal(h.state.core.ledger.at(-1)?.points,1);h.act('advance');
  }
  h.act('begin');h.answer(0,false);assert.throws(()=>h.act('submit',{team:0,text:'أحمد'}),/محاولتك/);
  h.act('next_clue');h.answer(0);assert.equal(h.state.core.ledger.at(-1)?.points,2);h.act('advance');
  h.act('begin');h.act('next_clue');h.act('next_clue');h.answer(1);assert.equal(h.state.core.ledger.at(-1)?.points,1);h.act('advance');
  for(let i=0;i<2;i++){h.act('open_buzzer');h.act('buzz',{team:0});h.answer(0);assert.equal(h.state.core.ledger.at(-1)?.points,4);h.act('advance');}
  const trailing=h.state.core.scores[0]>h.state.core.scores[1]?1:0;
  assert.equal(currentSlotV2(h.state).team,trailing);
  for(let i=0;i<4;i++){h.act('begin');h.answer(h.state.core.team!);assert.equal(h.state.core.ledger.at(-1)?.points,i<2?3:2);h.act('advance');}
  assert.equal(h.state.core.stage,'finished');
  for(const team of [0,1])assert.equal(h.state.core.scores[team],h.state.core.ledger.filter(l=>l.team===team).reduce((s,l)=>s+l.points,0));
});

test('ties use reserved buzzer questions; duplicate and delayed commands cannot affect the new turn',()=>{
  const h=harness([slot('buzzer',0),slot('tiebreak',0),slot('tiebreak',1)]);
  h.act('start');h.act('open_buzzer');const e=h.event('buzz',{team:0});h.run(e);const revision=h.state.revision;
  h.run(e);assert.equal(h.state.revision,revision);
  assert.throws(()=>h.act('buzz',{team:1}),/متاح/);
  h.advanceTime(10000);assert.equal(h.state.core.team,1);h.advanceTime(5000);h.act('advance');
  assert.equal(currentSlotV2(h.state).section,'tiebreak');assert.throws(()=>h.run({...e,id:crypto.randomUUID()}),/قديم/);
  h.act('open_buzzer');h.act('buzz',{team:1});h.answer(1);h.act('advance');
  assert.equal(h.state.core.stage,'finished');assert.deepEqual(h.state.core.scores,[0,1]);
});

test('expiry rejects new answers but preserves an already submitted item for later judgment; undo restores all scoring state',()=>{
  const h=harness([slot('knowledge',0,0),slot('knowledge',0,1)]);
  h.act('start');h.act('begin');h.advanceTime(29999);h.act('submit',{team:0,text:'أحمد'});
  const pending=h.state.core.attempts.at(-1)!;h.advanceTime(1);
  assert.equal(h.state.core.stage,'judging');assert.throws(()=>h.act('submit',{team:0,text:'محمد'}),/انتهى/);
  h.act('mark_correct',{attemptId:pending.id});assert.equal(h.state.core.stage,'result');assert.equal(h.state.core.counts['knowledge-0-0'],1);
  h.act('undo');assert.equal(h.state.core.accepted.length,0);assert.equal(h.state.core.attempts[0].correct,null);
  h.act('mark_wrong',{attemptId:pending.id});h.act('advance');h.act('begin');h.advanceTime(30000);
  const scores=[...h.state.core.scores];assert.deepEqual(scores,[1,1]);
  h.act('undo');assert.deepEqual(h.state.core.scores,[0,0]);assert.equal(h.state.core.paused,true);
  h.act('resume');h.advanceTime(1);assert.deepEqual(h.state.core.scores,[1,1]);
  h.act('advance');assert.equal(h.state.core.stage,'finished');h.act('undo');assert.equal(h.state.core.stage,'result');
});

test('canonical aliases cannot inflate counts; cards are single-use, equivalent and excluded from buzzer',()=>{
  const a=slot('knowledge',0,0);a.replacement=question('replacement','list_multiple');
  a.questions[0].answerAliases={'أحمد':['احمد بن فلان']};
  const h=harness([a,slot('knowledge',0,1)],true);h.act('start');
  h.act('swap',{team:0},false);assert.equal(currentQuestionV2(h.state).id,'replacement');
  assert.throws(()=>h.act('swap',{team:0},false));h.act('undo');
  h.act('resume');h.act('begin');h.act('extra_time',{team:0},false);assert.equal(h.state.core.deadline!-h.now,40000);
  assert.throws(()=>h.act('extra_time',{team:0},false));
  h.answer(0,true,'احمد بن فلان');h.act('submit',{team:0,text:'أحمد'});
  assert.throws(()=>h.act('mark_correct',{attemptId:h.state.core.attempts.at(-1)!.id}),/محسوب/);
  h.act('cancel_attempt',{attemptId:h.state.core.attempts.at(-1)!.id});
  const b=harness([slot('buzzer',0)],true);b.act('start');b.act('open_buzzer');b.act('buzz',{team:0});
  assert.throws(()=>b.act('extra_time',{team:0},false),/البطاقات/);
});

test('rapid questions share one team clock and the opposing team starts with a fresh full clock',()=>{
  const a=slot('knowledge',0,0),b=slot('knowledge',0,1);
  a.questions=[question('a1'),question('a2')];b.questions=[question('b1'),question('b2')];
  const h=harness([a,b]);h.act('start');h.act('begin');const deadline=h.state.core.deadline;
  h.advanceTime(6000);h.answer(0);assert.equal(currentQuestionV2(h.state).id,'a2');assert.equal(h.state.core.deadline,deadline);
  h.advanceTime(24000);h.act('advance');h.act('begin');assert.equal(h.state.core.deadline!-h.now,30000);
});


test('spoken judging is host-only, atomic, idempotent and undoable in one step',()=>{
  const h=harness([slot('buzzer',0)]);h.act('start');h.act('open_buzzer');h.act('buzz',{team:0});
  const e=h.event('judge_spoken',{team:0,text:'أحمد',correct:true});
  assert.throws(()=>h.run(e,false),/للمقدم/);
  const before=h.state.revision,undos=h.state.undo.length;
  h.run(e);assert.equal(h.state.revision,before+1);assert.equal(h.state.undo.length,undos+1);
  assert.equal(h.state.core.attempts.length,1);assert.deepEqual(h.state.core.scores,[2,0]);
  h.run(e);assert.equal(h.state.revision,before+1);
  h.act('undo');assert.equal(h.state.core.attempts.length,0);assert.deepEqual(h.state.core.scores,[0,0]);
});
