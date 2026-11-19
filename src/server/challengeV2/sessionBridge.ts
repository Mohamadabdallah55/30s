import type Database from 'better-sqlite3';
import type { InternalSessionState } from '../wsHub';
import { currentQuestionV2, currentSlotV2 } from './engine';

export function refreshSessionV2(s: InternalSessionState) {
  if(!s.challengeV2)return;
  const v=s.challengeV2,c=v.core,slot=currentSlotV2(v);
  const sections=['knowledge','auction','buzzer','identity','impossible','comeback'];
  s.phase=c.stage==='ready'?'vs':c.stage==='cancelled'||c.stage==='finished'?'finished':c.stage==='result'?'round_summary':'playing';
  s.currentRoundIndex=Math.max(0,slot.section==='tiebreak'?5:sections.indexOf(slot.section));
  s.currentQuestionIndexInRound=slot.encounter;
  s.currentQuestion=c.stage==='ready'?null:currentQuestionV2(v);
  s.activeTeamIndex=c.team??0;s.buzzedTeamIndex=c.team;s.timerEndsAtMs=c.deadline;
  s.timerRemainingSec=Math.ceil(c.deadline?Math.max(0,c.deadline-Date.now())/1000:c.remainingMs/1000);
  s.timerRunning=c.deadline!==null&&!c.paused;s.answerRevealed=c.stage==='result'||c.stage==='finished';
  s.revealedClueCount=c.clue+1;
  s.teams.forEach((team,i)=>{team.points=c.scores[i];});
  s.stats.totalAnswered=c.attempts.filter(a=>a.correct!==null).length;
  s.stats.totalCorrect=c.attempts.filter(a=>a.correct===true).length;
  s.scoreAuditLog=c.ledger.map(row=>({id:row.id,teamIndex:row.team,teamName:s.teams[row.team].name,
    delta:row.points,reason:row.reason,roundTitle:slot.section,timestamp:s.updatedAt}));
}

/** Called inside the same transaction as the session snapshot and scoreboard. */
export function persistSessionV2(db: Database.Database, s: InternalSessionState) {
  const v=s.challengeV2;if(!v)return;
  const old=(db.prepare('SELECT state_json FROM game_sessions WHERE id=?').get(s.id) as {state_json:string}|undefined);
  const prev=old?JSON.parse(old.state_json).challengeV2 as typeof v|undefined:undefined;
  const countFor=(state: typeof v|undefined, team:number)=>({
    correct:state?.core.attempts.filter(a=>a.team===team&&a.correct===true).length??0,
    xp:state?.core.ledger.filter(a=>a.team===team).reduce((sum,a)=>sum+a.points,0)??0,
  });
  for(const team of s.teams){
    const before=countFor(prev,team.index),after=countFor(v,team.index);
    for(const pid of team.participantIds.filter(id=>id&&!id.startsWith('guest-'))) {
      db.prepare('UPDATE profiles SET total_correct=MAX(0,total_correct+?), xp=MAX(0,xp+?) WHERE id=?')
        .run(after.correct-before.correct,after.xp-before.xp,pid);
    }
  }
  db.prepare('DELETE FROM answers WHERE session_id=?').run(s.id);
  const insert=db.prepare(`INSERT INTO answers (id,session_id,question_id,team_index,submitted_answer,is_correct,points_delta,created_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  for(const a of v.core.attempts.filter(a=>a.correct!==null))insert.run('v2-'+a.id,s.id,a.questionId,a.team,a.text,Number(a.correct),a.points,new Date(a.submittedAt).toISOString());
  const profiles=[...new Set([...s.teams.flatMap(t=>t.participantIds),...(s.hostProfileId?[s.hostProfileId]:[])])].filter(id=>id&&!id.startsWith('guest-'));
  const exposure=db.prepare(`INSERT OR IGNORE INTO question_exposures (id,profile_id,question_id,bank_id,session_id) VALUES (?,?,?,?,?)`);
  for(const qid of v.core.shown)for(const pid of profiles) {
    if(!db.prepare('SELECT 1 FROM profiles WHERE id=?').get(pid))continue;
    if(exposure.run('v2-'+s.id+'-'+pid+'-'+qid,pid,qid,s.bankId,s.id).changes)
      db.prepare('UPDATE profiles SET total_questions_seen=total_questions_seen+1 WHERE id=?').run(pid);
  }
}
