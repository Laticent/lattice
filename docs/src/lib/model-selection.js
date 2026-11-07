// THE STUDIO'S MODEL SELECTION — one chat record and one voice record, nothing else.
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
// engineering/decisions/2026-11-07-studio-model-spine.md

export const CHAT_SELECTION_KEY = 'lattice-studio-chat-selection';
export const VOICE_SELECTION_KEY = 'lattice-studio-voice-selection';
const VERSION = 1;

/** Chat providers. Cloud: OpenRouter and the direct-key providers. Device: the on-device tiers. */
export const CHAT_CLOUD_PROVIDERS = Object.freeze(['openrouter', 'openai', 'gemini', 'anthropic']);
export const CHAT_DEVICE_PROVIDERS = Object.freeze(['webllm', 'universal', 'prompt-api']);
/** Voice providers. OpenAI voice is out of scope (followups.d). */
export const VOICE_CLOUD_PROVIDERS = Object.freeze(['openrouter', 'gemini']);
export const VOICE_DEVICE_PROVIDERS = Object.freeze(['kokoro']);

export const DEFAULT_CHAT = Object.freeze({ v: VERSION, source: 'cloud', provider: 'openrouter', model: '', last: {} });
export const DEFAULT_VOICE = Object.freeze({ v: VERSION, source: 'cloud', provider: 'openrouter', model: '', voice: '', last: {} });

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
function readLS(k) {
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
	} catch {
		/* storage refused: the in-memory copy above holds for this page */
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

/** Validate a chat record; null when it is not one. */
export function normalizeChat(raw) {
	if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
	const all = [...CHAT_CLOUD_PROVIDERS, ...CHAT_DEVICE_PROVIDERS];
	if (!all.includes(raw.provider)) return null;
	const last = {};
	if (raw.last && typeof raw.last === 'object') for (const p of CHAT_CLOUD_PROVIDERS) if (str(raw.last[p])) last[p] = raw.last[p];
	return { v: VERSION, source: sourceOf(raw.provider, CHAT_DEVICE_PROVIDERS), provider: raw.provider, model: str(raw.model), last };
}

/** Validate a voice record; null when it is not one. */
export function normalizeVoice(raw) {
	if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
	const all = [...VOICE_CLOUD_PROVIDERS, ...VOICE_DEVICE_PROVIDERS];
	if (!all.includes(raw.provider)) return null;
	const last = {};
	if (raw.last && typeof raw.last === 'object') {
		for (const p of all) {
			const l = raw.last[p];
			if (l && typeof l === 'object' && (str(l.model) || str(l.voice))) last[p] = { model: str(l.model), voice: str(l.voice) };
		}
	}
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

/** Fold the legacy chat keys into a chat record. The on-device pick was never stored (memory only), so it has nothing to migrate. */
function migrateChat() {
	const p = readLS(LEGACY.provider);
	const provider = CHAT_CLOUD_PROVIDERS.includes(p) ? p : 'openrouter';
	const last = {};
	const or = readLS(LEGACY.orModel);
	if (or) last.openrouter = or;
	for (const d of CHAT_CLOUD_PROVIDERS) {
		if (d === 'openrouter') continue;
		const m = readLS(LEGACY.directModel(d));
		if (m) last[d] = m;
	}
	const rec = { v: VERSION, source: 'cloud', provider, model: last[provider] || '', last };
	writeLS(CHAT_SELECTION_KEY, JSON.stringify(rec));
	writeLS(LEGACY.provider, null);
	writeLS(LEGACY.orModel, null);
	for (const d of CHAT_CLOUD_PROVIDERS) if (d !== 'openrouter') writeLS(LEGACY.directModel(d), null);
	return rec;
}

/**
 * Fold the legacy voice keys into a voice record. The old engine was implicit (a ladder), so the
 * migration keeps what the author could SEE they chose: a stored cloud model means cloud; a stored
 * rung of 'kokoro' (never written in production, honored anyway) means on-device; otherwise the
 * cloud default. Both remembered voices carry over in `last`.
 */
function migrateVoice() {
	const rung = readLS(LEGACY.voiceRung);
	const orModel = readLS(LEGACY.voiceOrModel) || '';
	const orVoice = readLS(LEGACY.voiceOr) || '';
	const kVoice = readLS(LEGACY.voiceKokoro) || '';
	const last = {};
	if (orModel || orVoice) last.openrouter = { model: orModel, voice: orVoice };
	if (kVoice) last.kokoro = { model: '', voice: kVoice };
	const device = rung === 'kokoro';
	const rec = device
		? { v: VERSION, source: 'device', provider: 'kokoro', model: '', voice: kVoice, last }
		: { v: VERSION, source: 'cloud', provider: 'openrouter', model: orModel, voice: orVoice, last };
	writeLS(VOICE_SELECTION_KEY, JSON.stringify(rec));
	for (const k of [LEGACY.voiceRung, LEGACY.voiceOrModel, LEGACY.voiceOr, LEGACY.voiceKokoro]) writeLS(k, null);
	return rec;
}

// ── Reads (synchronous) ───────────────────────────────────────────────────────────────────

/** The chat selection. Migrates the legacy keys on the first read; never null. */
export function readChatSelection() {
	return parse(CHAT_SELECTION_KEY, normalizeChat) ?? normalizeChat(migrateChat()) ?? { ...DEFAULT_CHAT, last: {} };
}

/** The voice selection. Migrates the legacy keys on the first read; never null. */
export function readVoiceSelection() {
	return parse(VOICE_SELECTION_KEY, normalizeVoice) ?? normalizeVoice(migrateVoice()) ?? { ...DEFAULT_VOICE, last: {} };
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
	watching = false;
	memory.clear();
}
