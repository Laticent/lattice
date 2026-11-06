// THE ONE READER OF THE AUTHOR'S OPENROUTER KEY.
//
// The Studio, the Playground and the /suono and /cadenza library pages all run on the
// author's own OpenRouter key (BYOK). It used to be read in four places, each with its own
// copy of the storage name, so "what can read the key?" had no short answer. Every reader
// and writer now goes through this module, and `openrouter-key.test.ts` fails if the name
// appears anywhere else under `docs/src`. That one-module answer is what the shared-deck
// isolation proof stands on (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md).
//
// No imports and no side effects: every page that needs the key can load it cheaply.

const KEY = 'lattice-db-or-key';
// '1' once OpenRouter answered 401 for the stored key (revoked, deleted or expired).
const REJECTED = 'lattice-db-or-key-invalid';

function read(name) {
	try {
		return localStorage.getItem(name);
	} catch {
		return null;
	}
}
function write(name, value) {
	try {
		if (value == null) localStorage.removeItem(name);
		else localStorage.setItem(name, value);
	} catch {
		/* storage unavailable — the key simply is not there */
	}
}

/** The stored key, or null. */
export function readOpenRouterKey() {
	return read(KEY) || null;
}

/** Store a key (or remove it with null). A new key, or none, always clears the rejected mark. */
export function writeOpenRouterKey(key) {
	write(KEY, key || null);
	write(REJECTED, null);
}

/** True when OpenRouter has rejected the stored key with a 401. */
export function openRouterKeyRejected() {
	return !!readOpenRouterKey() && read(REJECTED) === '1';
}

/** Mark the stored key rejected. Returns true only on the transition, so callers announce it once. */
export function markOpenRouterKeyRejected() {
	if (!readOpenRouterKey() || read(REJECTED) === '1') return false;
	write(REJECTED, '1');
	return true;
}

/** Whether a `storage` event (another tab) changed the key. A cleared store (`key === null`) counts. */
export function isOpenRouterKeyEvent(event) {
	return event?.key === KEY || event?.key === null;
}
