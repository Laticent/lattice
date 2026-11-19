// The Worker a chat find or replace runs its pattern in (deck-find-pattern.ts explains why). It answers one
// job and the page ends it; it never keeps state between jobs.

import { type PatternJob, runPattern } from './deck-find-pattern';

self.onmessage = (e: MessageEvent<PatternJob>) => {
	self.postMessage(runPattern(e.data));
};
