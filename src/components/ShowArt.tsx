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
  return (
    <span className="show-mark" aria-label="تحدي الـ30 ثانية">
      <span className="show-mark__badge" dir="ltr">
        <svg className="show-mark__eyes" viewBox="0 0 42 18" width="32" height="14" aria-hidden="true">
          <ellipse cx="13" cy="9" rx="7.5" ry="7.5" fill="#FFF9ED" stroke="#29183E" strokeWidth="2.4" />
          <ellipse cx="29" cy="9" rx="7.5" ry="7.5" fill="#FFF9ED" stroke="#29183E" strokeWidth="2.4" />
          <circle cx="14.5" cy="9.5" r="3.4" fill="#29183E" />
          <circle cx="27.5" cy="9.5" r="3.4" fill="#29183E" />
          <circle cx="15.7" cy="8.2" r="1.2" fill="#FFF9ED" />
          <circle cx="28.7" cy="8.2" r="1.2" fill="#FFF9ED" />
        </svg>
        <span className="show-mark__number">30</span>
      </span>
      <span className="show-mark__words">
        <b>تحدّي</b>
        <small>ثانية</small>
      </span>
    </span>
  );
}

export function NashmiMascot({
  size = 38,
  mood = 'happy',
  className = '',
}: {
  size?: number;
  mood?: 'hype' | 'thinking' | 'happy' | 'tease' | 'gg';
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      {/* Purple comic speech badge background */}
      <path
        d="M32 5C16.5 5 6 15.8 6 29.8c0 7.1 3 13.4 8 17.8L10 57l11.2-4.6c3.3 1.2 7 1.8 10.8 1.8 15.5 0 26-10.8 26-24.4C58 15.8 47.5 5 32 5Z"
        fill="#874CF5"
        stroke="#29183E"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* Star head */}
      <path
        d="m32 13 4.8 9.2 10.2 1.6-7.3 7.3 1.7 10.2L32 36.6l-9.4 4.7 1.7-10.2-7.3-7.3 10.2-1.6Z"
        fill="#FFE45A"
        stroke="#29183E"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      {/* Jordanian red & black agal/shemagh crest */}
      <path
        d="M22.5 19.5c3-2.8 16-2.8 19 0"
        fill="none"
        stroke="#DC2626"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <path
        d="M23.5 17.6c2.7-2.2 14.3-2.2 17 0"
        fill="none"
        stroke="#29183E"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Glasses */}
      <circle cx="26.8" cy="27.5" r="4.2" fill="#FFF9ED" stroke="#29183E" strokeWidth="2.3" />
      <circle cx="37.2" cy="27.5" r="4.2" fill="#FFF9ED" stroke="#29183E" strokeWidth="2.3" />
      <path d="M31 27.5h2" stroke="#29183E" strokeWidth="2.3" strokeLinecap="round" />
      {/* Pupils */}
      <circle cx={mood === 'thinking' ? '27.8' : '26.8'} cy="27.6" r="1.8" fill="#29183E" />
      <circle cx={mood === 'thinking' ? '38.2' : '37.2'} cy="27.6" r="1.8" fill="#29183E" />
      {/* Smile */}
      {mood === 'tease' ? (
        <path d="M28.5 34.5c2 1.2 5.2.8 7-1" fill="none" stroke="#29183E" strokeWidth="2.3" strokeLinecap="round" />
      ) : (
        <path d="M27.5 33.4c2.1 2.2 6.9 2.2 9 0" fill="none" stroke="#29183E" strokeWidth="2.3" strokeLinecap="round" />
      )}
    </svg>
  );
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
