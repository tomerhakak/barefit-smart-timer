export interface Workout {
  id: string;
  name: string;
  kind: string;
  work: number;
  rest: number;
  rounds: number;
  sets: number;
  between: number;
  prepare: number;
  steps?: { type: string; seconds: number; label?: string }[];
}
export interface TimerView {
  workout: Workout;
  status: string;
  phase: string;
  phaseType: string;
  label: string;
  index: number;
  phaseCount: number;
  round: number;
  set: number;
  remaining: number;
  duration: number;
  progress: number;
  revision: number;
  totalRemaining: number;
}
export const PRESETS: Workout[];
export const LABELS: Record<string, string>;
export function validateWorkout(input: unknown): Workout;
export function buildPhases(
  w: Workout,
): {
  type: string;
  duration: number;
  round: number;
  set: number;
  label: string;
}[];
export function formatTime(ms: number): string;
export class WorkoutEngine {
  constructor(workout?: Workout, now?: () => number);
  workout: Workout;
  status: string;
  view(): TimerView;
  snapshot(): any;
  restore(data: any): void;
  command(type: string, payload?: any): TimerView;
  start(): void;
  pause(): void;
  stop(): void;
  next(): void;
  previous(): void;
  load(workout: Workout): void;
  sync(): void;
}
