// @vitest-environment node
// P0 of engineering/decisions/2026-11-20-deck-preset-study.md (§5 D1): the Playground's deck sheet shows what a preset
// RECOMMENDS for `theme`, `color-mode` and `mode`, and the hand's baseline is the preset's (deck-config.js used to
// hard-code `boardroom`). No shipped preset sets them yet, so these arms run on a probe preset.
import { describe, expect, it } from 'vitest';
import { PRESETS, withPresetTable } from '../../../lib/core/front-matter-key.js';
import { readFrontMatter, writeFrontMatter } from './deck-config.js';

const PROBE = { label: 'Probe', desc: '', values: { theme: 'cuoio', 'color-mode': 'dark', mode: 'sketch' } };
const withProbe = <T,>(f: () => T): T => withPresetTable({ ...PRESETS, probe: PROBE }, f);
const deck = (...fm: string[]) => ['---', 'marp: true', ...fm, '---', '', '# Hi'].join('\n');

describe('deck-config — a preset recommendation (P0)', () => {
	it('reads the preset palette, hand and color mode for a deck that names none', () => {
		withProbe(() => {
			expect(readFrontMatter(deck('preset: probe'))).toMatchObject({ theme: 'cuoio', 'color-mode': 'dark', mode: 'sketch' });
			expect(readFrontMatter(deck('preset: probe', 'theme: indaco', 'mode: boardroom'))).toMatchObject({ theme: 'indaco', mode: 'boardroom' });
			expect(readFrontMatter(deck('preset: probe', 'class: light'))['color-mode']).toBe('');
		});
		// Control: no recommendation, the old empty baselines.
		expect(readFrontMatter(deck('preset: editorial'))).toMatchObject({ theme: '', 'color-mode': '', mode: '' });
	});

	it('writes `boardroom` as the override under a preset that recommends another hand, and omits the preset hand', () => {
		withProbe(() => {
			expect(writeFrontMatter(deck('preset: probe'), 'mode', 'boardroom')).toMatch(/^mode: boardroom$/m);
			expect(writeFrontMatter(deck('preset: probe', 'mode: boardroom'), 'mode', 'sketch')).not.toMatch(/^mode:/m);
		});
		// Control: with no preset hand, boardroom is the omitted baseline, as before.
		expect(writeFrontMatter(deck('preset: editorial'), 'mode', 'boardroom')).not.toMatch(/^mode:/m);
	});
});
