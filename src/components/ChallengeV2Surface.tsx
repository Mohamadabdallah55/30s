import { useEffect, useRef, useState } from 'react';
import type { GameSessionView } from '../shared/types';
import type { ActionV2, EventV2 } from '../shared/challengeV2';
import { apiFetch } from '../utils/api';
import { ScoreRibbon } from './ShowPresentation';
import { ShowMark } from './ShowArt';
import { soundFx } from '../utils/sound';
import { SessionQrBadge } from './BrandEmblem';

export function ChallengeV2Surface({session, role, teamIndex=0, onUpdate, onExit}: {
  session:GameSessionView; role:'host'|'audience'|'team'; teamIndex?:number;
  onUpdate?:(s:GameSessionView)=>void; onExit:()=>void;
}) {
  const v=session.challengeV2!;
  const host=role==='host'&&Boolean(session.hostSecret);
  const [text,setText]=useState('');const [answerTeam,setAnswerTeam]=useState(0);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [clock,setClock]=useState(Date.now()); const [showAnswer,setShowAnswer]=useState(false);
  const busyRef=useRef(false); const feedback=useRef(0);
  useEffect(()=>{const id=setInterval(()=>setClock(Date.now()),100);return()=>clearInterval(id);},[]);
  useEffect(()=>{setText('');setShowAnswer(false);setError('');},[v.questionInstanceId,v.turnId]);
  useEffect(()=>{
    if(!session.settings.soundEnabled)return;
    soundFx.enabled=true;soundFx.calmMode=session.settings.calmMode;
    const count=v.host?.ledger.length??session.teams.reduce((sum,t)=>sum+t.points,0);
    if(count>feedback.current)soundFx.correct();feedback.current=count;
  },[session.teams,v.host?.ledger.length,session.settings.soundEnabled,session.settings.calmMode]);
  const remaining=v.deadline?Math.max(0,Math.ceil((v.deadline-clock)/1000)):Math.ceil(v.remainingMs/1000);
  const act=async(action:ActionV2,extra:Partial<EventV2>={})=>{
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');
    const command={id:crypto.randomUUID(),revision:v.revision,turnId:v.turnId,questionInstanceId:v.questionInstanceId,action,
      ...(!host?{team:teamIndex,teamKey:new URLSearchParams(location.hash.slice(1)).get('key')}:{}),...extra};
    try{const result=await apiFetch<{session:GameSessionView}>(`/api/sessions/${session.code}/v2/event`,{method:'POST',body:JSON.stringify(command)});
      onUpdate?.(result.session);setText('');
    }catch(e){setError(e instanceof Error?e.message:'تعذر تنفيذ الإجراء');
      apiFetch<{session:GameSessionView}>(`/api/sessions/${session.code}?role=${host?'host':'player'}`).then(r=>onUpdate?.(r.session)).catch(()=>{});
    }finally{busyRef.current=false;setBusy(false);}
  };
  const pending=v.host?.attempts.find(a=>a.correct===null);
  useEffect(()=>{
    if(!host)return;
    const onKey=(e:KeyboardEvent)=>{
      if(e.repeat||['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes((e.target as HTMLElement)?.tagName))return;
      if(e.key.toLowerCase()==='c'&&pending){e.preventDefault();void act('mark_correct',{attemptId:pending.id});}
      if(e.key.toLowerCase()==='x'&&pending){e.preventDefault();void act('mark_wrong',{attemptId:pending.id});}
      if(e.key.toLowerCase()==='z'&&(v.host?.undoCount??0)>0){e.preventDefault();void act('undo');}
      if(e.code==='Space'&&(v.deadline||v.paused)){e.preventDefault();void act(v.paused?'resume':'pause');}
    };window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[host,v.revision,pending?.id]);
  const button=(label:string,action:ActionV2,extra:Partial<EventV2>={},enabled=true)=><button type="button" className="show-button show-button--cream" disabled={busy||!enabled} onClick={()=>void act(action,extra)}>{label}</button>;
  const isLive=!v.paused&&remaining>0;
  const mayAnswer=v.stage==='answering'&&isLive&&(host||v.team===teamIndex||(v.section==='identity'&&!v.guessed.includes(teamIndex)));
  const terminal=['finished','cancelled'].includes(v.stage);
  const leader=session.teams[0].points===session.teams[1].points?null:session.teams[0].points>session.teams[1].points?0:1;
  return <div className="show-stage" dir="rtl" data-phase={session.phase}>
    <header className="show-stage__head"><ShowMark/><span>Challenge Engine V2 · <bdi>#{session.code}</bdi></span><button type="button" onClick={onExit} className="show-button show-button--cream">رجوع</button></header>
    <main className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-7">
      <ScoreRibbon session={session}/>
      <section className="rounded-3xl border-2 border-[#FFE45A] bg-[#29183E] p-5 text-center text-white space-y-3">
        <p className="text-[#42C9FF] font-bold">{role==='team'?`جهاز ${session.teams[teamIndex]?.name}`:host?'لوحة المقدم':'شاشة الجمهور'}</p>
        <h1 className="text-3xl font-black">{terminal?(v.stage==='cancelled'?'أُلغيت المباراة':leader===null?'تعادل!':`يا سلام! ${session.teams[leader].name} فازوا`):v.sectionTitle}</h1>
        <p>{v.rules}</p>
        {!terminal&&<><div className={`text-6xl font-black tabular-nums ${remaining<=5&&isLive?'text-[#FF68A0]':'text-[#FFE45A]'}`} aria-label="الوقت المتبقي">{remaining}</div>
          <p>{v.paused?'الوقت متوقف':v.stage==='reading'?'اقرأ السؤال، وبعدين افتح التحدي':v.stage==='bidding'?`الدور بالمزايدة: ${session.teams[v.bidTurn].name}`:v.team!==null?`الدور: ${session.teams[v.team].name}`:v.stage==='buzz_open'?'الجرس مفتوح!':v.stage==='judging'?'المقدم بحكّم الإجابة':v.stage==='result'?'انتهى التحدي':v.stage==='ready'?'الفريقان جاهزين؟':'يلا نشوف شطارتكم!'}</p></>}
        {v.notice&&<p role="status" className="text-[#FFE45A]">{v.notice}</p>}
      </section>
      {v.stage!=='ready'&&<section className="rounded-3xl bg-[#FFF9ED] p-6 text-[#29183E] space-y-4 text-center">
        <h2 className="text-2xl sm:text-4xl font-black">{session.currentQuestion?.prompt}</h2>
        {session.currentQuestion?.revealedClues?.map((clue,i)=><p className="rounded-2xl bg-[#874CF5]/15 p-3 text-xl" key={i}>التلميح {i+1}: {clue}</p>)}
        {v.section==='auction'&&<p className="text-3xl font-black">أعلى مزايدة: {v.bid} · {session.teams[v.bidder].name}<small className="block text-base">سقف المزايدة: {v.bidMax} · تم احتساب {v.acceptedCount}</small></p>}
        {v.section==='knowledge'&&<p className="text-3xl font-black">{v.acceptedCount} إجابة صحيحة</p>}
        {session.answerRevealed&&session.currentQuestion?.revealedAcceptableAnswers&&<p>{session.currentQuestion.revealedAcceptableAnswers.join(' · ')}</p>}
      </section>}
      {error&&<p role="alert" className="rounded-xl bg-rose-900 p-3 text-white">{error}</p>}
      {host&&<a target="_blank" rel="noopener noreferrer" href={`/?mode=projector&code=${encodeURIComponent(session.code)}`} className="underline">افتح شاشة الجمهور</a>}
      {host&&<section className="rounded-3xl bg-[#29183E] p-5 text-white space-y-4">
        <div className="flex flex-wrap gap-3">
          {v.stage==='ready'&&button('يلا نبلّش!','start')}
          {v.stage==='reading'&&( ['buzzer','tiebreak','impossible'].includes(v.section)?button('خلصت القراءة · افتح الجرس','open_buzzer',{},!v.paused):button('ابدأ التحدي','begin',{},!v.paused))}
          {v.stage==='result'&&button('التحدي التالي','advance')}
          {v.deadline&&!v.paused&&button('إيقاف الوقت · Space','pause')}
          {v.paused&&button('استئناف · Space','resume')}
          {v.section==='identity'&&v.stage==='answering'&&button(v.clue===2?'انتهت التلميحات':'التلميح التالي','next_clue',{},!v.paused)}
          {['reading','answering','buzz_open'].includes(v.stage)&&!pending&&button('تجاوز','skip',{},!v.paused)}
          {(v.host?.undoCount??0)>0&&button('تراجع · Z','undo')}
        </div>
        <button type="button" className="text-[#42C9FF] underline" onClick={()=>setShowAnswer(!showAnswer)}>{showAnswer?'إخفاء إجابات المقدم':'عرض الإجابات للمقدم فقط'}</button>
        {showAnswer&&<div className="rounded-xl bg-white/10 p-3"><p>{session.hostSecret?.acceptableAnswers.join(' · ')}</p><p>{session.hostSecret?.explanation}</p><blockquote>{session.hostSecret?.sourceExcerpt} {session.hostSecret?.sourcePage?`صفحة ${session.hostSecret.sourcePage}`:''}</blockquote></div>}
        {pending&&<div className="rounded-xl border border-[#42C9FF] p-4 space-y-3"><p>{session.teams[pending.team].name}: {pending.text}</p><div className="flex flex-wrap gap-3">{button('صحيحة · C','mark_correct',{attemptId:pending.id})}{button('خاطئة · X','mark_wrong',{attemptId:pending.id})}{button('إلغاء المحاولة','cancel_attempt',{attemptId:pending.id})}</div></div>}
        {v.host?.accepted.length? <p>العناصر المحتسبة: {v.host.accepted.join(' · ')}</p>:null}
        <p className="text-sm text-white/70">سجّل الإجابة قبل انتهاء الوقت، ثم حكّمها. C صحيحة · X خاطئة · Z تراجع · Space وقت.</p>
      </section>}
      {role!=='audience'&&!terminal&&<section className="rounded-3xl bg-[#29183E] p-5 text-white space-y-4">
        {v.stage==='buzz_open'&&(host?<div className="flex flex-wrap gap-3">{session.teams.map(t=><span key={t.index}>{button(`جرس ${t.name}`,'buzz',{team:t.index},!v.failed.includes(t.index)&&isLive)}</span>)}</div>:button('اضغط الجرس!','buzz',{},isLive&&!v.failed.includes(teamIndex)))}
        {v.stage==='bidding'&&(host||teamIndex===v.bidTurn)&&<div className="flex flex-wrap gap-3">{button(`بزايد ${v.bid+1}`,'raise',{team:v.bidTurn,value:v.bid+1},isLive&&v.bid<v.bidMax)}{button('خلص… أثبت كلامك!','challenge',{team:v.bidTurn},isLive)}</div>}
        {mayAnswer&&<form className="flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();void act('submit',{text,...(host?{team:v.team??answerTeam}:{})});}}>
          {host&&v.section==='identity'&&<select aria-label="الفريق صاحب الإجابة" className="rounded-xl bg-[#29183E] p-3" value={answerTeam} onChange={e=>setAnswerTeam(Number(e.target.value))}>{session.teams.map(t=><option disabled={v.guessed.includes(t.index)} key={t.index} value={t.index}>{t.name}</option>)}</select>}
          <input aria-label="الإجابة أو العنصر" value={text} onChange={e=>setText(e.target.value)} maxLength={600} className="min-w-0 flex-1 rounded-xl bg-white p-3 text-[#29183E]" placeholder="سجّل الإجابة أو اسم العنصر…"/><button className="show-button show-button--yellow" disabled={busy||!text.trim()}>تسجيل المحاولة</button>
        </form>}
        {v.cardsEnabled&&!['buzzer','tiebreak'].includes(v.section)&&<div className="flex flex-wrap gap-3">{(host?session.teams.filter(t=>t.index===v.team):[session.teams[teamIndex]]).map(t=><div key={t.index} className="flex flex-wrap gap-3">{button('بطاقة +10 ثوانٍ','extra_time',{team:t.index},!v.cards[t.index].time&&v.stage==='answering'&&isLive)}{button('بطاقة التبديل','swap',{team:t.index},!v.cards[t.index].swap&&['reading','answering'].includes(v.stage)&&!v.paused)}</div>)}</div>}
        {v.stage!=='ready'&&<details><summary className="cursor-pointer">تسجيل اعتراض</summary><form onSubmit={e=>{e.preventDefault();void act('object',{text:text||'يرجى مراجعة السؤال',...(host?{team:v.team??answerTeam}:{})});}} className="flex gap-2 pt-3"><input aria-label="سبب الاعتراض" value={text} onChange={e=>setText(e.target.value)} className="min-w-0 flex-1 rounded-xl p-2 text-black" placeholder="سبب الاعتراض"/><button disabled={busy} className="show-button show-button--cream">اعتراض</button></form></details>}
      </section>}
      {host&&<><section className="rounded-3xl bg-[#29183E] p-5 text-white space-y-3"><h2>اعتراضات وسجل النقاط</h2>{v.host?.objections.filter(o=>!o.resolved).map(o=><div key={o.id}><span>{session.teams[o.team].name}: {o.reason} </span>{button('تمت المراجعة','resolve_objection',{objectionId:o.id})}</div>)}{v.host?.ledger.slice(-12).map(l=><p key={l.id}>{session.teams[l.team].name} +{l.points} · {l.reason}</p>)}</section>
        <details className="rounded-3xl bg-[#29183E] p-5 text-white"><summary>روابط أجهزة الفريقين</summary><div className="flex flex-wrap gap-4 pt-4">{session.hostSecret?.teamKeys?.map((key,i)=>{const url=`${location.origin}/?mode=buzzer&code=${session.code}&team=${i}#key=${encodeURIComponent(key)}`;return <div key={i}><p>{session.teams[i].name}</p><SessionQrBadge code={session.code} url={url} size="sm"/><button type="button" className="underline" onClick={()=>navigator.clipboard.writeText(url).catch(()=>setError('تعذر نسخ الرابط'))}>انسخ رابط الفريق</button></div>;})}</div></details>
        {!terminal&&<button type="button" className="text-white underline" onClick={()=>{if(confirm('إنهاء المباراة وحفظ النتائج السابقة؟'))void act('cancel');}}>إلغاء المباراة</button>}</>}
    </main>
  </div>;
}
