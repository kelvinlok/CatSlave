import type { Game } from './simulation';
import type { CareEvent, CatActivity, FloorPoint, ToolId } from './types';

export type SoundId = ToolId | 'meow' | 'purr' | 'scratch' | 'eat' | 'land' | 'rustle' | 'step' | 'select' | 'reject' | 'pat';
export interface SoundSink {
  play(id: SoundId, position?: FloorPoint, key?: string): void;
  stop(): void;
}

// Short, original Foley textures. Recorded voices and contact sounds load separately.
// Fixed seed keeps the textures reproducible without consuming gameplay RNG.
function texture(context: AudioContext, id: SoundId): AudioBuffer {
  const durations: Record<SoundId, number> = { sweeper: .24, mop: .3, brush: .18, food: .26,
    toy: .22, vacuum: .75, meow: .5, purr: .85, scratch: .22, eat: .14,
    land: .16, rustle: .32, step: .07, select: .06, reject: .13, pat: .12 };
  const duration = durations[id], rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(rate * duration), rate), data = buffer.getChannelData(0);
  let seed = 317, low = 0, previous = 0, phase = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, u = t / duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = seed / 2147483648;
    low += (noise - low) * .12;
    const high = noise - previous; previous = noise;
    const envelope = Math.min(1, t / .012) * Math.pow(1 - u, 1.7);
    let value = 0;
    switch (id) {
      case 'sweeper': value = (low * 2 + high * .1) * (.6 + .4 * Math.sin(u * Math.PI)); break;
      case 'brush': value = (high * .16 + low) * (.65 + .35 * Math.sin(t * 170)); break;
      case 'mop': value = low * 2.5 + Math.sin(t * 680 + Math.sin(t * 70) * 4) * .07; break;
      case 'food': case 'eat': value = (noise * .3 + Math.sin(t * 3200) * .16) * Math.pow(Math.max(0, Math.sin(t * (id === 'food' ? 225 : 130))), 8); break;
      case 'toy': value = Math.sin(t * 2 * Math.PI * 1840) * .18 * Math.exp(-t * 23) + Math.sin(t * 2 * Math.PI * 2760) * .08 * Math.exp(-t * 30) + high * .04; break;
      case 'vacuum': value = (Math.sin(t * 2 * Math.PI * (92 + 35 * u)) * .25 + Math.sin(t * 2 * Math.PI * 186) * .08 + low * 1.1) * Math.min(1, t * 20); break;
      case 'scratch': value = high * .23 * (.35 + .65 * Math.pow(Math.sin(t * 85), 2)) + low * .65; break;
      case 'rustle': value = low * 1.5 * Math.pow(Math.sin(t * 65), 2) + high * .08; break;
      case 'step': case 'land': case 'pat': value = low * .9 + Math.sin(t * 2 * Math.PI * (id === 'step' ? 130 : 85)) * .4 * Math.exp(-t * 28); break;
      case 'select': case 'reject': value = Math.sin(t * 2 * Math.PI * (id === 'select' ? 720 : 240)) * .2; break;
      // Soft fallback if a recording fails to decode; no remote dependency at runtime.
      case 'purr': value = (low * 1.3 + Math.sin(t * 2 * Math.PI * 95) * .15) * (.3 + .7 * Math.pow(Math.sin(t * Math.PI * 25), 2)); break;
      case 'meow': phase += 2 * Math.PI * (440 + Math.sin(u * Math.PI) * 190 - u * 100) / rate; value = (Math.sin(phase) * .22 + Math.sin(phase * 2) * .06) * Math.sin(u * Math.PI); break;
    }
    data[i] = Math.max(-.8, Math.min(.8, value * envelope));
  }
  return buffer;
}

const cooldown: Partial<Record<SoundId, number>> = { meow: 2.5, purr: 10, sweeper: .16, mop: .2,
  brush: .14, food: .22, toy: .48, vacuum: .8, reject: .4, scratch: .24, eat: .28, step: .22, pat: .16 };
const volumes: Partial<Record<SoundId, number>> = { meow: .5, purr: .24, step: .12, land: .32,
  scratch: .28, eat: .28, rustle: .3, vacuum: .45, toy: .4 };

export class GameAudio implements SoundSink {
  private context?: AudioContext;
  private master?: GainNode;
  private buffers = new Map<SoundId, AudioBuffer>();
  private voices = new Set<AudioBufferSourceNode>();
  private lastPlayed = new Map<string, number>();
  // Shared by care rewards and bonus pats, across cats and pause/mute cleanup.
  private lastPurrAt = -Infinity;
  private volume = .65;
  private blocked = false;
  private loaded = 0;
  private failed = 0;
  private played = 0;
  private counts: Partial<Record<SoundId, number>> = {};
  constructor() {
    try {
      const saved = localStorage.getItem('catslave.sound-volume');
      if (saved !== null && Number.isFinite(Number(saved))) this.volume = Math.max(0, Math.min(1, Number(saved)));
    } catch { /* Storage may be unavailable in private browsing. */ }
  }
  get label() { return this.volume === 0 ? 'Sound: off' : this.volume < .5 ? 'Sound: soft' : 'Sound: on'; }
  get diagnostics() { return { state: this.context?.state ?? 'locked', volume: this.volume, voices: this.voices.size, loaded: this.loaded, failed: this.failed, played: this.played, counts: { ...this.counts } }; }
  unlock() {
    try {
      if (!this.context) {
        const context = this.context = new AudioContext();
        this.master = context.createGain(); this.master.gain.value = this.volume;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12; limiter.ratio.value = 8;
        this.master.connect(limiter); limiter.connect(context.destination);
        void this.loadRecordings(context);
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Audio support must never prevent playing the game. */ }
  }
  private async loadRecordings(context: AudioContext) {
    const files = { meow: 'cat-meow', purr: 'cat-purr', mop: 'water-pour', vacuum: 'vacuum', scratch: 'scratch' } as const;
    await Promise.all((Object.entries(files) as [SoundId, string][]).map(async ([id, file]) => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}audio/${file}.wav`);
        if (!response.ok) throw new Error('Missing audio');
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(id, buffer); this.loaded++;
      } catch { this.failed++; }
    }));
  }
  cycleVolume() {
    this.volume = this.volume === 0 ? .65 : this.volume >= .5 ? .3 : 0;
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .015);
    if (!this.volume) this.stop();
    try { localStorage.setItem('catslave.sound-volume', String(this.volume)); } catch { /* optional */ }
  }
  setBlocked(value: boolean) { if (value && !this.blocked) this.stop(); this.blocked = value; }
  stop() {
    for (const source of this.voices) { source.stop(); source.disconnect(); }
    this.voices.clear(); this.lastPlayed.clear();
  }
  play(id: SoundId, position?: FloorPoint, key: string = id) {
    const context = this.context;
    if (!context || context.state !== 'running' || this.blocked || this.volume === 0 || this.voices.size >= 12) return;
    const now = context.currentTime;
    if (id === 'purr' && now - this.lastPurrAt < 10) return;
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < (cooldown[id] ?? .1)) return;
    // Also cap calls shared by multiple cats, so five simultaneous needs stay gentle.
    if (id === 'meow' && now - (this.lastPlayed.get('all-meows') ?? -Infinity) < 1.2) return;
    this.lastPlayed.set(key, now); if (id === 'meow') this.lastPlayed.set('all-meows', now);
    if (id === 'purr') this.lastPurrAt = now;
    let buffer = this.buffers.get(id);
    if (!buffer) { buffer = texture(context, id); this.buffers.set(id, buffer); }
    const source = context.createBufferSource(), gain = context.createGain(), pan = context.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = id === 'select' || id === 'reject' ? 1 : .96 + Math.random() * .08;
    gain.gain.value = (volumes[id] ?? .5) * (position ? 1 / (1 + Math.abs(position.z - 2) * .055) : 1);
    if (id === 'purr') {
      // A short response, with a gentle release instead of an abrupt sample cut.
      const level = gain.gain.value;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level, now + .04);
      gain.gain.setValueAtTime(level, now + .5);
      gain.gain.linearRampToValueAtTime(0, now + .65);
    }
    pan.pan.value = position ? Math.max(-.75, Math.min(.75, position.x / 6)) : 0;
    source.connect(gain); gain.connect(pan); pan.connect(this.master!);
    this.voices.add(source); this.played++; this.counts[id] = (this.counts[id] ?? 0) + 1;
    source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); pan.disconnect(); };
    source.start();
    if (id === 'purr') source.stop(now + .65);
  }
}

interface CatSoundState { activity: CatActivity; stride: number; visitIndex?: number; visitProgress?: number; lastFoley: number; happy: number; }

/** Observe simulation transitions without modifying its state or random sequence. */
export class RoomSounds {
  private cats = new Map<number, CatSoundState>();
  private events = new Map<number, Pick<CareEvent, 'catId' | 'kind'>>();
  private clock = -1;
  private damage = 0;
  private running = false;
  reset() { this.cats.clear(); this.events.clear(); this.clock = -1; this.damage = 0; this.running = false; }
  update(game: Game, sink: SoundSink) {
    if (game.clock < this.clock) { sink.stop(); this.reset(); }
    this.clock = game.clock;
    if (!game.running) {
      if (this.running) sink.stop();
      this.running = false; this.cats.clear(); this.events = new Map(game.events.map(e => [e.id, { catId: e.catId, kind: e.kind }])); this.damage = game.damageSerial;
      return;
    }
    this.running = true;
    for (const event of game.events) if (!this.events.has(event.id)) sink.play('meow', game.cats.find(c => c.id === event.catId)?.position, `need:${event.catId}`);
    if (game.damageSerial > this.damage) sink.play('scratch', game.cats.find(c => c.id === game.lastAttackCatId)?.position, 'attack');
    this.damage = game.damageSerial;
    for (const cat of game.cats) {
      const previous = this.cats.get(cat.id);
      let lastFoley = previous?.lastFoley ?? -Infinity;
      const play = (id: SoundId) => sink.play(id, cat.position, `${id}:${cat.id}`);
      if (previous) {
        // Reserve the reward for a settled room after direct play. Routine cleanup
        // and feeding already have contact sounds and must not add another voice.
        if (cat.happyUntil > previous.happy && game.events.length === 0 &&
          [...this.events.values()].some(event => event.catId === cat.id && event.kind === 'boredom')) play('purr');
        if (previous.activity === 'jumping' && (previous.visitProgress ?? 0) > 0 &&
          (cat.activity !== 'jumping' || cat.visit?.index !== previous.visitIndex || (cat.visit?.progress ?? 0) < (previous.visitProgress ?? 0))) play('land');
        if (cat.activity === 'crawling' && previous.activity !== 'crawling' || cat.activity === 'hiding' && previous.activity !== 'hiding') play('rustle');
        if (cat.activity === 'walking' && Math.floor(cat.stride / (Math.PI / 2)) !== Math.floor(previous.stride / (Math.PI / 2))) play('step');
      }
      const interval = cat.activity === 'scratching' ? .29 : cat.activity === 'eating' ? .42 : 1.2;
      if (previous?.activity !== cat.activity || game.clock - lastFoley >= interval - 1e-7) {
        if (cat.activity === 'scratching') play('scratch');
        else if (cat.activity === 'eating') play('eat');
        else if (cat.activity === 'grooming') play('brush');
        lastFoley = game.clock;
      }
      this.cats.set(cat.id, { activity: cat.activity, stride: cat.stride, visitIndex: cat.visit?.index,
        visitProgress: cat.visit?.progress, lastFoley, happy: cat.happyUntil });
    }
    for (const id of this.cats.keys()) if (!game.cats.some(cat => cat.id === id)) this.cats.delete(id);
    this.events = new Map(game.events.map(e => [e.id, { catId: e.catId, kind: e.kind }]));
  }
}
