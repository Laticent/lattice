// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
	canEditClass,
	DIRECTIVE_KEYS,
	directiveKey,
	fenceRanges,
	getClassTokens,
	isDirectiveBody,
	isPaneMarkerBody,
	readClassDirective,
	setClassTokens,
	setGroupToken,
	tidyOutsideFences,
	toggleToken,
} from './slide-directives';

describe('directive classification', () => {
	it('recognizes engine directives (leading _ optional)', () => {
		expect(isDirectiveBody(' _class: kpi ')).toBe(true);
		expect(isDirectiveBody(' _focus: row 2 ')).toBe(true);
		expect(isDirectiveBody(' _paginate: false ')).toBe(true);
		expect(isDirectiveBody(' style: --fin-mark-text "AB" ')).toBe(true);
		expect(directiveKey(' _focusStyle: ring ')).toBe('focusStyle');
	});
	it('treats bare flag directives as directives, prose as notes', () => {
		expect(isDirectiveBody(' _build ')).toBe(true); // flag directive, no colon
		expect(isDirectiveBody(' _debug ')).toBe(true);
		expect(isDirectiveBody('note: pause here')).toBe(false);
		expect(isDirectiveBody('remember to smile')).toBe(false);
		// Prose that happens to start with a directive-ish word but has no colon.
		expect(isDirectiveBody('Present the numbers first')).toBe(false);
		expect(isDirectiveBody('Split the room, then ask')).toBe(false);
	});
	it('the vocabulary matches the engine KNOWN_DIRECTIVES (drift gate)', () => {
		const require = createRequire(import.meta.url);
		const { KNOWN_DIRECTIVES } = require('../../../lib/engine/directives.js');
		expect([...DIRECTIVE_KEYS].sort()).toEqual([...KNOWN_DIRECTIVES].sort());
	});
});

describe('getClassTokens / readClassDirective', () => {
	it('reads a single token and a multi-token value', () => {
		expect(getClassTokens('<!-- _class: kpi -->\n\n# Hi')).toEqual(['kpi']);
		expect(getClassTokens('<!-- _class: cards-grid dark scale-xl -->\n\n# Hi')).toEqual(['cards-grid', 'dark', 'scale-xl']);
	});
	it('returns [] with no directive, marks absent+editable', () => {
		const d = readClassDirective('# Just prose\n\nno class here');
		expect(d.tokens).toEqual([]);
		expect(d.present).toBe(false);
		expect(d.editable).toBe(true);
	});
	it('refuses the YAML array form (read-only)', () => {
		const d = readClassDirective('<!-- _class: [kpi, dark] -->\n\n# Hi');
		expect(d.editable).toBe(false);
		expect(d.reason).toBe('array-form');
	});
	it('refuses duplicate _class comments (read-only)', () => {
		const d = readClassDirective('<!-- _class: kpi -->\n\n# Hi\n\n<!-- _class: title -->');
		expect(d.editable).toBe(false);
		expect(d.reason).toBe('duplicate');
	});
	it('parses a compound comment, keeping other directives out of the token list', () => {
		expect(getClassTokens('<!-- _class: kpi dark\n_paginate: false -->\n\n# Hi')).toEqual(['kpi', 'dark']);
	});
});

describe('setClassTokens — span-surgical', () => {
	it('replaces the value, touching nothing else', () => {
		const chunk = '<!-- _class: kpi -->\n\n## Revenue\n\n1. $4M\n   - Net';
		const out = setClassTokens(chunk, ['kpi', 'dark']);
		expect(out).toBe('<!-- _class: kpi dark -->\n\n## Revenue\n\n1. $4M\n   - Net');
	});
	it('preserves unknown / hand-authored tokens verbatim and in order', () => {
		const chunk = '<!-- _class: kpi tint-corner at-tl my-local-thing -->\n\n# Hi';
		// Toggle `dark` on: append, keep the rest exactly.
		expect(toggleToken(chunk, 'dark')).toBe('<!-- _class: kpi tint-corner at-tl my-local-thing dark -->\n\n# Hi');
	});
	it('inserts a directive when absent', () => {
		// A slide with no record keeps the comment form: the form follows the slide until the cut (#3136).
		expect(setClassTokens('# Bare slide\n\nbody', ['content', 'dark'])).toBe('<!-- _class: content dark -->\n\n# Bare slide\n\nbody');
	});
	it('removes a sole-directive comment when cleared to empty', () => {
		expect(setClassTokens('<!-- _class: kpi -->\n\n# Hi', [])).toBe('# Hi');
	});
	it('keeps a compound comment (drops only the _class line) when cleared', () => {
		const out = setClassTokens('<!-- _class: kpi\n_paginate: false -->\n\n# Hi', []);
		expect(out).toContain('_paginate: false');
		expect(out).not.toMatch(/_class:/);
	});
	it('never lets a token close the comment early', () => {
		const out = setClassTokens('# Hi', ['kpi--></script>']);
		expect(out).not.toContain('--></script>'); // the value can't terminate the comment
		expect(out.match(/-->/g)?.length).toBe(1); // only the real terminator remains
	});
	it('is a no-op on a non-editable shape', () => {
		const dup = '<!-- _class: kpi -->\n\n# Hi\n\n<!-- _class: title -->';
		expect(setClassTokens(dup, ['x'])).toBe(dup);
		expect(canEditClass(dup)).toBe(false);
	});
});

describe('setGroupToken — mutually-exclusive axis', () => {
	const TONE = ['tone-pass', 'tone-warn', 'tone-fail', 'tone-skip'];
	it('swaps the group member, leaving other tokens untouched', () => {
		const chunk = '<!-- _class: kpi tone-warn dark -->\n\n# Hi';
		expect(getClassTokens(setGroupToken(chunk, TONE, 'tone-fail'))).toEqual(['kpi', 'dark', 'tone-fail']);
	});
	it('clears the group member with null', () => {
		const chunk = '<!-- _class: kpi tone-warn dark -->\n\n# Hi';
		expect(getClassTokens(setGroupToken(chunk, TONE, null))).toEqual(['kpi', 'dark']);
	});
});

describe('fence awareness', () => {
	it('ignores a _class comment shown inside a code fence', () => {
		const chunk = '<!-- _class: code -->\n\n```md\n<!-- _class: kpi -->\n```';
		expect(getClassTokens(chunk)).toEqual(['code']); // the fenced example is not read
		// Editing the real directive leaves the fenced example verbatim.
		const out = setClassTokens(chunk, ['code', 'dark']);
		expect(out).toContain('```md\n<!-- _class: kpi -->\n```');
		expect(out).toContain('<!-- _class: code dark -->');
	});
	it('marks fenced ranges', () => {
		const chunk = 'a\n```\nx\n```\nb';
		const ranges = fenceRanges(chunk);
		expect(ranges.length).toBe(1);
	});
	it('closes a fence only on a closer CommonMark accepts (zero to three columns)', () => {
		// A four-space run is fence BODY, so the range runs to the third fence line.
		const prose = '```\n    ```\n```\n\nPrice $x^2$';
		expect(fenceRanges(prose)).toEqual([[0, prose.indexOf('\n\nPrice')]]);
		// A tab reaches column 4 — body too. Three spaces is still a closer.
		const tab = '```\n\t```\n```';
		expect(fenceRanges(tab)).toEqual([[0, tab.length]]);
		const three = '```\n   ```\nafter';
		expect(fenceRanges(three)).toEqual([[0, three.indexOf('\nafter')]]);
	});
	it('closes a fence nested in a list item at the list content indent', () => {
		// The closer may sit up to three columns past the list's content column, which the
		// scanner bounds by the opener's column — else it would mask to the end.
		const chunk = '1. step\n\n      ```js\n      x()\n      ```\n\n<!-- _class: kpi -->';
		expect(fenceRanges(chunk)).toEqual([[chunk.indexOf('      ```js'), chunk.indexOf('\n\n<!--')]]);
		expect(getClassTokens(chunk)).toEqual(['kpi']);
		// Content column 2, closer at 5: markdown-it closes here, so the scanner must too.
		const shallow = '- a\n\n  ```\n  x\n     ```\n\n<!-- _class: kpi -->';
		expect(fenceRanges(shallow)).toEqual([[shallow.indexOf('  ```'), shallow.indexOf('\n\n<!--')]]);
		expect(getClassTokens(shallow)).toEqual(['kpi']);
	});
	it('preserves trailing spaces inside a fence when tidying', () => {
		const withHardBreak = '# Hi\n\n\n\n```\ncode   \n\n\nmore\n```';
		const out = tidyOutsideFences(withHardBreak);
		expect(out).toContain('code   \n'); // trailing spaces + blank run inside fence kept
		expect(out).toContain('# Hi\n\n```'); // blank run outside fence collapsed
	});
});

// Every marker spelling is read by the one shared reader (lib/core/meta-door.mjs `parsePaneMarker`, record note
// §5.4.1), so a record-form marker is structure, never the slide's speaker note.
describe('isPaneMarkerBody', () => {
	it('keeps the old spellings: `_pane:`, the one-component `pane:` alias and the `panes:` layout', () => {
		expect(isPaneMarkerBody(' _pane: bar no-title ')).toBe(true);
		expect(isPaneMarkerBody(' _pane: ')).toBe(true);
		expect(isPaneMarkerBody(' pane: list ')).toBe(true);
		expect(isPaneMarkerBody(' pane: list no-title ')).toBe(true);
		expect(isPaneMarkerBody(' panes: 35/65 ')).toBe(true);
	});
	it('reads a record that names a pane or a layout: bare, `@meta`, mixed, wrapped', () => {
		expect(isPaneMarkerBody(' {pane="bar no-title"} ')).toBe(true);
		expect(isPaneMarkerBody(' @meta{panes="60/40 stack"} ')).toBe(true);
		expect(isPaneMarkerBody(' {footer=x, pane="bar"} ')).toBe(true);
		expect(isPaneMarkerBody(' {pane="bar",\n  footer=x} ')).toBe(true);
	});
	it('reads the engine-internal comment the door writes', () => {
		expect(isPaneMarkerBody(' lat-meta: {"carry":false,"d":{"pane":"bar"}} ')).toBe(true);
	});
	it('leaves a note a note', () => {
		expect(isPaneMarkerBody(' pane: check the numbers ')).toBe(false);
		expect(isPaneMarkerBody(' _panes: 60/40 ')).toBe(false);
		expect(isPaneMarkerBody(' _pane: a\nb ')).toBe(false);
		expect(isPaneMarkerBody(' {layout=cards, footer="Q3"} ')).toBe(false);
		expect(isPaneMarkerBody(' remember the pane="x" joke ')).toBe(false);
	});
});

// A record slide edits as a directive slide does (record note step 3): the drawer writes INTO the record, keeping its
// typed fields and every other item as the author wrote it.
describe('the class drawer on a record slide', () => {
	const slide = '<!-- {layout=cards, footer="Q3, final", finish=ledger} -->\n\n# Hi';
	it('reads the record’s class and is editable', () => {
		expect(getClassTokens(slide)).toEqual(['cards', 'finish', 'finish-ledger']);
		expect(canEditClass(slide)).toBe(true);
	});
	it('a toggled modifier joins the record; a register word is written as its field', () => {
		expect(toggleToken(slide, 'compact')).toBe('<!-- {layout=cards, footer="Q3, final", finish=ledger, class=compact} -->\n\n# Hi');
		expect(toggleToken(slide, 'head-left')).toBe('<!-- {layout=cards, footer="Q3, final", finish=ledger, headline=left} -->\n\n# Hi');
	});
	it('removing a register word drops its field; swapping the layout keeps it typed', () => {
		expect(setClassTokens(slide, ['cards'])).toBe('<!-- {layout=cards, footer="Q3, final"} -->\n\n# Hi');
		expect(setGroupToken(slide, ['cards', 'kpi'], 'kpi')).toBe('<!-- {layout=kpi, footer="Q3, final", finish=ledger} -->\n\n# Hi');
	});
	it('a record that does not read is left as written; the class lands in a comment of its own', () => {
		// It applies nothing, so the slide has no class to show; the linter names it (`meta-record`).
		expect(canEditClass('<!-- {layout=cards, footer="open} -->\n\n# Hi')).toBe(true);
		expect(setClassTokens('<!-- {layout=cards, footer="open} -->\n\n# Hi', ['kpi'])).toContain('<!-- _class: kpi -->');
	});
});
