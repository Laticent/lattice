// The Studio's pattern runner: each chat pattern search in a fresh module Worker, ended on PATTERN_TIMEOUT_MS
// (deck-find-pattern.ts says why). Its own module so the Worker file never imports the module that spawns it.
// Null where there are no Workers (a unit test under Node): the chat then refuses a pattern rather than run
// it on the main thread.

import { type PatternRunner, type PatternWorker, workerPatternRunner } from './deck-find-pattern';

// PROBE: no pattern Worker, on purpose (#34 failing arm for the pattern e2e); this branch is deleted after the run.
export const browserPatternRunner: PatternRunner | null = null;
void workerPatternRunner;
export type { PatternWorker };
