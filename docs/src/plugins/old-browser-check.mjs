// The site-wide old-browser check (engineering/decisions/2026-11-12-device-capability-tiers.md §6.2): an Astro
// integration that puts the ES5 check in the <head> of EVERY page the build emits (home, Studio, Playground and every
// docs page), through Astro's `injectScript('head-inline', …)`. That is the static-site form of a global interceptor:
// no route can forget it or opt out, and a new route gets it with nothing to wire.
//
// Why at build time and in the page, not in a server middleware reading the user agent: the browser tests itself for
// the features it lacks (a user agent can say anything, and would mean gating on versions), the CDN cache stays one copy
// per URL (no Vary: User-Agent), and the site stays static. Why inline: an old browser may not parse our bundled
// modules at all, so the check cannot live in one.

import { transformSync } from 'esbuild';
import { joinBase } from '../lib/base-url.mjs';
import { oldBrowserCheckScript } from '../lib/old-browser-check.ts';

/**
 * The check as every page ships it: minified, because every page carries it and the home page sits at its HTML ceiling.
 * esbuild only shortens names and space: the source is ES5 and `target: 'es5'` keeps it so, which
 * old-browser-check.node.test.ts holds by parsing this exact output with `ecmaVersion: 5`.
 */
export function minifiedOldBrowserCheck(noticeSrc) {
	return transformSync(oldBrowserCheckScript(noticeSrc), { loader: 'js', minify: true, target: 'es5', legalComments: 'none' }).code.trim();
}

export function oldBrowserCheck() {
	return {
		name: 'lattice-old-browser-check',
		hooks: {
			'astro:config:setup': ({ config, injectScript }) => {
				injectScript('head-inline', minifiedOldBrowserCheck(joinBase(config.base, 'old-browser.js')));
			},
		},
	};
}
