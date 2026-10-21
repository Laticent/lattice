// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { shouldAutoWelcome } from './welcome-state';

// The welcome card opens by itself only for a first-time visitor on the production site. A dev
// server, a PR preview and every e2e run must stay quiet, or each of them would fight a dialog.

describe('shouldAutoWelcome', () => {
	const prod = { toursOn: true, search: '', toursStamp: 'on', automated: false };
	// localStorage does not exist under the node environment, so `wasWelcomed()` reads "welcomed" (it
	// cannot remember, so it must not nag). The cases below that need "not welcomed" use ?welcome=1.
	it('never opens for a visitor who turned tours off, even when forced', () => {
		expect(shouldAutoWelcome({ ...prod, toursOn: false, search: '?welcome=1' })).toBe(false);
	});
	it('?welcome=1 forces it on any host, stamp or automation', () => {
		expect(shouldAutoWelcome({ toursOn: true, search: '?welcome=1', toursStamp: 'off', automated: true })).toBe(true);
	});
	it('stays quiet off the production stamp', () => {
		expect(shouldAutoWelcome({ ...prod, toursStamp: 'off' })).toBe(false);
		expect(shouldAutoWelcome({ ...prod, toursStamp: undefined })).toBe(false);
	});
	it('stays quiet under test automation', () => {
		expect(shouldAutoWelcome({ ...prod, automated: true })).toBe(false);
	});
	it('does not nag when storage cannot remember the visitor', () => {
		expect(shouldAutoWelcome(prod)).toBe(false);
	});
});
