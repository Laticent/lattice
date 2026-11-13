// The page's side of the Studio's lint worker (lint-worker.js): one worker, shared by the editor's lint and the Coach's
// assessment, on the shared pool machinery (src/lib/worker-pool.js) with the main thread as the fallback.
//
// Each caller has a LANE. A lane runs one pass at a time and keeps only the newest request waiting: typing ten keys while a
// pass runs queues one more pass, not ten. A request that a newer one replaced before it started resolves `{ superseded: true }`, and
// its caller drops it (its text is already stale). `{ fallback: true }` means no worker can run here (no module workers,
// the lint core is not an asset of this page, or the worker failed) and the caller lints on the main thread, as the
// Studio always did. A pass whose lint THREW comes back `{ threw }`, so the caller says "no answer" rather than "clean".

import { deckPluginsOff } from '@/lib/plugin-admission';
import { createSharedPool, createWorkerPool } from '@/lib/worker-pool.js';

/** A lint of a deck takes well under a second here since payloads are skipped (lib/core/payload-elision.js). A worker
 *  silent this long is gone (a phone ends workers under memory pressure without an error event), and the pool falls back. */
const DEADLINE_MS = 120_000;

const SUPERSEDED = Object.freeze({ superseded: true });

// The lint core's address, from the lint door. Imported on the first pass, not with this module: the editor imports this
// module at startup, and the door must stay off the Studio's startup path (docs/scripts/inject-modulepreload.mjs).
/** @type {(() => string | null) | null} */
let lintCoreAddress = null;
/** @type {Promise<unknown> | null} */
let doorLoading = null;
const address = () => lintCoreAddress?.() ?? null;

const shared = createSharedPool(
	() =>
		createWorkerPool({
			spawn: () => new Worker(new URL('./lint-worker.js', import.meta.url), { type: 'module' }),
			size: 1,
			deadlineMs: DEADLINE_MS,
			label: 'lint',
			available: () => typeof Worker !== 'undefined' && !!address(),
		}),
	// The editor lints on every pause in typing; a minute between passes keeps the worker and its loaded core.
	{ idleMs: 60_000 },
);

// A vocabulary's content as a string, so the worker can tell two callers' vocabularies apart without comparing them
// field by field. Kept per object: the editor's is built once per configuration.
const keys = new WeakMap();
function vocabKey(vocab) {
	if (!vocab) return '';
	let k = keys.get(vocab);
	if (k == null) {
		k = JSON.stringify(vocab, (_key, v) => (v instanceof Set ? [...v] : v));
		keys.set(vocab, k);
	}
	return k;
}

/** @type {Map<string, { key: string, queued: { message: object, resolve: (v: any) => void } | null, running: boolean }>} */
const lanes = new Map();

let solo = 0;
function request(lane, message) {
	// A null lane is a one-off: nothing replaces it (the chat checks each draft it writes, and wants every answer).
	const key = lane ?? `solo:${solo++}`;
	return new Promise((resolve) => {
		let l = lanes.get(key);
		if (!l) {
			l = { key, queued: null, running: false };
			lanes.set(key, l);
		}
		l.queued?.resolve(SUPERSEDED);
		l.queued = { message, resolve };
		if (!l.running) void pump(l);
	});
}

async function pump(l) {
	l.running = true;
	while (l.queued) {
		const { message, resolve } = l.queued;
		l.queued = null;
		// The URL and the admission are read when the pass starts, not when it was asked for: the engine may have loaded
		// since (its directory names the same files), and the admission is the deck's as it stands.
		// Never throws: a door that will not load (offline after a deploy) is a pass on the main thread, and a later pass
		// tries the import again.
		try {
			doorLoading ??= import('@/playground/authoring-door.js').then((door) => {
				lintCoreAddress = door.lintCoreAddress;
			});
			await doorLoading;
			const out = await shared.use((pool) => pool.run(() => ({ message: { ...message, url: address(), off: deckPluginsOff(message.text) } })));
			resolve('fallback' in out ? out : out.value);
		} catch {
			doorLoading = null;
			resolve({ fallback: true });
		}
	}
	l.running = false;
	lanes.delete(l.key);
}

/**
 * Lint `text` off the main thread.
 * @param {string | null} lane  one per caller, e.g. `editor`; null for a one-off that nothing replaces
 * @returns {Promise<{ findings: any[] } | { threw: string } | { fallback: true } | { superseded: true }>}
 */
export function lintOffThread(lane, text, vocab) {
	return request(lane, { op: 'lint', text, vocab, vocabKey: vocabKey(vocab) });
}

/**
 * The Coach's assessment (assess-kernel.js) off the main thread.
 * @returns {Promise<{ scorecard: any, findings: any[] } | { threw: string } | { fallback: true } | { superseded: true }>}
 */
export function assessOffThread(lane, text, vocab, components, profileOverride) {
	const plain = components.map((c) => ({ name: c.name, bucket: c.bucket, density: c.density }));
	return request(lane, { op: 'assess', text, vocab, vocabKey: vocabKey(vocab), components: plain, profileOverride });
}
