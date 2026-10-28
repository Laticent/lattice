// The worker for Filo's heavy history work (studio-filo-persist.ts, Filo note §4.3), so none of it
// runs on the main thread:
//   · `narrow`: split a broad step (an AI apply, an import) into the lines that changed before it is
//     stored. On the bench's 100-step history of the 134 KB deck that costs 29 ms in Node
//     (`npm run bench`, the filo tier); §4.3 measured an unbounded line diff at 260-720 ms in browsers.
//   · `verify`: replay a stored history after a reload, checking every step against the text it was
//     recorded on. On a 100-step history that costs 16-34 ms (`npm run bench`, the filo tier).

import { narrowSnapshot } from '@/lib/filo/narrow';
import { replaySnapshot, type Snapshot } from '@/lib/filo/snapshot';

type Ask = { id: number; kind: 'narrow' | 'verify'; snap: Snapshot };

self.onmessage = (e: MessageEvent<Ask>) => {
	const { id, kind, snap } = e.data;
	if (kind === 'verify') {
		self.postMessage({ id, ok: replaySnapshot(snap) !== null });
		return;
	}
	let out: Snapshot | null = null;
	try {
		out = narrowSnapshot(snap);
	} catch {
		out = null;
	}
	self.postMessage({ id, snap: out });
};
