// The site's old-browser CHECK (engineering/decisions/2026-11-12-device-capability-tiers.md §6.2): the small,
// eager half that runs in <head> on every visit. old-browser-check.ts inlines this function into every page's <head>
// (the plugins/old-browser-check.mjs integration), called with
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
	// Hide the page before its first paint: the notice comes in a second download and shows once the page is parsed, and
	// until then the reader would see the broken page. The notice takes this away as it shows, its solid veil over the page.
	var veil = document.createElement('style');
	veil.id = 'lattice-old-browser-veil';
	// Painted in the color the notice's veil starts in, so nothing shifts when it takes over. As a literal, read once
	// here: legacy Edge flashed the whole window mustard on every refresh while a var(--bg,Canvas) form painted it, and a
	// literal color leaves an engine nothing to resolve. The stylesheet has applied by now (a script waits for it).
	// Every palette's --bg is a hex color; anything else (none yet, an engine without custom properties) gets a plain one.
	var bg = /#\w+/.exec(getComputedStyle(document.documentElement).getPropertyValue('--bg'));
	bg = bg ? bg[0] : document.documentElement.getAttribute('data-mode') === 'dark' ? '#111' : '#fff';
	veil.appendChild(document.createTextNode('html{background:' + bg + '}body{visibility:hidden}'));
	document.head.appendChild(veil);
	// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
	var lift = function () {
		if (veil.parentNode) veil.parentNode.removeChild(veil);
	};
	var s = document.createElement('script');
	s.src = src;
	// If the notice cannot load (offline, a network error), show the page and say so on it: the Studio's own gate then
	// shows its screen instead of deferring to a notice that will never come (device-gate.ts).
	// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
	s.onerror = function () {
		lift();
		document.documentElement.setAttribute('data-old-browser', 'failed');
	};
	document.head.appendChild(s);
	// And if the notice loads but never shows (a browser older than any tested), the page comes back: never a blank one.
	// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
	setTimeout(function () {
		if (document.getElementById('lattice-old-browser')) return;
		lift();
		// And say so, as a failed download does, so the Studio's own gate shows its screen (device-gate.ts).
		document.documentElement.setAttribute('data-old-browser', 'failed');
	}, 8000);
}
