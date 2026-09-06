// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The §7c data-loss defect lived at the seam between the asset store and the scene reader, so
// the store is where this stubs. jsdom has no IndexedDB, so the real module would read as an
// empty shelf and every assertion below would pass vacuously.
const listAssets = vi.fn();
const putAsset = vi.fn(async (r: unknown) => ({ ...(r as object), id: 'stored-id' }));
vi.mock('@/components/studio/library/asset-store.js', () => ({
	listAssets: (kind: string) => listAssets(kind),
	putAsset: (record: unknown) => putAsset(record),
	deleteAsset: vi.fn(),
}));

const { SCENE_SPEC_VERSION, listStoredScenes, listStudioScenes, putUnreadableScene, saveStudioScene } = await import('./scene-library');

// A spec the schema accepts, and one it does not. `duration: -1` is the same rejection the
// existing suite uses, so this is a real parse failure rather than a shape we invented.
const goodSpec = { source: 'svg', duration: 4000, hero: 1, asset: 'route.svg', elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'draw', span: 1 }] }] };
const badSpec = { source: 'built', duration: -1, hero: 5, elements: [] };

const rows = () => [
	{ id: 'a', kind: 'scene', name: 'good-one', label: 'Good one', spec: goodSpec, specVersion: 1 },
	{ id: 'b', kind: 'scene', name: 'old-one', label: 'Old one', spec: badSpec },
];

beforeEach(() => {
	listAssets.mockReset();
	putAsset.mockClear();
});

describe('the §7c data-loss defect — a record that no longer validates is KEPT', () => {
	it('listStoredScenes returns the unreadable record instead of erasing it', async () => {
		listAssets.mockResolvedValue(rows());
		const stored = await listStoredScenes();
		expect(stored).toHaveLength(2);

		const bad = stored.find((s) => !s.valid);
		expect(bad).toBeDefined();
		// The reason is carried, not swallowed — this is what the UI shows the user.
		expect(bad && 'reason' in bad && bad.reason).toBeTruthy();
		// And the record rides verbatim, so an export can hand the work back untouched.
		expect(bad && 'raw' in bad && (bad.raw as { name: string }).name).toBe('old-one');
	});

	it('a record written before the stamp is "older", not "corrupt" — specVersion is undefined, not 0', async () => {
		listAssets.mockResolvedValue(rows());
		const bad = (await listStoredScenes()).find((s) => !s.valid);
		expect(bad && 'specVersion' in bad && bad.specVersion).toBeUndefined();
	});

	it('listStudioScenes still yields only renderable scenes, so no caller starts rendering a broken one', async () => {
		listAssets.mockResolvedValue(rows());
		const valid = await listStudioScenes();
		expect(valid).toHaveLength(1);
		expect(valid[0].name).toBe('good-one');
	});
});

describe('a failed read is not an empty shelf', () => {
	it('listStoredScenes REJECTS when the store throws — a backup must never read this as "nothing there"', async () => {
		listAssets.mockRejectedValue(new Error('IndexedDB unavailable'));
		await expect(listStoredScenes()).rejects.toThrow(/unavailable/i);
	});

	it('listStudioScenes keeps its forgiving contract for the UI callers that rely on it', async () => {
		listAssets.mockRejectedValue(new Error('IndexedDB unavailable'));
		await expect(listStudioScenes()).resolves.toEqual([]);
	});
});

describe('specVersion is stamped on the way out', () => {
	it('saveStudioScene writes the current version so a future schema change can migrate', async () => {
		listAssets.mockResolvedValue([]);
		await saveStudioScene({ name: 'fresh', spec: goodSpec as never });
		expect(putAsset).toHaveBeenCalledTimes(1);
		expect((putAsset.mock.calls[0][0] as { specVersion: number }).specVersion).toBe(SCENE_SPEC_VERSION);
	});
});

describe('putUnreadableScene — the restore half', () => {
	it('puts an unreadable record back without validating it', async () => {
		await putUnreadableScene({ id: 'b', kind: 'scene', name: 'old-one', label: 'Old one', spec: badSpec });
		expect(putAsset).toHaveBeenCalledTimes(1);
		const written = putAsset.mock.calls[0][0] as { name: string; kind: string; spec: unknown };
		expect(written.name).toBe('old-one');
		expect(written.kind).toBe('scene');
		expect(written.spec).toEqual(badSpec); // the spec survives unchanged — that is the point
	});

	it('STILL sanitizes poster/art, because the store-boundary guarantee (HARD RULE #22) holds on every write', async () => {
		await putUnreadableScene({ id: 'c', kind: 'scene', name: 'evil', spec: badSpec, art: '<svg><script>window.__x=1</script><path d="M0 0 H10"/></svg>' });
		const written = putAsset.mock.calls[0][0] as { art: string };
		expect(written.art).not.toMatch(/<script/i);
		expect(written.art).toContain('<path'); // benign vector survives
	});

	it('ignores a junk row rather than writing garbage', async () => {
		await putUnreadableScene(null);
		await putUnreadableScene({ kind: 'scene' }); // no name
		expect(putAsset).not.toHaveBeenCalled();
	});
});
