import { describe, expect, it } from 'vitest';
import { catalogFromComponents, suggestMembership } from './suggest';
import type { LensRegistry } from './types';

// A small slice of the real dist/docs/components.json classifications.
const CATALOG = catalogFromComponents([
	{ name: 'title', bucket: 'anchor', function: 'anchor', form: 'bookend' },
	{ name: 'closing', bucket: 'anchor', function: 'anchor', form: 'bookend' },
	{ name: 'divider', bucket: 'anchor', function: 'anchor', form: 'divider' },
	{ name: 'kpi', bucket: 'evidence', function: 'evidence', form: 'ledger' },
	{ name: 'stats', bucket: 'evidence', function: 'evidence', form: 'stack' },
	{ name: 'big-number', bucket: 'statement', function: 'statement', form: 'canvas' },
	{ name: 'content', bucket: 'statement', function: 'statement', form: 'canvas' },
	{ name: 'wifi', bucket: 'connect', function: 'statement', form: 'panel' },
	{ name: 'list-steps', bucket: 'progression', function: 'progression', form: 'timeline' },
	{ name: 'decision', bucket: 'comparison', function: 'comparison', form: 'canvas' },
	{ name: 'chart', bucket: 'chart', function: 'evidence', form: 'canvas' },
]);

const REG: LensRegistry = {
	default: 'full',
	lenses: [
		{ id: 'full', label: 'Full deck', base: 'all' },
		{ id: 'brief', label: 'Bottom line', base: 'none' },
		{ id: 'ask', label: 'The ask', base: 'none', single: true },
		{ id: 'story', label: 'The story', base: 'none' },
		{ id: 'evidence', label: 'Show the work', base: 'all' },
	],
};

const cls = (name: string) => `<!-- _class: ${name} -->\n# ${name}`;
const members = (s: ReturnType<typeof suggestMembership>, lens: string) => s.filter((x) => x.lensId === lens).map((x) => x.index);

describe('suggestMembership — the deterministic, no-AI heuristics', () => {
	const deck = ['title', 'content', 'kpi', 'wifi', 'list-steps', 'chart', 'divider', 'closing'].map(cls);
	const s = suggestMembership(deck, REG, CATALOG);

	it('brief = bookend frame + statements + headline metrics, minus connect logistics', () => {
		// title(0) closing(7) frame; content(1) statement; kpi(2) metric. wifi(3) is statement BUT connect → excluded.
		expect(members(s, 'brief').sort((a, b) => a - b)).toEqual([0, 1, 2, 7]);
	});
	it('ask picks exactly one slide — the last closing', () => {
		expect(members(s, 'ask')).toEqual([7]);
	});
	it('ask emits nothing when no candidate exists (never a low-confidence guess)', () => {
		const bland = suggestMembership([cls('content'), cls('chart')], REG, CATALOG);
		expect(members(bland, 'ask')).toEqual([]);
	});
	it('story = anchors (incl. divider) + progression + the first non-anchor', () => {
		// title(0) closing(7) divider(6) anchors; list-steps(4) progression; content(1) is first non-anchor.
		expect(members(s, 'story').sort((a, b) => a - b)).toEqual([0, 1, 4, 6, 7]);
	});
	it('evidence proposes EXCLUSIONS: decoration, connect logistics, dividers', () => {
		const ev = s.filter((x) => x.lensId === 'evidence');
		expect(ev.every((x) => x.member === false)).toBe(true);
		expect(ev.map((x) => x.index).sort((a, b) => a - b)).toEqual([3, 6]); // wifi(3) connect, divider(6)
	});
	it('is deterministic — same catalog in, same proposals out', () => {
		expect(suggestMembership(deck, REG, CATALOG)).toEqual(s);
	});
	it('a custom lens with no built-in rule gets no suggestions', () => {
		const withCustom: LensRegistry = { ...REG, lenses: [...REG.lenses, { id: 'legal', label: 'Legal', base: 'none' }] };
		expect(suggestMembership(deck, withCustom, CATALOG).some((x) => x.lensId === 'legal')).toBe(false);
	});
});
