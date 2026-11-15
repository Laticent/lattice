// The landing page's old-browser notice (engineering/decisions/2026-11-12-device-capability-tiers.md §6.2).
//
// The landing page's inline check (src/pages/index.astro) tests the features only a browser's age takes away, and loads
// this file only when one is missing, with their names in `window.__latticeOldBrowser`. Every current browser skips it,
// so it costs the page nothing.
//
// Written in ES5 on purpose: `var`, `function`, no arrows, no template strings, no optional chaining, no modules. It
// runs in exactly the browsers that cannot parse our bundled JavaScript, so it is a static file the build never touches.
// Plain DOM, system colors with a plain fallback before each `var()`, and `aria-hidden` rather than `inert`, which these
// browsers do not have.
// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose: this file runs in browsers too old for the modern form.
(function () {
	var missing = window.__latticeOldBrowser;
	// biome-ignore lint/complexity/useOptionalChain: ES5 on purpose: this file runs in browsers too old for the modern form.
	if (!missing || !missing.length) return;
	var KEY = 'lattice-old-browser-continue';
	var ID = 'lattice-old-browser';

	function make(tag, css, text) {
		var e = document.createElement(tag);
		e.style.cssText = css;
		if (text) e.appendChild(document.createTextNode(text));
		return e;
	}

	function show() {
		if (document.getElementById(ID)) return;
		var list = missing.length === 1 ? missing[0] : missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1];
		var P = 'margin:0;padding:0 0 14px;font-size:16px;line-height:1.5;';

		// Every call below keeps its arguments on one line: a trailing comma in a call is ES2017, too new for some of these browsers.
		var SCREEN =
			'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:24px 16px;' +
			'background:white;background:Canvas;background:var(--bg,Canvas);color:black;color:CanvasText;color:var(--text-body,CanvasText);' +
			'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
		var screen = make('div', SCREEN);
		screen.id = ID;
		screen.setAttribute('role', 'alertdialog');
		screen.setAttribute('aria-modal', 'true');
		screen.setAttribute('aria-labelledby', ID + '-title');
		screen.setAttribute('aria-describedby', ID + '-lead');
		screen.setAttribute('data-testid', 'old-browser');

		var card = make('div', 'width:100%;max-width:34rem;padding-top:12vh;');
		var H1 = 'margin:0;padding:0 0 14px;font-size:28px;line-height:1.2;font-weight:700;color:inherit;color:var(--text-heading,CanvasText);outline:none;';
		var title = make('h1', H1, 'This browser is too old for Lattice.');
		title.id = ID + '-title';
		title.tabIndex = -1;
		var lead = make('p', P, 'Lattice needs ' + list + ", which this browser doesn't support, so the site can't work properly here.");
		lead.id = ID + '-lead';
		var SAFETY =
			'Browsers this old also stop getting security fixes, which makes them unsafe to use on the web. ' +
			'Update to a current Chrome, Edge, Safari or Firefox, or update your device if it can no longer install one.';
		var safety = make('p', P, SAFETY);
		var LINK = 'font:inherit;font-size:14px;font-weight:500;padding:9px 0;background:none;border:0;color:inherit;text-decoration:underline;cursor:pointer;';
		var go = make('button', LINK, 'Continue anyway');
		go.type = 'button';

		// The page beneath is hidden from assistive technology while the notice shows; only what this notice hid is given back.
		var hidden = [];
		var kids = document.body.children;
		var i;
		for (i = 0; i < kids.length; i++) {
			if (!kids[i].hasAttribute('aria-hidden')) {
				kids[i].setAttribute('aria-hidden', 'true');
				hidden.push(kids[i]);
			}
		}
		// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose: this file runs in browsers too old for the modern form.
		go.onclick = function () {
			var k;
			try {
				sessionStorage.setItem(KEY, '1');
			} catch (_e) {}
			for (k = 0; k < hidden.length; k++) hidden[k].removeAttribute('aria-hidden');
			screen.parentNode.removeChild(screen);
		};

		card.appendChild(title);
		card.appendChild(lead);
		card.appendChild(safety);
		card.appendChild(go);
		screen.appendChild(card);
		document.body.appendChild(screen);
		title.focus();
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
	else show();
})();
