// audio.js — minimal generated ambience: wind, distant birds, footsteps.
// No external audio files needed; uses WebAudio noise/oscillator synthesis
// so the prototype runs from index.html with zero assets.

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicVol = 0.6;
    this.sfxVol = 0.7;
    this.started = false;
    this.musicEl = null;
  }

  init() {
    if (this.started) return;
    this.started = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.masterGain = this.ctx.gain ? null : this.ctx.createGain();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    this._startWind();
    this._scheduleBird();
    this._startMusic();
  }

  // Background music — a plain looping <audio> element rather than a
  // WebAudio buffer, since the track is a full song (~18MB) and doesn't
  // need sample-accurate scheduling the way the short synthesized SFX do.
  // See index.html's <head> for the required license attribution comment.
  _startMusic() {
    this.musicEl = document.createElement('audio');
    this.musicEl.src = 'pillars-of-creation.mp3';
    this.musicEl.loop = true;
    this.musicEl.volume = 0.35 * this.musicVol;
    // Autoplay policies block sound before a user gesture; init() itself is
    // only ever called from a user-initiated tap (see game.js), so this
    // play() call happens inside that gesture's call stack and should be
    // allowed. Swallow a rejection quietly if a browser blocks it anyway —
    // ambient wind/birds still play, so losing music isn't fatal.
    this.musicEl.play().catch(() => {});
  }

  setMusicVolume(v) {
    this.musicVol = v;
    if (this.windGain) this.windGain.gain.value = 0.05 * v;
    if (this.musicEl) this.musicEl.volume = 0.35 * v;
  }
  setSfxVolume(v) { this.sfxVol = v; }

  _startWind() {
    const ctx = this.ctx;
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 300;
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.value = 0.05 * this.musicVol;
    this.windGain = gain;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start();

    // slow LFO on filter freq for wind "breathing"
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 150;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
  }

  _scheduleBird() {
    const play = () => {
      if (this.ctx.state === 'suspended') return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      const g = this.ctx.createGain();
      g.gain.value = 0;
      osc.frequency.value = 1400 + Math.random() * 600;
      osc.connect(g);
      g.connect(this.master);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.02 * this.sfxVol, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.4);
    };
    const scheduleNext = () => {
      const delay = 4000 + Math.random() * 9000;
      setTimeout(() => { play(); scheduleNext(); }, delay);
    };
    scheduleNext();
  }

  footstep() {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const bufferSize = 0.06 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.value = 0.06 * this.sfxVol;
    noise.connect(filter); filter.connect(g); g.connect(this.master);
    noise.start(t);
  }

  jump() { this._blip(520, 0.08, 'sine'); }
  land() { this._blip(160, 0.1, 'triangle'); }
  collect() {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [660, 880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g); g.connect(this.master);
      const start = t + i * 0.05;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.05 * this.sfxVol, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.start(start); osc.stop(start + 0.32);
    });
  }
  bite() { this._blip(220, 0.05, 'square', 0.03); }
  hurt() { this._blip(140, 0.18, 'sawtooth', 0.05); }

  _blip(freq, dur, type, vol) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime((vol || 0.04) * this.sfxVol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
}

const audioSystem = new AudioSystem();
