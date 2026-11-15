import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'acorn';
import { afterEach, describe, expect, it } from 'vitest';
import { GET } from '../pages/old-browser.js';
import { BROWSER_FLOOR } from './browser-floor';
import notice from './old-browser-notice.es5.js?raw';

// The landing page's old-browser notice (engineering/decisions/2026-11-12-device-capability-tiers.md §6.2), run exactly as
// it is served: the endpoint's output, evaluated in jsdom with a user agent from the table below. No real browser, clock
// or network is read (HARD RULE #32): the user agent is set per test, and the one timer (the entrance fade) is not waited on.

const served = await GET().text();

function run(ua: string, missing: string[] = ['CSS :has()']): HTMLElement {
	Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
	(window as unknown as { __latticeOldBrowser: string[] }).__latticeOldBrowser = missing;
	new Function(served)();
	const screen = document.querySelector<HTMLElement>('[data-testid="old-browser"]');
	if (!screen) throw new Error('the notice did not show');
	return screen;
}

const text = (screen: HTMLElement, sel: string) => Array.from(screen.querySelectorAll(sel)).map((e) => e.textContent);

afterEach(() => {
	document.body.innerHTML = '';
	document.head.innerHTML = '';
	sessionStorage.clear();
});

describe('the served notice', () => {
	it('is ES5, so the browsers it is for can parse it', () => {
		expect(() => parse(notice, { ecmaVersion: 5 })).not.toThrow();
		expect(() => parse(served, { ecmaVersion: 5 })).not.toThrow();
	});

	it('carries the floor table it is told to', () => {
		expect(served).toContain('"min":"16.4"');
		expect(served).not.toContain('</');
	});
});

describe('what it says to each browser', () => {
	it.each([
		['Safari 15.6 on a Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15', 'Safari 15.6', 'Safari 16.4 or newer', 'https://support.apple.com/en-us/102665', 'How to update Safari'],
		['an iPhone on iOS 15.7', 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1', 'iOS 15.7', 'iOS 16.4 or newer', 'https://support.apple.com/en-us/118575', 'How to update your iPhone or iPad'],
		['Chrome on iOS 16.1, which is Safari underneath', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0 Mobile/15E148 Safari/604.1', 'iOS 16.1', 'iOS 16.4 or newer', 'https://support.apple.com/en-us/118575', 'How to update your iPhone or iPad'],
		['Chrome 100 on Android', 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.79 Mobile Safari/537.36', 'Chrome 100', 'Chrome 111 or newer', 'https://play.google.com/store/apps/details?id=com.android.chrome', 'How to update Chrome'],
		['Chrome 105 on Windows 10', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36', 'Chrome 105', 'Chrome 111 or newer', 'https://support.google.com/chrome/answer/95414', 'How to update Chrome'],
		['Edge 109 on Windows 10', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.78', 'Edge 109', 'Edge 111 or newer', BROWSER_FLOOR.find((b) => b.id === 'edge')?.link, 'How to update Edge'],
		['Firefox 115 on a Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:115.0) Gecko/20100101 Firefox/115.0', 'Firefox 115', 'Firefox 128 or newer', 'https://support.mozilla.org/kb/update-firefox-latest-release', 'How to update Firefox'],
		['Samsung Internet 19', 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/19.0 Chrome/102.0.5005.125 Mobile Safari/537.36', 'Samsung Internet 19', 'Samsung Internet 22 or newer', 'https://play.google.com/store/apps/details?id=com.sec.android.app.sbrowser', 'How to update Samsung Internet'],
		['Opera 90', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36 OPR/90.0.4480.54', 'Opera 90', 'Opera 97 or newer', 'https://www.opera.com/download', 'How to update Opera'],
		['Chrome 109 on Windows 7', 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36', 'Windows 7', 'Windows 10 or later', 'https://support.microsoft.com/windows/windows-7-support-ended-on-january-14-2020-b75d4580-2cc7-895a-2c9c-1466d9a53962', 'About older Windows'],
	])('%s', (_name, ua, have, need, link, linkText) => {
		const screen = run(ua);
		expect(text(screen, '.lob-spec strong')).toEqual([have, need]);
		const primary = screen.querySelector<HTMLAnchorElement>('.lob-primary');
		expect(primary?.href).toBe(link);
		expect(primary?.textContent).toBe(linkText);
		expect(primary?.rel).toBe('noopener');
	});

	it('a browser whose user agent claims a new enough version gets the general advice, never a contradiction', () => {
		const screen = run('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
		expect(screen.querySelector('.lob-spec')).toBeNull();
		expect(text(screen, '.lob-steps')).toEqual(['Update to Chrome 111, Edge 111, Firefox 128, Safari 16.4, Samsung Internet 22, Opera 97 or newer, then come back.']);
		expect(screen.querySelector<HTMLAnchorElement>('.lob-primary')?.getAttribute('href')).toBe('/getting-started/#supported-browsers');
	});

	it('an unknown browser gets the general advice', () => {
		const screen = run('SomeBrowser/1.0');
		expect(screen.querySelector('.lob-spec')).toBeNull();
		expect(screen.querySelector('.lob-primary')?.textContent).toBe('Supported browsers');
	});

	it('names every missing feature, says why updating matters, and shows the slide for the mode', () => {
		document.documentElement.setAttribute('data-mode', 'dark');
		const screen = run('SomeBrowser/1.0', ['CSS :has()', 'CSS color-mix()', 'CSS @property']);
		expect(screen.textContent).toContain('Missing here: CSS :has(), CSS color-mix() and CSS @property.');
		expect(screen.textContent).toContain('stop getting security fixes');
		expect(screen.querySelector<HTMLImageElement>('figure img')?.getAttribute('src')).toBe('/old-browser/hero-dark.jpg');
		expect(screen.querySelector('h1')?.textContent).toBe('Lattice needs a newer browser.');
		expect(document.activeElement).toBe(screen.querySelector('h1'));
		document.documentElement.removeAttribute('data-mode');
	});
});

describe('the page beneath', () => {
	it('is blurred and hidden while the notice shows, and given back exactly on Continue anyway', () => {
		const main = document.createElement('main');
		const aside = document.createElement('aside');
		aside.setAttribute('aria-hidden', 'false');
		aside.style.filter = 'grayscale(1)';
		document.body.append(main, aside);
		const screen = run('SomeBrowser/1.0');
		expect(main.getAttribute('aria-hidden')).toBe('true');
		expect(main.style.filter).toContain('blur(');
		expect(main.style.pointerEvents).toBe('none');

		screen.querySelector<HTMLButtonElement>('.lob-go')?.click();
		expect(document.querySelector('[data-testid="old-browser"]')).toBeNull();
		expect(main.hasAttribute('aria-hidden')).toBe(false);
		expect(main.style.filter).toBe('');
		expect(aside.getAttribute('aria-hidden')).toBe('false');
		expect(aside.style.filter).toBe('grayscale(1)');
		expect(sessionStorage.getItem('lattice-old-browser-continue')).toBe('1');
	});
});

describe('the docs table', () => {
	it('lists every floor in browser-floor.ts', () => {
		const md = readFileSync(join(import.meta.dirname, '../content/docs/getting-started.md'), 'utf8');
		const section = md.slice(md.indexOf('## Supported browsers'), md.indexOf('## What to read next'));
		for (const b of BROWSER_FLOOR) {
			const row = b.id === 'ios' ? '| iPhone and iPad (every browser) | iOS 16.4 |' : `| ${b.id === 'safari' ? 'Safari (Mac)' : b.name} | ${b.min} |`;
			expect(section).toContain(row);
		}
	});
});
