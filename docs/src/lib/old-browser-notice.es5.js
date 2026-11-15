// The landing page's old-browser notice (engineering/decisions/2026-11-12-device-capability-tiers.md §6.2).
//
// Served as /old-browser.js by src/pages/old-browser.js.ts, which puts `var LOB = {...}` in front of this file: the floor
// table and update steps (browser-floor.ts), the slide images and the docs link. The landing page's inline check
// (index.astro) loads it only when a required feature is missing, with the missing names in `window.__latticeOldBrowser`.
//
// ES5 ON PURPOSE: `var`, `function`, no arrows, template strings, optional chaining, trailing commas or modules. It runs
// in exactly the browsers that can't parse our bundled JavaScript; old-browser-notice.test.ts parses it as ES5.
// The CSS is old-browser CSS too: flexbox, custom properties, `filter` with its -webkit- twin, and nothing that needs
// `:has()`, container queries or `color-mix()`.
//
// The look (owner's pick, "B"): the landing page stays behind the notice, blurred and veiled in the palette, and a card in
// the site's own type holds one real slide rendered by the engine, so the reader sees what is waiting for them.

// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose: this file runs in browsers too old for the modern form.
(function () {
	var missing = window.__latticeOldBrowser;
	// biome-ignore lint/complexity/useOptionalChain: ES5 on purpose.
	if (!missing || !missing.length || typeof LOB === 'undefined') return;
	var ID = 'lattice-old-browser';
	var KEY = 'lattice-old-browser-continue';

	function find(id) {
		var i;
		for (i = 0; i < LOB.floor.length; i++) if (LOB.floor[i].id === id) return LOB.floor[i];
		return null;
	}

	/** Which browser this is, from the user agent. Wording only: the decision was made by feature tests. */
	function identify(ua, touchMac) {
		var m;
		var android = /Android/.test(ua);
		if (/Windows NT 6\.[0-3]/.test(ua)) return { oldWindows: true, version: /Windows NT 6\.1/.test(ua) ? '7' : '8' };
		if (/iPhone|iPad|iPod/.test(ua) || (touchMac && /Macintosh/.test(ua))) {
			m = / OS (\d+)_(\d+)/.exec(ua) || /Version\/(\d+)\.(\d+)/.exec(ua);
			return { id: 'ios', version: m ? m[1] + '.' + m[2] : null };
		}
		if ((m = /SamsungBrowser\/(\d+)/.exec(ua))) return { id: 'samsung', version: m[1] };
		if ((m = /Edge?\/(\d+)/.exec(ua))) return { id: 'edge', version: m[1] };
		if ((m = /OPR\/(\d+)/.exec(ua))) return { id: 'opera', version: m[1] };
		if ((m = /Firefox\/(\d+)/.exec(ua))) return { id: 'firefox', version: m[1], android: android };
		if ((m = /Chrome\/(\d+)/.exec(ua))) return { id: 'chrome', version: m[1], android: android };
		if ((m = /Version\/(\d+(?:\.\d+)?).*Safari\//.exec(ua))) return { id: 'safari', version: m[1] };
		return null;
	}

	/** Whether version `have` is older than `min` ("15.6" < "16.4"). */
	function older(have, min) {
		var a = String(have).split('.');
		var b = String(min).split('.');
		var i;
		var x;
		var y;
		for (i = 0; i < Math.max(a.length, b.length); i++) {
			x = parseInt(a[i] || '0', 10);
			y = parseInt(b[i] || '0', 10);
			if (x !== y) return x < y;
		}
		return false;
	}

	/** The words for this reader: who they are, what they need, and how to get it. */
	function advice() {
		var who = identify(navigator.userAgent || '', navigator.maxTouchPoints > 1);
		// biome-ignore lint/complexity/useOptionalChain: ES5 on purpose.
		if (who && who.oldWindows) {
			return { have: 'Windows ' + who.version, need: 'Windows 10 or later', note: LOB.oldWindows.note, steps: [], link: LOB.oldWindows.link, linkText: 'About older Windows' };
		}
		var b = who && find(who.id);
		// A version we can't read, or one the user agent claims is new enough (a browser can say anything about itself), gets
		// the general advice: the feature tests already know it is missing something, and a contradiction helps nobody.
		if (!b || !who.version || !older(who.version, b.min)) return null;
		var a = who.android && b.android;
		return {
			have: b.name + ' ' + who.version,
			need: b.name + ' ' + b.min + ' or newer',
			note: a ? null : b.note,
			steps: a ? b.android.steps : b.steps,
			after: a ? null : b.after,
			link: a ? b.android.link : b.link,
			linkText: 'How to update ' + (b.id === 'ios' ? 'your iPhone or iPad' : b.name),
		};
	}

	var MONO = 'var(--font-mono,ui-monospace,Menlo,Consolas,monospace)';
	var RULE = '1px solid var(--border,rgba(127,127,127,.25))';
	var CSS_TEXT =
		'#ID{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;overflow:auto;-webkit-overflow-scrolling:touch;' +
		'font-family:var(--font-body,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);color:black;color:var(--text-body,CanvasText);text-align:left}' +
		'#ID .lob-veil{position:fixed;top:0;right:0;bottom:0;left:0;background:white;background:var(--bg,Canvas);opacity:.62}' +
		'#ID .lob-glow{position:fixed;top:0;right:0;bottom:0;left:0;opacity:.16;background:radial-gradient(60% 50% at 50% 30%,var(--accent,Highlight),transparent 70%)}' +
		'#ID .lob-stage{position:relative;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;' +
		'-webkit-box-align:start;-webkit-align-items:flex-start;align-items:flex-start;min-height:100%;box-sizing:border-box;padding:7vh 16px 48px}' +
		'#ID .lob-card{width:100%;max-width:38rem;box-sizing:border-box;padding:32px;border-radius:22px;background:white;background:var(--bg,Canvas);' +
		'border:1px solid rgba(127,127,127,.25);border:' + RULE + ';box-shadow:0 40px 90px -30px rgba(0,0,0,.45),0 2px 6px rgba(0,0,0,.06);' +
		'opacity:0;-webkit-transform:translateY(10px);transform:translateY(10px);-webkit-transition:opacity .5s ease,-webkit-transform .5s ease;transition:opacity .5s ease,transform .5s ease}' +
		'#ID.lob-in .lob-card{opacity:1;-webkit-transform:none;transform:none}' +
		// A visually hidden span: read aloud, never shown ("opens in a new tab").
		'#ID .lob-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
		'#ID .lob-eyebrow{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;margin:0;padding:0 0 18px;' +
		'font:600 12px/1 ' + MONO + ';letter-spacing:.14em;text-transform:uppercase;color:var(--accent,Highlight)}' +
		'#ID .lob-eyebrow img{width:22px;height:22px;padding:0 10px 0 0}' +
		'#ID h1{margin:0;padding:0 0 10px;font:700 34px/1.1 var(--font-display,Georgia,"Times New Roman",serif);letter-spacing:-.01em;color:inherit;color:var(--text-heading,CanvasText);outline:none}' +
		'#ID h2{margin:0;padding:0 0 12px;font:600 12px/1 ' + MONO + ';letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted,GrayText)}' +
		'#ID p,#ID ol,#ID dl,#ID dd{margin:0;font-size:16px;line-height:1.6}' +
		'#ID .lob-lead{padding:0 0 22px;font-size:17px}' +
		'#ID figure{margin:0;padding:0 0 22px}' +
		'#ID figure img{display:block;width:100%;height:auto;border-radius:12px;border:' + RULE + ';box-shadow:0 18px 40px -24px rgba(0,0,0,.5)}' +
		'#ID figcaption{padding:10px 0 0;font-size:14px;line-height:1.5;color:var(--text-muted,GrayText)}' +
		'#ID .lob-spec{display:-webkit-box;display:-webkit-flex;display:flex;padding:0;border-radius:14px;background:var(--bg-alt,transparent);border:' + RULE + ';overflow:hidden}' +
		'#ID .lob-spec div{-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;padding:14px 18px}' +
		'#ID .lob-spec div+div{border-left:' + RULE + '}' +
		'#ID .lob-spec dt{padding:0 0 6px;font:600 11px/1 ' + MONO + ';letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted,GrayText)}' +
		'#ID .lob-spec dd{font:700 20px/1.2 var(--font-display,Georgia,serif);color:var(--text-heading,CanvasText)}' +
		'#ID .lob-note{padding:16px 0 0}' +
		'#ID .lob-note+ol{padding-top:8px}' +
		'#ID ol{padding:16px 0 0 1.4em}' +
		'#ID li{padding:0 0 6px 4px}' +
		'#ID .lob-after{padding:4px 0 0;font-size:15px;color:var(--text-muted,GrayText)}' +
		'#ID .lob-actions{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;-webkit-box-align:center;-webkit-align-items:center;align-items:center;padding:18px 0 24px}' +
		'#ID .lob-actions a{display:inline-block;font-size:16px;font-weight:600;text-decoration:none}' +
		'#ID .lob-primary{padding:12px 22px;border-radius:999px;background:var(--accent,Highlight);color:white;color:var(--on-accent,var(--bg,Canvas))}' +
		'#ID .lob-secondary{padding:12px 4px 12px 22px;color:var(--accent,Highlight)}' +
		'#ID .lob-secondary:hover,#ID .lob-primary:hover{text-decoration:underline}' +
		// Keyboard focus is always visible, in the accent, on every control.
		'#ID a:focus,#ID button:focus,#ID summary:focus{outline:2px solid var(--accent,Highlight);outline-offset:3px}' +
		'#ID .lob-foot{padding:20px 0 0;border-top:' + RULE + '}' +
		'#ID .lob-foot p,#ID .lob-foot summary{font-size:15px;color:var(--text-muted,GrayText)}' +
		'#ID details{padding:12px 0 0}' +
		'#ID summary{cursor:pointer}' +
		'#ID details p{padding:6px 0 0}' +
		'#ID .lob-continue{padding:12px 0 0}' +
		'#ID .lob-go{font:inherit;font-weight:600;padding:0;background:none;border:0;color:inherit;color:var(--text-body,CanvasText);text-decoration:underline;cursor:pointer}' +
		// Wide screens: the slide sits beside the words, so the whole card fits a 1440 x 900 screen without scrolling. Grid
		// is in every browser this is for (Chrome 57, Safari 10.1, Firefox 52); one without it keeps the stacked layout.
		'@media (min-width:980px){#ID .lob-stage{-webkit-box-align:center;-webkit-align-items:center;align-items:center;padding:32px 32px 40px}' +
		'#ID .lob-card{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.12fr);grid-template-areas:"head media" "body media" "foot media";' +
		'grid-column-gap:44px;max-width:76rem;padding:36px 44px}' +
		'#ID .lob-head{grid-area:head}#ID .lob-body{grid-area:body}#ID .lob-foot{grid-area:foot}#ID figure{grid-area:media;-webkit-align-self:center;align-self:center;padding:0}}' +
		'@media (max-width:560px){#ID .lob-stage{padding:16px 12px 32px}#ID .lob-card{padding:22px 18px;border-radius:18px}#ID h1{font-size:28px}' +
		'#ID .lob-spec{display:block}#ID .lob-spec div+div{border-left:0;border-top:' + RULE + '}' +
		'#ID .lob-secondary{padding:12px 0}}' +
		'@media (prefers-reduced-motion:reduce){#ID .lob-card{-webkit-transition:none;transition:none}}';

	function el(tag, cls, text) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text) e.appendChild(document.createTextNode(text));
		return e;
	}

	/** One label and value of the "You have / Lattice needs" list. */
	function pair(label, value) {
		var c = el('div');
		c.appendChild(el('dt', '', label));
		c.appendChild(el('dd', '', value));
		return c;
	}

	/** A link that opens a new tab says so to a screen reader, which can't see where it went. */
	function newTabLink(cls, text, href) {
		var a = el('a', cls, text);
		a.href = href;
		a.target = '_blank';
		a.rel = 'noopener';
		a.appendChild(el('span', 'lob-sr', ' (opens in a new tab)'));
		return a;
	}

	function show() {
		if (document.getElementById(ID)) return;
		var root = document.documentElement;
		var dark = root.getAttribute('data-mode') === 'dark';
		var said = advice();
		var list = missing.length === 1 ? missing[0] : missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1];
		var i;

		var style = document.createElement('style');
		style.id = ID + '-style';
		style.appendChild(document.createTextNode(CSS_TEXT.replace(/#ID/g, '#' + ID)));
		document.head.appendChild(style);

		// An alert dialog: a screen reader announces its title and its lead as it opens, and keeps the reader inside it.
		var screen = el('div');
		screen.id = ID;
		screen.setAttribute('role', 'alertdialog');
		screen.setAttribute('aria-modal', 'true');
		screen.setAttribute('aria-labelledby', ID + '-title');
		screen.setAttribute('aria-describedby', ID + '-lead');
		screen.setAttribute('data-testid', 'old-browser');
		var veil = el('div', 'lob-veil');
		var glow = el('div', 'lob-glow');
		veil.setAttribute('aria-hidden', 'true');
		glow.setAttribute('aria-hidden', 'true');
		screen.appendChild(veil);
		screen.appendChild(glow);
		var stage = el('div', 'lob-stage');
		// An article: the notice is one self-contained piece, so its header and footer belong to it, not to the page (inside a
		// plain div they would be read as the site's own banner and footer landmarks).
		var card = el('article', 'lob-card');

		// 1. What this is: the heading and one sentence.
		var head = el('header', 'lob-head');
		var eyebrow = el('p', 'lob-eyebrow');
		var mark = el('img');
		mark.src = LOB.mark;
		mark.alt = '';
		eyebrow.appendChild(mark);
		eyebrow.appendChild(document.createTextNode('Browser update needed'));
		head.appendChild(eyebrow);
		var title = el('h1', '', 'Lattice needs a newer browser.');
		title.id = ID + '-title';
		title.tabIndex = -1;
		head.appendChild(title);
		var lead = el('p', 'lob-lead', 'Lattice turns a few lines of plain text into slides like this one. This browser is too old to run it.');
		lead.id = ID + '-lead';
		head.appendChild(lead);
		card.appendChild(head);

		// 2. What they are missing: one real slide, described in words for a reader who can't see it.
		var fig = el('figure');
		var shot = el('img');
		shot.src = dark ? LOB.slide.dark : LOB.slide.light;
		shot.width = 1120;
		shot.height = 630;
		shot.alt = LOB.slide.alt;
		fig.appendChild(shot);
		fig.appendChild(el('figcaption', '', LOB.slide.caption));
		card.appendChild(fig);

		// 3. What to do: a titled section, the versions as a description list, the steps as a numbered list.
		var body = el('section', 'lob-body');
		var h2 = el('h2', '', 'How to update');
		h2.id = ID + '-how';
		body.setAttribute('aria-labelledby', h2.id);
		var spec;
		var ol;
		body.appendChild(h2);
		if (said) {
			spec = el('dl', 'lob-spec');
			spec.appendChild(pair('You have', said.have));
			spec.appendChild(pair('Lattice needs', said.need));
			body.appendChild(spec);
			if (said.note) body.appendChild(el('p', 'lob-note', said.note));
			if (said.steps.length) {
				ol = el('ol');
				for (i = 0; i < said.steps.length; i++) ol.appendChild(el('li', '', said.steps[i]));
				body.appendChild(ol);
			}
			if (said.after) body.appendChild(el('p', 'lob-after', said.after));
		} else {
			body.appendChild(el('p', 'lob-note', 'Update to ' + LOB.summary + ' or newer, then open this page again.'));
		}
		var actions = el('p', 'lob-actions');
		var supported = el('a', said ? 'lob-secondary' : 'lob-primary', 'Supported browsers');
		supported.href = LOB.supportedHref;
		if (said) actions.appendChild(newTabLink('lob-primary', said.linkText, said.link));
		actions.appendChild(supported);
		body.appendChild(actions);
		card.appendChild(body);

		// 4. Why it matters, the technical detail for whoever wants it, and the way past.
		var foot = el('footer', 'lob-foot');
		foot.appendChild(el('p', '', 'Browsers this old also stop getting security fixes, which makes them unsafe to use on the web.'));
		var details = el('details');
		details.appendChild(el('summary', '', 'Technical details'));
		details.appendChild(el('p', '', 'This browser is missing ' + list + ', which Lattice needs. Lattice checks for features, not version numbers.'));
		foot.appendChild(details);
		var cont = el('p', 'lob-continue', 'You can still look around, but parts of the site may not work. ');
		var go = el('button', 'lob-go', 'Continue anyway');
		go.type = 'button';
		cont.appendChild(go);
		foot.appendChild(cont);
		card.appendChild(foot);

		stage.appendChild(card);
		screen.appendChild(stage);

		// The page beneath stays in view, blurred, and out of reach: hidden from assistive technology, from the pointer and,
		// where the browser knows `inert`, from the keyboard. Every attribute and style is given back on "Continue anyway".
		var touched = [];
		var kids = document.body.children;
		var k;
		for (i = 0; i < kids.length; i++) {
			k = kids[i];
			touched.push({ el: k, hidden: k.getAttribute('aria-hidden'), inert: k.hasAttribute('inert'), filter: k.style.filter, webkit: k.style.webkitFilter, events: k.style.pointerEvents });
			k.setAttribute('aria-hidden', 'true');
			k.setAttribute('inert', '');
			k.style.filter = 'blur(14px) saturate(1.15)';
			k.style.webkitFilter = 'blur(14px) saturate(1.15)';
			k.style.pointerEvents = 'none';
		}
		var overflow = root.style.overflow;
		root.style.overflow = 'hidden';
		window.scrollTo(0, 0);

		// Older browsers don't know `inert`, so focus that leaves the notice (Tab past its last control) is brought back to its
		// heading: a keyboard reader never lands on a link they can't see.
		// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
		var keep = function (e) {
			if (!screen.contains(e.target)) title.focus();
		};
		document.addEventListener('focusin', keep, true);

		// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
		go.onclick = function () {
			try {
				sessionStorage.setItem(KEY, '1');
			} catch (_e) {}
			document.removeEventListener('focusin', keep, true);
			var j;
			var t;
			for (j = 0; j < touched.length; j++) {
				t = touched[j];
				if (t.hidden === null) t.el.removeAttribute('aria-hidden');
				else t.el.setAttribute('aria-hidden', t.hidden);
				if (!t.inert) t.el.removeAttribute('inert');
				t.el.style.filter = t.filter;
				t.el.style.webkitFilter = t.webkit;
				t.el.style.pointerEvents = t.events;
			}
			root.style.overflow = overflow;
			screen.parentNode.removeChild(screen);
			style.parentNode.removeChild(style);
		};

		document.body.appendChild(screen);
		title.focus();
		// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
		setTimeout(function () {
			screen.className = 'lob-in';
		}, 30);
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
	else show();
})();
