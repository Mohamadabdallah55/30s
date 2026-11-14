import React from 'react';
import { buildSessionMatrix } from '../shared/qr';

export function ChallengeLogoEmblem({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const width = size === 'sm' ? 160 : 280;
  const height = size === 'sm' ? 60 : 108;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 280 112"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="شعار تحدي الـ30 ثانية"
      style={{ direction: 'ltr' }}
      className="select-none overflow-visible"
    >
      <defs>
        <linearGradient id="t30-stroke" x1="16" y1="20" x2="132" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id="t30-badge-fill" x1="20" y1="18" x2="120" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#132666" />
          <stop offset="100%" stopColor="#0B1642" />
        </linearGradient>
      </defs>
      {/* Dynamic rounded triangle 30 SEC badge inspired by the TV quiz brand */}
      <g transform="translate(8, 8)">
        <path
          d="M52 10C60 4 72 6 78 14L108 56C115 66 108 80 95 82L28 90C14 91 5 77 11 64L38 22C42 16 47 12 52 10Z"
          fill="url(#t30-badge-fill)"
          stroke="url(#t30-stroke)"
          strokeWidth="4"
        />
        <text
          x="59"
          y="58"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="36"
          fontWeight="900"
          fontFamily="IBM Plex Mono, Cairo, sans-serif"
          letterSpacing="-2"
        >
          30
        </text>
        <text
          x="60"
          y="76"
          textAnchor="middle"
          fill="#38BDF8"
          fontSize="12"
          fontWeight="800"
          fontFamily="IBM Plex Mono, sans-serif"
          letterSpacing="2"
        >
          SEC
        </text>
      </g>

      {/* Arabic Lockup anchored cleanly inside SVG box */}
      <text
        x="266"
        y="46"
        textAnchor="end"
        fill="#FFFFFF"
        fontSize="30"
        fontWeight="900"
        fontFamily="Cairo, Tajawal, sans-serif"
      >
        تحدي
      </text>
      <text
        x="266"
        y="79"
        textAnchor="end"
        fill="#38BDF8"
        fontSize="23"
        fontWeight="800"
        fontFamily="Cairo, Tajawal, sans-serif"
      >
        الـ ٣٠ ثانية
      </text>
      {/* Subtle Mosque Arch Accent */}
      <path
        d="M138 98H266"
        stroke="#F59E0B"
        strokeOpacity="0.65"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const AVATAR_OPTIONS: Array<{ id: string; labelAr: string; bg: string }> = [
  { id: 'crescent', labelAr: 'هلال', bg: 'bg-sky-500/20 text-sky-300 border-sky-400/40' },
  { id: 'minaret', labelAr: 'مئذنة', bg: 'bg-amber-500/20 text-amber-300 border-amber-400/40' },
  { id: 'quran', labelAr: 'مصحف', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' },
  { id: 'star', labelAr: 'نجمة', bg: 'bg-violet-500/20 text-violet-300 border-violet-400/40' },
  { id: 'lantern', labelAr: 'فانوس', bg: 'bg-orange-500/20 text-orange-300 border-orange-400/40' },
  { id: 'shield', labelAr: 'فرسان', bg: 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40' },
];

export function PlayerAvatar({ avatarId, size = 'md' }: { avatarId?: string; size?: 'sm' | 'md' | 'lg' }) {
  const opt = AVATAR_OPTIONS.find((a) => a.id === avatarId) || AVATAR_OPTIONS[0];
  const dims = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-11 h-11';
  const svgSize = size === 'sm' ? 16 : size === 'lg' ? 30 : 22;

  return (
    <div
      className={`${dims} rounded-xl border flex items-center justify-center shrink-0 ${opt.bg}`}
      aria-label={opt.labelAr}
    >
      <svg width={svgSize} height={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {opt.id === 'crescent' && <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />}
        {opt.id === 'minaret' && (
          <>
            <path d="M12 2v3" />
            <path d="M9 10c0-2.2 1.3-4 3-5 1.7 1 3 2.8 3 5v11H9V10Z" />
            <path d="M7 21h10" />
          </>
        )}
        {opt.id === 'quran' && (
          <>
            <path d="M2 6s4-2 10 0c6-2 10 0 10 0v13s-4-2-10 0c-6-2-10 0-10 0V6Z" />
            <path d="M12 6v13" />
          </>
        )}
        {opt.id === 'star' && (
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        )}
        {opt.id === 'lantern' && (
          <>
            <path d="M9 4h6" />
            <path d="M8 7h8l1 9H7L8 7Z" />
            <path d="M9 20h6" />
            <path d="M12 10v3" />
          </>
        )}
        {opt.id === 'shield' && <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />}
      </svg>
    </div>
  );
}

export function SessionQrBadge({
  code,
  url,
  size = 'md',
}: {
  code: string;
  url: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const payload = url?.trim() || code;
  const matrix = buildSessionMatrix(payload);
  const pixelSize = size === 'sm' ? 108 : size === 'lg' ? 184 : 144;
  const modulesCount = matrix.length;
  const quiet = 2;
  const viewBoxSize = modulesCount + quiet * 2;
  return (
    <div className="p-2.5 bg-white rounded-2xl inline-block shadow-lg">
      <svg
        width={pixelSize}
        height={pixelSize}
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        shapeRendering="crispEdges"
        aria-label={`رمز QR لربط الجلسة ${code}`}
      >
        <rect x={0} y={0} width={viewBoxSize} height={viewBoxSize} fill="#FFFFFF" />
        {matrix.map((row, r) =>
          row.map((on, c) =>
            on ? (
              <rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width={1} height={1} fill="#09143A" />
            ) : null
          )
        )}
      </svg>
    </div>
  );
}
