import { useEffect, useRef, useState } from 'react';
import type { GameSessionView } from '../shared/types';
import type { ActionV2, EventV2 } from '../shared/challengeV2';
import { apiFetch } from '../utils/api';
import { ShowMark } from './ShowArt';
import { soundFx } from '../utils/sound';
import { SessionQrBadge } from './BrandEmblem';
import { AudienceControlQr } from './AudienceControlQr';

export function ChallengeV2Surface({session, role, teamIndex=0, onUpdate, onExit, onOpenHost}: {
  session:GameSessionView; role:'host'|'audience'|'team'; teamIndex?:number;
  onUpdate?:(s:GameSessionView)=>void; onExit:()=>void; onOpenHost?:()=>void;
}) {
  const v=session.challengeV2!;
  const host=role==='host'&&Boolean(session.hostSecret);
  const [text,setText]=useState('');const [answerTeam,setAnswerTeam]=useState(0);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [clock,setClock]=useState(Date.now()); const [showAnswer,setShowAnswer]=useState(false);
  const busyRef=useRef(false); const feedback=useRef(0);
  useEffect(()=>{const id=setInterval(()=>setClock(Date.now()),100);return()=>clearInterval(id);},[]);
  useEffect(()=>{setText('');setShowAnswer(false);setError('');},[v.questionInstanceId]);
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
  const judgeSpoken=(team:number,answer:string,correct:boolean)=>{
    if(!host||!answer.trim())return;
    return act('judge_spoken',{team,text:answer.trim(),correct});
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
  const isLive=!v.paused&&(v.deadline===null||remaining>0);
  const mayAnswer=v.stage==='answering'&&isLive&&(host||v.team===teamIndex||(v.section==='identity'&&!v.guessed.includes(teamIndex)));
  const canonicalAnswers=session.hostSecret?.acceptableAnswers??[];
  const listMode=v.section==='auction'||(v.section==='knowledge'&&session.currentQuestion?.roundType!=='rapid_fire');
  const eligibleTeams=session.teams.filter(t=>v.section==='identity'?!v.guessed.includes(t.index):v.team===t.index);
  const terminal=['finished','cancelled'].includes(v.stage);
  const leader=session.teams[0].points===session.teams[1].points?null:session.teams[0].points>session.teams[1].points?0:1;
  return <div className={`show-stage v2-live-stage ${role==='audience'?'audience-wide-stage':''}`} dir="rtl" data-phase={session.phase} data-role={role}>
    <header className="show-stage__head"><ShowMark/><span>تحدي الثلاثين · <bdi>#{session.code}</bdi></span><button type="button" onClick={onExit} className="show-button show-button--cream">رجوع</button></header>
    {role==='audience'&&<div className="audience-top-score" aria-label="نتيجة المباراة">{session.teams.map(t=><div key={t.index} className="audience-top-team" data-active={v.team===t.index} style={{borderColor:t.color}}><span>{t.name}</span><strong dir="ltr">{t.points}</strong></div>)}<div className="audience-top-center"><span>{v.sectionTitle}</span>{!terminal&&(v.deadline!==null||v.paused)&&<strong className={remaining<=5&&isLive?'text-[#FF68A0]':'text-[#FFE45A]'} aria-label="الوقت المتبقي" dir="ltr">{remaining}</strong>}</div></div>}
    <main className="v2-live-layout">
      <aside className="v2-live-rail" aria-label="النتائج والوقت">
        {role!=='audience'&&<div className="v2-live-score">{session.teams.map(t=><div key={t.index} className="v2-live-team" data-active={v.team===t.index} style={{borderColor:t.color}}><span>{t.name}</span><strong dir="ltr">{t.points}</strong></div>)}</div>}
        <section className="v2-live-status rounded-2xl border-2 border-[#FFE45A] bg-[#29183E] text-center text-white">
        <p className="text-[#42C9FF] font-bold">{role==='team'?`جهاز ${session.teams[teamIndex]?.name}`:host?'شاشة الحكم':'شاشة الجمهور'}</p>
        <h1 className="text-3xl font-black">{terminal?(v.stage==='cancelled'?'أُلغيت المباراة':leader===null?'تعادل!':`يا سلام! ${session.teams[leader].name} فازوا`):v.sectionTitle}</h1>
        {!host&&role!=='audience'&&<p>{v.rules}</p>}{host&&<details className="text-sm"><summary className="cursor-pointer">قانون الجولة</summary><p>{v.rules}</p></details>}
        {!terminal&&<>{role!=='audience'&&(v.deadline!==null||v.paused)&&<div className={`text-6xl font-black tabular-nums ${remaining<=5&&isLive?'text-[#FF68A0]':'text-[#FFE45A]'}`} aria-label="الوقت المتبقي">{remaining}</div>}
          <p>{v.paused?'الوقت متوقف':v.stage==='reading'?'اقرأ السؤال، وبعدين افتح التحدي':v.stage==='bidding'?`الدور بالمزايدة: ${session.teams[v.bidTurn].name}`:v.stage==='auction_ready'?`بانتظار جاهزية ${session.teams[v.bidder].name}`:v.team!==null?`الدور: ${session.teams[v.team].name}`:v.stage==='buzz_open'?'الجرس مفتوح!':v.stage==='judging'?'المقدم بحكّم الإجابة':v.stage==='result'?'انتهى التحدي':v.stage==='ready'?'الفريقان جاهزين؟':'يلا نشوف شطارتكم!'}</p></>}
        {v.notice&&<p role="status" className="text-[#FFE45A]">{v.notice}</p>}
        </section>
        <div className="v2-live-progress" aria-label="فقرات المباراة">{v.plan.map(item=><span key={item.section} data-current={v.section===item.section}>{item.title}</span>)}</div>
        {role==='audience'&&!terminal&&<AudienceControlQr code={session.code} onOpenHost={onOpenHost}/>}
        {host&&<a target="_blank" rel="noopener noreferrer" href={`/?mode=projector&code=${encodeURIComponent(session.code)}`} className="show-button show-button--cream">عرض الجمهور (اختياري)</a>}
      </aside>
      <div className="v2-live-body">
      {role==='audience'&&v.stage==='ready'&&<section className="audience-ready"><p>تحدي الثلاثين</p><h2>جاهزين للمواجهة؟</h2><div className="audience-ready-teams">{session.teams.map(t=><strong key={t.index} style={{borderColor:t.color}}>{t.name}</strong>)}</div><p>بانتظار بدء المباراة من الحكم</p></section>}
      {role==='audience'&&terminal&&<section className="audience-ready"><p>النتيجة النهائية</p><h2>{v.stage==='cancelled'?'أُلغيت المباراة':leader===null?'تعادل!':session.teams[leader].name+' فازوا!'}</h2><div className="audience-ready-teams">{session.teams.map(t=><strong key={t.index} style={{borderColor:t.color}}>{t.name} · {t.points}</strong>)}</div></section>}
      {v.stage!=='ready'&&!terminal&&<section className="v2-live-question rounded-3xl bg-[#FFF9ED] text-[#29183E] text-center">
        <h2 className="text-2xl sm:text-4xl font-black">{session.currentQuestion?.prompt}</h2>
        {session.currentQuestion?.revealedClues?.map((clue,i)=><p className="rounded-2xl bg-[#874CF5]/15 p-3 text-xl" key={i}>التلميح {i+1}: {clue}</p>)}
        {v.section==='auction'&&<p className="text-3xl font-black">أعلى مزايدة: {v.bid} · {session.teams[v.bidder].name}<small className="block text-base">سقف المزايدة: {v.bidMax} · تم احتساب {v.acceptedCount}</small></p>}
        {v.section==='knowledge'&&<><p className="text-3xl font-black">{v.acceptedCount} إجابة صحيحة</p>{v.knowledgeStrikes&&<div className="flex flex-wrap justify-center gap-2">{session.teams.map(t=><span key={t.index} className="rounded-lg bg-rose-100 px-3 py-1 text-rose-900 font-bold">{t.name}: {v.knowledgeStrikes![t.index]} / 3 أخطاء · {v.knowledgePasses?.[t.index]?'الباس مستخدم':'باس متاح'}</span>)}</div>}</>}
        {session.answerRevealed&&session.currentQuestion?.revealedAcceptableAnswers&&<p className="v2-live-revealed">{session.currentQuestion.revealedAcceptableAnswers.join(' · ')}</p>}
        {host&&!session.answerRevealed&&<button type="button" aria-expanded={showAnswer} className="show-button show-button--yellow v2-live-reveal" onClick={()=>setShowAnswer(value=>!value)}>{showAnswer?'إخفاء الإجابة':'كشف الإجابة'}</button>}
        {host&&(showAnswer||session.answerRevealed)&&!listMode&&<div className="v2-live-revealed"><small>الإجابة الصحيحة</small><strong>{canonicalAnswers.join(' · ')||'—'}</strong>{session.hostSecret?.explanation&&<p>{session.hostSecret.explanation}</p>}</div>}
        {host&&showAnswer&&listMode&&!session.answerRevealed&&<p>قائمة الإجابات أسفل السؤال؛ اضغط على الاسم لاحتسابه.</p>}{host&&session.answerRevealed&&listMode&&<div className="v2-live-revealed"><small>الإجابات المعتمدة</small><strong>{canonicalAnswers.join(' · ')}</strong></div>}
      </section>}
      {error&&<p role="alert" className="rounded-xl bg-rose-900 p-3 text-white">{error}</p>}
      {host&&!terminal&&<section className="v2-live-controls rounded-2xl bg-[#29183E] text-white">
        <div className="flex flex-wrap gap-3">
          {v.stage==='ready'&&button('يلا نبلّش!','start')}
          {v.stage==='reading'&&( ['buzzer','tiebreak','impossible'].includes(v.section)?button('خلصت القراءة · افتح الجرس','open_buzzer',{},!v.paused):button('ابدأ التحدي','begin',{},!v.paused))}
          {v.stage==='auction_ready'&&<button type="button" className="show-button show-button--yellow" disabled={busy} onClick={()=>void act('start_auction')}>جاهز؟ ابدأ الـ30 ثانية</button>}
          {v.stage==='result'&&button('التحدي التالي','advance')}
          {v.deadline&&!v.paused&&button('إيقاف الوقت · Space','pause')}
          {v.paused&&button('استئناف · Space','resume')}
          {v.section==='identity'&&v.stage==='answering'&&button(v.clue===2?'انتهت التلميحات':'التلميح التالي','next_clue',{},!v.paused)}
          {['reading','answering','buzz_open'].includes(v.stage)&&!pending&&button('تجاوز','skip',{},!v.paused)}
          {(v.host?.undoCount??0)>0&&button('تراجع · Z','undo')}
        </div>
        {showAnswer&&session.hostSecret?.sourceExcerpt&&<details className="text-sm"><summary>مصدر الإجابة</summary><p>{session.hostSecret.sourceExcerpt} {session.hostSecret.sourcePage?`صفحة ${session.hostSecret.sourcePage}`:''}</p></details>}
        {pending&&<div className="rounded-xl border border-[#42C9FF] p-4 space-y-3"><p>{session.teams[pending.team].name}: {pending.text}</p><div className="flex flex-wrap gap-3">{button('صحيحة · C','mark_correct',{attemptId:pending.id})}{button('خاطئة · X','mark_wrong',{attemptId:pending.id})}{button('إلغاء المحاولة','cancel_attempt',{attemptId:pending.id})}</div></div>}
        {v.host?.accepted.length? <p>العناصر المحتسبة: {v.host.accepted.join(' · ')}</p>:null}

      </section>}
      {role!=='audience'&&!terminal&&v.stage!=='ready'&&<section className="v2-live-controls rounded-2xl bg-[#29183E] text-white">
        {v.stage==='buzz_open'&&(host?<div className="flex flex-wrap gap-3">{session.teams.map(t=><span key={t.index}>{button(`جرس ${t.name}`,'buzz',{team:t.index},!v.failed.includes(t.index)&&isLive)}</span>)}</div>:button('اضغط الجرس!','buzz',{},isLive&&!v.failed.includes(teamIndex)))}
        {v.stage==='bidding'&&(host||teamIndex===v.bidTurn)&&<div className="flex flex-wrap gap-3">{button(`بزايد ${v.bid+1}`,'raise',{team:v.bidTurn,value:v.bid+1},isLive&&v.bid<v.bidMax)}{button('تحدّاه · تأكيد المزايدة','challenge',{team:v.bidTurn},isLive)}</div>}
        {host&&mayAnswer&&!pending&&<div className="space-y-3">
          <h2 className="text-xl font-black">حكّم الإجابة الشفهية مباشرة</h2>
          {listMode? (showAnswer?<><p>اضغط على الاسم الذي قاله اللاعب. لا تحتاج تكتبه.</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{canonicalAnswers.map(answer=>{
            const accepted=v.host?.accepted.includes(answer)??false;
            return <button key={answer} type="button" disabled={busy||accepted||v.team===null} className="rounded-xl bg-emerald-600 p-3 text-right font-bold disabled:opacity-50" onClick={()=>void judgeSpoken(v.team!,answer,true)}>{accepted?'✓ ':''}{answer}</button>;
          })}</div></>:<button type="button" className="show-button show-button--yellow" onClick={()=>setShowAnswer(true)}>كشف قائمة الإجابات</button>):<div className="space-y-2">{eligibleTeams.map(t=><div className="grid grid-cols-2 gap-2" key={t.index}><button type="button" className="rounded-xl bg-emerald-600 p-4 font-black" disabled={busy||!canonicalAnswers[0]} onClick={()=>void judgeSpoken(t.index,canonicalAnswers[0],true)}>صح · {t.name}</button><button type="button" className="rounded-xl bg-rose-600 p-4 font-black" disabled={busy} onClick={()=>void judgeSpoken(t.index,'إجابة شفهية خاطئة',false)}>خطأ · {t.name}</button></div>)}</div>}
        </div>}
        {mayAnswer&&!pending&&v.knowledgePasses&&v.team!==null&&(host||teamIndex===v.team)&&button(v.knowledgePasses[v.team]?'الباس مستخدم':'باس · مرّر الدور','pass',{team:v.team},!v.knowledgePasses[v.team])}
        {host&&mayAnswer&&!pending&&v.knowledgeStrikes&&v.team!==null&&<button type="button" disabled={busy} className="rounded-xl bg-rose-600 p-4 text-white font-black" onClick={()=>void judgeSpoken(v.team!,'إجابة شفهية خاطئة',false)}>غلط · {session.teams[v.team].name}</button>}
        {mayAnswer&&(!host||(listMode&&showAnswer))&&<form className="flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();void act('submit',{text,...(host?{team:v.team??answerTeam}:{})});}}>
          {host&&v.section==='identity'&&<select aria-label="الفريق صاحب الإجابة" className="rounded-xl bg-[#29183E] p-3" value={answerTeam} onChange={e=>setAnswerTeam(Number(e.target.value))}>{session.teams.map(t=><option disabled={v.guessed.includes(t.index)} key={t.index} value={t.index}>{t.name}</option>)}</select>}
          <input aria-label="الإجابة أو العنصر" value={text} onChange={e=>setText(e.target.value)} maxLength={600} className="min-w-0 flex-1 rounded-xl bg-white p-3 text-[#29183E]" placeholder="سجّل الإجابة أو اسم العنصر…"/><button className="show-button show-button--yellow" disabled={busy||!text.trim()}>تسجيل المحاولة</button>
        </form>}
        {v.cardsEnabled&&!['buzzer','tiebreak'].includes(v.section)&&<div className="flex flex-wrap gap-3">{(host?session.teams.filter(t=>t.index===v.team):[session.teams[teamIndex]]).map(t=><div key={t.index} className="flex flex-wrap gap-3">{button('بطاقة +10 ثوانٍ','extra_time',{team:t.index},!v.cards[t.index].time&&v.stage==='answering'&&v.deadline!==null&&!v.knowledgeStrikes&&isLive)}{button('بطاقة التبديل','swap',{team:t.index},!v.cards[t.index].swap&&['reading','answering'].includes(v.stage)&&!v.paused)}</div>)}</div>}
        {v.stage!=='ready'&&<details><summary className="cursor-pointer">تسجيل اعتراض</summary><form onSubmit={e=>{e.preventDefault();void act('object',{text:text||'يرجى مراجعة السؤال',...(host?{team:v.team??answerTeam}:{})});}} className="flex gap-2 pt-3"><input aria-label="سبب الاعتراض" value={text} onChange={e=>setText(e.target.value)} className="min-w-0 flex-1 rounded-xl p-2 text-black" placeholder="سبب الاعتراض"/><button disabled={busy} className="show-button show-button--cream">اعتراض</button></form></details>}
      </section>}
      {host&&<><details className="rounded-3xl bg-[#29183E] p-5 text-white space-y-3"><summary className="cursor-pointer font-bold">اعتراضات وسجل النقاط</summary>{v.host?.objections.filter(o=>!o.resolved).map(o=><div key={o.id}><span>{session.teams[o.team].name}: {o.reason} </span>{button('تمت المراجعة','resolve_objection',{objectionId:o.id})}</div>)}{v.host?.ledger.slice(-12).map(l=><p key={l.id}>{session.teams[l.team].name} +{l.points} · {l.reason}</p>)}</details>
        <details className="rounded-3xl bg-[#29183E] p-5 text-white"><summary>روابط أجهزة الفريقين</summary><div className="flex flex-wrap gap-4 pt-4">{session.hostSecret?.teamKeys?.map((key,i)=>{const url=`${location.origin}/?mode=buzzer&code=${session.code}&team=${i}#key=${encodeURIComponent(key)}`;return <div key={i}><p>{session.teams[i].name}</p><SessionQrBadge code={session.code} url={url} size="sm"/><button type="button" className="underline" onClick={()=>navigator.clipboard.writeText(url).catch(()=>setError('تعذر نسخ الرابط'))}>انسخ رابط الفريق</button></div>;})}</div></details>
        {!terminal&&<button type="button" className="text-white underline" onClick={()=>{if(confirm('إنهاء المباراة وحفظ النتائج السابقة؟'))void act('cancel');}}>إلغاء المباراة</button>}</>}
      </div>
    </main>
  </div>;
}
