import type { RoundType } from '../shared/types';

export type RoundSoundCategory =
  | 'rapid_sprint'
  | 'show_duel'
  | 'mystery_focus'
  | 'precision_quiz'
  | 'golden_finale';

export type SoundCueCategory = RoundSoundCategory | 'victory_applause';

export interface ToneStep {
  freq: number;
  durationSec: number;
  type: OscillatorType;
  gainPeak: number;
  delay: number;
}

export interface NoiseStep {
  durationSec: number;
  filterType: BiquadFilterType;
  filterFreq: number;
  filterQ: number;
  gainPeak: number;
  delay: number;
}

export interface RoundCategorySoundPreset {
  category: RoundSoundCategory;
  labelAr: string;
  energyLevel: 'calm' | 'upbeat' | 'high';
  introTones: ToneStep[];
  introPercussion: NoiseStep[];
  correctTones: ToneStep[];
  wrongTones: ToneStep[];
  urgentTickFreq: number;
  urgentTickDoublePulse: boolean;
}

const RAPID_TYPES: ReadonlySet<RoundType> = new Set(['rapid_fire', 'true_false']);
const DUEL_TYPES: ReadonlySet<RoundType> = new Set(['buzzer', 'bid_challenge']);
const MYSTERY_TYPES: ReadonlySet<RoundType> = new Set(['who_am_i', 'memory', 'order_items', 'odd_one_out']);

export function getRoundSoundCategory(
  roundType?: RoundType | null,
  goldenTargetType?: RoundType | null
): RoundSoundCategory {
  if (!roundType) return 'precision_quiz';
  if (roundType === 'golden') {
    return 'golden_finale';
  }
  const effective = goldenTargetType ?? roundType;
  if (RAPID_TYPES.has(effective)) return 'rapid_sprint';
  if (DUEL_TYPES.has(effective)) return 'show_duel';
  if (MYSTERY_TYPES.has(effective)) return 'mystery_focus';
  return 'precision_quiz';
}

export function getRoundSoundCategoryLabelAr(category: SoundCueCategory): string {
  switch (category) {
    case 'rapid_sprint':
      return 'إيقاع التحدي السريع الحماسي';
    case 'show_duel':
      return 'إيقاع المواجهة والمزايدة';
    case 'mystery_focus':
      return 'نغمة التركيز والغموض';
    case 'golden_finale':
      return 'زفّة الجولة الذهبية المضاعفة';
    case 'victory_applause':
      return 'تصفيق واحتفال الفوز';
    case 'precision_quiz':
    default:
      return 'نغمة المعرفة والتفكير';
  }
}

export const SOUND_CATEGORY_PRESETS: Record<RoundSoundCategory, RoundCategorySoundPreset> = {
  rapid_sprint: {
    category: 'rapid_sprint',
    labelAr: 'إيقاع التحدي السريع الحماسي',
    energyLevel: 'high',
    // Fast ascending energetic synth stabs + punchy rhythmic hi-hat/kick hits
    introTones: [
      { freq: 392.0, durationSec: 0.09, type: 'sawtooth', gainPeak: 0.06, delay: 0 },
      { freq: 523.25, durationSec: 0.09, type: 'sawtooth', gainPeak: 0.065, delay: 0.08 },
      { freq: 659.25, durationSec: 0.1, type: 'triangle', gainPeak: 0.08, delay: 0.16 },
      { freq: 783.99, durationSec: 0.12, type: 'triangle', gainPeak: 0.085, delay: 0.24 },
      { freq: 1046.5, durationSec: 0.22, type: 'triangle', gainPeak: 0.095, delay: 0.33 },
    ],
    introPercussion: [
      { durationSec: 0.045, filterType: 'highpass', filterFreq: 4200, filterQ: 1.2, gainPeak: 0.06, delay: 0.0 },
      { durationSec: 0.045, filterType: 'highpass', filterFreq: 4600, filterQ: 1.2, gainPeak: 0.06, delay: 0.16 },
      { durationSec: 0.075, filterType: 'bandpass', filterFreq: 1900, filterQ: 1.5, gainPeak: 0.085, delay: 0.32 },
    ],
    correctTones: [
      { freq: 587.33, durationSec: 0.1, type: 'triangle', gainPeak: 0.095, delay: 0 },
      { freq: 880.0, durationSec: 0.15, type: 'triangle', gainPeak: 0.1, delay: 0.065 },
    ],
    wrongTones: [
      { freq: 246.94, durationSec: 0.12, type: 'triangle', gainPeak: 0.075, delay: 0 },
      { freq: 196.0, durationSec: 0.16, type: 'sine', gainPeak: 0.07, delay: 0.09 },
    ],
    urgentTickFreq: 1046.5,
    urgentTickDoublePulse: true,
  },
  show_duel: {
    category: 'show_duel',
    labelAr: 'إيقاع المواجهة والمزايدة',
    energyLevel: 'high',
    // Dramatic duel tension pulse + crisp snare snap
    introTones: [
      { freq: 293.66, durationSec: 0.16, type: 'triangle', gainPeak: 0.08, delay: 0 },
      { freq: 440.0, durationSec: 0.16, type: 'triangle', gainPeak: 0.08, delay: 0.11 },
      { freq: 587.33, durationSec: 0.24, type: 'triangle', gainPeak: 0.095, delay: 0.22 },
      { freq: 659.25, durationSec: 0.24, type: 'sine', gainPeak: 0.07, delay: 0.24 },
    ],
    introPercussion: [
      { durationSec: 0.065, filterType: 'bandpass', filterFreq: 1600, filterQ: 1.4, gainPeak: 0.08, delay: 0.11 },
      { durationSec: 0.085, filterType: 'bandpass', filterFreq: 2100, filterQ: 1.6, gainPeak: 0.09, delay: 0.22 },
    ],
    correctTones: [
      { freq: 523.25, durationSec: 0.12, type: 'triangle', gainPeak: 0.1, delay: 0 },
      { freq: 659.25, durationSec: 0.13, type: 'triangle', gainPeak: 0.1, delay: 0.075 },
      { freq: 783.99, durationSec: 0.2, type: 'triangle', gainPeak: 0.105, delay: 0.15 },
    ],
    wrongTones: [
      { freq: 207.65, durationSec: 0.18, type: 'sawtooth', gainPeak: 0.055, delay: 0 },
      { freq: 164.81, durationSec: 0.24, type: 'sine', gainPeak: 0.08, delay: 0.13 },
    ],
    urgentTickFreq: 932.33,
    urgentTickDoublePulse: true,
  },
  mystery_focus: {
    category: 'mystery_focus',
    labelAr: 'نغمة التركيز والغموض',
    energyLevel: 'calm',
    // Shimmering contemplative chimes for Who Am I / Memory / Order / Odd-One-Out
    introTones: [
      { freq: 440.0, durationSec: 0.22, type: 'sine', gainPeak: 0.065, delay: 0 },
      { freq: 523.25, durationSec: 0.24, type: 'sine', gainPeak: 0.065, delay: 0.14 },
      { freq: 659.25, durationSec: 0.32, type: 'triangle', gainPeak: 0.06, delay: 0.28 },
    ],
    introPercussion: [],
    correctTones: [
      { freq: 493.88, durationSec: 0.15, type: 'sine', gainPeak: 0.085, delay: 0 },
      { freq: 659.25, durationSec: 0.22, type: 'triangle', gainPeak: 0.09, delay: 0.1 },
    ],
    wrongTones: [
      { freq: 220.0, durationSec: 0.2, type: 'sine', gainPeak: 0.075, delay: 0 },
      { freq: 185.0, durationSec: 0.24, type: 'sine', gainPeak: 0.065, delay: 0.13 },
    ],
    urgentTickFreq: 783.99,
    urgentTickDoublePulse: false,
  },
  precision_quiz: {
    category: 'precision_quiz',
    labelAr: 'نغمة المعرفة والتفكير',
    energyLevel: 'upbeat',
    // Crisp bright quiz show entrance
    introTones: [
      { freq: 523.25, durationSec: 0.14, type: 'triangle', gainPeak: 0.075, delay: 0 },
      { freq: 659.25, durationSec: 0.14, type: 'triangle', gainPeak: 0.075, delay: 0.1 },
      { freq: 783.99, durationSec: 0.22, type: 'triangle', gainPeak: 0.085, delay: 0.2 },
    ],
    introPercussion: [
      { durationSec: 0.04, filterType: 'highpass', filterFreq: 3800, filterQ: 1.0, gainPeak: 0.045, delay: 0.2 },
    ],
    correctTones: [
      { freq: 523.25, durationSec: 0.14, type: 'triangle', gainPeak: 0.095, delay: 0 },
      { freq: 659.25, durationSec: 0.18, type: 'triangle', gainPeak: 0.1, delay: 0.09 },
    ],
    wrongTones: [
      { freq: 220.0, durationSec: 0.18, type: 'sine', gainPeak: 0.085, delay: 0 },
      { freq: 185.0, durationSec: 0.22, type: 'sine', gainPeak: 0.075, delay: 0.12 },
    ],
    urgentTickFreq: 880.0,
    urgentTickDoublePulse: false,
  },
  golden_finale: {
    category: 'golden_finale',
    labelAr: 'زفّة الجولة الذهبية المضاعفة',
    energyLevel: 'high',
    // Grand golden ×2 fanfare shimmer
    introTones: [
      { freq: 440.0, durationSec: 0.22, type: 'triangle', gainPeak: 0.08, delay: 0 },
      { freq: 554.37, durationSec: 0.22, type: 'triangle', gainPeak: 0.085, delay: 0.09 },
      { freq: 659.25, durationSec: 0.26, type: 'triangle', gainPeak: 0.09, delay: 0.18 },
      { freq: 880.0, durationSec: 0.36, type: 'sine', gainPeak: 0.095, delay: 0.27 },
    ],
    introPercussion: [
      { durationSec: 0.09, filterType: 'highpass', filterFreq: 3200, filterQ: 1.0, gainPeak: 0.07, delay: 0.27 },
    ],
    correctTones: [
      { freq: 587.33, durationSec: 0.12, type: 'triangle', gainPeak: 0.095, delay: 0 },
      { freq: 739.99, durationSec: 0.14, type: 'triangle', gainPeak: 0.095, delay: 0.08 },
      { freq: 880.0, durationSec: 0.24, type: 'triangle', gainPeak: 0.105, delay: 0.16 },
    ],
    wrongTones: [
      { freq: 233.08, durationSec: 0.2, type: 'sine', gainPeak: 0.085, delay: 0 },
      { freq: 174.61, durationSec: 0.26, type: 'sine', gainPeak: 0.08, delay: 0.13 },
    ],
    urgentTickFreq: 987.77,
    urgentTickDoublePulse: true,
  },
};

export function buildApplauseSteps(durationSec = 1.55, intensity: 'full' | 'light' = 'full'): NoiseStep[] {
  const safeDur = Math.max(0.4, Math.min(3.5, durationSec));
  const stepGap = intensity === 'full' ? 0.068 : 0.095;
  const count = Math.max(4, Math.floor((safeDur - 0.15) / stepGap));
  const steps: NoiseStep[] = [];
  const baseGain = intensity === 'full' ? 0.085 : 0.055;

  // Warm underlying crowd swell
  steps.push({
    durationSec: Math.min(safeDur, 1.35),
    filterType: 'bandpass',
    filterFreq: 1150,
    filterQ: 0.7,
    gainPeak: intensity === 'full' ? 0.055 : 0.035,
    delay: 0.05,
  });

  for (let i = 0; i < count; i++) {
    const progress = i / Math.max(1, count - 1);
    const envelope = progress < 0.2 ? 0.65 + progress * 1.75 : Math.max(0.28, 1 - (progress - 0.2) * 0.82);
    // Deterministic slight rhythm variation simulating multi-hand clapping
    const jitter = ((i % 3) - 1) * 0.011;
    const freqCenter = 1650 + (i % 4) * 280;
    steps.push({
      durationSec: 0.048,
      filterType: 'bandpass',
      filterFreq: freqCenter,
      filterQ: 1.6,
      gainPeak: Number((baseGain * envelope).toFixed(4)),
      delay: Number(Math.max(0, i * stepGap + jitter).toFixed(3)),
    });
  }
  return steps;
}

export function buildVictoryFanfare(isTie = false): ToneStep[] {
  if (isTie) {
    return [
      { freq: 440.0, durationSec: 0.16, type: 'triangle', gainPeak: 0.08, delay: 0 },
      { freq: 523.25, durationSec: 0.16, type: 'triangle', gainPeak: 0.085, delay: 0.12 },
      { freq: 659.25, durationSec: 0.28, type: 'triangle', gainPeak: 0.09, delay: 0.24 },
    ];
  }
  return [
    { freq: 523.25, durationSec: 0.14, type: 'triangle', gainPeak: 0.095, delay: 0 },
    { freq: 659.25, durationSec: 0.14, type: 'triangle', gainPeak: 0.095, delay: 0.11 },
    { freq: 783.99, durationSec: 0.15, type: 'triangle', gainPeak: 0.1, delay: 0.22 },
    { freq: 1046.5, durationSec: 0.36, type: 'triangle', gainPeak: 0.11, delay: 0.33 },
    { freq: 783.99, durationSec: 0.32, type: 'sine', gainPeak: 0.065, delay: 0.35 },
  ];
}

export type HostCueMood = 'idle' | 'hyped' | 'thinking' | 'tense' | 'celebrating' | 'shocked' | 'teasing';

export function buildHostCueSteps(mood: HostCueMood): { tones: ToneStep[]; noise: NoiseStep[] } {
  switch (mood) {
    case 'hyped':
      return {
        tones: [
          { freq: 659.25, durationSec: 0.08, type: 'sine', gainPeak: 0.04, delay: 0.04 },
          { freq: 880.0, durationSec: 0.11, type: 'triangle', gainPeak: 0.045, delay: 0.11 },
        ],
        noise: [],
      };
    case 'celebrating':
      return {
        tones: [
          { freq: 587.33, durationSec: 0.09, type: 'triangle', gainPeak: 0.045, delay: 0.04 },
          { freq: 783.99, durationSec: 0.09, type: 'triangle', gainPeak: 0.048, delay: 0.1 },
          { freq: 1046.5, durationSec: 0.16, type: 'sine', gainPeak: 0.05, delay: 0.17 },
        ],
        noise: [],
      };
    case 'tense':
      return {
        tones: [
          { freq: 740.0, durationSec: 0.06, type: 'sine', gainPeak: 0.04, delay: 0 },
          { freq: 783.99, durationSec: 0.08, type: 'sine', gainPeak: 0.042, delay: 0.07 },
        ],
        noise: [],
      };
    case 'shocked':
      return {
        tones: [
          { freq: 493.88, durationSec: 0.09, type: 'triangle', gainPeak: 0.045, delay: 0 },
          { freq: 311.13, durationSec: 0.16, type: 'sine', gainPeak: 0.045, delay: 0.08 },
        ],
        noise: [],
      };
    case 'teasing':
      return {
        tones: [
          { freq: 440.0, durationSec: 0.08, type: 'sine', gainPeak: 0.038, delay: 0.02 },
          { freq: 392.0, durationSec: 0.11, type: 'sine', gainPeak: 0.038, delay: 0.1 },
        ],
        noise: [],
      };
    case 'thinking':
      return {
        tones: [
          { freq: 523.25, durationSec: 0.07, type: 'sine', gainPeak: 0.032, delay: 0 },
          { freq: 587.33, durationSec: 0.09, type: 'sine', gainPeak: 0.034, delay: 0.07 },
        ],
        noise: [],
      };
    case 'idle':
    default:
      return { tones: [], noise: [] };
  }
}

