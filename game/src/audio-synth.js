// 100% procedural Web Audio API sound engine (turbine hum, wind rush, afterburner roar,
// stall warning horn, sky-ring chime, gear clunk, arrestor wire arrest, and cargo drop SFX).

import { clamp } from './math3d.js';

export class AudioSynth {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
    this.master = null;
    this.turbineOsc = null;
    this.turbineGain = null;
    this.windGain = null;
    this.windFilter = null;
    this.stallBeepTimer = 0;
  }

  ensureStarted() {
    if (this.ready || typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.35;
    this.master.connect(this.ctx.destination);

    // Turbine harmonic hum
    this.turbineOsc = this.ctx.createOscillator();
    this.turbineOsc.type = 'sawtooth';
    this.turbineOsc.frequency.value = 110;
    const turbFilter = this.ctx.createBiquadFilter();
    turbFilter.type = 'lowpass';
    turbFilter.frequency.value = 340;
    this.turbineGain = this.ctx.createGain();
    this.turbineGain.gain.value = 0.0;
    this.turbineOsc.connect(turbFilter);
    turbFilter.connect(this.turbineGain);
    this.turbineGain.connect(this.master);
    this.turbineOsc.start();

    // Filtered pink-like noise for cockpit wind & afterburner rush
    const bufLen = this.ctx.sampleRate * 2;
    const noiseBuf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.06 * white) / 1.06;
      data[i] = lastOut * 2.5;
    }
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 460;
    this.windFilter.Q.value = 0.8;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.0;
    noiseSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    noiseSrc.start();

    this.ready = true;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.35, this.ctx.currentTime, 0.04);
    }
    return this.muted;
  }

  updateFlightAudio(dt, active, plane) {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (!active || plane.crashed || plane.arrested) {
      this.turbineGain.gain.setTargetAtTime(0, t, 0.08);
      this.windGain.gain.setTargetAtTime(0, t, 0.08);
      return;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const fuelAlive = plane.fuel > 0.01 ? 1 : 0;
    const rpmFactor = clamp(0.25 + plane.throttle * 0.75 + (plane.afterburner ? 0.35 : 0), 0.15, 1.4) * fuelAlive;
    this.turbineOsc.frequency.setTargetAtTime(84 + rpmFactor * 145, t, 0.06);
    this.turbineGain.gain.setTargetAtTime(0.05 + rpmFactor * 0.09, t, 0.08);

    const speedRatio = clamp(plane.indicatedAirspeed / 180, 0.1, 1.2);
    this.windFilter.frequency.setTargetAtTime(plane.afterburner ? 280 : 420 + speedRatio * 560, t, 0.08);
    this.windGain.gain.setTargetAtTime((0.06 + speedRatio * 0.14 + (plane.afterburner ? 0.22 : 0)), t, 0.08);

    if (plane.stalling) {
      this.stallBeepTimer -= dt;
      if (this.stallBeepTimer <= 0) {
        this.stallBeepTimer = 0.34;
        this.playTone(680, 0.12, 'square', 0.11);
      }
    } else {
      this.stallBeepTimer = 0;
    }
  }

  playTone(freq, durSec, type = 'sine', vol = 0.16, endFreq = null) {
    if (!this.ready || !this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + durSec);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + durSec);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + durSec + 0.02);
  }

  playRingClear(combo = 1) {
    const base = 520 + Math.min(combo, 6) * 55;
    this.playTone(base, 0.14, 'triangle', 0.18, base * 1.35);
    setTimeout(() => this.playTone(base * 1.5, 0.22, 'sine', 0.15), 75);
  }

  playGearToggle() {
    this.playTone(170, 0.16, 'sawtooth', 0.12, 95);
  }

  playCargoDrop() {
    this.playTone(320, 0.18, 'triangle', 0.16, 140);
  }

  playLanding() {
    this.playTone(440, 0.16, 'triangle', 0.18);
    setTimeout(() => this.playTone(660, 0.28, 'triangle', 0.18), 110);
  }

  playCrash() {
    this.playTone(135, 0.48, 'sawtooth', 0.25, 42);
  }
}
