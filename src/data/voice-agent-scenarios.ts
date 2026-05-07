/** Speaker label rendered before each transcript turn. */
export type Speaker = 'sophie' | 'caller';

/** One conversational turn — a contiguous span of speech by a single speaker.
    `startMs` / `endMs` are the audio offsets used to drive transcript highlight. */
export interface Turn {
  readonly speaker: Speaker;
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

/** Behind-the-scenes event surfaced in the right rail.
    `plain` is the client-facing description; `technical` is the engineer view
    (tool name + duration). Toggle in the UI swaps which one is visible. */
export interface TimelineEvent {
  readonly atMs: number;
  readonly plain: string;
  readonly technical: string;
}

/** Pre-recorded demo call. Each scenario maps to one mp3 in /public/audio/voice-agent/. */
export interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly callerId: string;
  readonly durationMs: number;
  readonly audioSrc: string;
  readonly turns: readonly Turn[];
  readonly events: readonly TimelineEvent[];
}

/** Ordered source of truth for the scenario tab-bar.
    Empty in v1 — page renders the "recording in progress" empty state until
    the first real call is recorded. */
export const SCENARIOS: readonly Scenario[] = [];
