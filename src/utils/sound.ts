import type { RoundType } from '../shared/types';
import {
  SOUND_CATEGORY_PRESETS,
  buildApplauseSteps,
  buildHostCueSteps,
  buildVictoryFanfare,
  getRoundSoundCategory,
  type HostCueMood,
  type NoiseStep,
  type RoundSoundCategory,
  type ToneStep,
} from './soundProfiles';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private currentCategory: RoundSoundCategory = 'precision_quiz';
  public enabled = false; // Quiet mosque default
  public calmMode = true;

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 1.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.08,
    delay = 0
  ) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    const vol = this.calmMode ? gainPeak * 0.55 : gainPeak;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  private playNoiseBurst(step: NoiseStep) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime + step.delay;
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = step.filterType;
    filter.frequency.setValueAtTime(step.filterFreq, now);
    filter.Q.setValueAtTime(step.filterQ, now);

    const gain = ctx.createGain();
    const vol = this.calmMode ? step.gainPeak * 0.55 : step.gainPeak;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + step.durationSec);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + step.durationSec + 0.02);
  }

  private playSequence(tones: ToneStep[], noise: NoiseStep[] = []) {
    for (const t of tones) {
      this.playTone(t.freq, t.durationSec, t.type, t.gainPeak, t.delay);
    }
    for (const n of noise) {
      this.playNoiseBurst(n);
    }
  }

  unlock() {
    const enabled = this.enabled;
    this.enabled = true;
    this.getContext();
    this.enabled = enabled;
  }

  setRoundContext(roundType?: RoundType | null, goldenTargetType?: RoundType | null): RoundSoundCategory {
    this.currentCategory = getRoundSoundCategory(roundType, goldenTargetType);
    return this.currentCategory;
  }

  getRoundCategory(roundType?: RoundType | null, goldenTargetType?: RoundType | null): RoundSoundCategory {
    if (roundType) return getRoundSoundCategory(roundType, goldenTargetType);
    return this.currentCategory;
  }

  roundStart(roundType?: RoundType | null, goldenTargetType?: RoundType | null) {
    const category = roundType
      ? this.setRoundContext(roundType, goldenTargetType)
      : this.currentCategory;
    const preset = SOUND_CATEGORY_PRESETS[category];
    this.playSequence(preset.introTones, preset.introPercussion);
  }

  applause(durationSec = 1.55, intensity: 'full' | 'light' = 'full') {
    const steps = buildApplauseSteps(durationSec, intensity);
    for (const step of steps) {
      this.playNoiseBurst(step);
    }
  }

  countdown(step: number, roundType?: RoundType | null) {
    const category = this.getRoundCategory(roundType);
    if (category === 'rapid_sprint' || category === 'show_duel') {
      this.playTone(step === 1 ? 880 : 493.88, 0.11, 'triangle', 0.075);
      if (step === 1) {
        this.playNoiseBurst({
          durationSec: 0.05,
          filterType: 'highpass',
          filterFreq: 3800,
          filterQ: 1.2,
          gainPeak: 0.055,
          delay: 0,
        });
      }
      return;
    }
    this.playTone(step === 1 ? 784 : 440, 0.13, 'triangle', 0.07);
  }

  timeUp() {
    this.playTone(330, 0.18, 'triangle', 0.07);
    this.playTone(247, 0.25, 'triangle', 0.06, 0.12);
  }

  combo() {
    [523, 659, 784, 1047].forEach((note, index) => this.playTone(note, 0.14, 'triangle', 0.075, index * 0.055));
  }

  lead() {
    this.playTone(392, 0.15, 'triangle', 0.075);
    this.playTone(784, 0.2, 'triangle', 0.08, 0.1);
  }

  golden() {
    const preset = SOUND_CATEGORY_PRESETS.golden_finale;
    this.playSequence(preset.introTones, preset.introPercussion);
  }

  correct(roundType?: RoundType | null) {
    const category = this.getRoundCategory(roundType);
    const preset = SOUND_CATEGORY_PRESETS[category];
    this.playSequence(preset.correctTones);
    if (category === 'golden_finale' || category === 'show_duel') {
      this.applause(0.55, 'light');
    }
  }

  wrong(roundType?: RoundType | null) {
    const category = this.getRoundCategory(roundType);
    const preset = SOUND_CATEGORY_PRESETS[category];
    this.playSequence(preset.wrongTones);
  }

  tickUrgent(roundType?: RoundType | null) {
    const category = this.getRoundCategory(roundType);
    const preset = SOUND_CATEGORY_PRESETS[category];
    this.playTone(preset.urgentTickFreq, 0.055, 'sine', 0.06, 0);
    if (preset.urgentTickDoublePulse) {
      this.playTone(preset.urgentTickFreq * 1.12, 0.045, 'triangle', 0.045, 0.08);
    }
  }

  buzz() {
    this.playTone(587.33, 0.18, 'triangle', 0.11, 0);
    this.playNoiseBurst({
      durationSec: 0.045,
      filterType: 'bandpass',
      filterFreq: 2400,
      filterQ: 1.4,
      gainPeak: 0.065,
      delay: 0,
    });
  }

  victory(isTie = false) {
    const fanfare = buildVictoryFanfare(isTie);
    this.playSequence(fanfare);
    this.applause(isTie ? 1.0 : 1.75, isTie ? 'light' : 'full');
  }

  hostCue(mood: HostCueMood) {
    const { tones, noise } = buildHostCueSteps(mood);
    if (tones.length || noise.length) {
      this.playSequence(tones, noise);
    }
  }
}

export const soundFx = new SoundEngine();
export { getRoundSoundCategory, getRoundSoundCategoryLabelAr } from './soundProfiles';
export type { HostCueMood, RoundSoundCategory, SoundCueCategory } from './soundProfiles';
