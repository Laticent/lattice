import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanView } from '@/lib/tavola/view';
import { FOCUS_ROWS, rowIdOf } from './follow-bus';
import { changedWords, describeMove, placeOf, placeWords, settingsMoves, VIEW_KEYS, viewOf } from './follow-keys';

describe('follow keys', () => {
	it('keep only places from the declared lists, and flags', () => {
		const { view, dropped } = cleanView({ panel: 'chat', view: 'article', presenting: 'yes', asking: true, note: 'secret' }, VIEW_KEYS);
		expect(view).toEqual({ view: 'article', asking: true });
		expect(dropped.sort()).toEqual(['panel', 'presenting']);
	});

	it('write no panel as `none`, which is not the same as saying nothing', () => {
		expect(viewOf({ panel: null, view: 'compose', presenting: false })).toEqual({ panel: 'none', view: 'compose', presenting: false });
		expect(cleanView(viewOf({ panel: null, view: 'compose', presenting: false }), VIEW_KEYS).dropped).toEqual([]);
	});

	it('read a place from the view, else from the older `doing`, else nothing', () => {
		expect(placeOf({ panel: 'coach', view: 'article' }, { panel: 'live', view: 'compose', presenting: false })).toEqual({ panel: 'coach', view: 'article' });
		expect(placeOf({ panel: 'none', view: 'compose' }, undefined)).toEqual({ panel: null, view: 'compose' });
		expect(placeOf({}, { panel: 'live', view: 'compose', presenting: false })).toEqual({ panel: 'live', view: 'compose' });
		// A view with only half the place is not a place: fall back rather than invent the other half.
		expect(placeOf({ panel: 'coach' }, { panel: 'live', view: 'compose', presenting: false })).toEqual({ panel: 'live', view: 'compose' });
		expect(placeOf({}, undefined)).toBeUndefined();
	});
});

describe('settings moves', () => {
	const here = (inspector: string | null, section: string | null) => ({ inspector, section });
	it('open the panel the leader has open, and its section, in that order', () => {
		expect(settingsMoves({ inspector: 'deck', section: 'brand' }, here('none', null))).toEqual([['inspector', 'deck'], ['section', 'brand']]);
	});
	it('move only the section when the panel already matches', () => {
		expect(settingsMoves({ inspector: 'deck', section: 'brand' }, here('deck', 'look'))).toEqual([['section', 'brand']]);
		expect(settingsMoves({ inspector: 'deck', section: 'brand' }, here('deck', 'brand'))).toEqual([]);
	});
	it('close the panel when the leader closes theirs, and send no section for a closed panel', () => {
		expect(settingsMoves({ inspector: 'none', section: 'brand' }, here('slide', 'notes'))).toEqual([['inspector', 'none']]);
	});
	it('say nothing about what the leader did not send, and nothing where no screen reports the panel', () => {
		expect(settingsMoves({}, here('deck', 'look'))).toEqual([]);
		expect(settingsMoves({ section: 'brand' }, here('deck', 'look'))).toEqual([]);
		expect(settingsMoves({ inspector: 'deck', section: 'brand' }, here(null, null))).toEqual([]);
	});
});

describe('describing a move', () => {
	const t = { panel: null, view: 'compose' } as const;
	it('names the panel and section, or the panel, or the view', () => {
		expect(describeMove(t, [['inspector', 'deck'], ['section', 'brand']])).toBe('opened Deck · Brand');
		expect(describeMove(t, [['section', 'notes']])).toBe('is in Notes');
		expect(describeMove({ panel: 'coach', view: 'compose' }, [])).toBe('opened Coach');
		expect(describeMove({ panel: null, view: 'article' }, [])).toBe('opened Read');
		expect(describeMove(t, [])).toBe('went back to the editor');
	});
});

describe('settings rows that can be marked', () => {
	const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
	const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	it('are exactly the rows the Studio writes by name, so a new row joins the list or is left out on purpose', () => {
		const rows = new Set<string>();
		for (const f of ['StudioShell.tsx', 'SlideContext.tsx']) for (const m of read(f).matchAll(/<(?:Field|TextRow|Row) label="([^"]+)"/g)) rows.add(slug(m[1]));
		for (const m of read('StudioShell.tsx').matchAll(/settingsWrite\(\s*[`'"]([^`'"$→]+?)\s*(?:→|[`'"])/g)) rows.add(slug(m[1]));
		expect([...FOCUS_ROWS].sort()).toEqual([...rows].sort());
	});

	it('reject a row that is not on the list, however it is spelled', () => {
		expect(rowIdOf('Card rail placement')).toBe('card-rail-placement');
		expect(rowIdOf('Header')).toBe('header');
		expect(rowIdOf('Section rail off')).toBe('section-rail');
		expect(rowIdOf('Section rail on')).toBe('section-rail');
		expect(rowIdOf('Amina’s secret plan')).toBeNull();
		expect(cleanView({ focus: 'amina-s-secret-plan' }, VIEW_KEYS).view).toEqual({});
		expect(cleanView({ focus: 'header', changed: { what: 'theme', n: 3 } }, VIEW_KEYS).view).toEqual({ focus: 'header', changed: { what: 'theme', n: 3 } });
	});

	it('keep the widest view Live sends within the limit, so no key is dropped for size', () => {
		const widest = {
			panel: 'library',
			view: 'compose',
			presenting: false,
			asking: true,
			inspector: 'slide',
			section: 'comments',
			focus: 'card-rail-placement',
			shown: 'setup',
			setupTab: 'General',
			changed: { what: 'card-rail-placement', n: 1_000_000 },
			present: { idx: 10_000, page: 10_000, lens: 'a'.repeat(64), hash: 'abcdef12' },
		};
		const { view, dropped } = cleanView(widest, VIEW_KEYS);
		expect(dropped).toEqual([]);
		expect(Object.keys(view)).toHaveLength(Object.keys(widest).length);
	});
});

describe('words for where someone is', () => {
	it('name the settings panel and section, or Setup and its tab, or nothing', () => {
		expect(placeWords({ inspector: 'deck', section: 'brand' })).toBe('in Deck · Brand');
		expect(placeWords({ inspector: 'slide' })).toBe('in Slide');
		expect(placeWords({ shown: 'setup', setupTab: 'AI' })).toBe('in Setup · AI');
		expect(placeWords({ inspector: 'none' })).toBeNull();
	});
	it('name the row someone changed, never its value', () => {
		expect(changedWords({ changed: { what: 'color-mode', n: 2 } })).toBe('changed Color mode');
		expect(changedWords({})).toBeNull();
	});
});
