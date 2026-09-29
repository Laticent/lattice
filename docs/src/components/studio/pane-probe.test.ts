import { describe, expect, it } from 'vitest';
import { mayHavePaneSlides } from './pane-probe';

describe('mayHavePaneSlides', () => {
	it('loads pane support for a marker, and for a layout with no marker (the outline form)', () => {
		expect(mayHavePaneSlides('<!-- _class: columns -->\n\n## T\n\n### Before\n\n- a\n\n### After\n\n- b\n')).toBe(true);
		expect(mayHavePaneSlides('<!-- _class: rows ratio-40-60 dark -->\n\n## T\n')).toBe(true);
		expect(mayHavePaneSlides('## T\n\n<!-- _pane: bar -->\n### A\n')).toBe(true);
		expect(mayHavePaneSlides('## T\n\n<!-- pane: bar -->\n')).toBe(true);
	});
	it('rejects every other deck', () => {
		expect(mayHavePaneSlides('<!-- _class: split-panel -->\n\n## Two columns of prose\n')).toBe(false);
		expect(mayHavePaneSlides('## Columns and rows in a table\n\n| a | b |\n')).toBe(false);
		expect(mayHavePaneSlides('')).toBe(false);
	});
});
