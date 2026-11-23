import { describe, expect, it } from 'vitest';
import { classEntries } from '../../../lib/core/class-entries.mjs';
import { firstSpotClass } from './first-spot-class.mjs';

// The prefix read must equal the whole-deck read (lib/core/class-entries.mjs), on every input: the Playground's picker
// asks it on each keystroke instead of the full scan.
const whole = (src: string) => classEntries(src).find((e: { spot: boolean }) => e.spot)?.value ?? '';

describe('firstSpotClass — the prefix read equals the whole-deck read', () => {
	it.each([
		['a comment inside front matter is no slide setting', '---\ntheme: indaco\n<!-- @meta{class=hero} -->\n---\n\n<!-- _class: cards -->\n'],
		['a class comment inside front matter, then more YAML', '---\ntheme: indaco\n<!-- _class: title -->\npaginate: true\n---\n\n<!-- _class: cards -->\n'],
		['front matter with a comment and no slide class', '---\ntheme: x\n<!-- _class: fake -->\n---\n\n# A\n'],
		['front matter never closed', '---\ntheme: x\n<!-- _class: fake -->\n'],
		['a byte-order mark and CRLF', '﻿---\r\ntheme: x\r\n---\r\n\r\n<!-- _class: kpi -->\r\n'],
		['a record', '<!-- @meta{layout=kpi, class=spotlight} -->\n\n## A\n'],
		['a fenced example before the real class', '```\n<!-- _class: secret -->\n```\n\n<!-- _class: real -->\n'],
		['a class past three comments that set nothing', '<!-- a -->\n<!-- b {x} -->\n<!-- class note -->\n<!-- d -->\n\n<!-- _class: late -->\n'],
	])('%s', (_label, src) => {
		expect(firstSpotClass(src)).toBe(whole(src));
	});
	it('reads the slide class, not the comment in the front matter', () => {
		expect(firstSpotClass('---\ntheme: indaco\n<!-- @meta{class=hero} -->\n---\n\n<!-- _class: cards -->\n')).toBe('cards');
	});
});
