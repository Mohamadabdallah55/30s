class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = false; // Quiet mosque default
  public calmMode = true;

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(freq: number, durationSec: number, type: OscillatorType = 'sine', gainPeak = 0.08, delay = 0) {
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

  correct() {
    this.playTone(523.25, 0.14, 'triangle', 0.1, 0);
    this.playTone(659.25, 0.18, 'triangle', 0.1, 0.09);
  }

  wrong() {
    this.playTone(220, 0.18, 'sine', 0.09, 0);
    this.playTone(185, 0.22, 'sine', 0.08, 0.12);
  }

  tickUrgent() {
    this.playTone(880, 0.06, 'sine', 0.06, 0);
  }

  buzz() {
    this.playTone(587.33, 0.18, 'triangle', 0.11, 0);
  }

  victory() {
    this.playTone(523.25, 0.15, 'triangle', 0.09, 0);
    this.playTone(659.25, 0.15, 'triangle', 0.09, 0.12);
    this.playTone(783.99, 0.28, 'triangle', 0.1, 0.24);
  }
}

export const soundFx = new SoundEngine();
