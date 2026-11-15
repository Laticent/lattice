import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'acorn';
import { afterEach, describe, expect, it } from 'vitest';
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
		['the original Edge 15 on Windows 10 (the owner saw it)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Safari/537.36 Edge/15.15063', 'Edge 15', 'Edge 111 or newer', 'https://www.microsoft.com/edge', 'Get the current Edge'],
		['Firefox 115 on a Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:115.0) Gecko/20100101 Firefox/115.0', 'Firefox 115', 'Firefox 128 or newer', 'https://support.mozilla.org/kb/update-firefox-latest-release', 'How to update Firefox'],
		['Samsung Internet 19', 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/19.0 Chrome/102.0.5005.125 Mobile Safari/537.36', 'Samsung Internet 19', 'Samsung Internet 22 or newer', 'https://play.google.com/store/apps/details?id=com.sec.android.app.sbrowser', 'How to update Samsung Internet'],
		['Opera 90', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36 OPR/90.0.4480.54', 'Opera 90', 'Opera 97 or newer', 'https://www.opera.com/download', 'How to update Opera'],
		['Chrome 109 on Windows 7', 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36', 'Windows 7', 'Windows 10 or later', 'https://support.microsoft.com/windows/windows-7-support-ended-on-january-14-2020-b75d4580-2cc7-895a-2c9c-1466d9a53962', 'About older Windows'],
	])('%s', (_name, ua, have, need, link, linkText) => {
		const screen = run(ua);
		expect(text(screen, '.lob-spec dd')).toEqual([have, need]);
		const primary = screen.querySelector<HTMLAnchorElement>('.lob-primary');
		expect(primary?.href).toBe(link);
		// The visible label, then what a screen reader adds: where the link goes.
		expect(primary?.textContent).toBe(`${linkText} (opens in a new tab)`);
		expect(primary?.querySelector('.lob-sr')?.textContent).toBe(' (opens in a new tab)');
		expect(primary?.rel).toBe('noopener');
	});

	it('a browser whose user agent claims a new enough version gets the general advice, never a contradiction', () => {
		const screen = run('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
		expect(screen.querySelector('.lob-spec')).toBeNull();
		expect(text(screen, '.lob-note')).toEqual(['Update to a current browser, then open this page again. "Supported browsers" below lists the versions that work.']);
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
		const summaries = Array.from(screen.querySelectorAll('footer details summary')).map((s) => s.textContent);
		expect(summaries).toEqual(['Supported browsers', 'Technical details']);
		const supported = screen.querySelector('footer details');
		expect(supported?.hasAttribute('open')).toBe(false);
		expect(Array.from(supported?.querySelectorAll('li') ?? []).map((li) => li.textContent)).toEqual(supportedList());
		expect(supportedList()).toEqual([
			'Chrome 111 or newer',
			'Edge 111 or newer',
			'Firefox 128 or newer',
			'Safari 16.4 or newer on a Mac',
			'iOS 16.4 or newer on iPhone and iPad, for every browser there',
			'Samsung Internet 22 or newer',
			'Opera 97 or newer',
		]);
	});

	it('names every missing feature, says why updating matters, and shows the slide for the mode', () => {
		document.documentElement.setAttribute('data-mode', 'dark');
		const screen = run('SomeBrowser/1.0', ['CSS :has()', 'CSS color-mix()', 'CSS @property']);
		expect(screen.querySelector('details p')?.textContent).toContain('This browser is missing CSS :has(), CSS color-mix() and CSS @property, which Lattice needs.');
		expect(screen.textContent).toContain('stop getting security fixes');
		expect(screen.querySelector<HTMLImageElement>('figure img')?.getAttribute('src')).toBe('/old-browser/hero-dark.jpg');
		expect(screen.querySelector('h1')?.textContent).toBe('Lattice needs a newer browser.');
		expect(document.activeElement).toBe(screen.querySelector('h1'));
		document.documentElement.removeAttribute('data-mode');
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
		for (const d of screen.querySelectorAll('.lob-veil, .lob-glow')) expect(d.getAttribute('aria-hidden')).toBe('true');
		expect(screen.querySelector<HTMLImageElement>('.lob-eyebrow img')?.alt).toBe('');
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
		expect(screen.querySelector('.lob-note')?.textContent).toBe('Safari updates with macOS.');
		expect(text(screen, 'ol li')).toEqual(BROWSER_FLOOR.find((b) => b.id === 'safari')?.steps);
		expect(screen.querySelector('.lob-after')?.textContent).toMatch(/^On older Macs/);
	});

	it('keeps the jargon behind "Technical details" and says what Continue anyway costs', () => {
		const screen = run('SomeBrowser/1.0');
		const tech = Array.from(screen.querySelectorAll('details')).find((d) => d.querySelector('summary')?.textContent === 'Technical details');
		expect(tech?.hasAttribute('open')).toBe(false);
		expect(screen.querySelector('.lob-continue')?.textContent).toBe('You can still look around, but parts of the site may not work. Continue anyway');
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
		expect(screen.querySelector('.lob-note')?.textContent).toMatch(/original Edge, which Microsoft stopped updating in 2021/);
		expect(text(screen, 'ol li')[0]).toBe('Open microsoft.com/edge.');
	});

	it('the current Edge ("Edg/") is not taken for the original one', () => {
		const screen = run('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.78');
		expect(screen.querySelector('.lob-primary')?.textContent).toMatch(/^How to update Edge/);
	});
});

describe('collapsed sections in an engine without <details> (the original Edge, before 79)', () => {
	it('fall back to a button that opens and closes them, starting closed', () => {
		const proto = HTMLDetailsElement.prototype as unknown as Record<string, unknown>;
		const real = Object.getOwnPropertyDescriptor(proto, 'open');
		delete proto.open;
		try {
			const screen = run('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Safari/537.36 Edge/15.15063');
			const toggles = Array.from(screen.querySelectorAll<HTMLButtonElement>('footer summary .lob-toggle'));
			expect(toggles.map((t) => t.textContent)).toEqual(['Supported browsers', 'Technical details']);
			const list = screen.querySelector<HTMLElement>('footer .lob-supported');
			expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
			expect(list?.style.display).toBe('none');
			toggles[0].click();
			expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
			expect(list?.style.display).toBe('');
			toggles[0].click();
			expect(list?.style.display).toBe('none');
		} finally {
			if (real) Object.defineProperty(proto, 'open', real);
		}
	});

	it('an engine with <details> gets no fallback button', () => {
		const screen = run('SomeBrowser/1.0');
		expect(screen.querySelector('.lob-toggle')).toBeNull();
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
