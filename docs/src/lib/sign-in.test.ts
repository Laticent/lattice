import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetSignIn, SIGN_IN_CHANNEL, SIGN_IN_RETURN_LS, signIn, webSignInCallback } from './sign-in.js';
import { openSignInWindow, SIGN_IN_WINDOW } from './sign-in-window.js';

// The popup sign-in, against jsdom's real BroadcastChannel and postMessage. The popup is a
// stand-in object, because jsdom has no second window; what this pins is the tab's half.

function fakePopup() {
	return { closed: false, location: { href: 'about:blank' }, close: vi.fn(function (this: { closed: boolean }) { this.closed = true; }), focus: vi.fn() };
}
const begin = vi.fn(async (cb: string) => `https://openrouter.ai/auth?callback_url=${encodeURIComponent(cb)}`);
const callbackUrl = (code: string) => `${webSignInCallback()}?code=${code}`;
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
	begin.mockClear();
	localStorage.clear();
});
afterEach(() => {
	_resetSignIn();
	vi.useRealTimers();
});

describe('signIn with a popup', () => {
	it('sends the popup to the service with the callback page as its callback', async () => {
		const popup = fakePopup();
		signIn(begin, 'http://localhost:3000/studio/', { popup: popup as unknown as Window });
		await tick();
		expect(begin).toHaveBeenCalledWith(webSignInCallback());
		expect(popup.location.href).toContain(encodeURIComponent(webSignInCallback()));
		expect(localStorage.getItem(SIGN_IN_RETURN_LS)).toBe('http://localhost:3000/studio/');
	});

	it('resolves with the callback URL the callback page broadcasts, and closes the popup', async () => {
		const popup = fakePopup();
		const result = signIn(begin, '/studio/', { popup: popup as unknown as Window });
		await tick();
		const page = new BroadcastChannel(SIGN_IN_CHANNEL);
		const acks: unknown[] = [];
		page.onmessage = (e) => acks.push(e.data);
		page.postMessage({ type: 'sign-in-callback', url: callbackUrl('abc') });
		await expect(result).resolves.toBe(callbackUrl('abc'));
		await new Promise((r) => setTimeout(r, 20));
		expect(acks).toEqual([{ type: 'sign-in-ack' }]);
		expect(popup.close).toHaveBeenCalled();
		expect(localStorage.getItem(SIGN_IN_RETURN_LS)).toBeNull();
		page.close();
	});

	it('ignores a callback URL that is not our callback page', async () => {
		const popup = fakePopup();
		const result = signIn(begin, '/studio/', { popup: popup as unknown as Window });
		await tick();
		const page = new BroadcastChannel(SIGN_IN_CHANNEL);
		page.postMessage({ type: 'sign-in-callback', url: `${location.origin}/studio/?code=stolen` });
		page.postMessage({ type: 'sign-in-callback', url: 'https://evil.example/sign-in/callback/?code=x' });
		await new Promise((r) => setTimeout(r, 20));
		page.postMessage({ type: 'sign-in-callback', url: callbackUrl('real') });
		await expect(result).resolves.toBe(callbackUrl('real'));
		page.close();
	});

	it('accepts the callback over window.opener postMessage too, from this origin only', async () => {
		const popup = fakePopup();
		const result = signIn(begin, '/studio/', { popup: popup as unknown as Window });
		await tick();
		window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', data: { type: 'sign-in-callback', url: callbackUrl('no') } }));
		window.dispatchEvent(new MessageEvent('message', { origin: location.origin, data: { type: 'sign-in-callback', url: callbackUrl('yes') } }));
		await expect(result).resolves.toBe(callbackUrl('yes'));
	});

	it('resolves null once the popup closes, and hands a late code to onLate', async () => {
		const popup = fakePopup();
		const onLate = vi.fn();
		const result = signIn(begin, '/studio/', { popup: popup as unknown as Window, onLate });
		await tick();
		popup.closed = true; // what a popup cut off by a COOP sign-in page reads as, too
		vi.advanceTimersByTime(600);
		await expect(result).resolves.toBeNull();
		const page = new BroadcastChannel(SIGN_IN_CHANNEL);
		page.postMessage({ type: 'sign-in-callback', url: callbackUrl('late') });
		await new Promise((r) => setTimeout(r, 20));
		expect(onLate).toHaveBeenCalledWith(callbackUrl('late'));
		page.close();
	});

	it('a second Connect while the popup is open waits on the same sign-in', async () => {
		const popup = fakePopup();
		const first = signIn(begin, '/studio/', { popup: popup as unknown as Window });
		const second = signIn(begin, '/studio/', { popup: popup as unknown as Window });
		await tick();
		expect(begin).toHaveBeenCalledTimes(1);
		expect(popup.focus).toHaveBeenCalled();
		const page = new BroadcastChannel(SIGN_IN_CHANNEL);
		page.postMessage({ type: 'sign-in-callback', url: callbackUrl('one') });
		await expect(first).resolves.toBe(callbackUrl('one'));
		await expect(second).resolves.toBe(callbackUrl('one'));
		page.close();
	});

	it('a new sign-in after a closed one starts fresh and drops the old late listener', async () => {
		const old = fakePopup();
		const onLate = vi.fn();
		const first = signIn(begin, '/studio/', { popup: old as unknown as Window, onLate });
		await tick();
		old.closed = true;
		vi.advanceTimersByTime(600);
		await expect(first).resolves.toBeNull();
		const popup = fakePopup();
		const second = signIn(begin, '/studio/', { popup: popup as unknown as Window });
		await tick();
		expect(begin).toHaveBeenCalledTimes(2);
		const page = new BroadcastChannel(SIGN_IN_CHANNEL);
		page.postMessage({ type: 'sign-in-callback', url: callbackUrl('two') });
		await expect(second).resolves.toBe(callbackUrl('two'));
		expect(onLate).not.toHaveBeenCalled();
		page.close();
	});

	it('closes the popup when building the sign-in URL fails', async () => {
		const popup = fakePopup();
		const failing = vi.fn(async () => { throw new Error('no crypto'); });
		await expect(signIn(failing, '/studio/', { popup: popup as unknown as Window })).rejects.toThrow('no crypto');
		expect(popup.close).toHaveBeenCalled();
	});
});

describe('openSignInWindow', () => {
	it('opens the named window with an empty URL, so a second Connect does not blank an open sign-in', () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		openSignInWindow();
		expect(open).toHaveBeenCalledWith('', SIGN_IN_WINDOW, expect.stringContaining('popup'));
		open.mockRestore();
	});
});

describe('signIn without a popup', () => {
	it('falls back to sending the page itself to the service', async () => {
		const assign = vi.fn();
		const original = window.location;
		Object.defineProperty(window, 'location', { configurable: true, value: { ...original, origin: original.origin, set href(v: string) { assign(v); } } });
		try {
			signIn(begin, 'http://localhost:3000/studio/');
			await tick();
			expect(begin).toHaveBeenCalledWith('http://localhost:3000/studio/');
			expect(assign).toHaveBeenCalledWith(expect.stringContaining('openrouter.ai/auth'));
		} finally {
			Object.defineProperty(window, 'location', { configurable: true, value: original });
		}
	});
});
