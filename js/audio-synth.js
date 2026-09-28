/**
 * Audio Synthesizer & Procedural Soundboard
 * Generates realistic sound effects and demo radio music directly via Web Audio API.
 * 100% self-contained: works out-of-the-box without requiring external audio files!
 */

class AudioSynthEngine {
  constructor(audioContext = null) {
    this.ctx = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    this.isDemoMusicPlaying = false;
    this.demoMusicInterval = null;
    this.demoStep = 0;
  }

  setContext(ctx) {
    this.ctx = ctx;
  }

  ensureContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // ==========================================
  // SFX 1: AIR HORN (DJ BLAT)
  // ==========================================
  playAirhorn(destination = null) {
    this.ensureContext();
    const dest = destination || this.ctx.destination;
    const now = this.ctx.currentTime;

    // Airhorn chords (frequencies in Hz: Bb3, F4, Bb4, D5)
    const freqs = [233.08, 349.23, 466.16, 587.33];
    const bursts = [0, 0.22, 0.44]; // Triple blast rhythm

    bursts.forEach((burstTime) => {
      const t = now + burstTime;
      const burstDuration = 0.17;

      freqs.forEach((f) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        // Slight pitch drop for brass punch
        osc.frequency.exponentialRampToValueAtTime(f * 0.98, t + burstDuration);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(f * 1.5, t);
        filter.Q.setValueAtTime(4, t);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.25 / freqs.length, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + burstDuration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        osc.start(t);
        osc.stop(t + burstDuration + 0.05);
      });
    });
  }

  // ==========================================
  // SFX 2: RADIO CHIME / STATION IDENT
  // ==========================================
  playRadioJingle(destination = null) {
    this.ensureContext();
    const dest = destination || this.ctx.destination;
    const now = this.ctx.currentTime;

    // Classic 4-note melodic FM Chime: C5, E5, G5, C6
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const delays = [0, 0.16, 0.32, 0.50];

    notes.forEach((freq, idx) => {
      const t = now + delays[idx];
      const dur = 1.2;

      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      // Bell overtone
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2.76, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(dest);

      osc.start(t);
      osc2.start(t);
      osc.stop(t + dur);
      osc2.stop(t + dur);
    });
  }

  // ==========================================
  // SFX 3: APPLAUSE & CHEERS
  // ==========================================
  playApplause(destination = null, duration = 3.5) {
    this.ensureContext();
    const dest = destination || this.ctx.destination;
    const now = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Filtered pink noise + density clusters
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      let pink = b0 + b1 + b2 + white * 0.5362;
      // Claps modulation
      if (Math.random() < 0.004) {
        pink += (Math.random() * 2 - 1) * 3;
      }
      data[i] = pink * 0.25;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.setValueAtTime(1.2, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.65, now + 0.4);
    gain.gain.setValueAtTime(0.6, now + duration - 1.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    noise.start(now);
    noise.stop(now + duration);
  }

  // ==========================================
  // SFX 4: VINYL SCRATCH & SPINBACK
  // ==========================================
  playVinylScratch(destination = null) {
    this.ensureContext();
    const dest = destination || this.ctx.destination;
    const now = this.ctx.currentTime;
    const dur = 0.85;

    // FM Scratch synthesis
    const osc = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const mainGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.linearRampToValueAtTime(150, now + 0.18);
    osc.frequency.linearRampToValueAtTime(800, now + 0.35);
    osc.frequency.exponentialRampToValueAtTime(60, now + dur);

    mod.type = 'sine';
    mod.frequency.setValueAtTime(40, now);
    modGain.gain.setValueAtTime(250, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);

    mainGain.gain.setValueAtTime(0.01, now);
    mainGain.gain.linearRampToValueAtTime(0.4, now + 0.05);
    mainGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    mod.connect(modGain);
    modGain.connect(osc.frequency);
    osc.connect(filter);
    filter.connect(mainGain);
    mainGain.connect(dest);

    mod.start(now);
    osc.start(now);
    mod.stop(now + dur);
    osc.stop(now + dur);
  }

  // ==========================================
  // SFX 5: LASER SWEEP / WHOOSH
  // ==========================================
  playLaserSweep(destination = null) {
    this.ensureContext();
    const dest = destination || this.ctx.destination;
    const now = this.ctx.currentTime;
    const dur = 0.6;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + dur);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4000, now);
    filter.Q.setValueAtTime(6, now);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + dur);
  }

  // ==========================================
  // SFX 6: CENSOR BEEP (1 kHz)
  // ==========================================
  playCensorBeep(destination = null, duration = 0.5) {
    this.ensureContext();
    const dest = destination || this.ctx.destination;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.setValueAtTime(0.3, now + duration - 0.02);
    gain.gain.linearRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + duration);
  }

  // ==========================================
  // PROCEDURAL DEMO RADIO MUSIC GENERATOR
  // Groove / Synthwave beat loop
  // ==========================================
  startDemoMusic(destination = null, onBeat = null) {
    if (this.isDemoMusicPlaying) return;
    this.ensureContext();
    const dest = destination || this.ctx.destination;
    this.isDemoMusicPlaying = true;
    this.demoStep = 0;

    const bpm = 120;
    const stepTimeMs = (60 / bpm / 4) * 1000; // 16th notes

    // Bass notes progression (Am - F - C - G)
    const bassline = [
      110, 110, 110, 110, 110, 110, 110, 110, // A
      87.31, 87.31, 87.31, 87.31, 87.31, 87.31, 87.31, 87.31, // F
      130.81, 130.81, 130.81, 130.81, 130.81, 130.81, 130.81, 130.81, // C
      98, 98, 98, 98, 98, 98, 98, 98 // G
    ];

    // Arp notes
    const arpNotes = [440, 523.25, 659.25, 880, 659.25, 523.25, 440, 329.63];

    this.demoMusicInterval = setInterval(() => {
      if (!this.isDemoMusicPlaying) return;
      const now = this.ctx.currentTime;
      const step = this.demoStep % 32;

      // 1. Kick on beats 0, 4, 8, 12, 16, 20, 24, 28
      if (step % 4 === 0) {
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.frequency.setValueAtTime(150, now);
        kickOsc.frequency.exponentialRampToValueAtTime(38, now + 0.12);
        kickGain.gain.setValueAtTime(0.4, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        kickOsc.connect(kickGain);
        kickGain.connect(dest);
        kickOsc.start(now);
        kickOsc.stop(now + 0.15);
      }

      // 2. Snare / Clap on beats 4, 12, 20, 28
      if (step % 8 === 4) {
        const snareNoise = this.ctx.createBufferSource();
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.12, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
        snareNoise.buffer = buf;

        const snareFilter = this.ctx.createBiquadFilter();
        snareFilter.type = 'highpass';
        snareFilter.frequency.setValueAtTime(1200, now);

        const snareGain = this.ctx.createGain();
        snareGain.gain.setValueAtTime(0.3, now);
        snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        snareNoise.connect(snareFilter);
        snareFilter.connect(snareGain);
        snareGain.connect(dest);
        snareNoise.start(now);
      }

      // 3. Hi-hat on every odd step
      if (step % 2 === 1) {
        const hatOsc = this.ctx.createOscillator();
        const hatFilter = this.ctx.createBiquadFilter();
        const hatGain = this.ctx.createGain();
        hatOsc.type = 'square';
        hatOsc.frequency.setValueAtTime(8000, now);
        hatFilter.type = 'highpass';
        hatFilter.frequency.setValueAtTime(7000, now);
        hatGain.gain.setValueAtTime(0.07, now);
        hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        hatOsc.connect(hatFilter);
        hatFilter.connect(hatGain);
        hatGain.connect(dest);
        hatOsc.start(now);
        hatOsc.stop(now + 0.05);
      }

      // 4. Synth Bassline
      const bassFreq = bassline[step];
      if (step % 2 === 0 && bassFreq) {
        const bOsc = this.ctx.createOscillator();
        const bFilter = this.ctx.createBiquadFilter();
        const bGain = this.ctx.createGain();

        bOsc.type = 'sawtooth';
        bOsc.frequency.setValueAtTime(bassFreq, now);

        bFilter.type = 'lowpass';
        bFilter.frequency.setValueAtTime(380, now);
        bFilter.Q.setValueAtTime(3, now);

        bGain.gain.setValueAtTime(0.18, now);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        bOsc.connect(bFilter);
        bFilter.connect(bGain);
        bGain.connect(dest);
        bOsc.start(now);
        bOsc.stop(now + 0.18);
      }

      // 5. Arpeggio Synth melody
      const arpFreq = arpNotes[step % arpNotes.length];
      const aOsc = this.ctx.createOscillator();
      const aGain = this.ctx.createGain();
      aOsc.type = 'triangle';
      aOsc.frequency.setValueAtTime(arpFreq, now);
      aGain.gain.setValueAtTime(0.06, now);
      aGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      aOsc.connect(aGain);
      aGain.connect(dest);
      aOsc.start(now);
      aOsc.stop(now + 0.11);

      if (onBeat) onBeat(step);
      this.demoStep++;
    }, stepTimeMs);
  }

  stopDemoMusic() {
    this.isDemoMusicPlaying = false;
    if (this.demoMusicInterval) {
      clearInterval(this.demoMusicInterval);
      this.demoMusicInterval = null;
    }
  }
}

// Global instance
window.audioSynth = new AudioSynthEngine();
