import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
	canEditClass,
	DIRECTIVE_KEYS,
	directiveKey,
	fenceRanges,
	getClassTokens,
	isDirectiveBody,
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
		const { KNOWN_DIRECTIVES } = require('../../../../lib/engine/directives.js');
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
	it('preserves trailing spaces inside a fence when tidying', () => {
		const withHardBreak = '# Hi\n\n\n\n```\ncode   \n\n\nmore\n```';
		const out = tidyOutsideFences(withHardBreak);
		expect(out).toContain('code   \n'); // trailing spaces + blank run inside fence kept
		expect(out).toContain('# Hi\n\n```'); // blank run outside fence collapsed
	});
});
