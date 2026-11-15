// Serves /old-browser.js: the landing page's old-browser notice (lib/old-browser-notice.es5.js) with its data in front, as
// `var LOB = {...}`. The data comes from the TypeScript that owns it (browser-floor.ts), so the notice, the Studio's decline
// screen and the docs' "Supported browsers" table read one list. The notice links to no other page of this site: a
// browser too old for this page is too old for those, so the supported list travels inside it. Built once, at build time, into a static file; only a
// browser that fails the landing page's feature check (index.astro) ever downloads it.
//
// The notice source is ES5 and goes out as written: Vite does not transform a `?raw` import, which is the point.

import { joinBase } from '../lib/base-url.mjs';
import { BROWSER_FLOOR, OLD_WINDOWS, supportedList } from '../lib/browser-floor';
import notice from '../lib/old-browser-notice.es5.js?raw';

export function GET(): Response {
	const url = (p: string) => joinBase(import.meta.env.BASE_URL, p);
	const data = {
		floor: BROWSER_FLOOR,
		oldWindows: OLD_WINDOWS,
		// The supported list travels with the notice: no link to another page of the site, which this browser can't show.
		supported: supportedList(),
		mark: url('lattice-mark-min.svg'),
		slide: {
			light: url('old-browser/hero-light.jpg'),
			dark: url('old-browser/hero-dark.jpg'),
			alt: 'A Lattice slide: a waterfall chart titled "New customers drove the growth. Churn is the biggest drag.", taking revenue from $12.0M last year to $14.6M this year.',
			caption: 'One Lattice slide. Its source is a title and six lines of plain text.',
		},
	};
	// `<` is escaped so no string in the data can close a script element, wherever this text ends up.
	const head = `var LOB = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`;
	return new Response(head + notice, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
}
