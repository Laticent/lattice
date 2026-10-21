import { describe, expect, it } from 'vitest';
import { cleanView } from '@/lib/tavola/view';
import { placeOf, VIEW_KEYS, viewOf } from './follow-keys';

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
