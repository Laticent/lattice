// The Worker a chat find or replace runs its pattern in (deck-find-pattern.ts explains why). It says it is
// ready, answers one job, and the page ends it; it never keeps state between jobs.

import { PATTERN_READY, type PatternJob, runPattern } from './deck-find-pattern';

self.onmessage = (e: MessageEvent<PatternJob>) => {
	self.postMessage(runPattern(e.data));
};
// The page starts the search clock on this, so loading this script never counts against the pattern.
self.postMessage(PATTERN_READY);
