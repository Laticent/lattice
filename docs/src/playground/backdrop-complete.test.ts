// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { backdropAxisPosition } from './slide-context.js';

// The line-local detector for completing an axis inside the nested `backdrop:`
// front-matter map. It fires on an indented line typing a bare word; the
// completer (complete.js) then confirms the enclosing block header is `backdrop:`.
describe('backdropAxisPosition', () => {
	it('matches an indented, partially-typed axis and reports the indent + word start', () => {
		expect(backdropAxisPosition('  stren')).toEqual({ indent: 2, from: 2, typed: 'stren' });
		expect(backdropAxisPosition('    ')).toEqual({ indent: 4, from: 4, typed: '' }); // bare indent (explicit trigger)
	});

	it('does NOT match a non-indented line, a value position, or prose', () => {
		expect(backdropAxisPosition('strength')).toBeNull(); // not indented
		expect(backdropAxisPosition('  strength: 0.5')).toBeNull(); // past the key (a value)
		expect(backdropAxisPosition('finish: atrium')).toBeNull();
		expect(backdropAxisPosition('')).toBeNull();
	});
});
