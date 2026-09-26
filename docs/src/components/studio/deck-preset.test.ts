// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { frontMatterName } from '../../../../lib/core/front-matter-key.js';
import { applyPreset, clearPresetOverrides, PRESET_ENTRIES, PRESET_KEYS, PRESET_NAMES, PRESET_SAMPLE, presetChanges, presetOf, presetSampleDeck, registerValue, writeRegister } from './deck-preset';

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
