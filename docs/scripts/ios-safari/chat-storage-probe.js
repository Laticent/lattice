/**
 * THE CHAT STORAGE PROBE (PROBE=chat-storage), run INSIDE the Studio page by WebDriver (run.mjs) on Mobile Safari in
 * the iOS Simulator, and by the Playwright self-test (probe.selftest.mjs) on WebKit. It checks, in the engine the
 * Tauri app and every iPhone use, the two storage claims of
 * engineering/decisions/2026-11-11-studio-storage-pointer-records.md §11:
 *
 *   1. chats saved by an earlier build in localStorage (`lattice-studio-chat-<deckId>`) move to IndexedDB
 *      (`lattice-studio-chats` / `chats`) after a reload, without the author opening them, and arrive whole;
 *   2. the localStorage allowance is what local-quota.ts assumes for WebKit: about 5,242,272 characters of Latin-1
 *      text, and half that once the values hold a non-Latin-1 character. The fill warning's arithmetic rests on it.
 *
 * Two halves, because the migration runs at boot: `latticeChatStorageProbe()` plants the legacy threads in a booted
 * Studio, run.mjs reloads the page for real, and `latticeChatStorageAfterReload(seed)` checks the move, then
 * measures the allowance (last, so filling localStorage cannot disturb the move it checks). Each half resolves to
 * `{ ok, error, steps, ua, width }`. Plain browser JS on purpose: WebDriver's execute-script sends source text.
 */
const CHAT_PREFIX = 'lattice-studio-chat-';
const NEVER_OPENED = 'ios-probe-never-opened';
const THREAD = [
	{ role: 'user', content: 'asked before the upgrade — on iOS' },
	{ role: 'assistant', content: 'answered before the upgrade' },
];
const OTHER = [{ role: 'user', content: 'a deck this page never opens' }];

/** Poll `test` every 250 ms until it returns a truthy value or `ms` pass; the value, or null. */
async function chatProbeUntil(test, ms) {
	const t0 = Date.now();
	for (;;) {
		const v = await test();
		if (v) return v;
		if (Date.now() - t0 > ms) return null;
		await new Promise((r) => setTimeout(r, 250));
	}
}

/** The stored thread of one deck, read straight from IndexedDB: an array of message texts, or null. */
function chatProbeStored(deckId) {
	return new Promise((resolve) => {
		const open = indexedDB.open('lattice-studio-chats');
		open.onerror = () => resolve(null);
		open.onsuccess = () => {
			const db = open.result;
			if (!db.objectStoreNames.contains('chats')) {
				db.close();
				return resolve(null);
			}
			const get = db.transaction('chats').objectStore('chats').get(deckId);
			get.onsuccess = () => {
				db.close();
				resolve(get.result ? get.result.messages.map((m) => m.content) : null);
			};
			get.onerror = () => {
				db.close();
				resolve(null);
			};
		};
	});
}

const chatProbeLegacyKeys = () => Object.keys(localStorage).filter((k) => k.startsWith(CHAT_PREFIX) && k !== `${CHAT_PREFIX}selection` && k !== `${CHAT_PREFIX}fallback`);

/** Fill localStorage with `ch` until it refuses; the characters stored (key + value), then remove the fill. */
function chatProbeAllowance(ch) {
	const keys = [];
	let total = 0;
	for (const size of [100000, 10000, 1000, 100]) {
		const chunk = ch.repeat(size);
		for (;;) {
			const k = `ios-probe-fill-${keys.length}`;
			try {
				localStorage.setItem(k, chunk);
			} catch {
				break;
			}
			keys.push(k);
			total += k.length + chunk.length;
		}
	}
	for (const k of keys) localStorage.removeItem(k);
	return total;
}

/** Characters already stored, so the allowance counts what the origin holds besides the fill. */
function chatProbeUsed() {
	let n = 0;
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		n += k.length + (localStorage.getItem(k) || '').length;
	}
	return n;
}

// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeChatStorageProbe() {
	const steps = [];
	const step = (name, pass, detail = '') => steps.push({ name, pass: !!pass, detail });
	const active = await chatProbeUntil(() => JSON.parse(localStorage.getItem('lattice-studio-active') || 'null')?.deckId, 150000);
	step('the Studio booted and named its open deck', active, active || 'no lattice-studio-active after 150 s');
	if (active) {
		localStorage.setItem(CHAT_PREFIX + active, JSON.stringify(THREAD));
		localStorage.setItem(CHAT_PREFIX + NEVER_OPENED, JSON.stringify(OTHER));
		step('planted two threads the way an earlier build saved them', chatProbeLegacyKeys().length >= 2, chatProbeLegacyKeys().join(', '));
	}
	const failed = steps.filter((s) => !s.pass);
	return { ok: failed.length === 0, error: failed.map((s) => s.name).join('; ') || undefined, steps, seed: { deckId: active }, ua: navigator.userAgent, width: innerWidth };
}

// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeChatStorageAfterReload(seed) {
	const steps = [];
	const step = (name, pass, detail = '') => steps.push({ name, pass: !!pass, detail });
	const deckId = seed?.deckId;
	// The move runs once the page is idle (storage-notices.ts, about 10 s at most after boot); a minute is the deadline.
	const gone = await chatProbeUntil(() => chatProbeLegacyKeys().length === 0, 60000);
	step('after the reload, the idle migration empties localStorage of chat threads', gone, gone ? '' : `left: ${chatProbeLegacyKeys().join(', ')}`);
	const open = await chatProbeStored(deckId);
	const want = THREAD.map((m) => m.content);
	step("the open deck's thread is in IndexedDB, whole and in order", JSON.stringify(open) === JSON.stringify(want), JSON.stringify(open));
	const other = await chatProbeStored(NEVER_OPENED);
	step('a deck never opened here moved too', JSON.stringify(other) === JSON.stringify(OTHER.map((m) => m.content)), JSON.stringify(other));
	// The allowance, measured last. local-quota.ts: 5,242,272 for Latin-1; half once a value is non-Latin-1.
	const used = chatProbeUsed();
	const narrow = chatProbeAllowance('a') + used;
	const wide = chatProbeAllowance('—') + used;
	const NARROW = 5242272;
	step('localStorage holds about 5.24 M characters of Latin-1 text (local-quota.ts LOCAL_ALLOWANCE)', Math.abs(narrow - NARROW) / NARROW < 0.03, `${narrow} measured`);
	step('and about half that once the text is non-Latin-1 (WebKit counts it twice)', Math.abs(wide / narrow - 0.5) < 0.03, `${wide} measured, ratio ${(wide / narrow).toFixed(3)}`);
	step('the fill was removed', !Object.keys(localStorage).some((k) => k.startsWith('ios-probe-fill-')));
	const failed = steps.filter((s) => !s.pass);
	return { ok: failed.length === 0, error: failed.map((s) => s.name).join('; ') || undefined, steps, ua: navigator.userAgent, width: innerWidth };
}
