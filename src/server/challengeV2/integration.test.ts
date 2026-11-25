import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocket } from 'ws';
import type { ActionV2, EventV2 } from '../../shared/challengeV2';
import type { GameSessionView } from '../../shared/types';
import { createDatabase } from '../db';
import { seedDatabase } from '../seed';
import { importFullBank, FULL_BANK_ID } from '../importFullBank';
import { readBundledBank } from '../bundledBankData';
import { createAppAndHub } from '../appFactory';
import { issueAuthToken } from '../rbac';
import { GameSessionHub } from '../wsHub';
import { prepareMatchV2, pairSignature } from './planner';
import { currentSlotV2 } from './engine';

function fixture() {
  const db=createDatabase(':memory:');seedDatabase(db);
  for(const pack of ['thirty_seconds_question_bank','thirty_30s_sports_religion_addon','thirty_30s_gap_fill_addon','football_player_auction'] as const)
    importFullBank(db,readBundledBank(pack));
  return db;
}
test('real bank preflight builds equal fixed pairs, reserves equivalent cards and rejects shortages without changing data',()=>{
  const db=fixture();
  try {
    const filters={bankId:FULL_BANK_ID,ageGroup:'family' as const,difficulty:'mixed' as const,participantProfileIds:[]};
    for(const cards of [false,true]) {
      const plan=prepareMatchV2(db,filters,cards),ids=new Set<string>(),concepts=new Set<string>();
      assert.equal(plan.length,22);
      assert.equal(plan.filter(s=>s.section==='knowledge'&&s.team===null).length,2);
      for(const s of plan)for(const q of [...s.questions,...(s.replacement?[s.replacement]:[])]) {
        assert.ok(!ids.has(q.id));ids.add(q.id);
        if(q.conceptId){assert.ok(!concepts.has(q.conceptId));concepts.add(q.conceptId);}
        if(s.section==='impossible'){assert.equal(q.difficultyLevel,5);assert.ok(q.sourceExcerpt);assert.equal(q.options.length,0);}
      }
      for(const section of ['comeback'])for(const encounter of [0,1]) {
        const [a,b]=plan.filter(s=>s.section===section&&s.encounter===encounter);
        assert.equal(a.questions.length,b.questions.length);
        a.questions.forEach((q,i)=>assert.equal(pairSignature(q),pairSignature(b.questions[i])));
      }
    }
    const before=db.prepare('SELECT COUNT(*) FROM question_exposures').pluck().get();
    assert.throws(()=>prepareMatchV2(db,{...filters,category:'لا توجد هذه الفئة'},false),/لا توجد/);
    assert.equal(db.prepare('SELECT COUNT(*) FROM question_exposures').pluck().get(),before);
  }finally{db.close();}
});

test('HTTP and WebSocket: complete V2 match, buzzer race, undo database effects, hidden answers and reconnect',async()=>{
  const db=fixture(), {app,hub}=createAppAndHub(db),server=http.createServer(app);
  hub.attach(server);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const addr=server.address();assert.ok(addr&&typeof addr==='object');
  const root=`http://127.0.0.1:${addr.port}`;
  const token=issueAuthToken(db,'prof-teacher-1');
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
  const post=async(url:string,body:unknown,auth=true)=>fetch(root+url,{method:'POST',headers:auth?headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let view:GameSessionView;
  try {
    const response=await post('/api/sessions',{bankId:FULL_BANK_ID,ageGroup:'family',difficulty:'mixed',roundTypes:[],
      teams:[{name:'الأول',color:'#42C9FF',participantIds:['prof-teacher-1']},{name:'الثاني',color:'#FFE45A'}],
      settings:{engineMode:'challenge_v2',showMode:true,hostControlled:true}});
    assert.equal(response.status,201);view=(await response.json()).session;
    const keys=view.hostSecret!.teamKeys!;
    const make=(action:ActionV2,extra:Partial<EventV2>={})=>({id:crypto.randomUUID(),action,revision:view.challengeV2!.revision,
      turnId:view.challengeV2!.turnId,questionInstanceId:view.challengeV2!.questionInstanceId,...extra});
    const action=async(action:ActionV2,extra:Partial<EventV2>={})=>{
      const response=await post(`/api/sessions/${view.code}/v2/event`,make(action,extra));const json=await response.json();
      assert.equal(response.status,200,JSON.stringify(json));view=json.session;return view;
    };
    const expire=()=>{hub.getSessionInternal(view.code)!.challengeV2!.core.deadline=Date.now()-1;view=hub.getSessionView(view.code,true)!;};
    const answer=async(team:number,text:string)=>{
      await action('submit',{team,text});const a=view.challengeV2!.host!.attempts.find(a=>a.correct===null)!;
      await action('mark_correct',{attemptId:a.id});
    };
    const attemptStats=()=>db.prepare("SELECT total_correct,xp FROM profiles WHERE id='prof-teacher-1'").get();
    await action('start');await action('begin');
    const before=attemptStats();
    await answer(0,hub.getSessionInternal(view.code)!.currentQuestion!.acceptableAnswers[0]);
    assert.equal((db.prepare('SELECT COUNT(*) FROM answers WHERE session_id=?').pluck().get(view.id)),1);
    await action('undo');assert.deepEqual(attemptStats(),before);
    assert.equal(db.prepare('SELECT COUNT(*) FROM answers WHERE session_id=?').pluck().get(view.id),0);
    const pending=view.challengeV2!.host!.attempts.find(a=>a.correct===null)!;
    await action('mark_correct',{attemptId:pending.id});
    if(view.challengeV2!.paused)await action('resume');
    await action('skip');await action('advance');
    assert.equal((await post(`/api/sessions/${view.code}/action`,{action:'award_team',payload:{teamIndex:0}})).status,400);
    let ranRace=false;
    for(let guard=0;view.challengeV2!.stage!=='finished'&&guard<40;guard++) {
      const v=view.challengeV2!;
      assert.equal(v.stage,'reading');
      if(v.section==='knowledge'){await action('begin');await answer(v.team!,hub.getSessionInternal(view.code)!.currentQuestion!.acceptableAnswers[0]);await action('skip');}
      else if(v.section==='auction'){
        await action('begin');await action('challenge',{team:view.challengeV2!.bidTurn});
        const q=hub.getSessionInternal(view.code)!.currentQuestion!;
        for(const text of q.acceptableAnswers.slice(0,view.challengeV2!.bid))await answer(view.challengeV2!.bidder,text);
        expire();
      } else if(['buzzer','tiebreak','impossible'].includes(v.section)) {
        await action('open_buzzer');
        if(!ranRace&&v.section==='buzzer'){
          const body=make('buzz',{team:0});
          const race=await Promise.all([post(`/api/sessions/${view.code}/v2/event`,{...body,teamKey:keys[0]},false),
            post(`/api/sessions/${view.code}/v2/event`,{...body,id:crypto.randomUUID(),team:1,teamKey:keys[1]},false)]);
          assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
          const winner=race.find(r=>r.status===200)!;view=(await winner.json()).session;
          assert.equal(view.hostSecret,undefined);assert.equal(view.challengeV2!.host,undefined);
          const publicView=JSON.stringify(view);assert.ok(!publicView.includes(keys[0]));
          view=hub.getSessionView(view.code,true)!;
          const replay=await post(`/api/sessions/${view.code}/v2/event`,{...body,teamKey:keys[0]},false);assert.equal(replay.status,200);
          ranRace=true;
        }else await action('buzz',{team:v.section==='impossible'?1:0});
        await answer(view.challengeV2!.team!,hub.getSessionInternal(view.code)!.currentQuestion!.acceptableAnswers[0]);
      }else if(v.section==='identity'){await action('begin');await answer(1,hub.getSessionInternal(view.code)!.currentQuestion!.acceptableAnswers[0]);}
      else {await action('begin');await answer(v.team!,hub.getSessionInternal(view.code)!.currentQuestion!.acceptableAnswers[0]);}
      if(view.challengeV2!.section==='buzzer'&&ranRace){
        const socket=new WebSocket(`ws://127.0.0.1:${addr.port}/ws?code=${view.code}&role=audience`);
        const sync=await new Promise<GameSessionView>((resolve,reject)=>{socket.once('message',data=>resolve(JSON.parse(String(data)).payload));socket.once('error',reject);});
        assert.equal(sync.hostSecret,undefined);assert.equal(sync.challengeV2!.host,undefined);socket.close();
      }
      await action('advance');
    }
    assert.equal(view.challengeV2!.stage,'finished');assert.ok(ranRace);
    assert.equal(new Set(hub.getSessionInternal(view.code)!.challengeV2!.core.shown).size,hub.getSessionInternal(view.code)!.challengeV2!.core.shown.length);
    const restored=new GameSessionHub(db);const restoredView=restored.getSessionView(view.code,true)!;
    assert.deepEqual(restoredView.teams.map(t=>t.points),view.teams.map(t=>t.points));
    assert.equal(restoredView.challengeV2!.revision,view.challengeV2!.revision);restored.stop();
    const forbidden=await post(`/api/sessions/${view.code}/v2/event`,{...make('undo'),team:0,teamKey:keys[1]},false);assert.equal(forbidden.status,403);
    const internal=hub.getSessionInternal(view.code)!;
    assert.equal(currentSlotV2(internal.challengeV2!).section,'comeback');
    const scoreRows=db.prepare('SELECT points FROM scores WHERE session_id=? ORDER BY team_index').all(view.id) as Array<{points:number}>;
    assert.deepEqual(scoreRows.map(r=>r.points),view.teams.map(t=>t.points));
  }finally{
    hub.stop();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();
  }
});
