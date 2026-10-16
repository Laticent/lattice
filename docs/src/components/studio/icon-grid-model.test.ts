import { describe, expect, it } from 'vitest';
import { filterIcons, groupByCategory, iconEntries, iconInsertion } from './icon-grid-model';

const DATA = {
	category: { database: 'data', bucket: 'storage', 'database-export': 'data', function: 'compute' },
	icons: { function: [], bucket: [], database: [], 'database-export': [] },
};
const ALIASES = new Map([
	['database', 'also db'],
	['function', 'also fn, serverless'],
	['database-export', 'database export'],
]);

describe('icon grid model', () => {
	it('lists every drawn icon with its category and aliases, in the data order', () => {
		const e = iconEntries(DATA, ALIASES);
		expect(e.map((x) => x.name)).toEqual(['function', 'bucket', 'database', 'database-export']);
		expect(e[0]).toEqual({ name: 'function', category: 'compute', aliases: ['fn', 'serverless'] });
		// An info that is a gloss ("database export"), not an alias list, adds no alias.
		expect(e[3].aliases).toEqual([]);
		expect(iconEntries(null)).toEqual([]);
	});

	it('a search matches a name part, an alias or a category, every word', () => {
		const e = iconEntries(DATA, ALIASES);
		expect(filterIcons(e, 'db').map((x) => x.name)).toEqual(['database']);
		expect(filterIcons(e, 'export').map((x) => x.name)).toEqual(['database-export']);
		expect(filterIcons(e, 'serverless').map((x) => x.name)).toEqual(['function']);
		expect(filterIcons(e, 'data exp').map((x) => x.name)).toEqual(['database-export']);
		expect(filterIcons(e, 'storage').map((x) => x.name)).toEqual(['bucket']);
		expect(filterIcons(e, '  ')).toHaveLength(4);
		expect(filterIcons(e, 'zzz')).toEqual([]);
	});

	it('groups by category in first-seen order', () => {
		expect(groupByCategory(iconEntries(DATA)).map((g) => g.category)).toEqual(['compute', 'storage', 'data']);
	});

	it('inserts the whole span in prose, the notation inside a span, icon= inside a record', () => {
		const t = (before: string, after = '') => iconInsertion(before, 'bucket', after);
		expect(t('Raw files land in ')).toEqual({ back: 0, text: '`^{bucket}`' });
		expect(t('Raw files land in `')).toEqual({ back: 0, text: '^{bucket}' });
		expect(t('- `{S3')).toEqual({ back: 0, text: ', icon=bucket' });
		expect(t('- `{S3,')).toEqual({ back: 0, text: ' icon=bucket' });
		expect(t('- `{S3, ')).toEqual({ back: 0, text: 'icon=bucket' });
		expect(t('- `{')).toEqual({ back: 0, text: 'icon=bucket' });
		// A closed record and a spark's `~{` are not records to add to.
		expect(t('`{S3}` then ')).toEqual({ back: 0, text: '`^{bucket}`' });
		expect(t('`~{1,2')).toEqual({ back: 0, text: '^{bucket}' });
	});

	it('a half-typed icon is completed, not nested', () => {
		expect(iconInsertion('`^{', 'bucket')).toEqual({ back: 0, text: 'bucket}' });
		expect(iconInsertion('`^{bu', 'bucket')).toEqual({ back: 2, text: 'bucket}' });
		// The closing brace is already there: replace the partial name and leave the brace.
		expect(iconInsertion('`^{da', 'database', 'ta}`')).toEqual({ back: 2, text: 'database' });
	});

	it('a brace outside the caret\'s code span is not a record; an escaped backtick opens nothing', () => {
		expect(iconInsertion('`code {` then ', 'bucket')).toEqual({ back: 0, text: '`^{bucket}`' });
		expect(iconInsertion('Set {x', 'bucket')).toEqual({ back: 0, text: '`^{bucket}`' });
		expect(iconInsertion('a \\` b ', 'bucket')).toEqual({ back: 0, text: '`^{bucket}`' });
	});
});
