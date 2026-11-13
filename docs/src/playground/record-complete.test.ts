// @vitest-environment node
// Completion inside a slide record (`<!-- {layout=cards, footer=Q3} -->`, record note step 3): the record-side twin of
// the `_class:` completer, so a record slide completes as a directive slide does.
import { describe, expect, it } from 'vitest';
import { recordOptions } from './complete.js';
import { RECORD_FIELDS, RECORD_VALUES } from './grammar-vocab.js';
import { recordCompletion } from './slide-context.js';

const CATALOG = [
	{ name: 'cards', bucket: 'inventory', variants: ['compact', 'wide'] },
	{ name: 'kpi', bucket: 'evidence', variants: [] },
];
const labels = (o: Array<{ label: string }>) => o.map((x) => x.label);

describe('recordCompletion: where the cursor sits in a record', () => {
	it('a field name after `{` or a comma', () => {
		expect(recordCompletion('<!-- {')).toEqual({ kind: 'field', from: 6, typed: '', fields: [] });
		expect(recordCompletion('<!-- @meta{layout=cards, fo')).toEqual({ kind: 'field', from: 25, typed: 'fo', fields: ['layout'] });
	});
	it('a value after `name=`, with the record so far', () => {
		expect(recordCompletion('<!-- {layout=cards, variant=co')).toMatchObject({ kind: 'value', name: 'variant', typed: 'co', record: { layout: 'cards' } });
		expect(recordCompletion('<!-- {class="cards dar')).toMatchObject({ kind: 'value', name: 'class', typed: 'dar', prior: ['cards'] });
	});
	it('a comma or brace inside quotes is the value’s; a closed record or a non-record is nothing', () => {
		expect(recordCompletion('<!-- {footer="Q3, review", hea')).toMatchObject({ kind: 'field', typed: 'hea', fields: ['footer'] });
		expect(recordCompletion('<!-- {layout=cards} ')).toBeNull();
		expect(recordCompletion('<!-- _class: ca')).toBeNull();
		expect(recordCompletion('# Heading {')).toBeNull();
	});
});

describe('recordOptions: what it offers', () => {
	it('fields: the typed class fields, the registers, the directive keys and the channels, minus those set', () => {
		const all = labels(recordOptions(recordCompletion('<!-- {'), CATALOG, []));
		for (const f of ['layout', 'variant', 'finish', 'headline', 'icon', 'footer', 'focus-style', 'note', 'say', 'pane', 'carry']) expect(all).toContain(f);
		expect(labels(recordOptions(recordCompletion('<!-- {layout=cards, '), CATALOG, []))).not.toContain('layout');
		expect(all).toHaveLength(new Set(RECORD_FIELDS.map((f) => f.name)).size);
	});
	it('values: components for layout, that layout’s variants, a register’s own words', () => {
		expect(labels(recordOptions(recordCompletion('<!-- {layout='), CATALOG, []))).toEqual(expect.arrayContaining(['cards', 'kpi']));
		expect(labels(recordOptions(recordCompletion('<!-- {layout=cards, variant='), CATALOG, []))).toEqual(['compact', 'wide']);
		expect(labels(recordOptions(recordCompletion('<!-- {headline='), CATALOG, []))).toEqual((RECORD_VALUES as Record<string, string[]>).headline);
		expect(labels(recordOptions(recordCompletion('<!-- {focus-style=ri'), CATALOG, []))).toContain('ring');
		expect(recordOptions(recordCompletion('<!-- {footer=Q'), CATALOG, [])).toEqual([]);
	});
});
