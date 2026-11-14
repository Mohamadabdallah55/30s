import type { RoundType } from '../shared/types';

export const showRounds: Record<RoundType, { color: string; tag: string; art: string }> = {
  rapid_fire: { color: '#FFE45A', tag: 'شدّ حيلك… الرشّاش بلّش!', art: 'M28 6 11 26h12l-3 16 18-22H25z M7 12h10M4 19h10M6 34h7' },
  list_multiple: { color: '#4EDB9A', tag: 'عدّهم قبل ما يطير الوقت!', art: 'M8 12h7v7H8zM8 22h7v7H8zM8 32h7v7H8zM22 15h17M22 25h17M22 35h13' },
  bid_challenge: { color: '#FF68A0', tag: 'عندك أكثر؟ أثبت كلامك!', art: 'm9 36 14-14m-8-5 9-9 12 12-9 9zM9 36l5 5 14-14m2 10h13m-8-23 5-3m-2 8h6' },
  true_false: { color: '#4EDB9A', tag: 'معها ولا ضدّها؟', art: 'm6 23 7 7 12-15m4 12 11 11m0-11L29 38' },
  multiple_choice: { color: '#42C9FF', tag: 'اختارها واثق!', art: 'M8 8h12v12H8zM28 8h12v12H28zM8 28h12v12H8zM28 34l4 5 9-12' },
  who_am_i: { color: '#C7ABFF', tag: 'مين أنا؟ ركّز بالتلميحات!', art: 'M15 17a9 9 0 1 1 13 8c-4 2-4 5-4 7m0 7h.1M6 8l3 3m30-2 3-3m-4 30 4 4' },
  fill_blank: { color: '#FFE45A', tag: 'ناقصها كلمة… شو هي؟', art: 'M6 36h36M13 26 31 8l7 7-18 18-9 2zM27 12l7 7' },
  odd_one_out: { color: '#FF9AC0', tag: 'واحدة مش من المجموعة.', art: 'M8 8h12v12H8zM28 8h12v12H28zM8 28h12v12H8zM34 26l9 8-9 9-8-9z' },
  order_items: { color: '#42C9FF', tag: 'حطّ كل قطعة بمكانها.', art: 'M8 11h17M8 24h22M8 37h28M36 8v19m-6-5 6 6 6-6' },
  memory: { color: '#C7ABFF', tag: 'احفظها… ورجّعها!', art: 'M8 12l14-5 11 26-14 6zM32 12l9 3-8 23-5-1m-10-14 7 3m-5-7 2 9' },
  buzzer: { color: '#FF68A0', tag: 'أول ضغطة إلها الكلمة.', art: 'M12 31h24l-4-5v-9a8 8 0 0 0-16 0v9zm9 6a3 3 0 0 0 6 0M6 17l3-7m30 0 3 7' },
  golden: { color: '#FFE45A', tag: 'لحظة الحسم وصلت!', art: 'm24 6 5 12 13 1-10 9 3 13-11-7-11 7 3-13-10-9 13-1z' },
};

export function RoundArt({ type, className = '' }: { type: RoundType; className?: string }) {
  const art = showRounds[type];
  return <svg className={className} viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
    <path d={art.art} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function ShowMark() {
  return <span className="show-mark" aria-label="تحدي الثلاثين">
    <span className="show-mark__number" dir="ltr">30</span><span>ثانية</span>
  </span>;
}

export function TrophyArt() {
  return <svg className="show-trophy" viewBox="0 0 180 150" aria-hidden="true">
    <g stroke="#29183E" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
      <path fill="#FF68A0" d="M30 30H10v12c0 20 14 35 36 35l4-16C33 60 29 47 30 30zm120 0h20v12c0 20-14 35-36 35l-4-16c17-1 21-14 20-31z"/>
      <path fill="#874CF5" d="M53 116h74l10 22H43z"/>
      <path fill="#FFE45A" d="M30 18h120v27c0 31-21 55-52 58v15H82v-15C51 100 30 76 30 45z"/>
      <path fill="#FFF9ED" d="m90 33 8 16 17 3-12 13 3 17-16-8-16 8 3-17-12-13 17-3z" strokeWidth="4"/>
    </g>
  </svg>;
}
