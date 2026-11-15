// Builds the landing page's inline old-browser check (old-browser-check.es5.js) as one ES5 statement, with its data as JSON
// literals, so the script that reaches the page is ES5 end to end. index.astro puts it in <head> with `set:html`.

import { FEATURE_LABEL, FEATURE_PROBES, OLD_BROWSER_FEATURES } from './device-profile';
import check from './old-browser-check.es5.js?raw';

/** The probes the landing page runs: the Studio's own table, for the features only a browser's age takes away. */
export const OLD_BROWSER_CHECKS = OLD_BROWSER_FEATURES.map((f) => ({ label: FEATURE_LABEL[f], ...FEATURE_PROBES[f] }));

/** `<` is escaped so no string in the data can close the script element. */
const literal = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

/**
 * The check function without its comment lines or indentation (every page carries it). Lines stay lines, so automatic
 * semicolon insertion reads it exactly as the source. The build minifies it further (src/plugins/old-browser-check.mjs);
 * this module stays free of esbuild so it runs in a browser-like test environment.
 */
const code = check
	.split('\n')
	.filter((line) => !/^\s*\/\//.test(line))
	.map((line) => line.trim())
	.filter((line) => line !== '')
	.join('\n');

/** The inline script: the check function, called once with the probes and the notice's address. */
export function oldBrowserCheckScript(noticeSrc: string): string {
	return `(${code})(${literal(OLD_BROWSER_CHECKS)}, ${literal(noticeSrc)});`;
}
