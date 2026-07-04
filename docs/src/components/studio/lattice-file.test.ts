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
		expect(back.source).toBe(SRC); // byte-for-byte
		expect(back.title).toBe('My deck');
		expect(back.comments).toEqual(COMMENTS);
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
});
