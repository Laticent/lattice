import { DECKS, deckSource, type StudioDeck } from './decks';
import { stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';
import { DEFAULT_LANGUAGE, detectLanguage } from './studio-language';

// Studio persistence — localStorage-backed, Studio-scoped (lattice-studio-*).
// Three concerns, kept independent so a corrupt value in one never breaks the
// others (every read is try/caught and falls back):
//   1. The deck INDEX — which decks exist, their titles + order (seeded from the
//      built-in DECKS, then user-mutable: new / rename / delete).
//   2. Per-deck edited SOURCE — your edits, so switching decks and coming back
//      restores what you wrote (the gap this closes).
//   3. SETTINGS — the Workspace/Inspector toggles that should survive a reload.

const INDEX_LS = 'lattice-studio-deck-index'; // [{id,title,builtin}]
const SRC_PREFIX = 'lattice-studio-src-'; // + deckId → edited source
const SETTINGS_LS = 'lattice-studio-settings'; // { validation, pageNumbers, headerFooter, language }
const INSTRUCTIONS_LS = 'lattice-studio-instructions'; // standing instructions (free text)

function read<T>(key: string): T | null {
	try {
		const v = localStorage.getItem(key);
		return v ? (JSON.parse(v) as T) : null;
	} catch {
		return null;
	}
}
function write(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* storage full / unavailable — non-fatal */
	}
}

/** Derive a deck title from its source — the first heading, else a fallback. */
export function titleFromSource(source: string, fallback = 'Imported deck'): string {
	const m = stripFrontMatter(source).match(/^#{1,3}\s+(.+?)\s*$/m);
	return (m?.[1] ?? '').replace(/[`*_]/g, '').trim().slice(0, 60) || fallback;
}

/** `N slides` for the deck-switcher meta line — the SAME splitter the live rail
 *  uses (splitSlides), front-matter excluded, so the count never disagrees with
 *  the rendered rail. */
export function metaFor(source: string): string {
	const n = splitSlides(stripFrontMatter(source)).length || 1;
	return `${n} slide${n === 1 ? '' : 's'}`;
}

export type IndexEntry = { id: string; title: string; builtin: boolean };

// One-time flag: have we offered the welcome deck to a pre-existing user whose
// saved index predates it? Set once the migration runs, so a user who then
// deletes the welcome deck doesn't get it re-added on every load.
const WELCOME_MIGRATED_LS = 'lattice-studio-welcome-migrated';

/** The persisted deck index, seeded from the built-ins on first run. */
function loadIndex(): IndexEntry[] {
	const saved = read<IndexEntry[]>(INDEX_LS);
	if (saved?.length) return migrateWelcome(saved);
	return DECKS.map((d) => ({ id: d.id, title: d.title, builtin: true }));
}

// Surface the welcome deck to returning users ONCE: a saved index created before
// the welcome deck existed never lists it. Append it (don't prepend — that would
// hijack the active deck, which is index[0], on their next load) and persist, then
// set the flag so it's a one-time offer. Built-in source comes from DECKS, so a
// stale title can't drift in.
function migrateWelcome(saved: IndexEntry[]): IndexEntry[] {
	try {
		if (localStorage.getItem(WELCOME_MIGRATED_LS)) return saved;
		localStorage.setItem(WELCOME_MIGRATED_LS, '1');
		const welcome = DECKS.find((d) => d.id === 'welcome');
		if (!welcome || saved.some((e) => e.id === welcome.id)) return saved;
		const migrated = [...saved, { id: welcome.id, title: welcome.title, builtin: true }];
		saveIndex(migrated);
		return migrated;
	} catch {
		return saved;
	}
}
function saveIndex(index: IndexEntry[]): void {
	write(INDEX_LS, index);
}

/**
 * Has this browser used the Studio before? True if a deck index was ever saved
 * (new/rename/delete) or any deck source was edited. Used to treat pre-existing
 * users as already-onboarded, so the first-run welcome shows only to true
 * newcomers (the `onboarded` flag predates none of their prior activity).
 */
export function hasPriorStudioUse(): boolean {
	try {
		if (localStorage.getItem(INDEX_LS)) return true;
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k?.startsWith(SRC_PREFIX)) return true;
		}
	} catch {
		/* storage unavailable — treat as a fresh visitor */
	}
	return false;
}

/** Edited source for a deck, or null if it has never been edited. */
export function loadSource(id: string): string | null {
	return read<string>(SRC_PREFIX + id);
}
/** Persist a deck's edited source. */
export function saveSource(id: string, source: string): void {
	write(SRC_PREFIX + id, source);
}
function dropSource(id: string): void {
	try {
		localStorage.removeItem(SRC_PREFIX + id);
	} catch {
		/* non-fatal */
	}
}

// The canonical (unedited) source for a deck. Built-ins come from DECKS; a
// user-created deck stores its starter slides in the index-paired template.
const NEW_DECK_TEMPLATE = '<!-- _class: title -->\n\n# Untitled deck\n\n`Draft`\n\nStart typing to build your deck.';
function canonicalSource(entry: IndexEntry): string {
	const builtin = DECKS.find((d) => d.id === entry.id);
	return builtin ? deckSource(builtin) : NEW_DECK_TEMPLATE;
}

/**
 * Resolve the full deck list with each deck's CURRENT source (edited override,
 * else canonical). This is what the shell renders + switches between.
 */
export function loadDeckList(): StudioDeck[] {
	return loadIndex().map((e) => {
		const source = loadSource(e.id) ?? canonicalSource(e);
		return { id: e.id, title: e.title, meta: metaFor(source), slides: splitSlides(stripFrontMatter(source)) };
	});
}

/**
 * Create + persist a new deck. With `source` given (a deck import) the deck is
 * seeded with that content; otherwise the blank starter. Returns the new deck.
 */
export function createDeck(title = 'Untitled deck', source?: string): StudioDeck {
	// Date.now is fine in app code (unlike workflow scripts). Add a short random
	// suffix so two creates in the same millisecond (double-click) can't collide.
	const id = `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
	const body = source?.trim() ? source : NEW_DECK_TEMPLATE;
	const index = loadIndex();
	index.push({ id, title, builtin: false });
	saveIndex(index);
	saveSource(id, body);
	return { id, title, meta: metaFor(body), slides: splitSlides(stripFrontMatter(body)) };
}

/** Rename a deck in the index. */
export function renameDeck(id: string, title: string): void {
	const t = title.trim();
	if (!t) return;
	saveIndex(loadIndex().map((e) => (e.id === id ? { ...e, title: t } : e)));
}

/** Remove a deck (index entry + its edited source). */
export function deleteDeck(id: string): void {
	saveIndex(loadIndex().filter((e) => e.id !== id));
	dropSource(id);
}

// ── Version history (checkpoints) ──────────────────────────────────────────
const SNAP_PREFIX = 'lattice-studio-snap-'; // + deckId → Checkpoint[]
const SNAP_CAP = 25; // keep the most recent N per deck

export type Checkpoint = { id: string; ts: number; label: string; source: string };

/** Checkpoints for a deck, newest first. */
export function loadCheckpoints(deckId: string): Checkpoint[] {
	return read<Checkpoint[]>(SNAP_PREFIX + deckId) ?? [];
}
/**
 * Save a checkpoint of `source` (skipping a no-op if it matches the latest), cap
 * the list, and return the updated list. `ts` is passed in so the store stays
 * free of Date.now (callers stamp it).
 */
export function saveCheckpoint(deckId: string, source: string, label: string, ts: number): Checkpoint[] {
	const list = loadCheckpoints(deckId);
	if (list[0]?.source === source) return list; // nothing changed since the last one
	const cp: Checkpoint = { id: `cp-${ts.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, ts, label, source };
	const next = [cp, ...list].slice(0, SNAP_CAP);
	write(SNAP_PREFIX + deckId, next);
	return next;
}

// ── Architect chat history (per deck) ──────────────────────────────────────
const CHAT_PREFIX = 'lattice-studio-chat-'; // + deckId → ChatMessage[]
const CHAT_CAP = 60;

export type ChatMessage = {
	role: 'user' | 'assistant';
	content: string;
	/** Assistant turn only: the full source it proposes (for review/apply). */
	proposed?: string;
	/** Whether that proposal has been applied. */
	applied?: boolean;
};

export function loadChat(deckId: string): ChatMessage[] {
	return read<ChatMessage[]>(CHAT_PREFIX + deckId) ?? [];
}
export function saveChat(deckId: string, messages: ChatMessage[]): void {
	write(CHAT_PREFIX + deckId, messages.slice(-CHAT_CAP));
}

// `language` is the BCP-47 output locale for AI deck content (see studio-language).
// `onboarded` flips true the first time a newcomer engages (dismisses the
// welcome, makes an edit, or opens a panel). It gates the reduced-density
// first-run shell: while false, the side panels start closed and a one-time
// welcome cue shows; once true, the Studio opens at full density as before.
// `handleStyle` — how the Fabricate finish designer draws its on-canvas placement
// handles (wash hotspot / mark / spotlight). 'knob' is the familiar slider-thumb (the
// default, most obviously grabbable); 'reticle' is a precise, see-through crosshair for
// designers. A workspace preference, so the whole team's Studio reads the same way.
export type HandleStyle = 'knob' | 'reticle';
// `pdfPages` — the page-image format Share → PDF embeds. 'png' (default) is
// pixel-lossless; 'jpeg' (q95) exports about twice as fast and several times
// smaller, at the price of JPEG's edge artifacts (visually clean, never
// mathematically lossless). A fidelity-vs-speed call that belongs to the USER,
// so it lives here as a workspace preference rather than a hardcoded default.
export type PdfPages = 'png' | 'jpeg';
export type StudioSettings = { validation: boolean; pageNumbers: boolean; headerFooter: boolean; language: string; onboarded: boolean; handleStyle: HandleStyle; pdfPages: PdfPages };
const DEFAULT_SETTINGS: StudioSettings = { validation: true, pageNumbers: true, headerFooter: false, language: DEFAULT_LANGUAGE, onboarded: false, handleStyle: 'knob', pdfPages: 'png' };

export function loadSettings(): StudioSettings {
	const saved = read<Partial<StudioSettings>>(SETTINGS_LS) ?? {};
	// Seed the language from the browser the FIRST time only (no saved value); the
	// user's explicit pick wins forever after. detectLanguage falls back to en-US.
	const language = saved.language ?? detectLanguage();
	return { ...DEFAULT_SETTINGS, ...saved, language };
}
// Notify same-tab listeners a setting changed (the native `storage` event only fires in
// OTHER tabs). The Fabricate designer listens so a handle-style switch in the Workspace
// sheet reflects live without a remount.
export const SETTINGS_EVENT = 'lattice:settings';
export function saveSettings(partial: Partial<StudioSettings>): void {
	write(SETTINGS_LS, { ...loadSettings(), ...partial });
	if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
}

// ── Workspace export / import (the backup feature's store half) ─────────────
// The knowledge of WHICH keys make up a Studio workspace stays in this module;
// workspace-backup.ts only packs/unpacks what these two functions hand it.
// Excluded on purpose: the OpenRouter key + PKCE verifier (secrets never enter
// a backup file that may be emailed or synced) and site-chrome palette prefs.

const LAST_BACKUP_LS = 'lattice-studio-last-backup'; // epoch ms of the last download
const BACKUP_NUDGE_LS = 'lattice-studio-backup-nudge-at'; // epoch ms of the last nudge shown

export type StudioExport = {
	index: IndexEntry[];
	/** EDITED sources only, by deck id — built-ins that were never touched
	 *  restore from their canonical source, so a backup can't pin stale copies. */
	sources: Record<string, string>;
	checkpoints: Record<string, Checkpoint[]>;
	chats: Record<string, ChatMessage[]>;
	settings: StudioSettings;
	instructions: string;
};

/** Snapshot everything user-authored in the Studio's localStorage. */
export function exportStudioState(): StudioExport {
	const index = loadIndex();
	const sources: Record<string, string> = {};
	const checkpoints: Record<string, Checkpoint[]> = {};
	const chats: Record<string, ChatMessage[]> = {};
	for (const e of index) {
		const src = loadSource(e.id);
		if (src != null) sources[e.id] = src;
		const cps = loadCheckpoints(e.id);
		if (cps.length) checkpoints[e.id] = cps;
		const chat = loadChat(e.id);
		if (chat.length) chats[e.id] = chat;
	}
	return { index, sources, checkpoints, chats, settings: loadSettings(), instructions: loadInstructions() };
}

export type ImportSummary = { added: number; restoredCopies: number; skipped: number };

/**
 * Merge a backup into the current workspace (never destructive):
 *   · a deck id we don't have → added as-is (source, checkpoints, chat ride along);
 *   · a deck id we DO have with the same source (or none) → skipped, but its
 *     checkpoints/chat fill in wherever ours are empty;
 *   · a deck id we have with a DIFFERENT source → imported as a NEW deck titled
 *     "<title> (restored)" so nothing on this device is overwritten.
 * Settings + instructions are restored from the backup (they're the user's own
 * values either way). `ts` is passed in so the store stays free of Date.now.
 */
export function importStudioState(data: StudioExport, ts: number): ImportSummary {
	const summary: ImportSummary = { added: 0, restoredCopies: 0, skipped: 0 };
	const index = loadIndex();
	const have = new Map(index.map((e) => [e.id, e]));
	let n = 0;
	for (const entry of data.index) {
		const incomingSrc = data.sources[entry.id];
		const existing = have.get(entry.id);
		if (!existing) {
			index.push(entry);
			if (incomingSrc != null) saveSource(entry.id, incomingSrc);
			if (data.checkpoints[entry.id]?.length) write(SNAP_PREFIX + entry.id, data.checkpoints[entry.id].slice(0, SNAP_CAP));
			if (data.chats[entry.id]?.length) saveChat(entry.id, data.chats[entry.id]);
			summary.added++;
			continue;
		}
		const currentSrc = loadSource(entry.id);
		if (incomingSrc == null || incomingSrc === currentSrc) {
			// Same deck — take the backup's history wherever ours is missing.
			if (data.checkpoints[entry.id]?.length && !loadCheckpoints(entry.id).length) write(SNAP_PREFIX + entry.id, data.checkpoints[entry.id].slice(0, SNAP_CAP));
			if (data.chats[entry.id]?.length && !loadChat(entry.id).length) saveChat(entry.id, data.chats[entry.id]);
			summary.skipped++;
			continue;
		}
		if (currentSrc == null) {
			// The id exists (a built-in seeded into every fresh index) but carries no
			// local edits — there is nothing to protect, so the backup's source
			// restores IN PLACE. This is the whole-point case: a fresh browser after
			// storage loss, where every built-in id is present but untouched.
			saveSource(entry.id, incomingSrc);
			if (data.checkpoints[entry.id]?.length && !loadCheckpoints(entry.id).length) write(SNAP_PREFIX + entry.id, data.checkpoints[entry.id].slice(0, SNAP_CAP));
			if (data.chats[entry.id]?.length && !loadChat(entry.id).length) saveChat(entry.id, data.chats[entry.id]);
			summary.added++;
			continue;
		}
		// Truly diverged (both sides carry edits) — restore beside, never over.
		const newId = `deck-${ts.toString(36)}-r${(n++).toString(36)}`;
		index.push({ id: newId, title: `${entry.title} (restored)`, builtin: false });
		saveSource(newId, incomingSrc);
		if (data.checkpoints[entry.id]?.length) write(SNAP_PREFIX + newId, data.checkpoints[entry.id].slice(0, SNAP_CAP));
		if (data.chats[entry.id]?.length) saveChat(newId, data.chats[entry.id]);
		summary.restoredCopies++;
	}
	saveIndex(index);
	saveSettings(data.settings);
	saveInstructions(data.instructions);
	return summary;
}

/** Epoch ms of the last backup download, or null if never. */
export function lastBackupAt(): number | null {
	const v = read<number>(LAST_BACKUP_LS);
	return typeof v === 'number' ? v : null;
}
export function markBackupTaken(ts: number): void {
	write(LAST_BACKUP_LS, ts);
}

/**
 * Should the once-in-a-while backup nudge show? Earned only: real unbacked-up
 * work exists (3+ decks carrying edits, no backup ever or older than 30 days)
 * and we haven't nudged in 14 days. Callers pass `now` (no Date.now here).
 */
export function shouldNudgeBackup(now: number): boolean {
	const edited = loadIndex().filter((e) => loadSource(e.id) != null).length;
	if (edited < 3) return false;
	const backedUp = lastBackupAt();
	if (backedUp != null && now - backedUp < 30 * 86_400_000) return false;
	const nudged = read<number>(BACKUP_NUDGE_LS);
	if (typeof nudged === 'number' && now - nudged < 14 * 86_400_000) return false;
	return true;
}
export function markBackupNudged(now: number): void {
	write(BACKUP_NUDGE_LS, now);
}

// Standing instructions — a free-text voice prefix the AI honors on every
// DECK-CONTENT call (kept beside language; both ride through architect's
// withStudioVoice). Empty by default, so an untouched field injects nothing.
// Stored as a RAW string (not JSON) — the format the Workspace drawer has always
// written, so existing values keep working.
export function loadInstructions(): string {
	try {
		return localStorage.getItem(INSTRUCTIONS_LS) ?? '';
	} catch {
		return '';
	}
}
export function saveInstructions(text: string): void {
	try {
		localStorage.setItem(INSTRUCTIONS_LS, text);
	} catch {
		/* storage full / unavailable — non-fatal */
	}
}
