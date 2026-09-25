import { describe, expect, it, vi } from 'vitest';
import type { Scene } from '@/lib/anima';
import { packBundle, packComponent, packFinish, packScene, packTheme, showcaseDeck, unpackBundle } from './asset-bundle';
import type { StudioComponent } from './component-library';
import { coerceRecipe, DEFAULT_RECIPE } from './finish-generate';
import type { StudioFinish } from './finish-library';
import type { StudioScene } from './scene-library';
import type { StudioTheme } from './theme-library';
import { declaredInflatedBytes, MAX_INFLATED_BYTES, MAX_ZIP_BYTES, MAX_ZIP_ENTRIES, readBudget } from './zip-limits';

const theme: StudioTheme = {
	id: 't1',
	name: 'harbor',
	label: 'Harbor',
	css: '@theme harbor { --accent: #2d4ed8; }',
	essentials: { accent: '#2d4ed8', bg: '#ffffff' },
	overrides: null,
	rampStrategy: null,
};
const comp: StudioComponent = { id: 'c1', name: 'callout', bucket: 'statement', css: 'section.callout { color: var(--accent); }', skeleton: '<!-- _class: callout -->\n\n## Hi', meta: { bucket: 'statement' } };
const finish: StudioFinish = { id: 'f1', name: 'mybrand', label: 'My Brand', css: 'section.finish.finish-mybrand { --fin-wash: none; }', recipe: { ...DEFAULT_RECIPE, mark: { type: 'monogram', placement: 'bottom-right', glyph: 'AB' } } };
const builtSpec = { source: 'built', duration: 6000, hero: 0.4, elements: [{ id: 'rotor', shape: 'cone', color: 'var(--accent)', motion: [{ verb: 'spin', axis: 'y', period: 6000 }] }] } as unknown as Scene;
const svgSpec = { source: 'svg', duration: 4000, hero: 1, asset: 'route.svg', elements: [{ id: 'p', pathRef: 'p1', color: 'var(--accent)', motion: [{ verb: 'draw', span: 1 }] }] } as unknown as Scene;
const scene: StudioScene = { id: 's1', name: 'gyroscope', label: 'Gyroscope', description: 'A rotor spinning in its rig', spec: builtSpec, poster: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="var(--accent)"/></svg>' };
const drawScene: StudioScene = { id: 's2', name: 'route', label: 'Route', spec: svgSpec, art: '<svg viewBox="0 0 100 60"><path id="p1" d="M10 30 H90" stroke="#000"/></svg>' };

describe('asset-bundle — pack/unpack roundtrip', () => {
	it('packs a theme and reads it back (name/label/essentials/css)', async () => {
		const round = await unpackBundle(await packTheme(theme));
		expect(round.themes).toHaveLength(1);
		expect(round.components).toHaveLength(0);
		expect(round.themes[0]).toMatchObject({ name: 'harbor', label: 'Harbor', essentials: theme.essentials, css: theme.css });
	});

	it('writes the package FOLDER — no envelope — with the showcase beside it', async () => {
		const pdf = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });
		const { default: JSZip } = await import('jszip');
		const zip = await JSZip.loadAsync(await packTheme(theme, pdf));
		expect(Object.keys(zip.files).filter((p) => !zip.files[p].dir).sort()).toEqual(['README.md', 'harbor-showcase.pdf', 'harbor/harbor.css', 'harbor/harbor.essentials.json', 'harbor/harbor.manifest.json']);
		expect(zip.file('manifest.json')).toBeNull();
		const manifest = JSON.parse(await zip.file('harbor/harbor.manifest.json')!.async('string'));
		expect(manifest).toEqual({ name: 'harbor', type: 'theme', format: 1, label: 'Harbor' });
	});

	it('packs a component and reads it back (css + gallery + bucket)', async () => {
		const round = await unpackBundle(await packComponent(comp));
		expect(round.components).toHaveLength(1);
		expect(round.components[0]).toMatchObject({ name: 'callout', bucket: 'statement', css: comp.css, skeleton: comp.skeleton });
		const { default: JSZip } = await import('jszip');
		const zip = await JSZip.loadAsync(await packComponent(comp));
		// The repo's file names: styles.css and gallery.md, not the old .css / .skeleton.md.
		expect(zip.file('callout/callout.styles.css')).toBeTruthy();
		expect(zip.file('callout/callout.gallery.md')).toBeTruthy();
	});

	it('packs a finish and reads it back (css + recipe roundtrip)', async () => {
		const round = await unpackBundle(await packFinish(finish));
		expect(round.themes).toHaveLength(0);
		expect(round.components).toHaveLength(0);
		expect(round.finishes).toHaveLength(1);
		expect(round.finishes[0].name).toBe('mybrand');
		expect(round.finishes[0].label).toBe('My Brand');
		// The CSS no longer travels: saveStudioFinish regenerates it from the recipe (§3.6),
		// which it always did — it discarded a zip's CSS even when there was one.
		expect(round.finishes[0].css).toBe('');
		// The structured recipe survives (coerced — so a hand-edited number stays in-vocab).
		expect(round.finishes[0].recipe.mark.type).toBe('monogram');
		expect(round.finishes[0].recipe.mark.glyph).toBe('AB');
	});

	it('a finish re-imports renderable even when the recipe JSON is absent (coerced)', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('mybrand.finish.css', finish.css);
		zip.file('manifest.json', JSON.stringify({ format: 'lattice-asset/1', kind: 'finish', items: [{ kind: 'finish', name: 'mybrand', label: 'My Brand', css: 'mybrand.finish.css', recipe: 'mybrand.recipe.json' }] }));
		const round = await unpackBundle(await zip.generateAsync({ type: 'blob' }));
		expect(round.finishes).toHaveLength(1);
		expect(round.finishes[0].recipe).toBeDefined(); // coerceRecipe gives a renderable default
	});

	it('packs a scene and reads it back (spec canonical + poster + engine)', async () => {
		const { default: JSZip } = await import('jszip');
		const blob = await packScene(scene);
		const zip = await JSZip.loadAsync(blob);
		// The package manifest records the engine (derived from source); the poster is a role file.
		const manifest = JSON.parse(await zip.file('gyroscope/gyroscope.manifest.json')!.async('string'));
		expect(manifest.type).toBe('motion');
		expect(manifest.engine).toBe('zdog');
		expect(zip.file('gyroscope/gyroscope.poster.svg')).toBeTruthy();
		const round = await unpackBundle(blob);
		expect(round.scenes).toHaveLength(1);
		expect(round.scenes[0].name).toBe('gyroscope');
		expect(round.scenes[0].label).toBe('Gyroscope');
		expect(round.scenes[0].spec.source).toBe('built');
		expect(round.scenes[0].poster).toContain('var(--accent)'); // token-preserving, not theme-frozen
	});

	it('round-trips an svg (Vivus) scene with its line-art', async () => {
		const round = await unpackBundle(await packScene(drawScene));
		expect(round.scenes).toHaveLength(1);
		expect(round.scenes[0].spec.source).toBe('svg');
		expect(round.scenes[0].art).toContain('<path');
	});

	it('drops a scene whose spec no longer validates (fail-closed, never coerced)', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('broken.scene.json', JSON.stringify({ source: 'built', duration: -1, hero: 2, elements: [] })); // invalid
		zip.file('manifest.json', JSON.stringify({ format: 'lattice-asset/1', kind: 'scene', items: [{ kind: 'scene', name: 'broken', label: 'Broken', engine: 'zdog', spec: 'broken.scene.json' }] }));
		const round = await unpackBundle(await zip.generateAsync({ type: 'blob' }));
		expect(round.scenes).toHaveLength(0);
	});

	it('packs a mixed bundle and reads back all four kinds', async () => {
		const round = await unpackBundle(await packBundle([{ theme }], [comp], [finish], [scene]));
		expect(round.themes.map((t) => t.name)).toEqual(['harbor']);
		expect(round.components.map((c) => c.name)).toEqual(['callout']);
		expect(round.finishes.map((f) => f.name)).toEqual(['mybrand']);
		expect(round.scenes.map((s) => s.name)).toEqual(['gyroscope']);
	});

	it('round-trips a bundle scene carrying ART via the sub-dir layout', async () => {
		const round = await unpackBundle(await packBundle([], [], [], [drawScene]));
		expect(round.scenes).toHaveLength(1);
		expect(round.scenes[0].spec.source).toBe('svg');
		expect(round.scenes[0].art).toContain('<path');
	});

	it('round-trips a bare scene (neither poster nor art)', async () => {
		const bare: StudioScene = { id: 's3', name: 'bare', label: 'Bare', spec: builtSpec };
		const round = await unpackBundle(await packScene(bare));
		expect(round.scenes).toHaveLength(1);
		expect(round.scenes[0].poster).toBeUndefined();
		expect(round.scenes[0].art).toBeUndefined();
	});

	it('rejects a zip without a Lattice manifest', async () => {
		const { default: JSZip } = await import('jszip');
		const z = new JSZip();
		z.file('hello.txt', 'not a lattice asset');
		await expect(unpackBundle(await z.generateAsync({ type: 'blob' }))).rejects.toThrow(/manifest/i);
	});

	// LINE ENDINGS. A component skeleton is MARKDOWN, and `addSlideAfter` splices it verbatim into
	// deck source — so a CRLF skeleton in an imported zip produces a mixed-EOL deck that is then
	// persisted and shared out that way. The zip is external input, so `unpackBundle` normalizes
	// at the unpack. This asserts on the UNPACKED value rather than a round-trip through our own
	// packer, because our packer never emits CRLF: the case only arises from a zip built
	// elsewhere, which is exactly the one a round-trip test cannot reach.
	it('normalizes a CRLF skeleton at the unpack — CSS is deliberately left alone', async () => {
		const { default: JSZip } = await import('jszip');
		const z = new JSZip();
		const skeletonCRLF = '<!-- _class: callout -->\r\n\r\n# Heads up\r\n\r\nBody.\r\n';
		const cssCRLF = 'section.callout {\r\n  color: var(--text);\r\n}\r\n';
		z.file('callout.skeleton.md', skeletonCRLF);
		z.file('callout.css', cssCRLF);
		z.file('manifest.json', JSON.stringify({
			format: 'lattice-asset/1',
			kind: 'component',
			items: [{ kind: 'component', name: 'callout', bucket: 'statement', css: 'callout.css', skeleton: 'callout.skeleton.md' }],
		}));
		const round = await unpackBundle(await z.generateAsync({ type: 'blob' }));
		expect(round.components).toHaveLength(1);
		expect(round.components[0].skeleton).toBe('<!-- _class: callout -->\n\n# Heads up\n\nBody.\n');
		expect(/\r/.test(round.components[0].skeleton)).toBe(false);
		// CSS is NOT normalized — it is never spliced into markdown and the browser is
		// indifferent to its line endings. Pinned so the asymmetry is deliberate, not an oversight.
		expect(round.components[0].css).toBe(cssCRLF);
	});

	it('a lone-CR skeleton is covered too, which a reader-style `\\r?\\n` could not be', async () => {
		const { default: JSZip } = await import('jszip');
		const z = new JSZip();
		z.file('callout.skeleton.md', '<!-- _class: callout -->\r\r# Heads up\r');
		z.file('callout.css', 'section.callout { color: var(--text); }');
		z.file('manifest.json', JSON.stringify({
			format: 'lattice-asset/1',
			kind: 'component',
			items: [{ kind: 'component', name: 'callout', bucket: 'statement', css: 'callout.css', skeleton: 'callout.skeleton.md' }],
		}));
		const round = await unpackBundle(await z.generateAsync({ type: 'blob' }));
		expect(round.components[0].skeleton).toBe('<!-- _class: callout -->\n\n# Heads up\n');
	});

	it('showcase deck exercises the engine range', () => {
		const d = showcaseDeck('Harbor');
		for (const cls of ['title', 'kpi', 'journey', 'diagram', 'split-panel', 'closing']) expect(d).toContain(`_class: ${cls}`);
		expect(d).toContain('```mermaid');
		expect(d).toContain('# Harbor');
	});
});

// An asset zip is a file from anyone, and until 2026-09 this import had no size caps
// (`.lattice` import always had them). The same caps now apply to both (`zip-limits.ts`).
describe('asset-bundle — refuses an oversized zip', () => {
	it('refuses an archive larger than the on-disk cap before opening it', async () => {
		const big = new Blob([new Uint8Array(MAX_ZIP_BYTES + 1)]);
		await expect(unpackBundle(big)).rejects.toThrow(/too large/);
	});

	it('refuses an archive whose entries declare more than the inflated cap (a deflate bomb)', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('manifest.json', JSON.stringify({ format: 'lattice-asset/1', kind: 'bundle', items: [{ kind: 'component', name: 'x', css: 'bomb.css', skeleton: 'x.md' }] }));
		// Compresses to a few KB, inflates past the cap.
		zip.file('bomb.css', 'a'.repeat(MAX_INFLATED_BYTES + 1));
		const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
		expect(blob.size).toBeLessThan(MAX_ZIP_BYTES);
		await expect(unpackBundle(blob)).rejects.toThrow(/too large/);
	});

	it('refuses an archive with more entries than the cap', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('manifest.json', JSON.stringify({ format: 'lattice-asset/1', kind: 'bundle', items: [] }));
		for (let i = 0; i < MAX_ZIP_ENTRIES; i++) zip.file(`f${i}.txt`, '');
		await expect(unpackBundle(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/too large/);
	});

	it('does not count a showcase PDF the import never opens', async () => {
		// Library bulk export writes a showcase PDF per theme, and `unpackBundle` never
		// reads it. A large export of your own must not be refused on re-import for bytes
		// nobody inflates.
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('manifest.json', JSON.stringify({ format: 'lattice-asset/1', kind: 'bundle', items: [{ kind: 'theme', name: 'harbor', label: 'Harbor', css: 'harbor.css', showcase: 'harbor-showcase.pdf' }] }));
		zip.file('harbor.css', theme.css);
		zip.file('harbor-showcase.pdf', 'a'.repeat(MAX_INFLATED_BYTES + 1));
		const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
		const round = await unpackBundle(blob);
		expect(round.themes).toHaveLength(1);
	});

	it('stops the INFLATE at the read budget when an entry understates its size', async () => {
		// The declared-size check trusts the archive's directory. The budget charges each
		// chunk as it inflates, so an entry that lies about its size stops at the cap instead
		// of inflating in full first (lib/packages/zip-read.js).
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('big.css', 'a'.repeat(4 * 1024 * 1024));
		const buf = new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
		const view = new DataView(buf.buffer);
		view.setUint32(22, 10, true); // the local header's uncompressed size
		let cd = buf.length - 4;
		while (!(buf[cd] === 0x50 && buf[cd + 1] === 0x4b && buf[cd + 2] === 1 && buf[cd + 3] === 2)) cd--;
		view.setUint32(cd + 24, 10, true); // and the central directory's
		const liar = await JSZip.loadAsync(buf);
		expect(declaredInflatedBytes(liar.files['big.css'])).toBe(10);
		const charge = readBudget('too large', 256 * 1024);
		await expect(charge(liar.file('big.css'))).rejects.toThrow('too large');
		// Two honest reads share one budget.
		const two = readBudget('too large', 10);
		const small = new JSZip().file('a', 'abcdef');
		await two(small.file('a'));
		await expect(two(small.file('a'))).rejects.toThrow('too large');
	});

	it('refuses a manifest with no item list rather than throwing a TypeError', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('manifest.json', JSON.stringify({ format: 'lattice-asset/1', kind: 'bundle' }));
		await expect(unpackBundle(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/lists no items/);
	});

	it('still imports a normal bundle under the caps', async () => {
		const round = await unpackBundle(await packBundle([{ theme }], [comp], [finish], [scene]));
		expect(round.themes).toHaveLength(1);
	});
});

// OLD ZIPS STILL IMPORT (portable-packages §8, phase 3): a `lattice-asset/1` zip exported
// before the package format is read one way by the legacy reader.
describe('asset-bundle — a lattice-asset/1 zip still imports', () => {
	it('reads a legacy theme + component bundle', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('themes/harbor/harbor.css', theme.css);
		zip.file('components/callout/callout.css', comp.css);
		zip.file('components/callout/callout.skeleton.md', comp.skeleton);
		zip.file('manifest.json', JSON.stringify({ format: 'lattice-asset/1', kind: 'bundle', items: [
			{ kind: 'theme', name: 'harbor', label: 'Harbor', essentials: theme.essentials, css: 'themes/harbor/harbor.css' },
			{ kind: 'component', name: 'callout', bucket: 'statement', css: 'components/callout/callout.css', skeleton: 'components/callout/callout.skeleton.md' },
		] }));
		const round = await unpackBundle(await zip.generateAsync({ type: 'blob' }));
		expect(round.themes[0]).toEqual({ name: 'harbor', label: 'Harbor', essentials: theme.essentials, css: theme.css });
		expect(round.components[0]).toEqual({ name: 'callout', bucket: 'statement', css: comp.css, skeleton: comp.skeleton });
	});
});

describe('asset-bundle — a lattice-asset/1 zip gets no looser a door', () => {
	it('keeps only hex colors in a legacy theme\'s essentials (they reach inline styles on the Studio page)', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('themes/harbor/harbor.css', theme.css);
		zip.file('manifest.json', JSON.stringify({ format: 'lattice-asset/1', kind: 'theme', items: [
			{ kind: 'theme', name: 'harbor', label: 'Harbor', essentials: { accent: 'url(https://evil.example/b.png)', bg: '#ffffff' }, css: 'themes/harbor/harbor.css' },
		] }));
		const round = await unpackBundle(await zip.generateAsync({ type: 'blob' }));
		expect(round.themes[0].essentials).toEqual({ bg: '#ffffff' });
	});
});

describe('asset-bundle — package zips from elsewhere', () => {
	it('refuses a code package by name instead of importing it without its transform', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('bar/bar.manifest.json', JSON.stringify({ name: 'bars', type: 'component', format: 1 }));
		zip.file('bar/bar.styles.css', 'section.bars{}');
		zip.file('bar/bar.gallery.md', '<!-- _class: bars -->');
		zip.file('bar/bar.transform.js', 'export default () => "<svg/>"');
		const round = await unpackBundle(await zip.generateAsync({ type: 'blob' }));
		expect(round.components).toHaveLength(0);
		expect(round.refused).toEqual([{ name: 'bars', why: expect.stringMatching(/carries code/) }]);
	});

	it('trusts the manifest, not the file names: a renamed folder imports under its manifest name', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		// A browser saved it as `harbor (1)`; the manifest inside still says harbor.
		zip.file('harbor (1)/harbor (1).manifest.json', JSON.stringify({ name: 'harbor', type: 'theme', format: 1, label: 'Harbor' }));
		zip.file('harbor (1)/harbor (1).css', theme.css);
		const round = await unpackBundle(await zip.generateAsync({ type: 'blob' }));
		expect(round.themes.map((t) => t.name)).toEqual(['harbor']);
		expect(round.notes.join(' ')).toMatch(/harbor \(1\)\.css → harbor\.css/);
	});
});

// Found by the P3a checker, each one a way a user's own data was lost or let through.
describe('asset-bundle — package import edge cases', () => {
	it('round-trips a finish whose name starts with a digit (the Studio has always saved "2024 Launch" as 2024-launch)', async () => {
		const f = { ...finish, name: '2024-launch', label: '2024 Launch' };
		const round = await unpackBundle(await packBundle([], [], [f], []));
		expect(round.refused).toEqual([]);
		expect(round.finishes.map((x) => x.name)).toEqual(['2024-launch']);
	});

	it('keeps only hex colors from a theme package’s essentials and overrides (HARD RULE #22)', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('harbor/harbor.manifest.json', JSON.stringify({ name: 'harbor', type: 'theme', format: 1 }));
		zip.file('harbor/harbor.css', theme.css);
		zip.file('harbor/harbor.essentials.json', JSON.stringify({
			essentials: { accent: '#2d4ed8', bg: 'red; background: url(https://evil.test/x.png)' },
			overrides: { 'surface-inverse': { light: 'red; background-image: url(https://evil.test/b.png); --x: 0', dark: '#101010' }, 'bad token;': { light: '#fff' } },
			rampStrategy: 'spectrum; x',
		}));
		const round = await unpackBundle(await zip.generateAsync({ type: 'blob' }));
		const t = round.themes[0];
		expect(t.essentials).toEqual({ accent: '#2d4ed8' });
		expect(t.overrides).toEqual({ 'surface-inverse': { dark: '#101010' } });
		expect(t.rampStrategy).toBeUndefined();
	});

	// followups.d/2336 item 17: the value cap on the package-folder path too. A theme's
	// essentials.json and a finish's recipe.json were parsed with a bare JSON.parse, and the raw
	// file was carried into the saved record, so a flood persisted into every later backup.
	it('reads a flooded essentials.json or recipe.json as empty, and does not carry the file', async () => {
		const { default: JSZip } = await import('jszip');
		const { default: guard } = await import('../../../../lib/packages/json-guard.js');
		const flood = `{"essentials":{"accent":"#2d4ed8"},"pad":[${'1,'.repeat(guard.MAX_JSON_VALUES)}1]}`;
		const zip = new JSZip();
		zip.file('harbor/harbor.manifest.json', JSON.stringify({ name: 'harbor', type: 'theme', format: 1 }));
		zip.file('harbor/harbor.css', theme.css);
		zip.file('harbor/harbor.essentials.json', flood);
		zip.file('brand/brand.manifest.json', JSON.stringify({ name: 'brand', type: 'finish', format: 1, label: 'Brand' }));
		zip.file('brand/brand.recipe.json', flood);
		const round = await unpackBundle(await zip.generateAsync({ type: 'blob' }));
		const t = round.themes[0];
		expect(t.essentials).toBeNull(); // the accent inside the flood was not read
		expect(t.pkg?.files?.['essentials.json']).toBeUndefined();
		const f = round.finishes[0];
		expect(f.recipe).toEqual(coerceRecipe(undefined)); // the clamped default, as for a missing recipe
		expect(f.pkg?.files?.['recipe.json']).toBe('');
	});

	it('refuses a motion package whose scene.json is a flood, before JSON.parse builds it', async () => {
		const { default: JSZip } = await import('jszip');
		const { default: guard } = await import('../../../../lib/packages/json-guard.js');
		const zip = new JSZip();
		zip.file('orbit/orbit.manifest.json', JSON.stringify({ name: 'orbit', type: 'motion', format: 1 }));
		zip.file('orbit/orbit.scene.json', `{"source":"svg","pad":[${'1,'.repeat(guard.MAX_JSON_VALUES)}1]}`);
		const parse = vi.spyOn(JSON, 'parse');
		try {
			const round = await unpackBundle(await zip.generateAsync({ type: 'blob' }));
			expect(round.scenes).toEqual([]);
			expect(round.refused.map((r) => r.name)).toEqual(['orbit']);
			// The flood never reached JSON.parse: every call parsed something small.
			expect(parse.mock.calls.every(([text]) => String(text).length < 1_000_000)).toBe(true);
		} finally {
			parse.mockRestore();
		}
	});

	it('refuses a legacy (lattice-asset/1) zip whose manifest.json is a flood', async () => {
		const { default: JSZip } = await import('jszip');
		const { default: guard } = await import('../../../../lib/packages/json-guard.js');
		const zip = new JSZip();
		zip.file('manifest.json', `{"format":"lattice-asset/1","items":[],"pad":[${'1,'.repeat(guard.MAX_JSON_VALUES)}1]}`);
		await expect(unpackBundle(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/too large to import/);
	});

	it('reads a zip whose manifest sits at the ROOT (the files were zipped, not the folder)', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('harbor.manifest.json', JSON.stringify({ name: 'harbor', type: 'theme', format: 1 }));
		zip.file('harbor.css', theme.css);
		zip.file('README.md', '# not a package file');
		const round = await unpackBundle(await zip.generateAsync({ type: 'blob' }));
		expect(round.themes.map((x) => x.name)).toEqual(['harbor']);
	});

	it('names the component assets it leaves out instead of dropping them in silence', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('wall/wall.manifest.json', JSON.stringify({ name: 'wall', type: 'component', format: 1 }));
		zip.file('wall/wall.styles.css', 'section.wall{}');
		zip.file('wall/wall.gallery.md', '<!-- _class: wall -->');
		zip.file('wall/acme.svg', '<svg/>');
		const round = await unpackBundle(await zip.generateAsync({ type: 'blob' }));
		expect(round.components).toHaveLength(1);
		expect(round.notes.join(' ')).toMatch(/left out 1 asset file\(s\): acme\.svg/);
	});
});
