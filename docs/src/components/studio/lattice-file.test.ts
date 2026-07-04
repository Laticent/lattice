import { describe, expect, it } from 'vitest';
import { buildLatticeManifest, exportLatticeBlob, LATTICE_VERSION, parseLatticeManifest, readLatticeFile } from './lattice-file';
import type { SlideComment } from './slide-comments';

const COMMENTS: SlideComment[] = [
	{ id: 'a', slide: 1, author: 'Ada', body: 'Check this figure', createdAt: 1000, resolved: false },
	{ id: 'b', slide: 2, author: 'Ben', body: 'Fixed', createdAt: 2000, resolved: true },
];

const SRC = '---\ntheme: indaco\n---\n\n# Slide one\n\n<!-- describe: title -->\n\n---\n\n# Slide two\n';

describe('lattice-file', () => {
	it('builds a well-formed manifest', () => {
		const m = buildLatticeManifest('My deck', COMMENTS, 42);
		expect(m).toMatchObject({ format: 'lattice', version: LATTICE_VERSION, title: 'My deck', engine: 'lattice', generatedAt: 42 });
		expect(m.comments).toHaveLength(2);
	});

	it('round-trips source + comments losslessly through the zip', async () => {
		const blob = await exportLatticeBlob(SRC, 'My deck', COMMENTS, 99);
		const back = await readLatticeFile(blob);
		expect(back.source).toBe(SRC); // lossless for any well-formed text
		expect(back.title).toBe('My deck');
		expect(back.comments).toEqual(COMMENTS);
	});

	// The deflate-bomb guard reads JSZip's INTERNAL `_data.uncompressedSize`. If a
	// JSZip upgrade renames/restructures that field the guard silently fails open
	// (Number(undefined) || 0 → the cap is never hit). This test pins the field so
	// such an upgrade trips CI instead of quietly removing the protection.
	it('JSZip still exposes the entry uncompressed size the bomb-guard depends on', async () => {
		const { default: JSZip } = await import('jszip');
		const blob = await exportLatticeBlob(SRC, 'My deck', COMMENTS, 99);
		const zip = await JSZip.loadAsync(blob);
		const entry = zip.file('deck.md') as unknown as { _data?: { uncompressedSize?: number } };
		const size = entry?._data?.uncompressedSize;
		expect(typeof size).toBe('number');
		expect(Number.isFinite(size) && (size as number) > 0).toBe(true);
		// It must equal the real UTF-8 byte length of the source (the guard sums this).
		expect(size).toBe(new TextEncoder().encode(SRC).length);
	});

	it('parseLatticeManifest rejects non-Lattice JSON', () => {
		expect(() => parseLatticeManifest('{"format":"marp"}')).toThrow(/not a lattice/i);
		expect(() => parseLatticeManifest('not json')).toThrow(/unreadable/i);
	});

	it('parseLatticeManifest refuses a newer major format', () => {
		expect(() => parseLatticeManifest(JSON.stringify({ format: 'lattice', version: LATTICE_VERSION + 1 }))).toThrow(/newer Lattice/i);
	});

	it('tolerates a manifest with no comments (older/empty deck)', () => {
		const m = parseLatticeManifest(JSON.stringify({ format: 'lattice', version: 1, title: 'x' }));
		expect(m.comments).toEqual([]);
		expect(m.title).toBe('x');
	});

	it('readLatticeFile rejects a zip missing its parts', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('deck.md', SRC); // no manifest.json
		const blob = await zip.generateAsync({ type: 'blob' });
		await expect(readLatticeFile(blob)).rejects.toThrow(/missing its deck or manifest/i);
	});

	it('readLatticeFile rejects a non-zip blob (corrupt archive)', async () => {
		await expect(readLatticeFile(new Blob(['not a zip at all']))).rejects.toThrow(/not a valid archive/i);
	});

	it('rejects an invalid manifest version (non-integer / < 1) distinctly from a newer one', () => {
		expect(() => parseLatticeManifest(JSON.stringify({ format: 'lattice', version: 0 }))).toThrow(/version is invalid/i);
		expect(() => parseLatticeManifest(JSON.stringify({ format: 'lattice', version: 1.5 }))).toThrow(/version is invalid/i);
		expect(() => parseLatticeManifest(JSON.stringify({ format: 'lattice', version: -1 }))).toThrow(/version is invalid/i);
	});

	it('clamps a hostile manifest title (length + newlines)', () => {
		const m = parseLatticeManifest(JSON.stringify({ format: 'lattice', version: 1, title: `a${'x'.repeat(500)}\n\nb` }));
		expect(m.title.length).toBeLessThanOrEqual(120);
		expect(m.title).not.toContain('\n');
	});
});
