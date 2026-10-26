import test from "node:test";
import assert from "node:assert/strict";
import {
  WorkoutEngine,
  PRESETS,
  buildPhases,
  validateWorkout,
  formatTime,
} from "../shared/engine.mjs";
const setup = (w) => {
  let t = 0;
  const engine = new WorkoutEngine({ ...PRESETS[0], ...w }, () => t);
  return { engine, advance: (n) => (t += n) };
};
test("monotonic catch-up crosses several phases without losing overshoot", () => {
  const { engine: e, advance } = setup({
    prepare: 10,
    work: 45,
    rest: 15,
    rounds: 8,
    sets: 1,
  });
  e.start();
  advance(130500);
  const v = e.view();
  assert.equal(v.phase, "work");
  assert.equal(v.round, 3);
  assert.equal(v.remaining, 44500);
});
test("pause and resume preserve milliseconds", () => {
  const { engine: e, advance } = setup({ prepare: 0 });
  e.start();
  advance(1234);
  e.pause();
  advance(800000);
  assert.equal(e.view().remaining, 43766);
  e.start();
  advance(1000);
  assert.equal(e.view().remaining, 42766);
});
test("final round has no trailing rest; sets have only between-set rest", () => {
  const p = buildPhases({ ...PRESETS[0], prepare: 0, rounds: 2, sets: 2 });
  assert.deepEqual(
    p.map((p) => p.type),
    ["work", "rest", "work", "between", "work", "rest", "work"],
  );
});
test("completion remains stable after long missed callbacks", () => {
  const { engine: e, advance } = setup({
    prepare: 0,
    work: 1,
    rounds: 2,
    rest: 0,
    sets: 1,
  });
  e.start();
  advance(86400000);
  assert.equal(e.view().status, "finished");
  assert.equal(e.view().remaining, 0);
  e.start();
  assert.equal(e.view().round, 1);
  assert.equal(e.view().remaining, 1000);
});
test("restore running session always pauses", () => {
  const { engine: e, advance } = setup();
  e.start();
  advance(2371);
  const saved = e.snapshot();
  const r = new WorkoutEngine();
  r.restore(saved);
  assert.equal(r.view().status, "paused");
  assert.equal(r.view().remaining, 7629);
});
test("rejects corrupt snapshots and bad workouts", () => {
  const e = new WorkoutEngine();
  assert.throws(() => e.restore({ ...e.snapshot(), index: 100000 }));
  assert.throws(() => validateWorkout({ ...PRESETS[0], work: 0 }));
  assert.throws(() => validateWorkout({ ...PRESETS[0], rounds: 1.5 }));
  assert.throws(() =>
    validateWorkout({ ...PRESETS[0], work: 7200, rounds: 100, sets: 20 }),
  );
});
test("manual steps and stop preserve safe state", () => {
  const { engine: e } = setup();
  e.next();
  assert.equal(e.view().status, "paused");
  assert.equal(e.view().phase, "work");
  e.previous();
  assert.equal(e.view().phase, "prepare");
  e.stop();
  assert.equal(e.view().status, "ready");
});
test("workout cannot be replaced while running", () => {
  const e = new WorkoutEngine();
  e.start();
  assert.throws(() => e.command("LOAD_WORKOUT", PRESETS[1]));
  assert.equal(e.view().workout.id, "hiit");
});
test("custom phase sequences are validated and executed", () => {
  const { engine: e, advance } = setup({
    steps: [
      { type: "work", seconds: 120, label: "חימום" },
      { type: "rest", seconds: 30 },
      { type: "work", seconds: 60, label: "תחנה 1" },
    ],
  });
  e.start();
  advance(151000);
  assert.equal(e.view().label, "תחנה 1");
  assert.equal(e.view().remaining, 59000);
});
test("24-hour simulated endurance matches the reference clock exactly", () => {
  const { engine: e, advance } = setup({
    prepare: 10,
    work: 1000,
    rest: 30,
    rounds: 50,
    sets: 1,
    between: 0,
  });
  const duration = e.view().totalRemaining;
  e.start();
  let total = 0;
  while (total < 86400000) {
    advance(137);
    total += 137;
    const v = e.view();
    assert.equal(v.totalRemaining, Math.max(0, duration - total));
    assert.ok(v.remaining >= 0 && v.remaining <= v.duration);
    assert.ok(v.index >= 0 && v.index < v.phaseCount);
  }
});
test("boundary timing and formatting", () => {
  const { engine: e, advance } = setup({
    prepare: 1,
    work: 2,
    rest: 1,
    sets: 1,
    rounds: 2,
  });
  e.start();
  advance(1000);
  assert.equal(e.view().phase, "work");
  assert.equal(e.view().remaining, 2000);
  assert.equal(formatTime(1001), "00:02");
  assert.equal(formatTime(60000), "01:00");
});
