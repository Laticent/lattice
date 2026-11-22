// Resolve a request URL path to a file UNDER a root, or null when it would escape.
//
// The two local render servers (check-overflow, check-preview-render) serve dist/ to a headless
// browser. Joining `req.url` straight onto the root let a `..` walk read any file (CodeQL
// js/path-injection, #1958 §3, §7). The servers carry the `path.relative(...).startsWith('..')`
// barrier inline at the sink, because the query reads it there; this is the same predicate, under
// test, so the check and its proof stay in one place.

import path from 'node:path';

/**
 * @param {string} root  absolute directory the server may serve from
 * @param {string} urlPath  the decoded URL path, e.g. `/assets/app.js` or `/../secret`
 * @returns {string | null}  the absolute file path inside `root`, or null if it escapes
 */
export function confinedPath(root, urlPath) {
	const full = path.join(root, urlPath);
	const rel = path.relative(root, full);
	return rel.startsWith('..') || path.isAbsolute(rel) ? null : full;
}
