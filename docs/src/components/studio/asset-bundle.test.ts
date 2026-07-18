import { describe, expect, it } from 'vitest';
import type { Scene } from '@/lib/anima';
import { packBundle, packComponent, packFinish, packScene, packTheme, showcaseDeck, unpackBundle } from './asset-bundle';
import type { StudioComponent } from './component-library';
import { DEFAULT_RECIPE } from './finish-generate';
import type { StudioFinish } from './finish-library';
import type { StudioScene } from './scene-library';
import type { StudioTheme } from './theme-library';

const theme: StudioTheme = {
	id: 't1',
	name: 'harbor',
	label: 'Harbor',
	css: '@theme harbor { --accent: #2d4ed8; }',
	essentials: { accent: '#2d4ed8', bg: '#ffffff' },
};
const comp: StudioComponent = { id: 'c1', name: 'callout', bucket: 'statement', css: 'section.callout { color: var(--accent); }', skeleton: '<!-- _class: callout -->\n\n## Hi' };
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
		expect(round.themes[0]).toEqual({ name: 'harbor', label: 'Harbor', essentials: theme.essentials, css: theme.css });
	});

	it('records the showcase PDF in the manifest when supplied', async () => {
		const pdf = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });
		const { default: JSZip } = await import('jszip');
		const zip = await JSZip.loadAsync(await packTheme(theme, pdf));
		expect(zip.file('harbor-showcase.pdf')).toBeTruthy();
		const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
		expect(manifest.items[0].showcase).toBe('harbor-showcase.pdf');
	});

	it('packs a component and reads it back (css + skeleton + bucket)', async () => {
		const round = await unpackBundle(await packComponent(comp));
		expect(round.components).toEqual([{ name: 'callout', bucket: 'statement', css: comp.css, skeleton: comp.skeleton }]);
	});

	it('packs a finish and reads it back (css + recipe roundtrip)', async () => {
		const round = await unpackBundle(await packFinish(finish));
		expect(round.themes).toHaveLength(0);
		expect(round.components).toHaveLength(0);
		expect(round.finishes).toHaveLength(1);
		expect(round.finishes[0].name).toBe('mybrand');
		expect(round.finishes[0].label).toBe('My Brand');
		expect(round.finishes[0].css).toBe(finish.css);
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
		// The manifest records the engine (derived from source) + the poster filename.
		const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
		expect(manifest.kind).toBe('scene');
		expect(manifest.items[0].engine).toBe('zdog');
		expect(manifest.items[0].poster).toBe('gyroscope.poster.svg');
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

	it('showcase deck exercises the engine range', () => {
		const d = showcaseDeck('Harbor');
		for (const cls of ['title', 'kpi', 'journey', 'diagram', 'split-panel', 'closing']) expect(d).toContain(`_class: ${cls}`);
		expect(d).toContain('```mermaid');
		expect(d).toContain('# Harbor');
	});
});
