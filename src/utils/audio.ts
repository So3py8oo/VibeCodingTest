// Web Audio API Retro Sound Effects Synthesizer

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterVolume: GainNode | null = null;
  private bgmIntervalId: number | null = null;
  private bgmStep = 0;
  private isBgmPlaying = false;
  private isMuted = false;

  constructor() {
    // Sound is lazy-initialized on first user interaction to comply with browser autoplay policies
  }

  private init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterVolume = this.ctx.createGain();
        this.masterVolume.gain.setValueAtTime(0.3, this.ctx.currentTime); // default volume is gentle
        this.masterVolume.connect(this.ctx.destination);
      }
    } catch (e) {
      console.warn('Web Audio API is not supported in this browser:', e);
    }
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterVolume && this.ctx) {
      this.masterVolume.gain.setValueAtTime(this.isMuted ? 0 : 0.25, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  playJump(isDouble: boolean = false) {
    this.init();
    if (!this.ctx || this.isMuted) return;

    // Resume context if suspended
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle'; // pleasant soft retro sound

    if (!isDouble) {
      // First jump: Boing-y rising sound
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.15);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc.connect(gain);
      gain.connect(this.masterVolume!);
      osc.start(now);
      osc.stop(now + 0.23);
    } else {
      // Double jump: Shorter, higher double-twang
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.connect(gain);
      gain.connect(this.masterVolume!);
      osc.start(now);
      osc.stop(now + 0.16);
    }
  }

  playScoreMilestone() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    // Classic retro "ding ding!" or arpeggio
    const playNote = (freq: number, startTime: number, duration: number) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration - 0.02);
      
      osc.connect(gain);
      gain.connect(this.masterVolume!);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    playNote(523.25, now, 0.08); // C5
    playNote(659.25, now + 0.08, 0.08); // E5
    playNote(783.99, now + 0.16, 0.18); // G5 (sustained)
  }

  playHit() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    
    // Low rumble / crash
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(40, now + 0.3);
    
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    
    osc.connect(gain);
    gain.connect(this.masterVolume!);
    
    osc.start(now);
    osc.stop(now + 0.45);

    // Add extra low-noise burst
    try {
      const bufferSize = this.ctx.sampleRate * 0.2; // 0.2 seconds of noise
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(300, now);
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterVolume!);
      
      noise.start(now);
      noise.stop(now + 0.2);
    } catch (e) {
      // Fallback if audio buffer allocation fails
    }
  }

  playMenuClick() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.05);
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
    
    osc.connect(gain);
    gain.connect(this.masterVolume!);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  // Soft background melody synthesizer
  startBGM() {
    this.init();
    if (this.isBgmPlaying || this.isMuted) return;
    this.isBgmPlaying = true;
    
    // Simple 8-step retro nursery or cute pentatonic melody in F-major / G-major
    // Notes: C4, D4, E4, G4, A4, C5 (Pentatonic, very safe and charming)
    const melody = [261.63, 293.66, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66];
    const bass = [130.81, 146.83, 164.81, 196.00, 130.81, 196.00, 164.81, 146.83];
    
    const tick = () => {
      if (!this.isBgmPlaying || !this.ctx || this.isMuted) return;
      
      const now = this.ctx.currentTime;
      const step = this.bgmStep;
      
      // Melody note (every beat)
      // Play a soft bell-like sound
      const noteFreq = melody[step % melody.length];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(noteFreq, now);
      
      // Extremely quiet and ambient BGM
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      
      osc.connect(gain);
      gain.connect(this.masterVolume!);
      osc.start(now);
      osc.stop(now + 0.3);

      // Bass accompaniment (every 2 beats)
      if (step % 2 === 0) {
        const bassFreq = bass[(step / 2) % bass.length];
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(bassFreq, now);
        
        bassGain.gain.setValueAtTime(0.05, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        
        bassOsc.connect(bassGain);
        bassGain.connect(this.masterVolume!);
        bassOsc.start(now);
        bassOsc.stop(now + 0.5);
      }

      this.bgmStep = (this.bgmStep + 1) % 16;
    };

    // Trigger tick every 350ms (charming cheerful tempo)
    const intervalFn = () => {
      tick();
      if (this.isBgmPlaying) {
        this.bgmIntervalId = window.setTimeout(intervalFn, 350);
      }
    };
    
    intervalFn();
  }

  stopBGM() {
    this.isBgmPlaying = false;
    if (this.bgmIntervalId) {
      clearTimeout(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
  }
}

export const gameAudio = new AudioEngine();
