import { describe, expect, it } from 'vitest';
import { createDeck, exportStudioState, importStudioState, lastBackupAt, loadChat, loadCheckpoints, loadDeckList, loadInstructions, loadSettings, loadSource, markBackupTaken, saveChat, saveCheckpoint, saveInstructions, saveSettings, saveSource, shouldNudgeBackup } from './studio-store';
import { packWorkspace, restoreWorkspace, WORKSPACE_FORMAT, WORKSPACE_ZIP_NAME } from './workspace-backup';

// jsdom has no IndexedDB, so the Library shelves read as empty — these tests
// cover the Studio-store half (decks/checkpoints/chats/settings) and the zip
// anatomy; the Library leg rides the already-tested asset-bundle round-trip.

const T0 = 1_750_000_000_000; // fixed clock — the store takes ts as an argument

function seedWorkspace() {
	saveSource('deck-aaa', '# Quarterly plan\n\nHello.');
	saveCheckpoint('deck-aaa', '# Quarterly plan (v1)', 'first pass', T0 - 1000);
	saveChat('deck-aaa', [{ role: 'user', content: 'tighten the title' }]);
	saveSettings({ headerFooter: true, language: 'en-GB' });
	saveInstructions('Board voice.');
	// Registering the deck in the index requires touching the index — the store
	// seeds from built-ins, so create-by-import is the realistic path:
	const state = exportStudioState();
	state.index.push({ id: 'deck-aaa', title: 'Quarterly plan', builtin: false });
	importStudioState(state, T0);
}

describe('workspace-backup — zip anatomy', () => {
	it('packs manifest + workspace.json + readable deck copies', async () => {
		seedWorkspace();
		const blob = await packWorkspace(T0);
		expect(blob.size).toBeGreaterThan(0);
		const { default: JSZip } = await import('jszip');
		const zip = await JSZip.loadAsync(blob);
		const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
		expect(manifest.format).toBe(WORKSPACE_FORMAT);
		expect(manifest.counts.decks).toBeGreaterThan(0);
		expect(manifest.counts.refdocs).toBe(0); // jsdom has no IndexedDB → empty shelf, but the count is declared
		expect(manifest.counts.scenes).toBe(0); // scenes ride the same shelf — count declared even when empty
		expect(zip.file('workspace.json')).toBeTruthy();
		expect(zip.file('README.md')).toBeTruthy();
		expect(zip.file('decks/quarterly-plan.md')).toBeTruthy();
		expect(await zip.file('decks/quarterly-plan.md')!.async('string')).toContain('# Quarterly plan');
	});

	it('decks/ contains EVERY deck in the switcher, untouched built-ins included', async () => {
		// The regression the on-device inspection caught: edited-only copies made
		// the zip look like decks were randomly missing (they varied with which
		// decks the user had touched). The readable folder must match the manifest.
		seedWorkspace();
		const blob = await packWorkspace(T0);
		const { default: JSZip } = await import('jszip');
		const zip = await JSZip.loadAsync(blob);
		const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
		const deckFiles = Object.keys(zip.files).filter((n) => n.startsWith('decks/') && n.endsWith('.md'));
		expect(deckFiles.length).toBe(manifest.counts.decks);
		// An untouched built-in ships its canonical source.
		const untouched = deckFiles.find((n) => !n.includes('quarterly-plan'));
		expect(untouched).toBeTruthy();
		expect((await zip.file(untouched!)!.async('string')).length).toBeGreaterThan(0);
	});

	it('packing flushes the live editor debounce first (the mid-keystroke race)', async () => {
		seedWorkspace();
		// Simulate the shell's flush listener: the newest source only lands in
		// localStorage when the flush event fires.
		const listener = () => saveSource('deck-aaa', '# Quarterly plan\n\nFlushed at pack time.');
		window.addEventListener('lattice:flush-deck', listener);
		try {
			const blob = await packWorkspace(T0);
			const { default: JSZip } = await import('jszip');
			const zip = await JSZip.loadAsync(blob);
			expect(await zip.file('decks/quarterly-plan.md')!.async('string')).toContain('Flushed at pack time');
		} finally {
			window.removeEventListener('lattice:flush-deck', listener);
		}
	});

	it('never packs the OpenRouter key, even if present', async () => {
		seedWorkspace();
		localStorage.setItem('lattice-db-or-key', 'sk-secret-123');
		const blob = await packWorkspace(T0);
		const { default: JSZip } = await import('jszip');
		const zip = await JSZip.loadAsync(blob);
		for (const name of Object.keys(zip.files)) {
			const f = zip.file(name);
			if (!f) continue; // directory entry
			expect(await f.async('string')).not.toContain('sk-secret-123');
		}
	});
});

describe('workspace-backup — restore semantics', () => {
	it('round-trips into an empty browser (decks, history, chat, settings)', async () => {
		seedWorkspace();
		const blob = await packWorkspace(T0);
		localStorage.clear();

		const summary = await restoreWorkspace(blob, T0 + 60_000);
		expect(summary.added).toBeGreaterThan(0);
		expect(loadSource('deck-aaa')).toContain('# Quarterly plan');
		expect(loadCheckpoints('deck-aaa')).toHaveLength(1);
		expect(loadChat('deck-aaa')[0]?.content).toBe('tighten the title');
		expect(loadSettings().headerFooter).toBe(true);
		expect(loadSettings().language).toBe('en-GB');
		expect(loadInstructions()).toBe('Board voice.');
		expect(loadDeckList().some((d) => d.title === 'Quarterly plan')).toBe(true);
	});

	it('an edited BUILT-IN restores in place on a fresh browser (the storage-loss case)', async () => {
		// The regression the live-drive caught: fresh indexes are pre-seeded with
		// built-in ids, so "id exists" must not read as "diverged" when the local
		// copy carries no edits.
		saveSource('welcome', '# Welcome SENTINEL edit');
		const blob = await packWorkspace(T0);
		localStorage.clear();
		const summary = await restoreWorkspace(blob, T0 + 60_000);
		expect(loadSource('welcome')).toBe('# Welcome SENTINEL edit');
		expect(summary.added).toBeGreaterThan(0);
		expect(loadDeckList().some((d) => d.title.includes('(restored)'))).toBe(false);
	});

	it('merge never overwrites: a diverged deck comes back as a "(restored)" copy', async () => {
		seedWorkspace();
		const blob = await packWorkspace(T0);
		// The same deck id evolves locally after the backup was taken.
		saveSource('deck-aaa', '# Quarterly plan\n\nEdited SINCE the backup.');

		const summary = await restoreWorkspace(blob, T0 + 60_000);
		expect(summary.restoredCopies).toBe(1);
		// Local edit intact:
		expect(loadSource('deck-aaa')).toContain('Edited SINCE the backup');
		// Backup copy beside it:
		const restored = loadDeckList().find((d) => d.title === 'Quarterly plan (restored)');
		expect(restored).toBeTruthy();
		expect(loadSource(restored!.id)).toContain('Hello.');
	});

	it('a restored copy is BYTE-FAITHFUL — the "(restored)" marker never edits the content', async () => {
		// Restore fidelity is the whole point of this path. The marker is a display tag on
		// the index row, never a rewrite of the deck: writing it into the heading (which
		// this briefly did) stripped inline markdown, truncated mid-word against a DISPLAY
		// cap, and could split a surrogate pair in the user's restored content.
		const heading = '# The `Q3` **board** review — every number that moved, and the three that matter 🎉';
		const backedUp = `${heading}\n\nfrom the backup`;
		saveSource('welcome', backedUp);
		const blob = await packWorkspace(T0);
		saveSource('welcome', `${heading}\n\ndiverged locally`);

		await restoreWorkspace(blob, T0 + 60_000);

		const copy = loadDeckList().find((d) => d.title.includes('(restored)'));
		expect(copy).toBeTruthy();
		expect(loadSource(copy!.id)).toBe(backedUp); // not one byte changed
		expect(loadSource(copy!.id)?.isWellFormed()).toBe(true); // no lone surrogate
	});

	it('the "(restored)" tag survives the deck being retitled — it is provenance, not a name', async () => {
		seedWorkspace();
		const blob = await packWorkspace(T0);
		saveSource('deck-aaa', '# Quarterly plan\n\nEdited SINCE the backup.');
		await restoreWorkspace(blob, T0 + 60_000);

		const copy = loadDeckList().find((d) => d.title.includes('(restored)'));
		saveSource(copy!.id, '# Renamed by its heading\n\nbody');
		expect(loadDeckList().find((d) => d.id === copy!.id)?.title).toBe('Renamed by its heading (restored)');
	});

	it('a readable decks/*.md copy is named from the deck HEADING, not the stale index label', async () => {
		// The label is a creation record, so a deck named by its heading (or one not
		// opened since) would otherwise export as `untitled-deck.md`.
		const d = createDeck('Untitled deck');
		saveSource(d.id, '# Q4 Board Pack\n\nbody');
		const { default: JSZip } = await import('jszip');
		const zip = await JSZip.loadAsync(await packWorkspace(T0));
		expect(Object.keys(zip.files).some((f) => f === 'decks/q4-board-pack.md')).toBe(true);
	});

	it('identical decks are skipped, not duplicated', async () => {
		seedWorkspace();
		const blob = await packWorkspace(T0);
		const before = loadDeckList().length;
		const summary = await restoreWorkspace(blob, T0 + 60_000);
		expect(summary.restoredCopies).toBe(0);
		expect(summary.added).toBe(0);
		expect(summary.skipped).toBeGreaterThan(0);
		expect(loadDeckList().length).toBe(before);
	});

	it('rejects a zip that is not a workspace backup', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('random.txt', 'nope');
		const blob = await zip.generateAsync({ type: 'blob' });
		await expect(restoreWorkspace(blob, T0)).rejects.toThrow(/manifest\.json missing/);
	});
});

describe('backup bookkeeping — last-backup + earned nudge', () => {
	it('tracks the last backup time', () => {
		expect(lastBackupAt()).toBeNull();
		markBackupTaken(T0);
		expect(lastBackupAt()).toBe(T0);
	});

	it('nudges only with 3+ edited decks and no recent backup, once per 14 days', () => {
		expect(shouldNudgeBackup(T0)).toBe(false); // nothing edited
		saveSource('welcome', '# a');
		saveSource('deck-x', '# b');
		expect(shouldNudgeBackup(T0)).toBe(false); // only 2 edited
		saveSource('deck-y', '# c');
		// 3 edited sources, but ids must be in the index to count:
		const state = exportStudioState();
		state.index.push({ id: 'deck-x', title: 'X', builtin: false }, { id: 'deck-y', title: 'Y', builtin: false });
		importStudioState(state, T0);
		expect(shouldNudgeBackup(T0)).toBe(true);
		markBackupTaken(T0);
		expect(shouldNudgeBackup(T0 + 86_400_000)).toBe(false); // fresh backup silences it
		expect(shouldNudgeBackup(T0 + 40 * 86_400_000)).toBe(true); // stale backup re-arms it
	});

	it('zip name is stable', () => {
		expect(WORKSPACE_ZIP_NAME).toBe('lattice-workspace.zip');
	});
});
