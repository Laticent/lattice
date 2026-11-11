import { describe, expect, it } from 'vitest';
import { parsePaneMarker } from '../../../../lib/core/meta-door.mjs';
import { mayHavePaneSlides } from './pane-probe';

describe('mayHavePaneSlides', () => {
	it('loads pane support for a marker, and for a layout with no marker (the outline form)', () => {
		expect(mayHavePaneSlides('<!-- _class: columns -->\n\n## T\n\n### Before\n\n- a\n\n### After\n\n- b\n')).toBe(true);
		expect(mayHavePaneSlides('<!-- _class: rows ratio-40-60 dark -->\n\n## T\n')).toBe(true);
		expect(mayHavePaneSlides('## T\n\n<!-- _pane: bar -->\n### A\n')).toBe(true);
		expect(mayHavePaneSlides('## T\n\n<!-- pane: bar -->\n')).toBe(true);
	});
	it('loads pane support for a record, bare or `@meta`, alone or mixed with other fields', () => {
		expect(mayHavePaneSlides('## T\n\n<!-- {pane="bar no-title"} -->\n')).toBe(true);
		expect(mayHavePaneSlides('## T\n\n<!-- @meta{panes="60/40 stack"} -->\n')).toBe(true);
		expect(mayHavePaneSlides('## T\n\n<!-- {footer=x, pane="bar"} -->\n')).toBe(true);
		expect(mayHavePaneSlides('## T\n\n<!-- {pane="bar",\n  footer=x} -->\n')).toBe(true);
		expect(mayHavePaneSlides('<!-- {layout="columns ratio-60-40"} -->\n\n## T\n')).toBe(true);
	});
	it('rejects every other deck', () => {
		expect(mayHavePaneSlides('<!-- _class: split-panel -->\n\n## Two columns of prose\n')).toBe(false);
		expect(mayHavePaneSlides('## Columns and rows in a table\n\n| a | b |\n')).toBe(false);
		expect(mayHavePaneSlides('<!-- {layout=cards, footer="Q3"} -->\n\n## T\n\npane="x" in prose\n')).toBe(false);
		expect(mayHavePaneSlides('')).toBe(false);
	});
	// The probe is a cheap regex and the door's reader is the authority (record note §5.4.1): a comment the reader takes
	// as a pane or a pane layout must never be rejected here, or the Studio never loads the page map for that deck.
	it('never rejects a comment the shared reader takes as a pane or a pane layout', () => {
		const spellings = [
			'<!-- _pane: bar no-title -->',
			'<!-- _pane: no-title -->',
			'<!-- pane: bar -->',
			'<!--_pane:bar-->',
			'<!-- {pane="bar no-title"} -->',
			'<!-- {pane=bar} -->',
			'<!-- {PANE="bar"} -->',
			'<!--{pane=bar}-->',
			'<!-- @meta{pane="list"} -->',
			'<!-- @meta{panes="60/40 stack"} -->',
			'<!-- {layout=cards, pane="bar", footer=x} -->',
			'<!-- {pane="bar",\n  footer=x} -->',
		];
		for (const s of spellings) {
			const read = parsePaneMarker(s);
			expect(read?.pane ?? read?.panes, s).toBeTruthy();
			if (read?.pane) expect(mayHavePaneSlides(`## T\n\n${s}\n`), s).toBe(true);
		}
	});
});
