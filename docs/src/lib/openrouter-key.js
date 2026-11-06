// THE ONE READER OF THE AUTHOR'S OPENROUTER KEY.
//
// The Studio, the Playground and the /suono and /cadenza library pages all run on the
// author's own OpenRouter key (BYOK). It used to be read in four places, each with its own
// copy of the storage name, so "what can read the key?" had no short answer. Every reader
// and writer now goes through this module, and `openrouter-key.test.ts` fails if the name
// appears anywhere else under `docs/src`. That makes OUR code auditable. It is not the
// shared-deck defense: a script injected into a same-origin frame can read localStorage
// without this module. That defense is the slide sanitizer
// (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §3–§4).
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

/** A safe label for the stored key — its last four characters — or null. Never the key. */
export function openRouterKeyHint() {
	const key = readOpenRouterKey();
	return key && key.length > 8 ? `…${key.slice(-4)}` : key ? '…' : null;
}

/** True when OpenRouter has rejected the stored key with a 401. */
export function openRouterKeyRejected() {
	return !!readOpenRouterKey() && read(REJECTED) === '1';
}

/**
 * Feed the status of a request made WITH `key` into the rejected mark. A 401 marks the key
 * rejected; any 2xx clears a mark it earned earlier (a one-off 401 must not stick). A request
 * made with a key that is no longer the stored one is ignored: its answer is about the old
 * key, and letting a late 401 land after a reconnect would mark the NEW key rejected.
 * Returns true when the mark changed, so the caller can announce it once.
 */
export function noteOpenRouterStatus(status, key) {
	if (!key || key !== readOpenRouterKey()) return false;
	const marked = read(REJECTED) === '1';
	if (status === 401 && !marked) write(REJECTED, '1');
	else if (status >= 200 && status < 300 && marked) write(REJECTED, null);
	else return false;
	if (typeof window !== 'undefined') {
		try {
			window.dispatchEvent(new Event('db-model-changed'));
		} catch {
			/* no event support — the next status read still sees the mark */
		}
	}
	return true;
}

/** Whether a `storage` event (another tab) changed the key. A cleared store (`key === null`) counts. */
export function isOpenRouterKeyEvent(event) {
	return event?.key === KEY || event?.key === null;
}
