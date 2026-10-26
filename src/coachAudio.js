import { COACH_ASSETS } from '../shared/cues.mjs';

export class CoachAudio {
  constructor(report = () => {}) {
    this.report = report;
    this.buffers = new Map(); this.sources = new Set(); this.epoch = 0;
    this.data = Promise.all(COACH_ASSETS.map(async id => {
      const response = await fetch(`./assets/coach/${id}.wav?v=2`);
      if (!response.ok) throw Error('audio-load');
      return [id, await response.arrayBuffer()];
    }));
    this.data.catch(() => report('error'));
    this.report('loading');
  }
  prepare() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) { this.report('error'); return; }
      if (!this.context) this.context = new Context();
      if (!this.loading) this.loading = this.data.then(async entries => {
        for (const [id, data] of entries) {
          // Callbacks keep decoding compatible with embedded TV WebKit versions.
          const buffer = await new Promise((resolve,reject)=>this.context.decodeAudioData(data.slice(0),resolve,reject));
          this.buffers.set(id,buffer);
        }
        this.report('ready');
      }).catch(() => this.report('error'));
    } catch { this.report('error'); }
  }
  unlock() {
    this.prepare();
    this.context?.resume().then(() => {
      if (this.buffers.size === COACH_ASSETS.length) this.report('ready');
    }).catch(() => this.report('blocked'));
  }
  stop() {
    this.epoch++;
    for (const s of this.sources) { try { s.stop(); } catch {} }
    this.sources.clear();
    clearInterval(this.previewTimer);
  }
  play(cue, volume = .8) {
    if (!cue) return;
    this.stop();
    if (cue.stop || volume <= 0) return;
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') { this.report('blocked'); return; }
    // A delayed decode must never play an old count over the current time.
    if (!this.buffers.size || !this.buffers.has(cue.voice || cue.tone)) return;
    for (const [id, gain] of [[cue.tone, cue.voice ? volume * .26 : volume * .7], [cue.voice, volume]]) {
      if (!id || !this.buffers.has(id)) continue;
      const source = ctx.createBufferSource(), level = ctx.createGain();
      source.buffer = this.buffers.get(id); level.gain.value = gain;
      source.connect(level); level.connect(ctx.destination);
      source.onended = () => { this.sources.delete(source); source.disconnect(); level.disconnect(); };
      this.sources.add(source); source.start();
    }
  }
  async preview(volume, voice) {
    this.stop(); this.unlock();
    const epoch = this.epoch;
    await this.loading;
    if (epoch !== this.epoch) return;
    const cues = [{tone:'tone-work',voice:voice?'last':null}, ...Array.from({length:10},(_,i)=>({voice:voice?String(10-i):null,tone:'tone-tick'})), {tone:'tone-finish',voice:voice?'finish':null}];
    let index = 0;
    const next = () => {
      const cue = cues[index++];
      if (!cue) { this.stop(); return; }
      this.play(cue,volume);
      if (index < cues.length) this.previewTimer = setTimeout(next,index === 1 ? 1250 : 1000);
    };
    next();
  }
  dispose() { this.stop(); this.context?.close(); }
}
