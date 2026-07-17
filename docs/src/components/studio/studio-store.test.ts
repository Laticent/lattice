import { afterEach, describe, expect, it } from 'vitest';
import { DECKS } from './decks';
import { addComment, listComments } from './slide-comments';
import {
	clearAllDecks,
	createDeck,
	DECKS_CLEARED_EVENT,
	deckContentStats,
	deleteDeck,
	exportStudioState,
	importStudioState,
	loadChat,
	loadChatDraft,
	loadCheckpoints,
	loadDeckList,
	loadInstructions,
	loadOnDeviceInstructions,
	loadSettings,
	loadSource,
	metaFor,
	ON_DEVICE_INSTRUCTIONS_MAX,
	renameDeck,
	saveChat,
	saveChatDraft,
	saveCheckpoint,
	saveInstructions,
	saveOnDeviceInstructions,
	saveSettings,
	saveSource,
	titleFromSource,
	truncateCodePoints,
} from './studio-store';

afterEach(() => localStorage.clear());

describe('studio-store — deck index', () => {
	it('seeds the list from the built-in decks on first run', () => {
		const list = loadDeckList();
		expect(list.map((d) => d.id)).toEqual(DECKS.map((d) => d.id));
		expect(list[0].meta).toMatch(/\d+ slides?/);
	});

	it('createDeck appends a persisted, editable deck', () => {
		const before = loadDeckList().length;
		const d = createDeck('My deck');
		expect(d.title).toBe('My deck');
		const list = loadDeckList();
		expect(list.length).toBe(before + 1);
		expect(list.find((x) => x.id === d.id)).toBeTruthy();
	});

	it('renameDeck and deleteDeck persist', () => {
		const d = createDeck('Temp');
		renameDeck(d.id, 'Renamed');
		expect(loadDeckList().find((x) => x.id === d.id)?.title).toBe('Renamed');
		deleteDeck(d.id);
		expect(loadDeckList().find((x) => x.id === d.id)).toBeUndefined();
	});

	it('offers the welcome deck to a returning user once — appended, and deletable', () => {
		// A saved index from before the welcome deck existed (no `welcome`, no flag).
		localStorage.setItem('lattice-studio-deck-index', JSON.stringify([
			{ id: 'q3-board', title: 'Q3 Board Review', builtin: true },
			{ id: 'product-strategy', title: 'FY26 Product Strategy', builtin: true },
		]));
		const ids = loadDeckList().map((d) => d.id);
		// Welcome is appended (last) — it does not hijack index[0] (the active deck).
		expect(ids).toEqual(['q3-board', 'product-strategy', 'welcome']);
		// Deleting it sticks — the one-time migration doesn't re-add it.
		deleteDeck('welcome');
		expect(loadDeckList().map((d) => d.id)).toEqual(['q3-board', 'product-strategy']);
	});
});

describe('studio-store — per-deck source', () => {
	it('round-trips edited source and overrides the canonical', () => {
		const id = DECKS[0].id;
		expect(loadSource(id)).toBeNull();
		saveSource(id, '<!-- _class: title -->\n\n# Edited');
		expect(loadSource(id)).toContain('# Edited');
		// The list reflects the edit (slide count from the edited source).
		expect(loadDeckList().find((d) => d.id === id)?.slides[0]).toContain('# Edited');
	});

	it('metaFor counts slides — agreeing with the rail splitter on tight separators', () => {
		expect(metaFor('a\n\n---\n\nb\n\n---\n\nc')).toBe('3 slides');
		expect(metaFor('only one')).toBe('1 slide');
		// Tight + trailing separators count the same as the live rail (splitSlides),
		// not the old per-variant regex (which over/under-counted these).
		expect(metaFor('# A\n---\n# B')).toBe('2 slides');
		expect(metaFor('# A\n\n---\n\n# B\n\n---\n')).toBe('2 slides');
	});
});

describe('studio-store — version history', () => {
	it('saves checkpoints newest-first, dedupes the latest, and caps the list', () => {
		expect(loadCheckpoints('d1')).toEqual([]);
		saveCheckpoint('d1', 'v1', 'first', 1000);
		saveCheckpoint('d1', 'v2', 'second', 2000);
		saveCheckpoint('d1', 'v2', 'dupe', 3000); // same source as latest → skipped
		const list = loadCheckpoints('d1');
		expect(list.map((c) => c.source)).toEqual(['v2', 'v1']); // newest first, no dupe
		// Cap at 25.
		for (let i = 0; i < 40; i++) saveCheckpoint('d1', `x${i}`, 'bulk', 4000 + i);
		expect(loadCheckpoints('d1').length).toBe(25);
	});
});

describe('studio-store — titleFromSource', () => {
	it('derives a title from the first heading', () => {
		expect(titleFromSource('<!-- _class: title -->\n\n# Q4 Wrap\n\nbody')).toBe('Q4 Wrap');
		expect(titleFromSource('no heading here')).toBe('Imported deck');
	});
});

describe('studio-store — settings', () => {
	it('defaults then round-trips', () => {
		expect(loadSettings()).toMatchObject({ validation: true, pageNumbers: true, headerFooter: false, posture: 'read' });
		saveSettings({ pageNumbers: false });
		expect(loadSettings().pageNumbers).toBe(false);
		expect(loadSettings().validation).toBe(true); // untouched keys keep defaults
	});

	it('derives the boot posture across the three populations, and drops the legacy flag', () => {
		// (1) A legacy engaged user (onboarded:true) reached the full surface → keep it → Build.
		localStorage.setItem('lattice-studio-settings', JSON.stringify({ onboarded: true }));
		expect(loadSettings().posture).toBe('build');
		// The retired flag is not re-persisted — no stale second source of truth beside posture.
		saveSettings({ pageNumbers: false });
		expect('onboarded' in JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}')).toBe(false);
		// (2) Prior Studio use but no full surface (a saved deck index) → the calm middle → Write.
		localStorage.clear();
		localStorage.setItem('lattice-studio-deck-index', JSON.stringify([{ id: 'x', title: 'X', builtin: true }]));
		expect(loadSettings().posture).toBe('write');
		// (3) A true first visit (nothing stored) → the gentlest home → Read.
		localStorage.clear();
		expect(loadSettings().posture).toBe('read');
	});

	it('seeds language from the browser the first time, then honors the saved pick', () => {
		// No saved value → detected (jsdom navigator resolves to a supported code).
		const seeded = loadSettings().language;
		expect(typeof seeded).toBe('string');
		expect(seeded.length).toBeGreaterThan(0);
		// An explicit pick persists and overrides detection on later reads.
		saveSettings({ language: 'en-GB' });
		expect(loadSettings().language).toBe('en-GB');
		// And it survives an unrelated settings write (no re-detect clobber).
		saveSettings({ validation: false });
		expect(loadSettings().language).toBe('en-GB');
	});
});

describe('studio-store — standing instructions', () => {
	it('round-trips a raw (non-JSON) string, empty by default', () => {
		expect(loadInstructions()).toBe('');
		saveInstructions('Be terse.');
		expect(loadInstructions()).toBe('Be terse.');
		// Stored verbatim — the format the drawer has always written.
		expect(localStorage.getItem('lattice-studio-instructions')).toBe('Be terse.');
	});
});

describe('studio-store — on-device standing instructions (separate + capped)', () => {
	it('round-trips independently of the cloud field, under its own key', () => {
		expect(loadOnDeviceInstructions()).toBe('');
		saveInstructions('Cloud voice.');
		saveOnDeviceInstructions('Short local note.');
		expect(loadInstructions()).toBe('Cloud voice.');
		expect(loadOnDeviceInstructions()).toBe('Short local note.');
		expect(localStorage.getItem('lattice-studio-ondevice-instructions')).toBe('Short local note.');
	});

	it('caps what is saved at ON_DEVICE_INSTRUCTIONS_MAX characters', () => {
		const long = 'x'.repeat(ON_DEVICE_INSTRUCTIONS_MAX + 50);
		saveOnDeviceInstructions(long);
		expect(loadOnDeviceInstructions().length).toBe(ON_DEVICE_INSTRUCTIONS_MAX);
	});

	it('also caps on READ — a value written before the cap existed (or restored raw) never injects an oversized block', () => {
		const long = 'y'.repeat(ON_DEVICE_INSTRUCTIONS_MAX + 200);
		localStorage.setItem('lattice-studio-ondevice-instructions', long); // bypass saveOnDeviceInstructions
		expect(loadOnDeviceInstructions().length).toBe(ON_DEVICE_INSTRUCTIONS_MAX);
	});

	// Red-team finding: a plain `.slice(0, N)` counts UTF-16 CODE UNITS, so a value
	// ending on an astral-plane character (any emoji, e.g. 😀 = 2 units) right at the
	// boundary gets split mid-character — the last unit becomes a lone surrogate
	// (U+FFFD once re-encoded), a silent, invisible-to-the-author corruption.
	it('caps at a Unicode CODE POINT boundary, never splitting a surrogate pair', () => {
		const long = `${'x'.repeat(ON_DEVICE_INSTRUCTIONS_MAX - 1)}😀extra`; // emoji straddles the boundary
		saveOnDeviceInstructions(long);
		const saved = loadOnDeviceInstructions();
		// The emoji (2 UTF-16 units) is kept whole — the cap lands one code point
		// short of the naive unit count, not mid-surrogate. (A valid emoji legitimately
		// contains surrogate-range code units in a PAIR; `isWellFormed` is the actual
		// "no lone/broken surrogate" check — a bare regex for the range would false-
		// positive on every correctly-paired astral character.)
		expect(saved).toBe(`${'x'.repeat(ON_DEVICE_INSTRUCTIONS_MAX - 1)}😀`);
		expect(saved.isWellFormed()).toBe(true);
		expect(Array.from(saved).length).toBe(ON_DEVICE_INSTRUCTIONS_MAX);
	});

	it('truncateCodePoints: a plain slice would have split the pair; this does not', () => {
		const s = `${'a'.repeat(9)}😀`; // 11 UTF-16 units, 10 code points
		expect(s.length).toBe(11); // the naive (wrong) unit count
		expect(s.slice(0, 10)).not.toBe(s); // .slice(0,10) WOULD cut the emoji in half
		expect(truncateCodePoints(s, 10)).toBe(s); // code-point-safe: all 10 chars fit whole
		expect(truncateCodePoints(s, 9)).toBe('a'.repeat(9)); // drops the whole emoji, not half of it
	});
});

describe('studio-store — workspace backup carries both instruction fields', () => {
	it('exports and restores the on-device field alongside the cloud one', () => {
		saveInstructions('Cloud voice.');
		saveOnDeviceInstructions('Local note.');
		const snapshot = exportStudioState();
		expect(snapshot.instructions).toBe('Cloud voice.');
		expect(snapshot.onDeviceInstructions).toBe('Local note.');

		localStorage.clear();
		expect(loadOnDeviceInstructions()).toBe('');
		importStudioState(snapshot, 1000);
		expect(loadInstructions()).toBe('Cloud voice.');
		expect(loadOnDeviceInstructions()).toBe('Local note.');
	});

	it('a pre-split backup with no onDeviceInstructions field restores to empty, never throws', () => {
		saveOnDeviceInstructions('stale local note');
		const legacy = exportStudioState();
		// @ts-expect-error — simulating a backup file from before this field existed.
		delete legacy.onDeviceInstructions;
		expect(() => importStudioState(legacy, 2000)).not.toThrow();
		expect(loadOnDeviceInstructions()).toBe('');
	});
});

describe('studio-store — Privacy & Data (clearAllDecks / deckContentStats)', () => {
	it('deckContentStats counts the deck index and grows with edited content', () => {
		const before = deckContentStats();
		expect(before.count).toBe(DECKS.length);
		const d = createDeck('Extra');
		saveSource(d.id, '# Extra\n\nbody');
		saveCheckpoint(d.id, '# Extra v1', 'first', 1000);
		saveChat(d.id, [{ role: 'user', content: 'hi' }]);
		const after = deckContentStats();
		expect(after.count).toBe(DECKS.length + 1);
		expect(after.bytes).toBeGreaterThan(before.bytes);
	});

	it('clearAllDecks wipes every deck\'s content and resets the index to the built-in seed', () => {
		const d = createDeck('Temp');
		saveSource(d.id, '# Temp\n\nbody');
		saveCheckpoint(d.id, '# Temp v1', 'first', 1000);
		saveChat(d.id, [{ role: 'user', content: 'hi' }]);
		saveChatDraft(d.id, 'unsent thought');
		// A built-in deck carrying local edits should also lose its override.
		saveSource(DECKS[0].id, '# Edited built-in');

		clearAllDecks();

		const list = loadDeckList();
		expect(list.map((x) => x.id)).toEqual(DECKS.map((x) => x.id)); // back to the built-in seed only
		expect(loadSource(DECKS[0].id)).toBeNull(); // the built-in's edit is gone too
		expect(loadCheckpoints(d.id)).toEqual([]);
		expect(loadChatDraft(d.id)).toBe('');
		expect(deckContentStats().count).toBe(DECKS.length);
	});

	it('clearAllDecks leaves settings and standing instructions untouched (data, not preferences)', () => {
		saveSettings({ headerFooter: true });
		saveInstructions('Board voice.');
		clearAllDecks();
		expect(loadSettings().headerFooter).toBe(true);
		expect(loadInstructions()).toBe('Board voice.');
	});

	it('deleteDeck also clears the deck\'s checkpoints, chat, and chat draft (previously left orphaned — a red-team/checker finding)', () => {
		const d = createDeck('Temp2');
		saveCheckpoint(d.id, '# Temp2 v1', 'first', 1000);
		saveChat(d.id, [{ role: 'user', content: 'hi' }]);
		saveChatDraft(d.id, 'unsent draft');
		addComment(d.id, 1, 'a comment');

		deleteDeck(d.id);

		expect(loadCheckpoints(d.id)).toEqual([]);
		expect(loadChat(d.id)).toEqual([]);
		expect(loadChatDraft(d.id)).toBe('');
		expect(listComments(d.id)).toEqual([]);
	});

	it('clearAllDecks sweeps ORPHANED sidecar keys too — content a deck no longer in the index left behind (the pre-fix deleteDeck gap; "Delete Everything" must not leave this)', () => {
		// Simulate exactly what the pre-fix deleteDeck() left behind: checkpoint/
		// chat/chat-draft/comment keys for an id that is NOT (or no longer) in the
		// deck index. These helpers write straight to localStorage regardless of
		// index membership, so this reproduces the orphan without needing a real
		// stale deleteDeck build.
		saveCheckpoint('orphan-1', '# Orphan v1', 'first', 1000);
		saveChat('orphan-1', [{ role: 'user', content: 'hi' }]);
		saveChatDraft('orphan-1', 'unsent');
		addComment('orphan-1', 1, 'leftover comment');
		expect(loadCheckpoints('orphan-1').length).toBeGreaterThan(0);
		expect(loadChatDraft('orphan-1')).toBe('unsent');
		expect(listComments('orphan-1').length).toBeGreaterThan(0);

		clearAllDecks();

		expect(loadCheckpoints('orphan-1')).toEqual([]);
		expect(loadChat('orphan-1')).toEqual([]);
		expect(loadChatDraft('orphan-1')).toBe('');
		expect(listComments('orphan-1')).toEqual([]);
	});

	it('clearAllDecks fires DECKS_CLEARED_EVENT — the live editor (StudioShell) listens for this to stop autosaving a just-cleared deck', () => {
		const seen: string[] = [];
		const onCleared = () => seen.push('fired');
		window.addEventListener(DECKS_CLEARED_EVENT, onCleared);
		try {
			clearAllDecks();
		} finally {
			window.removeEventListener(DECKS_CLEARED_EVENT, onCleared);
		}
		expect(seen).toEqual(['fired']);
	});
});

describe('studio-store — chat draft (Architect no-lost-work)', () => {
	it('round-trips a per-deck draft so a closed panel keeps the unsent text', () => {
		expect(loadChatDraft('deck-a')).toBe('');
		saveChatDraft('deck-a', 'tighten slide 3');
		expect(loadChatDraft('deck-a')).toBe('tighten slide 3');
		// Drafts are isolated per deck — switching decks never bleeds the text.
		expect(loadChatDraft('deck-b')).toBe('');
	});
	it('clears the stored key when the draft goes empty (sent / erased)', () => {
		saveChatDraft('deck-a', 'half a thought');
		saveChatDraft('deck-a', '');
		expect(loadChatDraft('deck-a')).toBe('');
		expect(localStorage.getItem('lattice-studio-chatdraft-deck-a')).toBeNull();
	});
});
