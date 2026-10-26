import type { TimerView } from './engine.mjs';
export const COACH_ASSETS: string[];
export interface Cue { stop?: boolean; tone?: string | null; voice?: string | null }
export function roundNotice(view: TimerView): string;
export function isFinalRound(view: TimerView): boolean;
export function countdownWindow(view: TimerView): number;
export class CueTracker {
  reset(): void;
  update(view: TimerView, settings?: {voice?: boolean; countdown?: number}): Cue | null;
}
