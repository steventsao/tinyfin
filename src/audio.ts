/** Every sound is synthesized: a low sea rumble, swim wash, bubble bloops, chimes, far whale calls. */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private wash!: GainNode;
  private washF!: BiquadFilterNode;
  private rumbleF!: BiquadFilterNode;
  private verb!: ConvolverNode;
  private nextWhale = 12;
  private nextBloop = 2;
  muted = false;

  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // Reverb: a generated decaying-noise impulse, long and dark, like a big body of water.
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 4;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) { lp = lp * 0.9 + (Math.random() * 2 - 1) * 0.1; d[i] = lp * Math.pow(1 - i / len, 2.5) * 3; }
    }
    this.verb.buffer = ir;
    const vg = ctx.createGain();
    vg.gain.value = 0.55;
    this.verb.connect(vg).connect(this.master);

    const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < nd.length; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; nd[i] = b * 3.5; }
    const loop = (gain: number) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.loopStart = Math.random();
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g);
      src.start(0, Math.random() * 3);
      return g;
    };
    // Rumble.
    this.rumbleF = ctx.createBiquadFilter();
    this.rumbleF.type = "lowpass";
    this.rumbleF.frequency.value = 260;
    loop(0.7).connect(this.rumbleF).connect(this.master);
    // Swim wash: band-passed noise that rises with speed.
    this.washF = ctx.createBiquadFilter();
    this.washF.type = "bandpass";
    this.washF.Q.value = 0.8;
    this.washF.frequency.value = 400;
    this.wash = ctx.createGain();
    this.wash.gain.value = 0;
    loop(1).connect(this.washF).connect(this.wash).connect(this.master);

    // A quiet pad: three detuned sines, slowly breathing.
    const pad = ctx.createGain();
    pad.gain.value = 0.035;
    const pf = ctx.createBiquadFilter();
    pf.type = "lowpass";
    pf.frequency.value = 900;
    pad.connect(pf).connect(this.master);
    pf.connect(this.verb);
    [146.83, 220, 277.18, 329.63].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? "triangle" : "sine";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 12;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + i * 0.017;
      const lg = ctx.createGain();
      lg.gain.value = 0.45;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(pad);
      o.start();
      lfo.start();
    });
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.1);
  }

  bloop(pitch = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    const f0 = (280 + Math.random() * 380) * pitch;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.6, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.verb);
    o.start(t);
    o.stop(t + 0.15);
  }

  chime(n: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    const f = 587.33 * Math.pow(2, scale[n % scale.length] / 12);
    const t = ctx.currentTime;
    for (const [mul, type, amp] of [[1, "sine", 0.08], [2.01, "triangle", 0.025], [3.98, "sine", 0.012]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.verb);
      o.start(t);
      o.stop(t + 1.5);
    }
  }

  private whale(pitch = 1, gain = 0.05): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const f0 = (90 + Math.random() * 80) * pitch;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (1.4 + Math.random() * 0.6), t + 1.6);
    o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 3.6);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = 4;
    vib.connect(vg).connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    lp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
    o.connect(lp).connect(g);
    g.connect(this.verb);
    o.start(t);
    vib.start(t);
    o.stop(t + 4);
    vib.stop(t + 4);
  }

  /** A nearby whale's call: louder and closer-sounding than the ambient far calls. */
  song(pitch: number, gain: number): void {
    if (!this.ctx) return;
    this.whale(pitch, gain);
    setTimeout(() => this.ctx && this.whale(pitch * 1.25, gain * 0.7), 2600);
  }

  update(dt: number, speed: number, depth: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.wash.gain.setTargetAtTime(Math.min(0.5, 0.03 + speed * 0.035), t, 0.2);
    this.washF.frequency.setTargetAtTime(250 + speed * 90, t, 0.2);
    this.rumbleF.frequency.setTargetAtTime(Math.max(90, 320 - depth * 2.5), t, 0.5);
    this.nextWhale -= dt;
    if (this.nextWhale < 0) { this.whale(); this.nextWhale = 25 + Math.random() * 40; }
    this.nextBloop -= dt;
    if (this.nextBloop < 0) { this.bloop(0.8); this.nextBloop = 1.5 + Math.random() * 5; }
  }
}
