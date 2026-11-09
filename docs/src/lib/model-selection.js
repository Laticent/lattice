// THE STUDIO'S MODEL SELECTION — a chat record, an image-reader record and a voice record.
//
// Before this module the Studio had no stored choice: chat and voice each picked whoever
// answered from a readiness ladder on every call, so the speaker depended on timing (a key
// still unsealing, Kokoro loaded or not, an in-memory on-device pick lost on reload). Now:
//
//   chat:  { v:1, source:'cloud'|'device', provider, model, last:{[provider]:model} }
//   voice: { v:1, source:'cloud'|'device', provider, model, voice, last:{[provider]:{model,voice}} }
//
// - EXACTLY ONE of each, in localStorage, read SYNCHRONOUSLY so the UI paints its final state
//   on the first frame. `model: ''` means "the provider's curated default".
// - Only a selection writes a record (the user picking, or saving a key per owner decision 3).
//   Readiness never writes it: a selection that is not ready reads warming / needs-key /
//   unavailable, and nothing substitutes another backend or provider.
// - `last` remembers the user's last pick per provider, so switching back restores it. It
//   replaces the old per-provider `lattice-db-${p}-model` keys.
// - A one-time, idempotent migration folds the legacy keys into the records and removes them.
// - Every write announces `db-model-changed` (chat) / `db-voice-changed` (voice); another tab's
//   write arrives as a `storage` event, which `watchSelectionStorage` turns into the same events.
//
// - A record can be NOT SET (`source: 'none'`, `provider: ''`): nothing chosen yet. Only
//   `fillUnset` (a connection exists) and the author's pick move it to set, and a set record never
//   goes back (engineering/decisions/2026-11-08-studio-ai-routes-ux.md §2 rule 1).
// - The image reader (`lattice-studio-image-selection`) is `{ mode: 'same' }` (follow the chat
//   model, the default) or `{ mode: 'own', provider, model }`.
//
// engineering/decisions/2026-11-07-studio-model-spine.md, 2026-11-08-studio-ai-routes-ux.md

import { providerKeyState } from './openrouter-key.js';

export const CHAT_SELECTION_KEY = 'lattice-studio-chat-selection';
export const VOICE_SELECTION_KEY = 'lattice-studio-voice-selection';
export const IMAGE_SELECTION_KEY = 'lattice-studio-image-selection';
const VERSION = 1;

/** Chat providers. Cloud: OpenRouter and the direct-key providers. Device: the on-device tiers. */
export const CHAT_CLOUD_PROVIDERS = Object.freeze(['openrouter', 'openai', 'gemini', 'anthropic']);
export const CHAT_DEVICE_PROVIDERS = Object.freeze(['webllm', 'universal', 'prompt-api']);
/** Voice providers. OpenAI voice is out of scope (followups.d). */
export const VOICE_CLOUD_PROVIDERS = Object.freeze(['openrouter', 'gemini']);
export const VOICE_DEVICE_PROVIDERS = Object.freeze(['kokoro']);

/** Image-reader providers: the cloud routes (every frontier chat model there reads images). */
export const IMAGE_PROVIDERS = Object.freeze(['openrouter', 'gemini', 'anthropic', 'openai']);

/** Not set: nothing chosen yet. What a record with nothing to migrate is. */
export const UNSET_CHAT = Object.freeze({ v: VERSION, source: 'none', provider: '', model: '', last: {} });
export const UNSET_VOICE = Object.freeze({ v: VERSION, source: 'none', provider: '', model: '', voice: '', last: {} });
export const DEFAULT_IMAGE = Object.freeze({ v: VERSION, mode: 'same', provider: '', model: '', last: {} });
// Kept for callers that name them: an unreadable record reads as Not set.
export const DEFAULT_CHAT = UNSET_CHAT;
export const DEFAULT_VOICE = UNSET_VOICE;

/** The order connections fill a Not-set selection in (rule 1): OpenRouter, then the direct keys. */
export const FILL_ORDER = Object.freeze(['openrouter', 'gemini', 'anthropic', 'openai']);

const SETTINGS_LS = 'lattice-studio-settings';
const OLD_DEFAULT_IMAGE_MODEL = '~anthropic/claude-sonnet-latest';

// Legacy keys, read once by the migration and then removed.
const LEGACY = {
	provider: 'lattice-db-provider',
	orModel: 'lattice-db-or-model',
	directModel: (p) => `lattice-db-${p}-model`,
	voiceRung: 'lattice-studio-voice-rung',
	voiceOrModel: 'lattice-studio-voice-or-model',
	voiceOr: 'lattice-studio-voice-or',
	voiceKokoro: 'lattice-studio-voice-kokoro',
};

const hasWindow = typeof window !== 'undefined';

// Where localStorage is missing or refuses (Node, a locked-down profile), the records live in
// memory for this page, so a selection still holds for the session.
const memory = new Map();
function storage() {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}
// Writes the browser REFUSED (storage full, or blocked mid-page). They win over what storage
// still holds, so a pick made while storage is full takes effect on this page instead of the
// old record silently answering every read.
const refused = new Map();
function readLS(k) {
	if (refused.has(k)) return refused.get(k);
	const ls = storage();
	if (!ls) return memory.get(k) ?? null;
	try {
		return ls.getItem(k);
	} catch {
		return memory.get(k) ?? null;
	}
}
function writeLS(k, v) {
	const ls = storage();
	if (v == null) memory.delete(k);
	else memory.set(k, v);
	if (!ls) return;
	try {
		if (v == null) ls.removeItem(k);
		else ls.setItem(k, v);
		refused.delete(k);
	} catch {
		// Storage refused: the copy above holds for this page, and reads prefer it.
		refused.set(k, v ?? null);
	}
}
function emit(name) {
	if (!hasWindow) return;
	try {
		window.dispatchEvent(new Event(name));
	} catch {
		/* no event support */
	}
}

const str = (v) => (typeof v === 'string' ? v : '');
const sourceOf = (provider, device) => (device.includes(provider) ? 'device' : 'cloud');
// Whether a provider holds a key, asked of lib/openrouter-key.js (the one module that names the
// key slots): 'none' = no key; 'opening' = stored, not open yet; 'ready'; 'rejected'.
const hasKey = (p) => providerKeyState(p) !== 'none';

/** Can this browser run the on-device voice? The same rule as voice-model.js `kokoroSupported`: not a coarse (touch-first) pointer. */
export function canRunKokoro() {
	return !(typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
}

/** Is this selection record set (picked or filled), as opposed to Not set? */
export const isSet = (rec) => !!rec && rec.source !== 'none' && !!rec.provider;

/** Validate a chat record; null when it is not one. */
export function normalizeChat(raw) {
	if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
	const last = {};
	if (raw.last && typeof raw.last === 'object') for (const p of CHAT_CLOUD_PROVIDERS) if (str(raw.last[p])) last[p] = raw.last[p];
	if (raw.source === 'none') return { ...UNSET_CHAT, last };
	const all = [...CHAT_CLOUD_PROVIDERS, ...CHAT_DEVICE_PROVIDERS];
	if (!all.includes(raw.provider)) return null;
	return { v: VERSION, source: sourceOf(raw.provider, CHAT_DEVICE_PROVIDERS), provider: raw.provider, model: str(raw.model), last };
}

/** Validate an image-reader record; null when it is not one. */
export function normalizeImage(raw) {
	if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
	const last = {};
	if (raw.last && typeof raw.last === 'object') for (const p of IMAGE_PROVIDERS) if (str(raw.last[p])) last[p] = raw.last[p];
	if (raw.mode !== 'own') return { ...DEFAULT_IMAGE, last };
	if (!IMAGE_PROVIDERS.includes(raw.provider)) return null;
	return { v: VERSION, mode: 'own', provider: raw.provider, model: str(raw.model), last };
}

/** Validate a voice record; null when it is not one. */
export function normalizeVoice(raw) {
	if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
	const all = [...VOICE_CLOUD_PROVIDERS, ...VOICE_DEVICE_PROVIDERS];
	const last = {};
	if (raw.last && typeof raw.last === 'object') {
		for (const p of all) {
			const l = raw.last[p];
			if (l && typeof l === 'object' && (str(l.model) || str(l.voice))) last[p] = { model: str(l.model), voice: str(l.voice) };
		}
	}
	if (raw.source === 'none') return { ...UNSET_VOICE, last };
	if (!all.includes(raw.provider)) return null;
	return { v: VERSION, source: sourceOf(raw.provider, VOICE_DEVICE_PROVIDERS), provider: raw.provider, model: str(raw.model), voice: str(raw.voice), last };
}

function parse(key, normalize) {
	const raw = readLS(key);
	if (!raw) return null;
	try {
		return normalize(JSON.parse(raw));
	} catch {
		return null;
	}
}

// ── Migration (one-time, idempotent) ──────────────────────────────────────────────────────

/**
 * Fold the legacy chat keys into a chat record, reproducing what `main` ran
 * (2026-11-08-studio-ai-routes-ux.md §4.1):
 *   - a legacy provider, or an OpenRouter model pick → SET on that provider, key or not (a key
 *     that is gone reads "Needs its connection": what the author chose, never another);
 *   - no pick but an OpenRouter key → SET to OpenRouter's default (what `main` answered with);
 *   - no key and no pick → NOT SET (on `main` nothing could answer either).
 * The on-device pick was never stored (memory only), so it has nothing to migrate.
 */
function migrateChat() {
	const p = readLS(LEGACY.provider);
	const last = {};
	const or = readLS(LEGACY.orModel);
	if (or) last.openrouter = or;
	for (const d of CHAT_CLOUD_PROVIDERS) {
		if (d === 'openrouter') continue;
		const m = readLS(LEGACY.directModel(d));
		if (m) last[d] = m;
	}
	const provider = CHAT_CLOUD_PROVIDERS.includes(p) ? p : or || hasKey('openrouter') ? 'openrouter' : '';
	const rec = provider ? { v: VERSION, source: 'cloud', provider, model: last[provider] || '', last } : { ...UNSET_CHAT, last };
	writeLS(CHAT_SELECTION_KEY, JSON.stringify(rec));
	writeLS(LEGACY.provider, null);
	writeLS(LEGACY.orModel, null);
	for (const d of CHAT_CLOUD_PROVIDERS) if (d !== 'openrouter') writeLS(LEGACY.directModel(d), null);
	return rec;
}

/**
 * Fold the legacy voice keys into a voice record, reproducing `main`'s ladder (`pickRung`):
 *   - a stored cloud model or voice pick → SET on OpenRouter; a stored rung of 'kokoro' → Kokoro;
 *   - no pick, on a desktop that can run Kokoro → SET to Kokoro on this device (free; `main`
 *     preferred it with or without a key, its first read starting the download);
 *   - no pick, elsewhere, with an OpenRouter key → SET to OpenRouter's default voice;
 *   - no pick, elsewhere, no key → NOT SET (captions on `main` too).
 * "Can run Kokoro" is synchronous, so the card never shows Not set and then flips.
 */
function migrateVoice() {
	const rung = readLS(LEGACY.voiceRung);
	const orModel = readLS(LEGACY.voiceOrModel) || '';
	const orVoice = readLS(LEGACY.voiceOr) || '';
	const kVoice = readLS(LEGACY.voiceKokoro) || '';
	const last = {};
	if (orModel || orVoice) last.openrouter = { model: orModel, voice: orVoice };
	if (kVoice) last.kokoro = { model: '', voice: kVoice };
	const kokoro = { v: VERSION, source: 'device', provider: 'kokoro', model: '', voice: kVoice, last };
	const openrouter = { v: VERSION, source: 'cloud', provider: 'openrouter', model: orModel, voice: orVoice, last };
	const rec = rung === 'kokoro' ? kokoro : orModel || orVoice || rung === 'openrouter' ? openrouter : canRunKokoro() ? kokoro : hasKey('openrouter') ? openrouter : { ...UNSET_VOICE, last };
	writeLS(VOICE_SELECTION_KEY, JSON.stringify(rec));
	for (const k of [LEGACY.voiceRung, LEGACY.voiceOrModel, LEGACY.voiceOr, LEGACY.voiceKokoro]) writeLS(k, null);
	return rec;
}

/** The image reader from the old `settings.imageModel`: a pick other than the old default becomes its own reader on OpenRouter; otherwise same as chat. */
function migrateImage() {
	let picked = '';
	try {
		picked = str(JSON.parse(readLS(SETTINGS_LS) || '{}')?.imageModel);
	} catch {
		picked = '';
	}
	const rec = picked && picked !== OLD_DEFAULT_IMAGE_MODEL ? { v: VERSION, mode: 'own', provider: 'openrouter', model: picked, last: { openrouter: picked } } : { ...DEFAULT_IMAGE, last: {} };
	writeLS(IMAGE_SELECTION_KEY, JSON.stringify(rec));
	return rec;
}

// ── Reads (synchronous) ───────────────────────────────────────────────────────────────────

/** The chat selection. Migrates the legacy keys on the first read; never null. */
export function readChatSelection() {
	// A record that exists is never re-migrated or overwritten, even one this build cannot read
	// (a newer version written by a newer tab, a provider this build does not know): it reads as
	// the default here and stays in storage untouched.
	if (readLS(CHAT_SELECTION_KEY)) return parse(CHAT_SELECTION_KEY, normalizeChat) ?? { ...UNSET_CHAT, last: {} };
	return normalizeChat(migrateChat()) ?? { ...UNSET_CHAT, last: {} };
}

/** The voice selection. Migrates the legacy keys on the first read; never null. */
export function readVoiceSelection() {
	// As for chat: an existing record, readable or not, is never re-migrated or overwritten.
	if (readLS(VOICE_SELECTION_KEY)) return parse(VOICE_SELECTION_KEY, normalizeVoice) ?? { ...UNSET_VOICE, last: {} };
	return normalizeVoice(migrateVoice()) ?? { ...UNSET_VOICE, last: {} };
}

/** The image-reader selection: same as chat (the default) or its own. Migrates once from `settings.imageModel`; never null. */
export function readImageSelection() {
	if (readLS(IMAGE_SELECTION_KEY)) return parse(IMAGE_SELECTION_KEY, normalizeImage) ?? { ...DEFAULT_IMAGE, last: {} };
	return normalizeImage(migrateImage()) ?? { ...DEFAULT_IMAGE, last: {} };
}

/** The model id this chat provider would run: the selection's when it is the selected provider, else the user's last pick ('' = curated default). */
export function chatModelFor(provider) {
	const s = readChatSelection();
	return s.provider === provider ? s.model : s.last[provider] || '';
}

// ── Writes ────────────────────────────────────────────────────────────────────────────────

/**
 * Select a chat model. It is active immediately: there is no "selected but not active" state.
 * `model` omitted = the user's last pick for that provider, else its curated default.
 * Returns the record written.
 * @param {{ provider: string, model?: string }} pick
 */
export function selectChat({ provider, model }) {
	const cur = readChatSelection();
	const isCloud = CHAT_CLOUD_PROVIDERS.includes(provider);
	if (!isCloud && !CHAT_DEVICE_PROVIDERS.includes(provider)) throw new Error(`unknown chat provider ${provider}`);
	const id = isCloud ? (model ?? cur.last[provider] ?? '') : '';
	const last = { ...cur.last };
	// Remember the model being LEFT too, so coming back to that provider finds it. Every write
	// here and the migration already record it; this covers a record written by hand (a test
	// fixture, a future writer) with a model but no memory of it. It never overwrites a memory.
	if (cur.source === 'cloud' && cur.model && !last[cur.provider]) last[cur.provider] = cur.model;
	if (isCloud && id) last[provider] = id;
	const rec = { v: VERSION, source: isCloud ? 'cloud' : 'device', provider, model: id, last };
	writeLS(CHAT_SELECTION_KEY, JSON.stringify(rec));
	emit('db-model-changed');
	return rec;
}

/**
 * Select a voice. Active immediately. `model`/`voice` omitted = the last pick for that provider, else its default.
 * @param {{ provider: string, model?: string, voice?: string }} pick
 */
export function selectVoice({ provider, model, voice }) {
	const cur = readVoiceSelection();
	const isCloud = VOICE_CLOUD_PROVIDERS.includes(provider);
	if (!isCloud && !VOICE_DEVICE_PROVIDERS.includes(provider)) throw new Error(`unknown voice provider ${provider}`);
	const prev = cur.last[provider] ?? { model: '', voice: '' };
	const sameModel = model === undefined || model === prev.model;
	const m = model ?? prev.model ?? '';
	// A new model invalidates the old voice id (rosters are per model) unless a voice is named.
	const v = voice ?? (sameModel ? prev.voice : '') ?? '';
	const last = { ...cur.last, [provider]: { model: m, voice: v } };
	const rec = { v: VERSION, source: isCloud ? 'cloud' : 'device', provider, model: m, voice: v, last };
	writeLS(VOICE_SELECTION_KEY, JSON.stringify(rec));
	emit('db-voice-changed');
	return rec;
}

/**
 * Select the image reader: `{ mode: 'same' }` (follow the chat model) or `{ mode: 'own', provider,
 * model }`. Active at once.
 * @param {{ mode: 'same' } | { mode: 'own', provider: string, model?: string }} pick
 */
export function selectImage(pick) {
	const cur = readImageSelection();
	if (pick.mode !== 'own') {
		const rec = { ...DEFAULT_IMAGE, last: cur.last };
		writeLS(IMAGE_SELECTION_KEY, JSON.stringify(rec));
		emit('db-model-changed');
		return rec;
	}
	if (!IMAGE_PROVIDERS.includes(pick.provider)) throw new Error(`unknown image provider ${pick.provider}`);
	const model = pick.model ?? cur.last[pick.provider] ?? '';
	const last = model ? { ...cur.last, [pick.provider]: model } : { ...cur.last };
	const rec = { v: VERSION, mode: 'own', provider: pick.provider, model, last };
	writeLS(IMAGE_SELECTION_KEY, JSON.stringify(rec));
	emit('db-model-changed');
	return rec;
}

// ── Fill (rule 1: the Studio's only change to a selection besides version healing) ───────

/**
 * Fill every NOT SET selection a connection can serve, and say what was filled. Called when a
 * connection is added and once at startup, so the order of events never matters. A set
 * selection is never touched. Chat fills from the first connected cloud provider in
 * FILL_ORDER; voice fills with Kokoro on this device when the browser can run it (the owner's
 * one on-device fill, keeping voice free on desktop), else from the first connected provider
 * that speaks. On-device chat never fills. The image reader is "same as chat" by default, so
 * it follows whatever chat is filled with and is never filled itself.
 * @param {{ connected: string[], kokoro?: boolean }} env cloud providers holding a key, and whether Kokoro can run here
 * @returns {{ kind: 'chat' | 'voice', provider: string }[]} what was filled, for the notice
 */
export function fillUnset({ connected, kokoro = canRunKokoro() }) {
	const filled = [];
	const has = (p) => connected.includes(p);
	if (!isSet(readChatSelection())) {
		const p = FILL_ORDER.find(has);
		if (p) {
			selectChat({ provider: p });
			filled.push({ kind: 'chat', provider: p });
		}
	}
	if (!isSet(readVoiceSelection())) {
		const p = kokoro ? 'kokoro' : FILL_ORDER.find((q) => VOICE_CLOUD_PROVIDERS.includes(q) && has(q));
		if (p) {
			selectVoice({ provider: p });
			filled.push({ kind: 'voice', provider: p });
		}
	}
	return filled;
}

/** The cloud providers holding a key that has not been rejected, in FILL_ORDER (from storage alone: no key is opened). */
export function connectedProviders() {
	return FILL_ORDER.filter((p) => {
		const k = providerKeyState(p);
		return k !== 'none' && k !== 'rejected';
	});
}

/** The event that announces a fill, with what was filled: the Studio shell turns it into one notice. */
export const SELECTION_FILLED_EVENT = 'lattice:selection-filled';

/**
 * Run the fill from what is stored, and announce it. The Studio calls this at startup and after
 * any connection is added (a key saved, OpenRouter signed in), so the order of events never
 * changes the outcome. Returns what was filled.
 */
export function fillFromConnections() {
	const filled = fillUnset({ connected: connectedProviders() });
	if (filled.length && hasWindow) {
		try {
			window.dispatchEvent(new CustomEvent(SELECTION_FILLED_EVENT, { detail: filled }));
		} catch {
			/* no event support */
		}
	}
	return filled;
}

/**
 * NORMALIZE a stored voice id against the live roster: the one write that is not a pick.
 * Like the migration, it corrects what is stored (a voice id the provider renamed or dropped)
 * so storage, the UI and synthesis agree, and it never changes WHICH provider or model is
 * selected. It rewrites `voice` wherever it is stored for `provider` + `model` (the selection
 * itself and the per-provider memory). Returns true when it changed anything.
 * @param {{ provider: string, model: string, from: string, to: string }} fix
 */
export function normalizeStoredVoice({ provider, model, from, to }) {
	if (!to || from === to) return false;
	const cur = readVoiceSelection();
	let changed = false;
	const rec = { ...cur, last: { ...cur.last } };
	if (cur.provider === provider && cur.model === model && cur.voice === from) {
		rec.voice = to;
		changed = true;
	}
	const l = cur.last[provider];
	if (l && l.model === model && l.voice === from) {
		rec.last[provider] = { ...l, voice: to };
		changed = true;
	}
	if (!changed) return false;
	writeLS(VOICE_SELECTION_KEY, JSON.stringify(rec));
	emit('db-voice-changed');
	return true;
}

// ── Cross-tab sync ────────────────────────────────────────────────────────────────────────

/**
 * Is a `storage` event about the chat or voice selection?
 * @param {{ key: string | null } | null | undefined} event
 */
export function selectionEventKind(event) {
	// A null key = another tab cleared storage: both records may have changed.
	if (event?.key === null) return 'both';
	if (event?.key === CHAT_SELECTION_KEY) return 'chat';
	if (event?.key === VOICE_SELECTION_KEY) return 'voice';
	if (event?.key === IMAGE_SELECTION_KEY) return 'chat';
	return null;
}

let watching = false;
/**
 * Re-announce another tab's selection change in this tab, so its UI and its next call agree
 * (the records are re-read on every call; this keeps the DISPLAY in step). Idempotent.
 */
export function watchSelectionStorage() {
	if (!hasWindow || watching) return;
	watching = true;
	window.addEventListener('storage', (e) => {
		const kind = selectionEventKind(e);
		if (kind === 'chat' || kind === 'both') emit('db-model-changed');
		if (kind === 'voice' || kind === 'both') emit('db-voice-changed');
	});
}

/** Test seam: forget the storage watch and the in-memory copy. */
export function __resetSelectionForTests() {
	refused.clear();
	watching = false;
	memory.clear();
}
