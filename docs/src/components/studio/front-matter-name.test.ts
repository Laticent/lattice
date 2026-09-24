// @vitest-environment node
import { describe, expect, it } from 'vitest';
// The engine's reader (CommonJS) — the one the Studio's mirror must agree with.
import { frontMatterName } from '../../../../lib/core/front-matter-key.js';
import { getFrontMatterName } from './front-matter';

// Parity: the Inspector's register rows read through `getFrontMatterName`, and a row that
// disagrees with the engine shows one setting over a preview rendering another (#2087).
// Each value line is read both ways and must agree, with the engine's null as undefined.
const LINES = [
	'strict',
	'strict  # for the board pack',
	'spread # x',
	'off # x',
	'OFF',
	'"strict"',
	"'strict' # quoted, then a comment",
	'"a # b"',
	'  loose  ',
	'two words',
	'',
];

describe('getFrontMatterName ↔ engine frontMatterName', () => {
	for (const value of LINES) {
		it(`agrees on \`guards: ${value}\``, () => {
			const engine = frontMatterName(`guards: ${value}`, 'guards');
			const studio = getFrontMatterName(`---\nguards: ${value}\n---\n\n# x\n`, 'guards');
			expect(studio).toBe(engine ?? undefined);
		});
	}

	it('keeps case, so `player-motion: OFF` is not read as off (the engine compares exactly)', () => {
		expect(getFrontMatterName('---\nplayer-motion: OFF\n---\n', 'player-motion')).toBe('OFF');
	});

	it('an absent key is undefined', () => {
		expect(getFrontMatterName('---\ntitle: x\n---\n', 'guards')).toBeUndefined();
	});
});
