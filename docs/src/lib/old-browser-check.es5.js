// The landing page's old-browser CHECK (engineering/decisions/2026-11-12-device-capability-tiers.md §6.2): the small,
// eager half that runs in <head> on every visit. old-browser-check.ts inlines this function into index.astro, called with
// the probe table and the notice's address. It tests each feature; if one is missing it marks <html data-old-browser> and
// loads /old-browser.js (the notice). A current browser does nothing else.
//
// ES5 ON PURPOSE, and checked: old-browser-notice.test.ts parses the inlined script with acorn `ecmaVersion: 5`. It runs in
// browsers too old to parse our bundled modules. (Astro's `define:vars` would have declared the data with `const`, which
// is why the data is not passed that way.)

// biome-ignore lint/correctness/noUnusedVariables: called by the inlined script old-browser-check.ts builds.
function latticeOldBrowserCheck(checks, src) {
	var missing = [];
	var i;
	var j;
	var c;
	var ok;
	var v;
	var path;
	for (i = 0; i < checks.length; i++) {
		c = checks[i];
		ok = false;
		try {
			if (c.css) {
				ok = !!(window.CSS && CSS.supports(c.css));
			} else {
				v = window;
				path = c.global.split('.');
				for (j = 0; j < path.length && v != null; j++) v = v[path[j]];
				ok = typeof v !== 'undefined';
			}
		} catch (_e) {}
		if (!ok) missing.push(c.label);
	}
	if (!missing.length) return;
	document.documentElement.setAttribute('data-old-browser', '');
	try {
		if (sessionStorage.getItem('lattice-old-browser-continue') === '1') return;
	} catch (_e) {}
	window.__latticeOldBrowser = missing;
	var s = document.createElement('script');
	s.src = src;
	// If the notice cannot load (offline, a network error), say so on the page: the Studio's own gate then shows its
	// screen instead of deferring to a notice that will never come (device-gate.ts).
	// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
	s.onerror = function () {
		document.documentElement.setAttribute('data-old-browser', 'failed');
	};
	document.head.appendChild(s);
}
