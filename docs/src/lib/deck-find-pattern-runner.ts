// The Studio's pattern runner: each chat pattern search in a fresh module Worker, ended on PATTERN_TIMEOUT_MS
// (deck-find-pattern.ts says why). Its own module so the Worker file never imports the module that spawns it.
// Null where there are no Workers (a unit test under Node): the chat then refuses a pattern rather than run
// it on the main thread.

import { type PatternRunner, type PatternWorker, workerPatternRunner } from './deck-find-pattern';

export const browserPatternRunner: PatternRunner | null =
	typeof Worker === 'undefined' ? null : workerPatternRunner(() => new Worker(new URL('./deck-find-pattern.worker.ts', import.meta.url), { type: 'module' }) as unknown as PatternWorker);
