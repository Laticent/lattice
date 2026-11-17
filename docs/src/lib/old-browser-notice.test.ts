import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'acorn';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../pages/old-browser.js';
import { BROWSER_FLOOR, supportedList } from './browser-floor';
import { OLD_BROWSER_CHECKS, oldBrowserCheckScript } from './old-browser-check';
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

describe('the inline check in <head>', () => {
	const inline = oldBrowserCheckScript('/old-browser.js');
	const supports = (fails: RegExp) => (c: string) => !fails.test(c);

	/** Run the inline check with a CSS.supports that answers no for what `fails` matches. */
	function check(fails: RegExp): HTMLScriptElement | null {
		const css = (window as unknown as { CSS?: unknown }).CSS;
		(window as unknown as { CSS: unknown }).CSS = { supports: supports(fails), registerProperty: () => {} };
		(globalThis as unknown as { structuredClone?: unknown }).structuredClone ??= () => null;
		try {
			new Function(inline)();
		} finally {
			(window as unknown as { CSS?: unknown }).CSS = css;
		}
		return document.head.querySelector<HTMLScriptElement>('script[src="/old-browser.js"]');
	}

	afterEach(() => {
		document.documentElement.removeAttribute('data-old-browser');
		delete (window as unknown as { __latticeOldBrowser?: unknown }).__latticeOldBrowser;
	});

	it('is ES5 as it is inlined, data included', () => {
		expect(() => parse(inline, { ecmaVersion: 5 })).not.toThrow();
		expect(inline).not.toMatch(/\bconst\b|\blet\b|=>/);
	});

	it('tests the same features as the Studio, with the same labels', () => {
		expect(OLD_BROWSER_CHECKS.map((c) => c.label)).toEqual(['CSS :has()', 'CSS container queries', 'structuredClone()', 'CSS color-mix()', 'CSS @property']);
	});

	it('does nothing in a browser that has every feature', () => {
		expect(check(/^$/)).toBeNull();
		expect(document.documentElement.hasAttribute('data-old-browser')).toBe(false);
	});

	it('marks the page and loads the notice when a feature is missing, naming what is missing', () => {
		expect(check(/:has\(|color-mix/)).not.toBeNull();
		expect(document.documentElement.hasAttribute('data-old-browser')).toBe(true);
		expect((window as unknown as { __latticeOldBrowser: string[] }).__latticeOldBrowser).toEqual(['CSS :has()', 'CSS color-mix()']);
	});

	it('marks the page "failed" when the notice cannot load, so the app can say it instead', () => {
		const script = check(/:has\(/);
		expect(document.documentElement.getAttribute('data-old-browser')).toBe('');
		script?.onerror?.(new Event('error'));
		expect(document.documentElement.getAttribute('data-old-browser')).toBe('failed');
	});

	describe('hides the page before its first paint, so the broken page never flashes', () => {
		const hider = () => document.getElementById('lattice-old-browser-veil');
		afterEach(() => {
			hider()?.remove();
			vi.useRealTimers();
		});

		it('only when a feature is missing', () => {
			check(/^$/);
			expect(hider()).toBeNull();
			check(/:has\(/);
			// No palette here, so no --bg: a plain light background, still a literal.
			expect(hider()?.textContent).toBe('html{background:#fff!important}body{visibility:hidden}');
		});

		it("paints the page's own --bg as a literal color, never a var() an old engine resolves (legacy Edge's mustard flash)", () => {
			const palette = document.createElement('style');
			palette.textContent = ':root{--bg:#faf7f2}';
			document.head.append(palette);
			check(/:has\(/);
			expect(hider()?.textContent).toBe('html{background:#faf7f2!important}body{visibility:hidden}');
			expect(hider()?.textContent).not.toContain('var(');
		});

		it('not once this tab chose Continue anyway', () => {
			sessionStorage.setItem('lattice-old-browser-continue', '1');
			check(/:has\(/);
			expect(hider()).toBeNull();
		});

		it('shows the page again when the notice cannot load', () => {
			const script = check(/:has\(/);
			script?.onerror?.(new Event('error'));
			expect(hider()).toBeNull();
		});

		it('shows the page again after 8 s if the notice never appears, and marks it "failed" so the app can say it', () => {
			vi.useFakeTimers();
			check(/:has\(/);
			vi.advanceTimersByTime(7999);
			expect(hider()).not.toBeNull();
			expect(document.documentElement.getAttribute('data-old-browser')).toBe('');
			vi.advanceTimersByTime(1);
			expect(hider()).toBeNull();
			expect(document.documentElement.getAttribute('data-old-browser')).toBe('failed');
		});

		it('a notice that arrives after the 8 s give-up clears the "failed" mark, so the app does not stack its own screen', () => {
			document.documentElement.setAttribute('data-old-browser', 'failed');
			run('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36');
			expect(document.documentElement.getAttribute('data-old-browser')).toBe('');
			document.documentElement.removeAttribute('data-old-browser');
		});

		it('the notice takes it away as it shows, with the page behind its solid veil and out of reach', () => {
			check(/:has\(/);
			expect(hider()).not.toBeNull();
			const main = document.createElement('main');
			document.body.append(main);
			const screen = run('SomeBrowser/1.0');
			// The page stays hidden by the notice's own rule; the hider keeps only <html>'s literal background, with
			// !important (legacy Edge painted <html> in the accent through :root), until Continue anyway.
			expect(hider()?.textContent).toBe('html{background:#fff!important}');
			expect(main.getAttribute('aria-hidden')).toBe('true');
			// Solid: nothing of the page can show through (no blur, no glow to bleed it).
			expect(main.style.filter).toBe('');
			expect(document.querySelector('.lob-glow')).toBeNull();
			screen.querySelector<HTMLButtonElement>('.lob-go')?.click();
			expect(hider()).toBeNull();
		});
	});

	it('marks the page but loads nothing once this tab chose Continue anyway', () => {
		sessionStorage.setItem('lattice-old-browser-continue', '1');
		expect(check(/:has\(/)).toBeNull();
		expect(document.documentElement.hasAttribute('data-old-browser')).toBe(true);
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
		['the original Edge 15 on Windows 10 (the owner saw it)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Safari/537.36 Edge/15.15063', 'Edge 15', 'Edge 111 or newer', 'https://support.microsoft.com/windows/update-windows-3c5ae7fc-9fb6-9af1-1984-b5e0412c556a', 'How to install Windows updates'],
		['Firefox 115 on a Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:115.0) Gecko/20100101 Firefox/115.0', 'Firefox 115', 'Firefox 128 or newer', 'https://support.mozilla.org/kb/update-firefox-latest-release', 'How to update Firefox'],
		['Samsung Internet 19', 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/19.0 Chrome/102.0.5005.125 Mobile Safari/537.36', 'Samsung Internet 19', 'Samsung Internet 22 or newer', 'https://play.google.com/store/apps/details?id=com.sec.android.app.sbrowser', 'How to update Samsung Internet'],
		['Opera 90', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36 OPR/90.0.4480.54', 'Opera 90', 'Opera 97 or newer', 'https://help.opera.com/en/latest/crashes-and-issues/#update', 'How to update Opera'],
		['Chrome 109 on Windows 7', 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36', 'Windows 7', 'Windows 10 or later', null, null],
	])('%s', (_name, ua, have, need, link: string | null | undefined, linkText) => {
		const screen = run(ua);
		expect(text(screen, '.lob-spec dd')).toEqual([have, need]);
		const primary = screen.querySelector<HTMLAnchorElement>('.lob-primary');
		if (link === null) {
			// Old Windows: no update exists, so no button; the section says what the reader can do instead.
			expect(primary).toBeNull();
			expect(screen.querySelector('h2')?.textContent).toBe('What you can do');
			expect(screen.querySelector('.lob-cant')).toBeNull();
			return;
		}
		expect(primary?.href).toBe(link);
		// The visible label, then what a screen reader adds: where the link goes.
		expect(primary?.textContent).toBe(`${linkText} (opens in a new tab)`);
		expect(primary?.querySelector('.lob-sr')?.textContent).toBe(' (opens in a new tab)');
		expect(primary?.rel).toBe('noopener');
		// And a way forward for whoever can't update: the IT team, or this address on another device.
		// "Can't update?" as a labeled block: the question, then a work-device line and an own-device line.
		expect(screen.querySelector('.lob-cant-q')?.textContent).toBe("Can't update?");
		expect(text(screen, '.lob-cant-ways li')).toEqual([
			'On a work device: ask your IT team. They manage its updates.',
			'On your own device: use any browser in the Supported browsers list below.',
		]);
		expect(text(screen, '.lob-cant-ways strong')).toEqual(['On a work device:', 'On your own device:']);
		// A bulleted list, like the supported browsers.
		expect(screen.querySelector('.lob-cant-ways')?.tagName).toBe('UL');
		expect(getComputedStyle(screen.querySelector('.lob-cant-ways') as Element).listStyleType).toBe('disc');
	});

	it.each([
		['Edge on Android', 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.79 Mobile Safari/537.36 EdgA/100.0.1185.50', 'Edge 100', 'https://play.google.com/store/apps/details?id=com.microsoft.emmx'],
		['Opera on Android', 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.88 Mobile Safari/537.36 OPR/68.3.3557.64528', 'Opera 68', 'https://play.google.com/store/apps/details?id=com.opera.browser'],
	])('%s is named as itself, with its store steps and what to do if the store offers no update', (_name, ua, have, link) => {
		const screen = run(ua);
		expect(text(screen, '.lob-spec dd')[0]).toBe(have);
		expect(screen.querySelector<HTMLAnchorElement>('.lob-primary')?.href).toBe(link);
		expect(screen.querySelector('.lob-after')?.textContent).toMatch(/^No Update button\? On a work phone, ask your IT team\. On your own phone, /);
	});

	it('a browser whose user agent claims a new enough version gets the general advice, never a contradiction', () => {
		const screen = run('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
		expect(screen.querySelector('.lob-spec')).toBeNull();
		expect(text(screen, '.lob-note')).toEqual(["We couldn't tell which browser this is. Lattice works in current versions of Chrome, Edge, Firefox and Safari. On your own device, install or update one of them; Supported browsers below lists the versions."]);
	});

	it('an unknown browser gets nothing to click away to; the supported list waits in the footer', () => {
		const screen = run('SomeBrowser/1.0');
		expect(screen.querySelector('.lob-spec')).toBeNull();
		expect(screen.querySelector('.lob-actions')).toBeNull();
		expect(screen.querySelector('.lob-body .lob-supported')).toBeNull();
	});

	it('links to no page of this site: the only link goes to the browser maker', () => {
		for (const ua of ['SomeBrowser/1.0', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15']) {
			const screen = run(ua);
			const hrefs = Array.from(screen.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
			for (const h of hrefs) expect(h).toMatch(/^https:\/\//);
			document.body.innerHTML = '';
			document.head.innerHTML = '';
		}
	});

	it.each([
		['a named browser', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15'],
		['a browser it cannot name', 'SomeBrowser/1.0'],
	])('%s gets the supported list collapsed in the footer, like the technical details', (_name, ua) => {
		const screen = run(ua);
		const toggles = Array.from(screen.querySelectorAll<HTMLButtonElement>('footer .lob-toggle'));
		expect(toggles.map((t) => t.textContent)).toEqual(['Supported browsers', 'Capability requirements']);
		const supported = document.getElementById(toggles[0].getAttribute('aria-controls') ?? '');
		expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
		expect(supported?.style.display).toBe('none');
		expect(Array.from(supported?.querySelectorAll('li') ?? []).map((li) => li.textContent)).toEqual(supportedList());
		expect(supportedList()).toEqual([
			'Chrome 111 or newer',
			'Edge 111 or newer',
			'Firefox 128 or newer',
			'Mac: Safari 16.4 or newer',
			'iPhone and iPad: iOS 16.4 or newer, in any browser',
			'Samsung Internet 22 or newer',
			'Opera 97 or newer',
		]);
	});

	it('names every missing feature, says why updating matters, and shows the slide for the mode', () => {
		document.documentElement.setAttribute('data-mode', 'dark');
		const screen = run('SomeBrowser/1.0', ['CSS :has()', 'CSS color-mix()', 'CSS @property']);
		// Each capability in plain words, its technical name beside it, and its state in words.
		const reqs = Array.from(screen.querySelectorAll('.lob-reqs li')).map((li) => li.textContent);
		expect(reqs).toContain('Arranging each slide around what is on itCSS :has() · Missing');
		expect(reqs).toContain('Copying your work safely from one part of the app to anotherstructuredClone() · Supported');
		expect(screen.querySelectorAll('.lob-req-missing')).toHaveLength(3);
		expect(screen.textContent).toContain('the latest security fixes');
		expect(screen.textContent).toContain('Nothing is wrong with your device or your files.');
		expect(screen.querySelector<HTMLImageElement>('figure img')?.getAttribute('src')).toBe('/old-browser/hero-dark.jpg');
		expect(screen.querySelector('h1')?.textContent).toBe('Lattice needs a newer browser.');
		expect(document.activeElement).toBe(screen.querySelector('h1'));
		document.documentElement.removeAttribute('data-mode');
	});
});

describe("the infosec rule: a work device goes to IT, never around it; the reader's own device still gets options", () => {
	it.each([
		['Safari on a Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15'],
		['an iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1'],
		['Chrome on Android', 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.79 Mobile Safari/537.36'],
		['Chrome on Windows 7', 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'],
		['the old Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Safari/537.36 Edge/15.15063'],
		['a browser it cannot name', 'SomeBrowser/1.0'],
	])('%s', (_name, ua) => {
		const words = run(ua).textContent ?? '';
		// Never: moving to another device.
		expect(words).not.toMatch(/another device|other device|newer (phone|device|computer)|home computer|use your phone/i);
		// A work device is always sent to IT.
		expect(words).toMatch(/On a work (device|computer|Mac|phone|iPhone or iPad)[,:] (your IT team|ask your IT team)/);
		// Installing a browser is only ever offered to a reader on their own device.
		for (const sentence of words.split(/(?<=[.?])\s*/)) {
			if (/\b(install|any browser)\b/i.test(sentence) && /Chrome|Firefox|Edge|browser/.test(sentence) && !/install (the|it)\b|Install the update|installs from/i.test(sentence)) {
				expect(sentence, sentence).toMatch(/your own/i);
			}
		}
	});
});

describe('its structure, for a reader who listens or tabs', () => {
	it('is an alert dialog named by its heading and described by its lead', () => {
		const screen = run('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15');
		expect(screen.getAttribute('role')).toBe('alertdialog');
		expect(screen.getAttribute('aria-modal')).toBe('true');
		expect(document.getElementById(screen.getAttribute('aria-labelledby') ?? '')?.tagName).toBe('H1');
		expect(document.getElementById(screen.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(/^Lattice turns a few lines/);
		// The decorations say nothing.
		expect(screen.querySelector('.lob-veil')?.getAttribute('aria-hidden')).toBe('true');
		// The site's top bar is branding only: hidden from assistive technology, its mark without alt text.
		expect(screen.querySelector('.lob-bar')?.getAttribute('aria-hidden')).toBe('true');
		expect(screen.querySelector<HTMLImageElement>('.lob-bar img')?.alt).toBe('');
		expect(screen.querySelector('.lob-bar span')?.textContent).toBe('Lattice');
	});

	it('reads in order: header, figure, a titled section, footer', () => {
		const screen = run('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15');
		const card = screen.querySelector('.lob-card');
		expect(Array.from(card?.children ?? []).map((c) => c.tagName)).toEqual(['HEADER', 'FIGURE', 'SECTION', 'FOOTER']);
		const section = screen.querySelector('section');
		expect(section?.firstElementChild?.tagName).toBe('H2');
		expect(document.getElementById(section?.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('How to update');
		// One h1 and one h2: a heading list a screen reader can jump through.
		expect(Array.from(screen.querySelectorAll('h1, h2, h3')).map((h) => h.tagName)).toEqual(['H1', 'H2']);
	});

	it('gives the versions as a description list and the steps as a numbered list', () => {
		const screen = run('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15');
		expect(text(screen, 'dl dt')).toEqual(['You have', 'Lattice needs']);
		expect(screen.querySelector('.lob-note')?.textContent).toBe("Safari updates along with your Mac's system software.");
		const steps = text(screen, 'ol li');
		expect(steps).toEqual(BROWSER_FLOOR.find((b) => b.id === 'safari')?.steps);
		// A Mac old enough for Safari 15 has System Preferences, not System Settings: the step names both.
		expect(steps[1]).toMatch(/System Settings.*On older Macs, choose System Preferences/);
		expect(screen.querySelector('.lob-after')?.textContent).toBe("Can't install it? On a work Mac, ask your IT team. On your own Mac, a current Chrome or Firefox may still install on it.");
	});

	it('keeps the jargon behind "Capability requirements" and says what Continue anyway costs', () => {
		const screen = run('SomeBrowser/1.0');
		const tech = Array.from(screen.querySelectorAll('.lob-toggle')).find((t) => t.textContent === 'Capability requirements');
		expect(tech?.getAttribute('aria-expanded')).toBe('false');
		expect(screen.querySelector('.lob-continue')?.textContent).toBe('You can still look around, but some pages may look broken or not work. Continue anyway');
		expect(screen.querySelector('.lob-go')?.getAttribute('type')).toBe('button');
	});

	it('brings focus that leaves the notice back to its heading', () => {
		const link = document.createElement('a');
		link.href = '#x';
		link.textContent = 'a link on the page beneath';
		document.body.append(link);
		const screen = run('SomeBrowser/1.0');
		expect(document.activeElement).toBe(screen.querySelector('h1'));
		link.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		expect(document.activeElement).toBe(screen.querySelector('h1'));
		// Inside the notice, focus goes where the reader sends it.
		const go = screen.querySelector<HTMLButtonElement>('.lob-go');
		go?.focus();
		expect(document.activeElement).toBe(go);
	});
});

describe('what an old engine gets wrong', () => {
	it("keeps body text at weight 400: an old browser draws a weight the page hasn't loaded as the light 300, for good", () => {
		const screen = run('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36');
		// The root sets 400 for everything that inherits; these are the elements that set a weight of their own.
		for (const sel of ['#lattice-old-browser', '.lob-cant-q', '.lob-cant-ways strong', '.lob-primary', '.lob-go', '.lob-toggle']) {
			for (const el of screen.querySelectorAll(sel)) expect(getComputedStyle(el).fontWeight, sel).toBe('400');
		}
	});

	it('sets its own readable selection colors: the site tints a selection with color-mix(), which an old engine paints solid', () => {
		run('SomeBrowser/1.0');
		const css = document.getElementById('lattice-old-browser-style')?.textContent ?? '';
		expect(css).toContain('#lattice-old-browser ::selection{background:Highlight;color:HighlightText}');
	});

	it('keeps the two-column card behind @supports (display:grid), so an engine without grid keeps the narrow stacked card', () => {
		run('SomeBrowser/1.0');
		const css = document.getElementById('lattice-old-browser-style')?.textContent ?? '';
		expect(css).toMatch(/@supports \(display:grid\)\{@media \(min-width:980px\)\{[^@]*display:grid/);
		expect(css.slice(0, css.indexOf('@supports'))).not.toContain('display:grid');
	});

	it('tells the original Edge that no update reaches the floor, and where the current Edge is', () => {
		const screen = run('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Safari/537.36 Edge/15.15063');
		expect(screen.querySelector('.lob-note')?.textContent).toMatch(/old Edge, which Microsoft stopped updating in 2021/);
		expect(text(screen, 'ol li')[0]).toBe('Open Settings, then Update & Security, then Windows Update.');
	});

	it('the current Edge ("Edg/") is not taken for the original one', () => {
		const screen = run('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.78');
		expect(screen.querySelector('.lob-primary')?.textContent).toMatch(/^How to update Edge/);
	});
});

describe('collapsed sections: one button disclosure in every engine, never <details>', () => {
	it.each([
		['the original Edge 15', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Safari/537.36 Edge/15.15063'],
		['an engine it cannot name', 'SomeBrowser/1.0'],
	])('in %s, a button opens and closes each section, starting closed', (_name, ua) => {
		const screen = run(ua);
		// No <details> or <summary> anywhere: each engine draws those its own way, and one drew a second arrow beside ours.
		expect(screen.querySelectorAll('details, summary')).toHaveLength(0);
		const toggles = Array.from(screen.querySelectorAll<HTMLButtonElement>('footer .lob-toggle'));
		expect(toggles.map((t) => t.type)).toEqual(['button', 'button']);
		const list = document.getElementById(toggles[0].getAttribute('aria-controls') ?? '');
		expect(list?.classList.contains('lob-supported')).toBe(true);
		expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
		expect(list?.style.display).toBe('none');
		toggles[0].click();
		expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
		expect(list?.style.display).toBe('');
		toggles[0].click();
		expect(list?.style.display).toBe('none');
		// The two sections open on their own.
		expect(toggles[1].getAttribute('aria-expanded')).toBe('false');
		expect(new Set(toggles.map((t) => t.getAttribute('aria-controls'))).size).toBe(2);
	});
});

describe('on the Studio and the Playground', () => {
	it("Continue anyway also sets the device tier's continue key and tells the page, so the app runs as Lite", () => {
		const heard = vi.fn();
		document.addEventListener('lattice-old-browser-continue', heard);
		const screen = run('SomeBrowser/1.0');
		screen.querySelector<HTMLButtonElement>('.lob-go')?.click();
		expect(sessionStorage.getItem('lattice-old-browser-continue')).toBe('1');
		expect(sessionStorage.getItem('lattice-device-continue')).toBe('1');
		expect(heard).toHaveBeenCalledTimes(1);
		document.removeEventListener('lattice-old-browser-continue', heard);
	});

	it('what an app adds to <body> after the notice shows joins the page beneath, and is given back', async () => {
		const screen = run('SomeBrowser/1.0');
		const toast = document.createElement('div');
		document.body.append(toast);
		await vi.waitFor(() => expect(toast.getAttribute('aria-hidden')).toBe('true'));
		expect(toast.style.pointerEvents).toBe('none');
		screen.querySelector<HTMLButtonElement>('.lob-go')?.click();
		expect(toast.hasAttribute('aria-hidden')).toBe(false);
		expect(toast.style.cssText).toBe('');
	});

	it('a node the app moves within <body> is given back untouched, and a style the app set meanwhile survives', async () => {
		const portal = document.createElement('div');
		document.body.append(portal);
		const screen = run('SomeBrowser/1.0');
		const toast = document.createElement('div');
		document.body.append(toast);
		await vi.waitFor(() => expect(toast.getAttribute('aria-hidden')).toBe('true'));
		// The app moves both (appendChild of a node already in <body> reports it as added again), and styles one.
		document.body.append(portal);
		document.body.append(toast);
		toast.style.top = '12px';
		await vi.waitFor(() => expect(portal.getAttribute('aria-hidden')).toBe('true'));
		screen.querySelector<HTMLButtonElement>('.lob-go')?.click();
		for (const n of [portal, toast]) {
			expect(n.hasAttribute('aria-hidden')).toBe(false);
			expect(n.style.pointerEvents).toBe('');
		}
		expect(toast.style.top).toBe('12px');
	});

	it('does not draw the page beneath while it shows, even a part the page marks visible, and draws it again on Continue', () => {
		const main = document.createElement('main');
		// The site's own Tailwind utility, as a stylesheet rule (an inline style is the e2e's and the real engines' to judge).
		const utility = document.createElement('style');
		utility.textContent = '.visible{visibility:visible}';
		document.head.append(utility);
		main.innerHTML = '<p class="visible">tinted</p>';
		document.body.append(main);
		const screen = run('SomeBrowser/1.0');
		const tinted = main.querySelector('p') as HTMLElement;
		expect(getComputedStyle(main).visibility).toBe('hidden');
		expect(getComputedStyle(tinted).visibility).toBe('hidden');
		expect(getComputedStyle(screen.querySelector('h1') as HTMLElement).visibility).not.toBe('hidden');
		screen.querySelector<HTMLButtonElement>('.lob-go')?.click();
		expect(getComputedStyle(main).visibility).not.toBe('hidden');
		expect(getComputedStyle(tinted).visibility).toBe('visible');
	});

	it('says plainly that the browser is too old, without defining the word for the reader', () => {
		const lead = run('SomeBrowser/1.0').querySelector('.lob-lead')?.textContent ?? '';
		expect(lead).toContain('Your browser is too old to run Lattice.');
		expect(lead).not.toContain('the app you use');
	});

	it('?lob-debug prints the colors this engine computed, and nothing appears without it', () => {
		expect(run('SomeBrowser/1.0').querySelector('[data-testid="lob-trace"]')).toBeNull();
		document.body.innerHTML = '';
		history.replaceState(null, '', '/?lob-debug');
		// The trace reads again at +50 ms and +600 ms: on fake timers, run inside this test, so no reading outlives it.
		vi.useFakeTimers();
		try {
			const trace = run('SomeBrowser/1.0').querySelector('[data-testid="lob-trace"]');
			expect(trace?.textContent).toMatch(/^hider none\nshow,\d+,html .*, body .*, veil /);
			vi.runAllTimers();
			expect(trace?.textContent).toMatch(/\nshow\+600ms,\d+,html /);
		} finally {
			vi.useRealTimers();
			history.replaceState(null, '', '/');
		}
	});

	it('Continue anyway also marks the page, for a tab whose storage throws', () => {
		const screen = run('SomeBrowser/1.0');
		screen.querySelector<HTMLButtonElement>('.lob-go')?.click();
		expect(document.documentElement.getAttribute('data-old-browser')).toBe('continued');
		document.documentElement.removeAttribute('data-old-browser');
	});
});

describe('the page beneath', () => {
	it('is hidden and out of reach while the notice shows, and given back exactly on Continue anyway', () => {
		const main = document.createElement('main');
		const aside = document.createElement('aside');
		aside.setAttribute('aria-hidden', 'false');
		aside.style.filter = 'grayscale(1)';
		document.body.append(main, aside);
		const screen = run('SomeBrowser/1.0');
		expect(main.getAttribute('aria-hidden')).toBe('true');
		expect(main.style.filter).toBe('');
		expect(main.style.pointerEvents).toBe('none');
		expect(main.style.userSelect).toBe('none');
		expect(main.hasAttribute('inert')).toBe(true);

		screen.querySelector<HTMLButtonElement>('.lob-go')?.click();
		expect(document.querySelector('[data-testid="old-browser"]')).toBeNull();
		expect(main.hasAttribute('aria-hidden')).toBe(false);
		expect(main.hasAttribute('inert')).toBe(false);
		// Focus no longer snaps back once the notice has gone.
		const after = document.createElement('button');
		document.body.append(after);
		after.focus();
		after.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		expect(document.activeElement).toBe(after);
		expect(main.style.filter).toBe('');
		expect(main.style.userSelect).toBe('');
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
