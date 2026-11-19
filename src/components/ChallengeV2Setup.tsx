import { useEffect, useState } from 'react';
import type { AgeGroup, GameSessionView, ProfilePublic, QuestionBank } from '../shared/types';
import { AGE_GROUP_LABELS, CANONICAL_AGE_GROUPS } from '../shared/gameRules';
import { SECTIONS_V2 } from '../shared/challengeV2';
import { apiFetch } from '../utils/api';
import { ShowMark } from './ShowArt';

export function ChallengeV2Setup({banks,user,soundEnabled,reducedMotion,onBack,onCustom,onLesson,onOpenAuth,onSessionCreated}: {
  banks:QuestionBank[];user:ProfilePublic|null;soundEnabled:boolean;reducedMotion:boolean;
  onBack:()=>void;onCustom:()=>void;onLesson:()=>void;onOpenAuth:()=>void;
  onSessionCreated:(s:GameSessionView,mode:'arena'|'host_and_projector')=>void;
}) {
  const [bankId,setBankId]=useState('bank-import-thirty-seconds-v1');
  const [ageGroup,setAgeGroup]=useState<AgeGroup>(user?.ageGroup??'family');
  const [names,setNames]=useState(['فريق الأنصار','فريق المهاجرين']);
  const [cards,setCards]=useState(false);const [ready,setReady]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();setReady(false);setError('');
    if(!banks.some(b=>b.id===bankId))return;
    apiFetch('/api/challenge-v2/preview',{method:'POST',signal:controller.signal,body:JSON.stringify({bankId,ageGroup,difficulty:'mixed',tacticalCards:cards})})
      .then(()=>setReady(true)).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[bankId,ageGroup,cards,banks,user?.id]);
  const start=async()=>{
    if(!user){onOpenAuth();return;}setBusy(true);setError('');
    try{const r=await apiFetch<{session:GameSessionView}>('/api/sessions',{method:'POST',body:JSON.stringify({
      title:'تحدي الثلاثين · Challenge Engine V2',bankId,ageGroup,difficulty:'mixed',category:'الكل',
      teams:names.map((name,i)=>({name,color:i===0?'#42C9FF':'#FFE45A',participantIds:i===0?[user.id]:[],participantNames:i===0?[user.displayName]:[]})),
      roundTypes:[],settings:{engineMode:'challenge_v2',tacticalCards:cards,hostControlled:true,showMode:true,soundEnabled,reducedMotion,calmMode:true},
    })});onSessionCreated(r.session,'host_and_projector');}catch(e){setError(e instanceof Error?e.message:'تعذر إعداد المباراة');}finally{setBusy(false);}
  };
  return <div className="show-setup min-h-screen p-4 sm:p-8 text-white" dir="rtl"><main className="max-w-5xl mx-auto space-y-5">
    <header className="flex flex-wrap justify-between gap-3"><ShowMark/><button className="show-button show-button--cream" onClick={onBack}>الرئيسية</button></header>
    <nav className="flex flex-wrap gap-3"><strong className="show-button show-button--yellow">المنافسة الرئيسية V2</strong><button type="button" className="show-button show-button--cream" onClick={onCustom}>المخصص · كل أنواع الأسئلة</button><button type="button" className="show-button show-button--cream" onClick={onLesson}>تحدي الدرس</button></nav>
    <section className="rounded-3xl bg-[#29183E] p-5 space-y-4"><h1 className="text-3xl font-black">ست فقرات… ومنافسة عادلة!</h1><p>نجهّز 20 تحديًا أساسيًا و4 أسئلة حسم قبل البداية. أسئلة الفريقين متكافئة، والمقدم يتحكم بالمراحل.</p>
      <div className="grid sm:grid-cols-2 gap-4">{names.map((name,i)=><label key={i}>اسم الفريق {i+1}<input className="block w-full rounded-xl bg-white p-3 text-[#29183E]" value={name} maxLength={48} onChange={e=>setNames(names.map((v,j)=>i===j?e.target.value:v))}/></label>)}
      <label>بنك الأسئلة<select className="block w-full rounded-xl bg-[#29183E] border p-3" value={bankId} onChange={e=>setBankId(e.target.value)}>{banks.map(b=><option key={b.id} value={b.id}>{b.name} · {b.publishedCount??0} معتمد</option>)}</select></label>
      <label>الفئة العمرية<select className="block w-full rounded-xl bg-[#29183E] border p-3" value={ageGroup} onChange={e=>setAgeGroup(e.target.value as AgeGroup)}>{CANONICAL_AGE_GROUPS.map(age=><option key={age} value={age}>{AGE_GROUP_LABELS[age]}</option>)}</select></label></div>
      <label className="flex gap-3"><input type="checkbox" checked={cards} onChange={e=>setCards(e.target.checked)}/>البطاقات التكتيكية: +10 ثوانٍ وتبديل بسؤال مكافئ · مرة لكل فريق</label>
    </section>
    <section className="grid sm:grid-cols-2 gap-3">{Object.entries(SECTIONS_V2).filter(([key])=>key!=='tiebreak').map(([key,s],i)=><article key={key} className="rounded-2xl bg-[#29183E] p-5 border border-white/20"><h2 className="text-xl font-black text-[#FFE45A]">{i+1}. {s.title}</h2><p className="mt-2">{s.rules}</p></article>)}</section>
    {error&&<p role="alert" className="rounded-xl bg-rose-900 p-4">{error}</p>}
    <p role="status">{ready?'الأسئلة كافية: تم التحقق من الأزواج والصعوبة والتوثيق والبدائل.':error?'غيّر الفئة أو البنك أو إعداد البطاقات.':'نتحقق من الأسئلة الفعلية…'}</p>
    <button type="button" className="show-button show-button--yellow" disabled={!ready||busy||names.some(n=>!n.trim())} onClick={()=>void start()}>{busy?'نحضّر المباراة…':'يلا نبلّش المنافسة!'}</button>
  </main></div>;
}
