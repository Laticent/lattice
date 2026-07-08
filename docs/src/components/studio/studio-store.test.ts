import { afterEach, describe, expect, it } from 'vitest';
import { DECKS } from './decks';
import { createDeck, deleteDeck, loadChatDraft, loadCheckpoints, loadDeckList, loadInstructions, loadSettings, loadSource, metaFor, renameDeck, saveChatDraft, saveCheckpoint, saveInstructions, saveSettings, saveSource, titleFromSource } from './studio-store';

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
		expect(loadSettings()).toMatchObject({ validation: true, pageNumbers: true, headerFooter: false, onboarded: false });
		saveSettings({ pageNumbers: false });
		expect(loadSettings().pageNumbers).toBe(false);
		expect(loadSettings().validation).toBe(true); // untouched keys keep defaults
	});

	it('seeds language from the browser the first time, then honors the saved pick', () => {
		// No saved value → detected (jsdom navigator resolves to a supported code).
		const seeded = loadSettings().language;
		expect(typeof seeded).toBe('string');
		expect(seeded.length).toBeGreaterThan(0);
		// An explicit pick persists and overrides detection on later reads.
		saveSettings({ language: 'fr-FR' });
		expect(loadSettings().language).toBe('fr-FR');
		// And it survives an unrelated settings write (no re-detect clobber).
		saveSettings({ validation: false });
		expect(loadSettings().language).toBe('fr-FR');
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
