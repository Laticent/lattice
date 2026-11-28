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
		expect(getClassTokens('<!-- @meta{layout=kpi} -->\n\n# Hi')).toEqual(['kpi']);
		expect(getClassTokens('<!-- @meta{layout=cards-grid, class=dark scale-xl} -->\n\n# Hi')).toEqual(['cards-grid', 'dark', 'scale-xl']);
	});
	it('returns [] with no directive, marks absent+editable', () => {
		const d = readClassDirective('# Just prose\n\nno class here');
		expect(d.tokens).toEqual([]);
		expect(d.present).toBe(false);
		expect(d.editable).toBe(true);
	});
	it('reads the old YAML array comment as no class: since the cut it sets nothing, so the drawer may write a record', () => {
		const d = readClassDirective('<!-- _class: [kpi, dark] -->\n\n# Hi');
		expect(d).toMatchObject({ tokens: [], present: false, editable: true });
	});
	it('refuses duplicate _class comments (read-only)', () => {
		const d = readClassDirective('<!-- @meta{layout=kpi} -->\n\n# Hi\n\n<!-- @meta{layout=title} -->');
		expect(d.editable).toBe(false);
		expect(d.reason).toBe('duplicate');
	});
	it('reads a two-line old comment as the engine does: since the cut it sets no class at all', () => {
		// The door blanks the old comment (record note §15), so the slide renders with no class and the drawer may write one.
		const chunk = '<!-- _class: kpi dark\n_paginate: false -->\n\n# Hi';
		expect(getClassTokens(chunk)).toEqual([]);
		expect(readClassDirective(chunk)).toMatchObject({ present: false, editable: true });
	});
});

describe('setClassTokens — span-surgical', () => {
	it('replaces the value, touching nothing else', () => {
		const chunk = '<!-- @meta{layout=kpi} -->\n\n## Revenue\n\n1. $4M\n   - Net';
		const out = setClassTokens(chunk, ['kpi', 'dark']);
		// The setting moves into a record, in the comment's place (record note §15).
		expect(out).toBe('<!-- @meta{layout=kpi, class=dark} -->\n\n## Revenue\n\n1. $4M\n   - Net');
	});
	it('preserves unknown / hand-authored tokens verbatim and in order', () => {
		const chunk = '<!-- @meta{layout=kpi, class=tint-corner at-tl my-local-thing} -->\n\n# Hi';
		// Toggle `dark` on: append, keep the rest exactly.
		expect(toggleToken(chunk, 'dark')).toBe('<!-- @meta{layout=kpi, class=tint-corner at-tl my-local-thing dark} -->\n\n# Hi');
	});
	it('inserts a directive when absent', () => {
		// Always a record, the one spelling the Studio writes (record note §15).
		expect(setClassTokens('# Bare slide\n\nbody', ['content', 'dark'])).toBe('<!-- @meta{layout=content, class=dark} -->\n\n# Bare slide\n\nbody');
	});
	it('removes a sole-directive comment when cleared to empty', () => {
		expect(setClassTokens('<!-- @meta{layout=kpi} -->\n\n# Hi', [])).toBe('# Hi');
	});
	it('leaves a two-line comment as written when cleared: it is read-only, as the engine reads one class', () => {
		const chunk = '<!-- _class: kpi\n_paginate: false -->\n\n# Hi';
		expect(setClassTokens(chunk, [])).toBe(chunk);
	});
	it('never lets a token close the comment early', () => {
		const out = setClassTokens('# Hi', ['kpi--></script>']);
		expect(out).not.toContain('--></script>'); // the value can't terminate the comment
		expect(out.split('-->').length - 1).toBe(1); // only the real terminator remains — counted by split, not a `-->` regex (js/bad-tag-filter, #1958 §3, §7)
	});
	it('is a no-op on a non-editable shape', () => {
		const dup = '<!-- @meta{layout=kpi} -->\n\n# Hi\n\n<!-- @meta{layout=title} -->';
		expect(setClassTokens(dup, ['x'])).toBe(dup);
		expect(canEditClass(dup)).toBe(false);
	});
});

describe('setGroupToken — mutually-exclusive axis', () => {
	const TONE = ['tone-pass', 'tone-warn', 'tone-fail', 'tone-skip'];
	it('swaps the group member, leaving other tokens untouched', () => {
		const chunk = '<!-- @meta{layout=kpi, class=tone-warn dark} -->\n\n# Hi';
		expect(getClassTokens(setGroupToken(chunk, TONE, 'tone-fail'))).toEqual(['kpi', 'dark', 'tone-fail']);
	});
	it('clears the group member with null', () => {
		const chunk = '<!-- @meta{layout=kpi, class=tone-warn dark} -->\n\n# Hi';
		expect(getClassTokens(setGroupToken(chunk, TONE, null))).toEqual(['kpi', 'dark']);
	});
});

describe('fence awareness', () => {
	it('ignores a _class comment shown inside a code fence', () => {
		const chunk = '<!-- @meta{layout=code} -->\n\n```md\n<!-- @meta{layout=kpi} -->\n```';
		expect(getClassTokens(chunk)).toEqual(['code']); // the fenced example is not read
		// Editing the real directive leaves the fenced example verbatim.
		const out = setClassTokens(chunk, ['code', 'dark']);
		expect(out).toContain('```md\n<!-- @meta{layout=kpi} -->\n```');
		expect(out).toContain('<!-- @meta{layout=code, class=dark} -->');
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
		const chunk = '1. step\n\n      ```js\n      x()\n      ```\n\n<!-- @meta{layout=kpi} -->';
		expect(fenceRanges(chunk)).toEqual([[chunk.indexOf('      ```js'), chunk.indexOf('\n\n<!--')]]);
		expect(getClassTokens(chunk)).toEqual(['kpi']);
		// Content column 2, closer at 5: markdown-it closes here, so the scanner must too.
		const shallow = '- a\n\n  ```\n  x\n     ```\n\n<!-- @meta{layout=kpi} -->';
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
	it('reads a record that names a pane or a layout: `@meta`, mixed, wrapped', () => {
		expect(isPaneMarkerBody(' @meta{pane="bar no-title"} ')).toBe(true);
		expect(isPaneMarkerBody(' @meta{panes="60/40 stack"} ')).toBe(true);
		expect(isPaneMarkerBody(' @meta{footer=x, pane="bar"} ')).toBe(true);
		expect(isPaneMarkerBody(' @meta{pane="bar",\n  footer=x} ')).toBe(true);
	});
	it('reads no pane from the retired bare record: the door blanks it (record note §15, D5 amended)', () => {
		expect(isPaneMarkerBody(' {pane="bar no-title"} ')).toBe(false);
		expect(isPaneMarkerBody(' {footer=x, pane="bar"} ')).toBe(false);
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
	const slide = '<!-- @meta{layout=cards, footer="Q3, final", finish=ledger} -->\n\n# Hi';
	it('reads the record’s class and is editable', () => {
		expect(getClassTokens(slide)).toEqual(['cards', 'finish', 'finish-ledger']);
		expect(canEditClass(slide)).toBe(true);
	});
	it('a toggled modifier joins the record; a register word is written as its field', () => {
		expect(toggleToken(slide, 'compact')).toBe('<!-- @meta{layout=cards, footer="Q3, final", finish=ledger, class=compact} -->\n\n# Hi');
		expect(toggleToken(slide, 'head-left')).toBe('<!-- @meta{layout=cards, footer="Q3, final", finish=ledger, headline=left} -->\n\n# Hi');
	});
	it('removing a register word drops its field; swapping the layout keeps it typed', () => {
		expect(setClassTokens(slide, ['cards'])).toBe('<!-- @meta{layout=cards, footer="Q3, final"} -->\n\n# Hi');
		expect(setGroupToken(slide, ['cards', 'kpi'], 'kpi')).toBe('<!-- @meta{layout=kpi, footer="Q3, final", finish=ledger} -->\n\n# Hi');
	});
	it('a record that does not read is left as written; the class lands in a record of its own', () => {
		// It applies nothing, so the slide has no class to show; the linter names it (`meta-record`).
		expect(canEditClass('<!-- @meta{layout=cards, footer="open} -->\n\n# Hi')).toBe(true);
		expect(setClassTokens('<!-- @meta{layout=cards, footer="open} -->\n\n# Hi', ['kpi'])).toContain('<!-- @meta{layout=kpi} -->');
	});
});
