// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { frontMatterName, PRESETS, withPresetTable } from '../../../../lib/core/front-matter-key.js';
import { AUTHOR_KEYS, applyPreset, clearPresetOverrides, PRESET_ENTRIES, PRESET_KEYS, PRESET_NAMES, PRESET_SAMPLE, presetAutoLabel, presetChanges, presetOf, presetRecommendation, presetSampleDeck, registerValue, writeRegister } from './deck-preset';

const deck = (...fm: string[]) => ['---', 'theme: indaco', ...fm, '---', '', '# Hi'].join('\n');
const fmOf = (src: string) => src.split('---')[1];

describe('deck-preset — the Studio agrees with the engine about a preset', () => {
	it('every engine preset has a picker entry, in the engine order', () => {
		expect(PRESET_ENTRIES.map((e) => e.name)).toEqual([...PRESET_NAMES]);
		for (const e of PRESET_ENTRIES) expect(e.label && e.blurb).toBeTruthy();
	});

	it('a row shows the preset value until the deck writes its own — the same answer the engine gives', () => {
		const src = deck('preset: editorial');
		for (const key of PRESET_KEYS) {
			// The engine answers null for a key the preset leaves at default; the row then shows
			// that default, so compare only where the engine has an opinion.
			const engine = frontMatterName(fmOf(src), key);
			if (engine !== null) expect(registerValue(src, key)).toBe(engine);
		}
		expect(registerValue(src, 'rule')).toBe('short');
		expect(registerValue(deck('preset: editorial', 'rule: none'), 'rule')).toBe('none');
		expect(registerValue(deck(), 'rule')).toBe('auto');
	});

	it('writing the preset value clears the override instead of restating it', () => {
		const src = deck('preset: editorial', 'rule: none');
		expect(writeRegister(src, 'rule', 'short')).toBe(deck('preset: editorial'));
		// The engine default is a real override under a preset that changes it…
		expect(writeRegister(deck('preset: editorial'), 'rule', 'auto')).toBe(deck('preset: editorial', 'rule: auto'));
		// …and a no-op write with no preset, exactly as before presets existed.
		expect(writeRegister(deck(), 'rule', 'auto')).toBe(deck());
	});

	it('counts the drift from the preset, and Reset clears exactly that family', () => {
		const src = deck('preset: brand', 'rule: none', 'eyebrow: dot', 'footer: Confidential');
		// `eyebrow: dot` restates Brand-forward's own value, so it is not a change.
		expect(presetChanges(src)).toEqual(['rule']);
		expect(clearPresetOverrides(src)).toBe(deck('preset: brand', 'footer: Confidential'));
	});

	it('picking a preset keeps what the author wrote; the default writes no key', () => {
		// The picker selects on arrow-key focus, so a pick must never delete the author's keys.
		const src = deck('preset: editorial', 'rule: none', 'lift: off');
		const picked = applyPreset(src, 'minimal');
		expect(picked).toBe(deck('preset: minimal', 'rule: none', 'lift: off'));
		// `rule: none` is Minimal's own value, so it stops counting as a change; `lift: off` too.
		expect(presetChanges(picked)).toEqual([]);
		expect(applyPreset(deck('preset: minimal'), 'classic')).toBe(deck());
	});

	it('an unknown preset name reads as the default, as the engine resolves it', () => {
		expect(presetOf(deck('preset: editorail'))).toBe('classic');
		expect(presetOf(deck('preset: Editorial'))).toBe('editorial');
	});

	it('reads a key the way the engine does — comment stripped, empty means the preset', () => {
		const ed = (...fm: string[]) => deck('preset: editorial', ...fm);
		for (const [src, rendered] of [
			[ed('rule: short  # house'), 'short'],
			[ed('rule:'), 'short'],
			[ed('rule: # todo'), 'short'],
			[ed('rule: none # x'), 'none'],
		] as const) {
			expect(frontMatterName(fmOf(src), 'rule')).toBe(rendered);
			expect(registerValue(src, 'rule')).toBe(rendered);
		}
		// A restated value with a comment is not a change; an empty key is not one either.
		expect(presetChanges(ed('rule: short  # house'))).toEqual([]);
		expect(presetChanges(ed('rule:'))).toEqual([]);
		expect(presetChanges(ed('rule: none'))).toEqual(['rule']);
	});

	it('a nested preset: is not the deck preset, for the Studio as for the engine', () => {
		const src = ['---', 'pptx:', '  preset: brand', '---', '', '# Hi'].join('\n');
		expect(presetOf(src)).toBe('classic');
		expect(frontMatterName(fmOf(src), 'spectrum')).toBeNull();
	});


	it('a picker tile renders the deck in its own theme and mode, at 16:9, showing the pure preset', () => {
		const fm = '---\ntheme: cuoio\ncolor-mode: dark\nsize: 4k\npreset: brand\nrule: none\nfinish: halo\n---';
		const tile = presetSampleDeck(fm, 'editorial');
		const head = tile.split('\n---\n')[0];
		// The deck's theme and mode ride along, so the tile looks like THIS deck…
		for (const kept of ['theme: cuoio', 'color-mode: dark']) expect(head).toContain(kept);
		// …but not its size: every tile box is 16:9, and a portrait deck would crop the cards away.
		expect(head).not.toContain('size:');
		// …the preset is the tile's, and the author's overrides are gone, so it shows the look itself.
		expect(head).toContain('preset: editorial');
		expect(head).not.toMatch(/rule:|finish:|preset: brand/);
		expect(tile.endsWith(PRESET_SAMPLE)).toBe(true);
		// Classic writes no key; a deck with no front matter still gets a well-formed block.
		expect(presetSampleDeck(fm, 'classic')).not.toContain('preset:');
		expect(presetSampleDeck('', 'minimal').startsWith('---\npreset: minimal\n---\n')).toBe(true);
	});
});

describe('deck-preset — Reset never reaches into a `style: |` block (followups.d/2391-p3)', () => {
	it('clears the real overrides and leaves CSS lines named like registers alone', () => {
		const src = deck('preset: brand', 'lift: off', 'style: |', '  lift: on', '  rule: short');
		expect(presetChanges(deck('preset: brand', 'style: |', '  lift: on', '  rule: short'))).toEqual([]);
		expect(clearPresetOverrides(src)).toBe(deck('preset: brand', 'style: |', '  lift: on', '  rule: short'));
	});
});

// P0 of engineering/decisions/2026-11-20-deck-preset-study.md: a preset RECOMMENDS `theme`, `color-mode`, `mode`,
// `marks` and `backdrop` (D1). No shipped preset sets them yet, so the arms below run on a probe preset.
const PROBE = { label: 'Probe', desc: 'test only', values: { theme: 'cuoio', 'color-mode': 'dark', marks: 'etch vivid', backdrop: '40 clear', rule: 'short' } };
const withProbe = <T,>(fn: () => T): T => withPresetTable({ ...PRESETS, probe: PROBE }, fn);
const bare = (...fm: string[]) => ['---', ...fm, '---', '', '# Hi'].join('\n');

describe('deck-preset — the recommendation keys (P0)', () => {
	it('reads a multi-word value whole, and a theme in its own case', () => {
		expect(registerValue(bare('marks: etch vivid'), 'marks')).toBe('etch vivid');
		expect(registerValue(bare('marks: "etch  Vivid"  # house'), 'marks')).toBe('etch vivid');
		expect(registerValue(bare('backdrop: 40 clear'), 'backdrop')).toBe('40 clear');
		expect(registerValue(bare('theme: NoirStudio'), 'theme')).toBe('NoirStudio');
		// Control: a single-word key still reads as the bare, lower-cased name it always did.
		expect(registerValue(bare('rule: Short'), 'rule')).toBe('short');
		// A top-level key nested under another block is not the deck's key.
		expect(registerValue(bare('foo:', '  backdrop: 40'), 'backdrop')).toBe('');
	});

	it('shows the preset recommendation until the deck writes its own', () => {
		withProbe(() => {
			const src = bare('preset: probe');
			expect(registerValue(src, 'theme')).toBe('cuoio');
			expect(registerValue(src, 'color-mode')).toBe('dark');
			expect(registerValue(src, 'marks')).toBe('etch vivid');
			expect(registerValue(src, 'backdrop')).toBe('40 clear');
			expect(registerValue(bare('preset: probe', 'theme: indaco'), 'theme')).toBe('indaco');
			// The old `chart-finish:` key still speaks for `marks:` and beats the preset, as in the engine.
			expect(registerValue(bare('preset: probe', 'chart-finish: tone'), 'marks')).toBe('tone');
			expect(registerValue(bare('preset: probe', 'marks: pigment', 'chart-finish: tone'), 'marks')).toBe('pigment');
		});
	});

	it('names what Auto follows: the recommendation, only while the deck leaves the key to the preset', () => {
		withProbe(() => {
			expect(presetRecommendation(bare('preset: probe'), 'theme')).toBe('cuoio');
			expect(presetRecommendation(bare('preset: probe'), 'color-mode')).toBe('dark');
			expect(presetRecommendation(bare('preset: probe', 'theme: indaco'), 'theme')).toBe(null);
			expect(presetRecommendation(bare('preset: probe', 'class: color-system'), 'color-mode')).toBe(null);
			expect(presetRecommendation(bare('preset: probe', 'theme: cuoio-dark'), 'color-mode')).toBe(null);
			expect(presetRecommendation(bare('foo:', '  preset: probe'), 'theme')).toBe(null);
		});
		expect(presetRecommendation(bare('preset: editorial'), 'theme')).toBe(null);
		// A quoted empty value, a comment-only value and a trailing comment read as the engine reads them.
		withProbe(() => {
			expect(presetRecommendation(bare('preset: probe', 'theme: ""'), 'theme')).toBe('cuoio');
			expect(presetRecommendation(bare('preset: probe', 'color-mode: # todo'), 'color-mode')).toBe('dark');
			expect(presetRecommendation(bare('preset: probe', 'theme: indaco # brand'), 'theme')).toBe(null);
		});
	});

	it('the drawer Auto head reads `preset: <label>` while the recommendation applies', () => {
		const cap = (v: string) => v[0].toUpperCase() + v.slice(1);
		withProbe(() => {
			expect(presetAutoLabel(bare('preset: probe'), 'theme', 'Indaco', cap)).toBe('preset: Cuoio');
			expect(presetAutoLabel(bare('preset: probe'), 'color-mode', "Theme's own", cap)).toBe('preset: Dark');
			expect(presetAutoLabel(bare('preset: probe', 'class: dark'), 'color-mode', "Theme's own", cap)).toBe("Theme's own");
		});
		expect(presetAutoLabel(bare('theme: cuoio'), 'theme', 'Indaco', cap)).toBe('Indaco');
		// A palette this host cannot render is not named: the preview falls back to the site's.
		withProbe(() => {
			expect(presetAutoLabel(bare('preset: probe'), 'theme', 'Indaco', cap, (n) => n !== 'cuoio')).toBe('Indaco');
		});
	});

	it('Reset and the drift count never touch the author theme or color mode', () => {
		expect(AUTHOR_KEYS).toEqual(['theme', 'color-mode']);
		withProbe(() => {
			const src = bare('preset: probe', 'theme: indaco', 'color-mode: light', 'marks: tone', 'rule: none');
			expect(presetChanges(src)).toEqual(['rule', 'marks']);
			expect(clearPresetOverrides(src)).toBe(bare('preset: probe', 'theme: indaco', 'color-mode: light'));
		});
		// Control: with no preset at all, Reset still keeps them.
		expect(clearPresetOverrides(bare('theme: indaco', 'color-mode: dark', 'rule: none'))).toBe(bare('theme: indaco', 'color-mode: dark'));
	});

	it('a picker tile keeps the deck theme and color mode, and drops every other override', () => {
		const fm = '---\ntheme: indaco\ncolor-mode: dark\nmarks: tone\nbackdrop: 80\n---';
		const tile = presetSampleDeck(fm, 'editorial');
		expect(tile).toContain('theme: indaco');
		expect(tile).toContain('color-mode: dark');
		expect(tile).not.toContain('marks:');
		expect(tile).not.toContain('backdrop:');
	});
});
