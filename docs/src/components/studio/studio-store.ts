import { DECKS, deckSource, type StudioDeck } from './decks';
import { frontMatterBlock, stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';
import { clearComments } from './slide-comments';
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
// Exported so the storage-overlay's category matchers can be drift-tested against
// the REAL prefix (storage-metrics.test.ts) — a rename here then fails that test
// instead of silently mis-bucketing the overlay's breakdown.
export const SRC_PREFIX = 'lattice-studio-src-'; // + deckId → edited source
const ACTIVE_LS = 'lattice-studio-active'; // { deckId, slideIndex } — the deck+slide last viewed, so a reload boots where you left off
const SETTINGS_LS = 'lattice-studio-settings'; // { validation, pageNumbers, headerFooter, language }
const INSTRUCTIONS_LS = 'lattice-studio-instructions'; // CLOUD standing instructions (free text)
const ONDEVICE_INSTRUCTIONS_LS = 'lattice-studio-ondevice-instructions'; // ON-DEVICE standing instructions (free text, capped)

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
function remove(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		/* storage unavailable — non-fatal */
	}
}

// ── The deck's title IS its first heading ──────────────────────────────────
// A deck has ONE name and the deck itself carries it: the first heading in the
// source. Everything that shows a deck title (the switcher, the header, ⌘K,
// Share, the export filename) derives it from there, so typing a real `# Title`
// renames the deck everywhere with no second step — the bug this closes was a
// new deck staying "Untitled deck" in the switcher forever after its heading
// changed. The stored index label is only a FALLBACK (a deck with no heading at
// all) plus a mirror for the surfaces that read localStorage before the app
// hydrates; `syncDerivedTitle` keeps that mirror fresh, and Rename rewrites the
// heading via `retitleSource` rather than storing a name that disagrees with the slide.

/** How many chars of `line` are the line ITSELF, excluding a CRLF `\r`. Splicing must
 *  stop before that `\r`, or a rewrite would silently convert one line of a
 *  Windows-authored deck to LF. */
const lineEnd = (line: string) => line.length - (line.endsWith('\r') ? 1 : 0);

/** The first heading in `source` — front matter, fenced code, and HTML comments all
 *  skipped — as its char span, level, and text. Null when the deck has no heading.
 *  The skips matter twice over: a `# install deps` line in a bash block, or a
 *  `<!-- Notes: # rewrite this -->` aside, is not the deck's title — and since Rename
 *  WRITES this span back, treating one as the title would destroy the author's code or
 *  note AND name the deck something no rendered slide says. */
function scanFirstHeading(source: string): { start: number; end: number; level: number; text: string } | null {
	const src = String(source ?? '');
	let at = frontMatterBlock(src).length;
	let fence = '';
	let inComment = false;
	for (const raw of src.slice(at).split('\n')) {
		const line = raw.slice(0, lineEnd(raw)); // CRLF: the `\r` is not part of the content
		const end = at + line.length;
		const startedInComment = inComment;
		// A comment may open and close on one line (the `<!-- _class: x -->` directive every
		// slide carries) or span many (an authored note block).
		let rest = line;
		while (rest) {
			if (!inComment) {
				const open = rest.indexOf('<!--');
				if (open === -1) break;
				inComment = true;
				rest = rest.slice(open + 4);
				continue;
			}
			const close = rest.indexOf('-->');
			if (close === -1) { rest = ''; break; }
			inComment = false;
			rest = rest.slice(close + 3);
		}
		const f = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
		if (f) {
			if (!fence) fence = f[1][0];
			else if (f[1][0] === fence) fence = '';
		} else if (!fence && !startedInComment && !line.trimStart().startsWith('<!--')) {
			const h = line.match(/^(#{1,3})[ \t]+(.+?)[ \t]*$/);
			if (h) return { start: at, end, level: h[1].length, text: h[2] };
		}
		at = at + raw.length + 1; // + the '\n' consumed by split
	}
	return null;
}

/** The deck's first heading text, RAW — no markdown stripping, no length cap. Null when
 *  the deck has no heading. This is what Rename must round-trip: `titleFromSource`
 *  normalizes for DISPLAY, and feeding that normalized string back through
 *  `retitleSource` would silently delete the author's emphasis and everything past 60
 *  characters from their cover slide. */
export function headingText(source: string): string | null {
	return scanFirstHeading(source)?.text ?? null;
}

/** Derive a deck title from its source — the first heading, else a fallback. The
 *  stripping and the 60-char cap are DISPLAY concerns; never write the result back into
 *  a deck (see headingText). */
export function titleFromSource(source: string, fallback = 'Imported deck'): string {
	return (scanFirstHeading(source)?.text ?? '').replace(/[`*_]/g, '').trim().slice(0, 60) || fallback;
}

/** Rewrite the deck's first heading to `title`, preserving its level — the write half of
 *  `headingText`, used by Rename so a renamed deck's SLIDE says so too. Returns null when
 *  the deck has no heading to rewrite (the caller falls back to the stored index label).
 *  The title is flattened to one line: a newline in it would inject raw markdown —
 *  including a `---` slide break — into the deck. */
export function retitleSource(source: string, title: string): string | null {
	const h = scanFirstHeading(source);
	const t = title.replace(/\s+/g, ' ').replace(/^#+\s*/, '').trim();
	if (!h || !t) return null;
	const src = String(source ?? '');
	return `${src.slice(0, h.start)}${'#'.repeat(h.level)} ${t}${src.slice(h.end)}`;
}

/** The starter source for a brand-new deck — its heading seeded with `title`, so the
 *  deck's name and its cover slide agree from birth (the title is the heading). */
export function newDeckSource(title = 'Untitled deck'): string {
	return `<!-- _class: title -->\n\n# ${title.trim() || 'Untitled deck'}\n\n\`Draft\`\n\nStart typing to build your deck.`;
}

/** `N slides` for the deck-switcher meta line — the SAME splitter the live rail
 *  uses (splitSlides), front-matter excluded, so the count never disagrees with
 *  the rendered rail. */
export function metaFor(source: string): string {
	const n = splitSlides(stripFrontMatter(source)).length || 1;
	return `${n} slide${n === 1 ? '' : 's'}`;
}

/**
 * A deck's row in the persisted index.
 *
 * `title` is the deck's CREATION/RENAME label, written only by a deliberate act (create,
 * import, restore-copy, an explicit Rename on a heading-less deck). It is deliberately
 * NOT overwritten as the author types: it is the only record that a deck was ever
 * explicitly named, it is what the demo dedupes its starter deck by, and destroying it
 * would be the one irreversible thing in the derived-title model.
 *
 * `derived` is the MIRROR — the deck's current heading, refreshed on save, read only by
 * studio.astro's pre-paint shell (which cannot run the deriver before hydration). A cache
 * with a single writer, never an authority: nothing in the app reads it.
 *
 * `restored` marks a copy laid down beside a diverged deck by a backup restore. A DISPLAY
 * tag, not a name — the copy's source is byte-faithful to the backup, so the marker
 * cannot live in its heading without editing content the user asked us to restore.
 */
export type IndexEntry = { id: string; title: string; builtin: boolean; derived?: string; restored?: boolean };

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
 * (new/rename/delete) or any deck source was edited.
 *
 * Feeds the posture migration: `derivePosture` consults this to route a
 * prior-use-but-not-onboarded browser to `'write'` rather than the fresh-visitor
 * `'read'` (the hardened three-population form, R4/R6). It formerly gated the
 * retired `onboarded` runtime check, before the dial replaced it.
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
function canonicalSource(entry: IndexEntry): string {
	const builtin = DECKS.find((d) => d.id === entry.id);
	return builtin ? deckSource(builtin) : newDeckSource(entry.title);
}

/**
 * Resolve the full deck list with each deck's CURRENT source (edited override,
 * else canonical). This is what the shell renders + switches between. Each title
 * is DERIVED from that source (its first heading), so the switcher can never
 * disagree with the slide; the index label is the fallback for a heading-less deck.
 */
export function loadDeckList(): StudioDeck[] {
	return loadIndex().map((e) => {
		const source = loadSource(e.id) ?? canonicalSource(e);
		const derived = titleFromSource(source, e.title);
		// The restore tag is appended for DISPLAY only — two copies of the same deck would
		// otherwise sit in the switcher under one identical name.
		return { id: e.id, title: e.restored ? `${derived} (restored)` : derived, meta: metaFor(source), slides: splitSlides(stripFrontMatter(source)) };
	});
}

/** Every index row's stable creation/rename LABEL (not the derived title) — the handle
 *  for anything that must recognize a deck it created earlier regardless of what the
 *  author has since typed into it (the demo's starter deck; the e2e specs that assert on
 *  it). Exported rather than exposing the whole index: callers get identity, not state. */
export function deckLabels(): { id: string; label: string }[] {
	return loadIndex().map((e) => ({ id: e.id, label: e.title }));
}

// ── Last-active deck + slide (boot where you left off) ──────────────────────
// The Studio historically ALWAYS booted loadDeckList()[0] (the first deck), even
// when you'd switched to another one — so a reload (or an iOS memory-reclaim tab
// discard) dropped you back on deck #1. Worse: the returning-visitor instant-shell
// (studio.astro's pre-paint replay) gates its snapshot on `snap.deckId === bootId`
// with bootId = index[0].id, so leaving from any non-first deck meant the snapshot
// never matched and the user stared at a blank cold-boot preview — verified on real
// WebKit (engineering/decisions/2026-07-11-preview-performance-diagnosis.md logged
// this "boot the last-active deck + slide" follow-up; this is it). We now persist the
// deck+slide last viewed and boot from it, and studio.astro derives its bootId from
// the SAME key so the shell and the hydrated app agree on which deck (and slide) leads.

export type ActiveDeck = { deckId: string; slideIndex: number };

/** The deck + slide last viewed, or null if never recorded. */
export function loadActiveDeck(): ActiveDeck | null {
	const v = read<Partial<ActiveDeck>>(ACTIVE_LS);
	if (!v || typeof v.deckId !== 'string' || !v.deckId) return null;
	return { deckId: v.deckId, slideIndex: typeof v.slideIndex === 'number' && v.slideIndex >= 0 ? v.slideIndex : 0 };
}
/** Record the deck + slide currently in view (called on every deck/slide change). */
export function saveActiveDeck(deckId: string, slideIndex: number): void {
	write(ACTIVE_LS, { deckId, slideIndex: Math.max(0, slideIndex | 0) });
}
/** Forget the last-active pointer if it names `deckId` (a deck being deleted) — so it
 *  can never dangle at a deck that no longer exists, which would make the app boot the
 *  fallback while the instant-shell still trusts the stale id (a wrong-deck flash). */
function clearActiveDeckIf(deckId: string): void {
	if (loadActiveDeck()?.deckId === deckId) remove(ACTIVE_LS);
}

/**
 * The deck to boot: the last-active deck when it still exists in the list, else the
 * first deck, else the built-in first deck. Mirrors studio.astro's inline bootId
 * resolution EXACTLY (last-active id → index[0].id → DECKS[0].id) so the pre-paint
 * instant-shell and the hydrated app never disagree on which deck leads.
 */
export function loadBootDeck(): StudioDeck {
	const list = loadDeckList();
	const active = loadActiveDeck();
	if (active) {
		const hit = list.find((d) => d.id === active.deckId);
		if (hit) return hit;
	}
	return list[0] ?? DECKS[0];
}
/** The slide index to boot at — the last-active slide when it belongs to the boot deck
 *  (else 0). Clamping to the deck's real slide count is left to the shell (it already
 *  clamps activeSlide against the viewed set, which can be lens-reshaped). */
export function loadBootSlide(): number {
	const active = loadActiveDeck();
	return active && active.deckId === loadBootDeck().id ? active.slideIndex : 0;
}

/**
 * Create + persist a new deck. With `source` given (a deck import) the deck is
 * seeded with that content; otherwise the blank starter, whose heading carries
 * `title` so the deck's name and its cover slide agree from birth. `id` is passed
 * only by a caller that needs a STABLE id across runs (the demo's starter deck,
 * which dedupes itself); everything else mints one. Returns the new deck.
 */
export function createDeck(title = 'Untitled deck', source?: string): StudioDeck {
	// Date.now is fine in app code (unlike workflow scripts). Add a short random
	// suffix so two creates in the same millisecond (double-click) can't collide.
	const id = `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
	const body = source?.trim() ? source : newDeckSource(title);
	const index = loadIndex();
	index.push({ id, title, builtin: false });
	saveIndex(index);
	saveSource(id, body);
	return { id, title: titleFromSource(body, title), meta: metaFor(body), slides: splitSlides(stripFrontMatter(body)) };
}

/**
 * Mirror a deck's title into the index. The title itself lives in the deck's first
 * heading (see titleFromSource) — this keeps the stored label in step so the surfaces
 * that read localStorage WITHOUT the app do too: studio.astro's pre-paint instant
 * shell (which would otherwise flash the previous name through hydration) and the
 * backup's readable per-deck filenames. Also the direct writer for the one case with
 * no heading to derive from — Rename on a heading-less deck.
 */
export function syncDerivedTitle(id: string, heading: string | null): void {
	const t = heading?.trim();
	const index = loadIndex();
	const entry = index.find((e) => e.id === id);
	if (!t || !entry || entry.derived === t) return; // unchanged → no write
	saveIndex(index.map((e) => (e.id === id ? { ...e, derived: t } : e)));
}

/** Set a deck's explicit creation/rename LABEL — the deliberate act `title` records.
 *  Today only Rename on a deck with no heading to carry the name instead. */
export function setDeckLabel(id: string, title: string): void {
	const t = title.trim();
	const index = loadIndex();
	const entry = index.find((e) => e.id === id);
	if (!t || !entry || entry.title === t) return;
	saveIndex(index.map((e) => (e.id === id ? { ...e, title: t } : e)));
}

/** Remove a deck (index entry + its edited source, checkpoints, chat, chat
 *  draft, and review comments). Every per-deck sidecar this module and
 *  slide-comments.ts own is dropped here — leaving any of them behind orphans
 *  that id's content in localStorage forever (past deletions left checkpoint/
 *  chat/chat-draft keys behind; clearAllDecks's prefix sweep below cleans up
 *  any that predate this fix, but new deletes should never create more). */
export function deleteDeck(id: string): void {
	saveIndex(loadIndex().filter((e) => e.id !== id));
	dropSource(id);
	remove(SNAP_PREFIX + id);
	remove(CHAT_PREFIX + id);
	remove(CHAT_DRAFT_PREFIX + id);
	clearComments(id);
	clearActiveDeckIf(id); // don't leave the boot pointer dangling at a deleted deck
}

// ── Privacy & Data (Workspace → Privacy & Data tab) ─────────────────────────
// This module already owns the knowledge of which keys make up deck CONTENT
// (as opposed to settings/instructions, kept deliberately separate below) — so
// the Privacy & Data tab's stats + "clear decks" action live here too, rather
// than re-deriving the key list in the UI layer.

/** Deck count + a rough byte size for everything this module (+ slide-comments.ts,
 *  a per-deck sidecar) persists as deck CONTENT — used by the Privacy & Data tab's
 *  "Decks" row. Settings/instructions are excluded; they're preferences, not data. */
export function deckContentStats(): { count: number; bytes: number } {
	const count = loadIndex().length;
	let bytes = 0;
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (!k) continue;
			// 'lattice-studio-comments-' is slide-comments.ts's PREFIX — kept in sync
			// by hand, the same way hasPriorStudioUse above scans SRC_PREFIX directly.
			if (k === INDEX_LS || k === ACTIVE_LS || k.startsWith(SRC_PREFIX) || k.startsWith(SNAP_PREFIX) || k.startsWith(CHAT_PREFIX) || k.startsWith(CHAT_DRAFT_PREFIX) || k.startsWith('lattice-studio-comments-')) {
				bytes += k.length + (localStorage.getItem(k)?.length ?? 0);
			}
		}
	} catch {
		/* storage unavailable */
	}
	return { count, bytes };
}

/**
 * Delete every deck's content — index, edited sources, checkpoints, chats, chat
 * drafts, and comments — resetting the workspace to the built-in starter decks
 * (an empty index re-seeds from DECKS on next load; see loadIndex). Settings and
 * standing instructions are untouched: Privacy & Data clears DATA, not preferences.
 *
 * Sweeps by KEY PREFIX, not just ids in the current index: a deck removed
 * earlier via the ordinary deck-switcher delete could leave its checkpoint/
 * chat/chat-draft/comment keys orphaned once its id fell out of the index
 * (deleteDeck didn't clean those up before this fix) — "Delete Everything"
 * must not leave that behind, or the privacy promise is false. The prefix
 * scan mirrors deckContentStats' own byte count above, which already reads
 * by prefix rather than by index membership for the same reason.
 */
export function clearAllDecks(): void {
	// Known ids first, through the real per-deck API (clearComments dispatches
	// COMMENTS_EVENT so any open comment view refreshes — the prefix sweep below
	// can't do that, since it doesn't know which ids it's touching).
	for (const { id } of loadIndex()) {
		dropSource(id);
		remove(SNAP_PREFIX + id);
		remove(CHAT_PREFIX + id);
		remove(CHAT_DRAFT_PREFIX + id);
		clearComments(id);
	}
	// Then sweep by KEY PREFIX for anything the index no longer knows about: a
	// deck removed earlier via the ordinary deck-switcher delete could leave its
	// checkpoint/chat/chat-draft/comment keys orphaned once its id fell out of
	// the index (deleteDeck didn't clean those up before this fix) — "Delete
	// Everything" must not leave that behind, or the privacy promise is false.
	// The prefix scan mirrors deckContentStats' own byte count above, which
	// already reads by prefix rather than by index membership for the same
	// reason. Collected into an array before removing anything — mutating
	// localStorage mid-forward-iteration over its own live index would skip keys.
	try {
		const orphaned: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k && (k.startsWith(SRC_PREFIX) || k.startsWith(SNAP_PREFIX) || k.startsWith(CHAT_PREFIX) || k.startsWith(CHAT_DRAFT_PREFIX) || k.startsWith('lattice-studio-comments-'))) orphaned.push(k);
		}
		for (const k of orphaned) remove(k);
	} catch {
		/* storage unavailable — non-fatal, matches the read-side scan above */
	}
	remove(INDEX_LS);
	remove(ACTIVE_LS); // the boot pointer is deck CONTENT state — clear it with the rest
	// The live editor has no other way to learn its in-memory deck/source state
	// just went stale — without this, the user could keep typing in the still-
	// focused editor and the existing 400ms debounced autosave (StudioShell)
	// would silently re-write the just-cleared deck's content back to
	// localStorage before the Workspace sheet's reload catches up.
	if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DECKS_CLEARED_EVENT));
}

/** Fired the instant clearAllDecks finishes — StudioShell listens and stops
 *  every saveSource call for the rest of its lifetime (it's about to be
 *  torn down by a reload anyway; see clearAllDecks above for why this exists). */
export const DECKS_CLEARED_EVENT = 'lattice:decks-cleared';

// ── Version history (checkpoints) ──────────────────────────────────────────
export const SNAP_PREFIX = 'lattice-studio-snap-'; // + deckId → Checkpoint[] (exported for the storage-overlay drift test)
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
export const CHAT_PREFIX = 'lattice-studio-chat-'; // + deckId → ChatMessage[] (exported for the storage-overlay drift test)
const CHAT_CAP = 60;

/** A reviewable, re-appliable proposed edit persisted on an assistant turn. Structural
 *  (matches architect.ts ProposedEdit) so the store doesn't import the AI module. `raw`
 *  is re-fed to applyEdit against the CURRENT deck at Apply-time — never a stale snapshot. */
export type ChatProposal = {
	label: string;
	slide: number;
	action: string;
	raw: { action: string; slide: number; body: string };
	before: string;
	after: string;
	diff: { type: string; text: string }[];
};

export type ChatMessage = {
	role: 'user' | 'assistant';
	content: string;
	/** Assistant turn only: the edits it proposes (reviewable per-slide diffs). */
	proposed?: ChatProposal[];
	/** Whether that proposal has been applied. */
	applied?: boolean;
};

export function loadChat(deckId: string): ChatMessage[] {
	return read<ChatMessage[]>(CHAT_PREFIX + deckId) ?? [];
}
export function saveChat(deckId: string, messages: ChatMessage[]): void {
	write(CHAT_PREFIX + deckId, messages.slice(-CHAT_CAP));
}

// The unsent chat draft, per deck — so a closed (or unmounted) Architect panel
// keeps what the author was typing. Paired with the persisted history above, the
// chat's full state survives the panel going away (the activity-bar model closes
// it entirely; nothing should be lost on the way out).
export const CHAT_DRAFT_PREFIX = 'lattice-studio-chatdraft-'; // + deckId → string (exported for the storage-overlay drift test)
export function loadChatDraft(deckId: string): string {
	return read<string>(CHAT_DRAFT_PREFIX + deckId) ?? '';
}
export function saveChatDraft(deckId: string, draft: string): void {
	if (draft) write(CHAT_DRAFT_PREFIX + deckId, draft);
	else remove(CHAT_DRAFT_PREFIX + deckId);
}

// `language` is the BCP-47 output locale for AI deck content (see studio-language).
// `posture` is the persisted density stop — the always-visible, reversible dial
// that replaced the one-way `onboarded` ratchet + welcome banner (2026-07-17-studio-persona-dial.md).
// It is written ONLY by an explicit dial interaction (never by engagement), so a
// user boots where they left off and the surface never drifts. `'write'` = today's
// Focus body (editor + preview), `'build'` = the full desktop. (The `'read'`
// newcomer home lands in a later milestone; the union widens then.)
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
// `lensDefaults` — whether decks INHERIT the workspace default reader views (the curated two,
// workspace-lenses.ts). ON by default: a fresh deck shows the two starter views in its Lenses panel
// without baking anything into its source (the delta model — see workspace-lenses.ts). Turning it off
// drops the inherited starters from every deck that never materialized (approved/edited/dropped) one.
// The persisted density stop. (`'read'` — the full-bleed newcomer home — widens
// this union in a later milestone; today's two stops map to the existing surfaces.)
export type Posture = 'read' | 'write' | 'build';
const POSTURES: readonly Posture[] = ['read', 'write', 'build'];
const isPosture = (v: unknown): v is Posture => POSTURES.includes(v as Posture);
// `readHintSeen` — the one-time "this sample deck is yours → Edit this slide"
// orientation hint on the Read stop is shown until the newcomer edits or dismisses
// it, then never again. (It is content attached to the Edit button, not a banner —
// it points INTO the app, never recurs, and blocks nothing.)
export type StudioSettings = { validation: boolean; pageNumbers: boolean; headerFooter: boolean; language: string; posture: Posture; readHintSeen: boolean; handleStyle: HandleStyle; pdfPages: PdfPages; lensDefaults: boolean };
const DEFAULT_SETTINGS: StudioSettings = { validation: true, pageNumbers: true, headerFooter: false, language: DEFAULT_LANGUAGE, posture: 'read', readHintSeen: false, handleStyle: 'knob', pdfPages: 'png', lensDefaults: true };

// Derive the boot stop for a browser with no explicitly-stored posture — the
// hardened three-population form (R4/R6, prior-use-first so an actively-editing
// user is never demoted): an explicit legacy `onboarded:true` (they reached the
// full surface) → keep it → 'build'; a browser with prior Studio use but no full
// surface → the calm middle 'write'; a true first visit → the gentlest home,
// 'read'. Once derived for a fresh visitor, the boot stop is persisted ONCE (see
// hasStoredPosture + the mount effect in StudioShell) so a first-session action
// like creating a deck can never silently re-derive it upward.
function derivePosture(legacyOnboarded: boolean | undefined): Posture {
	if (legacyOnboarded === true) return 'build';
	if (hasPriorStudioUse()) return 'write';
	return 'read';
}
// True only when a posture was EXPLICITLY written to storage (not merely derived).
// The mount effect uses this to persist a fresh visitor's derived stop exactly once.
export function hasStoredPosture(): boolean {
	try {
		return isPosture(read<Partial<StudioSettings>>(SETTINGS_LS)?.posture);
	} catch {
		return false;
	}
}

export function loadSettings(): StudioSettings {
	// `onboarded` is read for one migration cycle then dropped from the persisted
	// object (excluded from the spread below), so it never lingers as a stale second
	// source of truth beside `posture`.
	const { onboarded: legacyOnboarded, ...saved } = (read<Partial<StudioSettings> & { onboarded?: boolean }>(SETTINGS_LS) ?? {});
	// Seed the language from the browser the FIRST time only (no saved value); the
	// user's explicit pick wins forever after. detectLanguage falls back to en-US.
	const language = saved.language ?? detectLanguage();
	// Validate rather than trust: an unknown stored value (corruption, or a `'read'`
	// written by a later build then rolled back) must fall back to the derived stop,
	// never flow through to leave the dial lighting no segment.
	const posture = isPosture(saved.posture) ? saved.posture : derivePosture(legacyOnboarded);
	return { ...DEFAULT_SETTINGS, ...saved, language, posture };
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
	/** CLOUD standing instructions — unlimited. */
	instructions: string;
	/** ON-DEVICE standing instructions — separate from the cloud field, capped at
	 *  ON_DEVICE_INSTRUCTIONS_MAX (see below). */
	onDeviceInstructions: string;
};

/**
 * Every deck's CURRENT full source — edited override where one exists, the
 * canonical built-in source otherwise. This is what the backup's readable
 * decks/ copies pack: a person inspecting their backup must see EVERY deck
 * from the switcher, not just the ones they happen to have touched (the
 * edited-only variant shipped first and read as "my decks weren't backed up").
 */
export function resolvedSources(): { entry: IndexEntry; source: string }[] {
	return loadIndex().map((entry) => ({ entry, source: loadSource(entry.id) ?? canonicalSource(entry) }));
}

// Ask the live shell to flush its debounced editor save (StudioShell persists
// the active deck's source on a 400ms debounce) — dispatched by the backup
// path so a download taken mid-keystroke can't miss the newest edits.
export const FLUSH_EVENT = 'lattice:flush-deck';
export function requestSourceFlush(): void {
	if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FLUSH_EVENT));
}

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
	return { index, sources, checkpoints, chats, settings: loadSettings(), instructions: loadInstructions(), onDeviceInstructions: loadOnDeviceInstructions() };
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
		// Truly diverged (both sides carry edits) — restore beside, never over. The source
		// is stored BYTE-FAITHFUL: restore fidelity is the whole point of this path, and
		// the `(restored)` marker is a display tag on the index row instead (see
		// IndexEntry.restored). Writing the marker into the copy's heading — which this
		// briefly did — corrupted the very content the user asked us to restore: it
		// stripped inline markdown, truncated mid-word against a DISPLAY cap, could split
		// a surrogate pair, and on a deck whose cover is heading-less by design
		// (big-number) it rewrote a body slide's H2 instead of the cover.
		const newId = `deck-${ts.toString(36)}-r${(n++).toString(36)}`;
		index.push({ id: newId, title: `${entry.title} (restored)`, builtin: false, restored: true });
		saveSource(newId, incomingSrc);
		if (data.checkpoints[entry.id]?.length) write(SNAP_PREFIX + newId, data.checkpoints[entry.id].slice(0, SNAP_CAP));
		if (data.chats[entry.id]?.length) saveChat(newId, data.chats[entry.id]);
		summary.restoredCopies++;
	}
	saveIndex(index);
	saveSettings(data.settings);
	saveInstructions(data.instructions);
	saveOnDeviceInstructions(data.onDeviceInstructions ?? ''); // absent in a pre-split backup — restores empty, never throws
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
//
// CLOUD field — unlimited. See loadOnDeviceInstructions below for the separate,
// capped ON-DEVICE field: cloud and on-device are fully separate namespaces (not
// one shared field), per engineering/decisions/2026-07-09-studio-cloud-ondevice-
// config-split.md — a small local model loses the thread past a short brief, so
// its instructions field is its own setting, not a truncation of this one.
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

// ON-DEVICE standing instructions — the same idea as loadInstructions, but a
// wholly separate field + key, capped at ON_DEVICE_INSTRUCTIONS_MAX characters.
// The cap is enforced HERE (not just the textarea's `maxLength`) so a value
// written before the cap existed, or restored from an older backup, can't inject
// an oversized block into a small local model's system prompt.
export const ON_DEVICE_INSTRUCTIONS_MAX = 300;

// A plain `.slice(0, N)` counts UTF-16 CODE UNITS, not characters — it can split a
// surrogate pair (an emoji, any astral-plane character) exactly at the boundary,
// corrupting the last character into a lone surrogate. `Array.from` iterates by
// CODE POINT, so the cap always lands on a real character boundary. Exported so
// the live-typing truncation in the Workspace drawer matches what actually gets
// persisted (the textarea's native `maxLength` is itself UTF-16-unit-based and
// can already truncate mid-codepoint before this ever runs — a residual browser-
// level edge case this doesn't fully close, only what our own logic controls).
export function truncateCodePoints(s: string, n: number): string {
	return Array.from(s).slice(0, n).join('');
}

export function loadOnDeviceInstructions(): string {
	try {
		return truncateCodePoints(localStorage.getItem(ONDEVICE_INSTRUCTIONS_LS) ?? '', ON_DEVICE_INSTRUCTIONS_MAX);
	} catch {
		return '';
	}
}
export function saveOnDeviceInstructions(text: string): void {
	try {
		localStorage.setItem(ONDEVICE_INSTRUCTIONS_LS, truncateCodePoints(text, ON_DEVICE_INSTRUCTIONS_MAX));
	} catch {
		/* storage full / unavailable — non-fatal */
	}
}
