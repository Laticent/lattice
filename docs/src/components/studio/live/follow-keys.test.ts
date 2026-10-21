import { describe, expect, it } from 'vitest';
import { cleanView } from '@/lib/tavola/view';
import { describeMove, placeOf, settingsMoves, VIEW_KEYS, viewOf } from './follow-keys';

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
