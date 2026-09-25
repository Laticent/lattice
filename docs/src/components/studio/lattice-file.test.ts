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

	// portable-packages §4: the saved assets a deck uses ride along as package folders, and
	// come back out through the same reader as a Library zip.
	it('carries package folders and reads them back as a parsed bundle', async () => {
		const theme = { type: 'theme' as const, name: 'probe-brand', files: { 'probe-brand.manifest.json': JSON.stringify({ name: 'probe-brand', type: 'theme', format: 1, label: 'Probe' }), 'probe-brand.css': "/* @theme probe-brand */\n@import 'lattice';\n:root { --accent: #2d4ed8; }\n" } };
		const blob = await exportLatticeBlob(SRC, 'My deck', COMMENTS, 99, [theme]);
		const { default: JSZip } = await import('jszip');
		const zip = await JSZip.loadAsync(blob);
		expect(Object.keys(zip.files).filter((f) => !zip.files[f].dir)).toEqual(expect.arrayContaining(['packages/theme/probe-brand/probe-brand.css', 'packages/theme/probe-brand/probe-brand.manifest.json']));
		const back = await readLatticeFile(blob);
		expect(back.source).toBe(SRC);
		expect(back.packages.themes.map((t) => t.name)).toEqual(['probe-brand']);
		expect(back.packages.themes[0].css).toBe(theme.files['probe-brand.css']);
	});

	it('a file with no packages (every .lattice before format 1 of packages) reads an empty bundle', async () => {
		const back = await readLatticeFile(await exportLatticeBlob(SRC, 'My deck', COMMENTS, 99));
		expect(back.packages.themes).toEqual([]);
		expect(back.packages.components).toEqual([]);
		expect(back.packages.refused).toEqual([]);
	});

	it('a carried package with code is refused by name, and the deck still opens', async () => {
		const bars = { type: 'component' as const, name: 'bars', files: { 'bars.manifest.json': JSON.stringify({ name: 'bars', type: 'component', format: 1 }), 'bars.styles.css': 'section.bars {}', 'bars.gallery.md': '<!-- _class: bars -->', 'bars.transform.js': 'module.exports = () => ""' } };
		const back = await readLatticeFile(await exportLatticeBlob(SRC, 'My deck', COMMENTS, 99, [bars]));
		expect(back.source).toBe(SRC);
		expect(back.packages.components).toEqual([]);
		expect(back.packages.refused.map((r) => r.name)).toContain('bars');
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

	// The declared-size check trusts the archive's own directory. A deck that UNDERSTATES its
	// size passed that check and was then inflated in full by an uncapped `entry.async()`; it
	// now reads through the same running budget as the packages, which stops at the cap
	// (followups.d/2336-p3-packages-trio-followups.md item 12).
	it('stops inflating a deck that understates its size, at the read budget', async () => {
		const { default: JSZip } = await import('jszip');
		const { MAX_INFLATED_BYTES } = await import('./zip-limits');
		const zip = new JSZip();
		zip.file('deck.md', 'a'.repeat(MAX_INFLATED_BYTES + 1024 * 1024)); // FIRST, so its local header sits at 0
		zip.file('manifest.json', JSON.stringify(buildLatticeManifest('Liar', [], 0)));
		const buf = new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
		const view = new DataView(buf.buffer);
		view.setUint32(22, 10, true); // the local header's uncompressed size
		let cd = 0;
		while (!(buf[cd] === 0x50 && buf[cd + 1] === 0x4b && buf[cd + 2] === 1 && buf[cd + 3] === 2)) cd++;
		view.setUint32(cd + 24, 10, true); // and the first central-directory entry's (deck.md)
		const liar = await JSZip.loadAsync(buf);
		expect((liar.files['deck.md'] as unknown as { _data: { uncompressedSize: number } })._data.uncompressedSize).toBe(10);
		await expect(readLatticeFile(new Blob([buf]))).rejects.toThrow(/too large to open/);
	});
});

describe('readLatticeFile — the parse cost of what the read budget admits', () => {
	it('refuses a manifest of a million values before JSON.parse builds them', async () => {
		const { default: JSZip } = await import('jszip');
		const { default: guard } = await import('../../../../lib/packages/json-guard.js');
		const zip = new JSZip();
		zip.file('deck.md', '# Deck');
		zip.file('manifest.json', `{"format":"lattice","version":1,"pad":[${'1,'.repeat(guard.MAX_JSON_VALUES)}1]}`);
		const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
		await expect(readLatticeFile(blob)).rejects.toThrow(/too large to open/);
	});
});
