export const PRESETS = [
  {
    id: "hiit",
    name: "HIIT קבוצתי",
    kind: "HIIT",
    work: 45,
    rest: 15,
    rounds: 8,
    sets: 3,
    between: 90,
    prepare: 10,
  },
  {
    id: "tabata",
    name: "טבטה קלאסי",
    kind: "TABATA",
    work: 20,
    rest: 10,
    rounds: 8,
    sets: 1,
    between: 0,
    prepare: 10,
  },
  {
    id: "emom",
    name: "כל דקה מחדש",
    kind: "EMOM",
    work: 60,
    rest: 0,
    rounds: 12,
    sets: 1,
    between: 0,
    prepare: 10,
  },
  {
    id: "amrap",
    name: "כמה שיותר סבבים",
    kind: "AMRAP",
    work: 1200,
    rest: 0,
    rounds: 1,
    sets: 1,
    between: 0,
    prepare: 10,
  },
  {
    id: "boxing",
    name: "סבבי אגרוף",
    kind: "BOXING",
    work: 180,
    rest: 60,
    rounds: 6,
    sets: 1,
    between: 0,
    prepare: 10,
  },
  {
    id: "strength",
    name: "כוח ודיוק",
    kind: "STRENGTH",
    work: 40,
    rest: 30,
    rounds: 6,
    sets: 3,
    between: 120,
    prepare: 10,
  },
];
export function validateWorkout(input) {
  if (
    !input ||
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 80
  )
    throw Error("יש להזין שם אימון עד 80 תווים");
  const w = {
    id: String(input.id || "custom").slice(0, 80),
    name: input.name.trim(),
    kind: String(input.kind || "CUSTOM").slice(0, 30),
  };
  const limits = {
    work: [1, 7200],
    rest: [0, 3600],
    rounds: [1, 100],
    sets: [1, 20],
    between: [0, 3600],
    prepare: [0, 300],
  };
  for (const [key, [min, max]] of Object.entries(limits)) {
    const n = Number(input[key]);
    if (!Number.isInteger(n) || n < min || n > max)
      throw Error(`ערך לא תקין: ${key} (${min}–${max})`);
    w[key] = n;
  }
  if (input.steps !== undefined) {
    if (
      !Array.isArray(input.steps) ||
      !input.steps.length ||
      input.steps.length > 500
    )
      throw Error("נדרשים 1–500 שלבים");
    w.steps = input.steps.map((s) => {
      if (
        !["work", "rest", "prepare", "between"].includes(s.type) ||
        !Number.isInteger(s.seconds) ||
        s.seconds < 1 ||
        s.seconds > 7200
      )
        throw Error("שלב לא תקין");
      return {
        type: s.type,
        seconds: s.seconds,
        label: String(s.label || "").slice(0, 60),
      };
    });
  }
  if (buildPhases(w).reduce((n, p) => n + p.duration, 0) > 86400000)
    throw Error("אימון מוגבל ל־24 שעות");
  return w;
}
export function buildPhases(w) {
  const phases = [];
  const add = (type, seconds, round = 1, set = 1, label = "") => {
    if (seconds > 0)
      phases.push({ type, duration: seconds * 1000, round, set, label });
  };
  if (w.steps) {
    w.steps.forEach((s, i) => add(s.type, s.seconds, i + 1, 1, s.label));
    return phases;
  }
  add("prepare", w.prepare);
  for (let set = 1; set <= w.sets; set++)
    for (let round = 1; round <= w.rounds; round++) {
      add("work", w.work, round, set);
      if (round < w.rounds) add("rest", w.rest, round, set);
      else if (set < w.sets) add("between", w.between, round, set);
    }
  return phases;
}
export function formatTime(ms) {
  const n = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
}
export const LABELS = {
  ready: "מוכנים?",
  prepare: "מתכוננים",
  work: "עבודה",
  rest: "מנוחה",
  between: "בין סטים",
  finished: "כל הכבוד!",
  paused: "השהיה",
};
// The ticker only asks for a view; elapsed time is always derived from a monotonic clock.
export class WorkoutEngine {
  constructor(workout = PRESETS[0], now = () => performance.now()) {
    this.now = now;
    this.load(workout);
  }
  load(workout) {
    this.workout = validateWorkout(workout);
    this.phases = buildPhases(this.workout);
    // Avoid allocating and summing the remaining phase list on every TV frame.
    this.remainingAfter = new Array(this.phases.length + 1).fill(0);
    for(let i=this.phases.length-1;i>=0;i--)
      this.remainingAfter[i]=this.remainingAfter[i+1]+this.phases[i].duration;
    this.index = 0;
    this.elapsed = 0;
    this.anchor = this.now();
    this.status = "ready";
    this.revision = (this.revision || 0) + 1;
  }
  sync() {
    if (this.status !== "running") return;
    const current = this.now();
    let elapsed = this.elapsed + Math.max(0, current - this.anchor);
    this.anchor = current;
    while (
      this.index < this.phases.length &&
      elapsed >= this.phases[this.index].duration
    ) {
      elapsed -= this.phases[this.index].duration;
      this.index++;
      this.revision++;
    }
    if (this.index >= this.phases.length) {
      this.index = this.phases.length - 1;
      this.status = "finished";
      this.elapsed = this.phases[this.index].duration;
    } else this.elapsed = elapsed;
  }
  start() {
    if (this.status === "running") return;
    if (this.status === "finished") {
      this.index = 0;
      this.elapsed = 0;
    }
    this.status = "running";
    this.anchor = this.now();
    this.revision++;
  }
  pause() {
    this.sync();
    if (this.status === "running") {
      this.status = "paused";
      this.revision++;
    }
  }
  stop() {
    this.index = 0;
    this.elapsed = 0;
    this.status = "ready";
    this.anchor = this.now();
    this.revision++;
  }
  next() {
    this.sync();
    if (this.status === "finished") return;
    if (this.index < this.phases.length - 1) {
      this.index++;
      this.elapsed = 0;
      this.anchor = this.now();
      if (this.status === "ready") this.status = "paused";
    } else {
      this.status = "finished";
      this.elapsed = this.phases[this.index].duration;
    }
    this.revision++;
  }
  previous() {
    this.sync();
    this.index = Math.max(0, this.index - 1);
    this.elapsed = 0;
    this.anchor = this.now();
    if (this.status === "finished" || this.status === "ready")
      this.status = "paused";
    this.revision++;
  }
  command(type, payload) {
    switch (type) {
      case "START":
      case "RESUME":
        this.start();
        break;
      case "PAUSE":
        this.pause();
        break;
      case "STOP":
        this.stop();
        break;
      case "NEXT_PHASE":
        this.next();
        break;
      case "PREVIOUS_PHASE":
        this.previous();
        break;
      case "LOAD_WORKOUT":
      case "UPDATE_WORKOUT":
        if (this.status === "running")
          throw Error("יש להשהות את האימון לפני שינוי תוכנית");
        this.load(payload);
        break;
      case "GET_STATUS":
        break;
      default:
        throw Error("פקודה לא מוכרת");
    }
    return this.view();
  }
  view() {
    this.sync();
    const phase = this.phases[this.index];
    const remaining = Math.max(0, phase.duration - this.elapsed);
    return {
      workout: this.workout,
      status: this.status,
      phase:
        this.status === "finished"
          ? "finished"
          : this.status === "ready"
            ? "ready"
            : phase.type,
      phaseType: phase.type,
      label: phase.label,
      index: this.index,
      phaseCount: this.phases.length,
      round: phase.round,
      set: phase.set,
      remaining,
      duration: phase.duration,
      progress: remaining / phase.duration,
      revision: this.revision,
      totalRemaining: remaining + this.remainingAfter[this.index + 1],
    };
  }
  snapshot() {
    this.sync();
    return {
      version: 1,
      workout: this.workout,
      index: this.index,
      elapsed: this.elapsed,
      status: this.status,
      revision: this.revision,
    };
  }
  restore(data) {
    if (data?.version !== 1) throw Error("גרסת שמירה אינה נתמכת");
    this.load(data.workout);
    if (
      !Number.isInteger(data.index) ||
      data.index < 0 ||
      data.index >= this.phases.length ||
      !Number.isFinite(data.elapsed) ||
      data.elapsed < 0 ||
      data.elapsed > this.phases[data.index].duration ||
      !["ready", "running", "paused", "finished"].includes(data.status)
    )
      throw Error("שמירה פגומה");
    this.index = data.index;
    this.elapsed = data.elapsed;
    this.status = data.status === "running" ? "paused" : data.status;
    this.revision++;
    this.anchor = this.now();
  }
}
