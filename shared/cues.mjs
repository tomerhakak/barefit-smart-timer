import { buildPhases } from './engine.mjs';

export const COACH_ASSETS = ['1','2','3','4','5','6','7','8','9','10',
  'work','rest','prepare','between','last','last-set','finish',
  'tone-work','tone-rest','tone-prepare','tone-tick','tone-finish'];

const plans = new WeakMap();
function plan(workout) {
  if (!plans.has(workout)) {
    const work = buildPhases(workout).map((phase,index)=>({phase,index})).filter(x=>x.phase.type==='work');
    // One continuous effort (e.g. a 20-minute AMRAP) is not a final round.
    plans.set(workout, { finalIndex: work.length > 1 && workout.kind.toUpperCase() !== 'AMRAP' ? work[work.length-1].index : -1 });
  }
  return plans.get(workout);
}
export function isFinalRound(view) {
  return view.phaseType === 'work' && view.index === plan(view.workout).finalIndex;
}
export function countdownWindow(view) { return isFinalRound(view) ? 10 : 3; }
export function roundNotice(view) {
  return !['ready','finished'].includes(view.status) && isFinalRound(view) ? 'סיבוב אחרון' : '';
}

// The clock owns timing. Never queue missed counts or infer elapsed time from audio.
export class CueTracker {
  reset() { this.previous = null; this.entered = null; this.spokenSecond = null; }
  constructor() { this.reset(); }
  update(view, { voice = true, countdown = 10 } = {}) {
    if (this.workout !== view.workout) {
      this.workout = view.workout;
      this.reset();
    }
    const previous = this.previous;
    this.previous = { status: view.status, index: view.index };
    if (view.status === 'ready') {
      this.entered = null; this.spokenSecond = null;
      return previous?.status !== 'ready' ? { stop: true } : null;
    }
    if (view.status === 'paused') return previous?.status !== 'paused' ? { stop: true } : null;
    if (view.status === 'finished') return previous?.status !== 'finished'
      ? { tone: 'tone-finish', voice: voice ? 'finish' : null } : null;
    const second = Math.ceil(view.remaining / 1000);
    const entry = this.entered !== view.index;
    if (entry) { this.entered = view.index; this.spokenSecond = null; }
    let spoken = null;
    let tone = null;
    if (entry) {
      tone = view.phaseType === 'work' ? 'tone-work'
        : ['rest','between'].includes(view.phaseType) ? 'tone-rest' : 'tone-prepare';
      // Rest starts with its distinct tone. Spoken counting only happens near its end.
      spoken = isFinalRound(view) ? 'last' : view.phaseType === 'work' ? 'work' : null;
    }
    const window = countdown === 0 ? 0 : countdownWindow(view);
    if (second > 0 && second <= window && second !== this.spokenSecond) {
      this.spokenSecond = second;
      // A short final round can enter inside the countdown window; keep its
      // audible number aligned with the clock instead of replacing it.
      // Never let the final-round announcement replace the actual number.
      spoken = String(second);
      if (!tone && (!voice || second <= 3)) tone = 'tone-tick';
    } else if (!entry) return null;
    return { tone, voice: voice ? spoken : null };
  }
}
