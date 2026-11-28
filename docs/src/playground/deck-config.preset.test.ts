// @vitest-environment node
// P0 of engineering/decisions/2026-11-20-deck-preset-study.md (§5 D1): the Playground's deck sheet shows what a preset
// RECOMMENDS for `theme`, `color-mode` and `drawing`, and the hand's baseline is the preset's (deck-config.js used to
// hard-code `boardroom`, now `clean`). No shipped preset sets them yet, so these arms run on a probe preset.
import { describe, expect, it } from 'vitest';
import { PRESETS, withPresetTable } from '../../../lib/core/front-matter-key.js';
import { readFrontMatter, writeFrontMatter } from './deck-config.js';

const PROBE = { label: 'Probe', desc: '', values: { theme: 'cuoio', 'color-mode': 'dark', drawing: 'sketch' } };
const withProbe = <T,>(f: () => T): T => withPresetTable({ ...PRESETS, probe: PROBE }, f);
const deck = (...fm: string[]) => ['---', 'marp: true', ...fm, '---', '', '# Hi'].join('\n');

describe('deck-config — a preset recommendation (P0)', () => {
	it('reads the preset hand as the row value, and the recommended palette and color mode for the Auto label', () => {
		withProbe(() => {
			// Auto FOLLOWS a recommended palette or color mode, so the rows stay at Auto ('') and the
			// recommendation rides beside them for the label.
			expect(readFrontMatter(deck('preset: probe'))).toMatchObject({ theme: '', 'color-mode': '', drawing: 'sketch', presetTheme: 'cuoio', presetColorMode: 'dark' });
			expect(readFrontMatter(deck('preset: probe', 'theme: indaco', 'drawing: clean'))).toMatchObject({ theme: 'indaco', presetTheme: '', drawing: 'clean' });
			expect(readFrontMatter(deck('preset: probe', 'class: light')).presetColorMode).toBe('');
			expect(readFrontMatter(deck('preset: probe', 'class: color-system')).presetColorMode).toBe('');
			expect(readFrontMatter(deck('preset: probe', 'color-mode: light')).presetColorMode).toBe('');
		});
		// Control: no recommendation, the old empty baselines.
		expect(readFrontMatter(deck('preset: editorial'))).toMatchObject({ theme: '', 'color-mode': '', drawing: '', presetTheme: '', presetColorMode: '' });
	});

	it('writes `clean` as the override under a preset that recommends another hand, and omits the preset hand', () => {
		withProbe(() => {
			expect(writeFrontMatter(deck('preset: probe'), 'drawing', 'clean')).toMatch(/^drawing: clean$/m);
			expect(writeFrontMatter(deck('preset: probe', 'drawing: clean'), 'drawing', 'sketch')).not.toMatch(/^drawing:/m);
		});
		// Control: with no preset hand, clean is the omitted baseline, as before.
		expect(writeFrontMatter(deck('preset: editorial'), 'drawing', 'clean')).not.toMatch(/^drawing:/m);
	});

	it('reads every key the way the engine does: comments, quotes, comment-only and the -dark pin', () => {
		withProbe(() => {
			// The engine renders the preset under a comment-only key, so the label names it.
			expect(readFrontMatter(deck('preset: probe', 'theme: # todo')).presetTheme).toBe('cuoio');
			expect(readFrontMatter(deck('preset: probe', 'color-mode: # todo')).presetColorMode).toBe('dark');
			// A comment after the class is not a class token: `lead # dark later` pins nothing.
			expect(readFrontMatter(deck('preset: probe', 'class: lead # dark later')).presetColorMode).toBe('dark');
			// A `-dark` theme with a trailing comment still pins the scheme.
			expect(readFrontMatter(deck('preset: probe', 'theme: cuoio-dark # c')).presetColorMode).toBe('');
			// A quoted preset name with a trailing comment is still the preset.
			expect(readFrontMatter(deck("preset: 'probe' # c")).presetTheme).toBe('cuoio');
			// A written theme with a comment is the author's.
			expect(readFrontMatter(deck('preset: probe', 'theme: indaco # brand')).presetTheme).toBe('');
		});
	});

	it('the Theme, Color mode and class rows read the value the engine reads, not the comment', () => {
		expect(readFrontMatter(deck('theme: # todo')).theme).toBe('');
		expect(readFrontMatter(deck('theme: cuoio  # brand')).theme).toBe('cuoio');
		expect(readFrontMatter(deck('color-mode: dark # pinned'))['color-mode']).toBe('dark');
		expect(readFrontMatter(deck('class: lead # dark later')).class).toBe('lead');
	});
});

