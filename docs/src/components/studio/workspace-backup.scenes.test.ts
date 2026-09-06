// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// THE REGRESSION THIS FILE EXISTS FOR (2026-09-02-frame-model-for-motion.md §7c).
//
// `packWorkspace` built the backup from `listStudioScenes()`, which dropped every record whose
// spec no longer validated. So tightening the schema deleted a user's saved scenes from the
// Library AND from the only copy they had, with no message — restore onto a clean profile and
// they were gone. These tests fail against that behavior: the first because the zip carried no
// lane for an unreadable record, the second because a thrown read was flattened to `[]` and the
// backup reported `0 scene(s)` as though the shelf were empty.
//
// jsdom has no IndexedDB, so the scene reader is stubbed — against the real module every
// assertion here would pass vacuously on an empty shelf.

const listStoredScenes = vi.fn();
const putUnreadableScene = vi.fn();
vi.mock('./scene-library', () => ({
	listStoredScenes: (...a: unknown[]) => listStoredScenes(...a),
	putUnreadableScene: (...a: unknown[]) => putUnreadableScene(...a),
	saveStudioScene: vi.fn(),
}));

const { packWorkspace } = await import('./workspace-backup');

const T0 = 1_750_000_000_000;
const UNREADABLE = {
	valid: false as const,
	id: 'b',
	name: 'old-rotor',
	label: 'Old rotor',
	reason: 'duration must be > 0',
	specVersion: undefined,
	raw: { id: 'b', kind: 'scene', name: 'old-rotor', spec: { source: 'built', duration: -1 } },
};

async function zipOf(blob: Blob) {
	const { default: JSZip } = await import('jszip');
	return JSZip.loadAsync(blob);
}

describe('a scene this version cannot read still reaches the backup', () => {
	it('rides in its own file, verbatim, and is counted in the manifest', async () => {
		listStoredScenes.mockResolvedValue([UNREADABLE]);
		const zip = await zipOf(await packWorkspace(T0));

		const lane = zip.file('library-unreadable-scenes.json');
		expect(lane, 'the unreadable record must have a lane in the zip').not.toBeNull();

		const rows = JSON.parse(await lane!.async('string')) as { name: string; reason: string; record: unknown }[];
		expect(rows).toHaveLength(1);
		expect(rows[0].name).toBe('old-rotor');
		expect(rows[0].reason).toBe('duration must be > 0'); // why it could not be read, kept for the user
		expect(rows[0].record).toEqual(UNREADABLE.raw); // byte-for-byte, so a restore can hand it back

		const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { counts: { unreadableScenes?: number } };
		expect(manifest.counts.unreadableScenes).toBe(1);

		// And the human-readable README says so, rather than leaving the file unexplained.
		expect(await zip.file('README.md')!.async('string')).toMatch(/could not read/i);
	});

	it('adds no empty lane when every scene reads cleanly', async () => {
		listStoredScenes.mockResolvedValue([]);
		const zip = await zipOf(await packWorkspace(T0));
		expect(zip.file('library-unreadable-scenes.json')).toBeNull();
	});
});

describe('a failed shelf read is recorded, not silently reported as zero', () => {
	// The backup deliberately still SUCCEEDS here. A browser with no IndexedDB (private mode,
	// jsdom) has no scenes to lose, and refusing to back up the decks would trade a small
	// reporting lie for a much larger loss. What must not survive is the CLAIM of zero.
	it('marks the manifest and says so in the README, instead of claiming 0 scene(s)', async () => {
		listStoredScenes.mockRejectedValue(new Error('IndexedDB unavailable'));
		const zip = await zipOf(await packWorkspace(T0));

		const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { scenesUnavailable?: true };
		expect(manifest.scenesUnavailable).toBe(true);
		expect(await zip.file('README.md')!.async('string')).toMatch(/does not mean you have none/i);
	});

	it('does not mark it when the shelf reads cleanly and is simply empty', async () => {
		listStoredScenes.mockResolvedValue([]);
		const zip = await zipOf(await packWorkspace(T0));
		const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { scenesUnavailable?: true };
		expect(manifest.scenesUnavailable).toBeUndefined();
	});
});
