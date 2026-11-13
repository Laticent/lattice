// Resolve a request URL path to a file UNDER a root, or null when it would escape.
//
// The two local render servers (check-overflow, check-preview-render) serve dist/ to a headless
// browser. Joining `req.url` straight onto the root let a `..` walk read any file (CodeQL
// js/path-injection, #1958 §3, §7). This resolves the path and confirms it stays inside the root,
// so a traversal attempt 404/403s instead of leaking.

import path from 'node:path';

/**
 * @param {string} root  absolute directory the server may serve from
 * @param {string} urlPath  the decoded URL path, e.g. `/assets/app.js` or `/../secret`
 * @returns {string | null}  the absolute file path inside `root`, or null if it escapes
 */
export function confinedPath(root, urlPath) {
	const base = path.resolve(root);
	// Treat the URL path as relative to the root, whatever leading slashes it carries.
	const full = path.resolve(base, `.${path.posix.sep}${urlPath}`);
	return full === base || full.startsWith(base + path.sep) ? full : null;
}
