// The site's old-browser notice (engineering/decisions/2026-11-12-device-capability-tiers.md §6.2).
//
// Served as /old-browser.js by src/pages/old-browser.js.ts, which puts `var LOB = {...}` in front of this file: the floor
// table and update steps (browser-floor.ts), the slide images and the supported list. The inline check in every
// page's <head> (old-browser-check.es5.js) loads it only when a required feature is missing, with the missing names in `window.__latticeOldBrowser`.
//
// ES5 ON PURPOSE: `var`, `function`, no arrows, template strings, optional chaining, trailing commas or modules. It runs
// in exactly the browsers that can't parse our bundled JavaScript; old-browser-notice.test.ts parses it as ES5.
// The CSS is old-browser CSS too: flexbox, custom properties, and nothing that needs
// `:has()`, container queries or `color-mix()`.
//
// The look (owner's pick, "B", refined to the site's own style): the site's top bar over its flat background, and a card in
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
		// The original Edge (EdgeHTML, "Edge/12" to "Edge/18") updates with Windows and was retired in 2021; the current one is "Edg/".
		if ((m = /Edge\/(\d+)/.exec(ua))) return { id: 'edge-legacy', version: m[1] };
		// Edge on Android says "EdgA/": Chromium underneath, so without this it would be taken for Chrome.
		if ((m = /EdgA?\/(\d+)/.exec(ua))) return { id: 'edge', version: m[1], android: android };
		if ((m = /OPR\/(\d+)/.exec(ua))) return { id: 'opera', version: m[1], android: android };
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
			return { have: 'Windows ' + who.version, need: LOB.oldWindows.need, note: LOB.oldWindows.note, steps: [], oldWindows: true };
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
			after: a ? b.android.after : b.after,
			link: a ? b.android.link : b.link,
			linkText: b.linkText || 'How to update ' + (b.id === 'ios' ? 'your iPhone or iPad' : b.name),
		};
	}

	var MONO = 'var(--font-mono,ui-monospace,Menlo,Consolas,monospace)';
	var RULE = '1px solid var(--border,rgba(127,127,127,.25))';
	var CSS_TEXT =
		'#ID{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;overflow:auto;-webkit-overflow-scrolling:touch;' +
		'font-family:var(--font-body,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);font-weight:400;color:black;color:var(--text-body,CanvasText);text-align:left}' +
		// The site's own flat background, solid from the first frame to the last, in the same color the <head> check painted
		// while it hid the page. Nothing beneath shows through, so nothing can flicker: an old browser draws that page
		// broken (orange chart bars, in the owner's legacy Edge), and an earlier thin veil and accent glow let it bleed.
		'#ID .lob-veil{position:fixed;top:0;right:0;bottom:0;left:0;background:white;background:var(--bg,Canvas)}' +
		// And the page beneath is not drawn at all while the notice is up, so the veil is a second guard, not the only one.
		// Legacy Edge still showed a flash of mustard with the veil solid: there every faint accent tint of the page paints
		// as the full accent (no color-mix(), so Tailwind's fallback is plain var(--accent)). `!important` and the ID beat a
		// page's own `visibility:visible` (Tailwind's `visible`, `!visible`); the notice's own subtree stays visible.
		'body>*:not(#ID),body>*:not(#ID) *{visibility:hidden!important}' +
		// The site's top bar, as every page has it: the mark and the wordmark over a hairline, 61 px tall.
		'#ID .lob-bar{position:relative;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;height:61px;box-sizing:border-box;padding:0 40px;' +
		'background:white;background:var(--bg,Canvas);border-bottom:' + RULE + '}' +
		'#ID .lob-bar img{width:30px;height:30px}' +
		'#ID .lob-bar span{padding:0 0 0 12px;font:400 26px/1 var(--font-display,Georgia,serif);color:var(--text-heading,CanvasText)}' +
		'#ID .lob-stage{position:relative;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;' +
		'-webkit-box-align:start;-webkit-align-items:flex-start;align-items:flex-start;min-height:100%;box-sizing:border-box;padding:48px 16px 48px}' +
		// The site's card: 12 px corners, a hairline in --border, no shadow.
		'#ID .lob-card{width:100%;max-width:38rem;box-sizing:border-box;padding:32px;border-radius:12px;background:white;background:var(--bg,Canvas);' +
		'border:1px solid rgba(127,127,127,.25);border:' + RULE + ';' +
		'opacity:0;-webkit-transform:translateY(10px);transform:translateY(10px);-webkit-transition:opacity .5s ease,-webkit-transform .5s ease;transition:opacity .5s ease,transform .5s ease}' +
		'#ID.lob-in .lob-card{opacity:1;-webkit-transform:none;transform:none}' +
		// The notice's own selection colors. The site's `::selection` is a tint made with `color-mix()`; a browser without
		// it paints the raw accent, which hid the heading in legacy Edge. The system's own pair is readable everywhere.
		'#ID ::selection{background:Highlight;color:HighlightText}#ID ::-moz-selection{background:Highlight;color:HighlightText}' +
		// A visually hidden span: read aloud, never shown ("opens in a new tab").
		'#ID .lob-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
		'#ID .lob-eyebrow{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;margin:0;padding:0 0 18px;' +
		'font:500 12px/1 ' + MONO + ';letter-spacing:.16em;text-transform:uppercase;color:var(--accent,Highlight)}' +
		'#ID h1{margin:0;padding:0 0 10px;font:700 34px/1.1 var(--font-display,Georgia,"Times New Roman",serif);letter-spacing:-.01em;color:inherit;color:var(--text-heading,CanvasText);outline:none}' +
		'#ID h2{margin:0;padding:0 0 12px;font:500 12px/1 ' + MONO + ';letter-spacing:.16em;text-transform:uppercase;color:var(--text-muted,GrayText)}' +
		'#ID p,#ID ol,#ID ul,#ID dl,#ID dd{margin:0;font-size:16px;line-height:1.6}' +
		'#ID .lob-lead{padding:0 0 22px;font-size:17px}' +
		'#ID figure{margin:0;padding:0 0 22px}' +
		'#ID figure img{display:block;width:100%;height:auto;border:' + RULE + '}' +
		'#ID figcaption{padding:10px 0 0;font-size:14px;line-height:1.5;color:var(--text-muted,GrayText)}' +
		'#ID .lob-spec{display:-webkit-box;display:-webkit-flex;display:flex;padding:0;border-radius:12px;background:var(--bg-alt,transparent);border:' + RULE + ';overflow:hidden}' +
		'#ID .lob-spec div{-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;padding:14px 18px}' +
		'#ID .lob-spec div+div{border-left:' + RULE + '}' +
		'#ID .lob-spec dt{padding:0 0 6px;font:500 11px/1 ' + MONO + ';letter-spacing:.16em;text-transform:uppercase;color:var(--text-muted,GrayText)}' +
		'#ID .lob-spec dd{font:700 20px/1.2 var(--font-display,Georgia,serif);color:var(--text-heading,CanvasText)}' +
		'#ID .lob-note{padding:16px 0 0}' +
		'#ID .lob-note+ol,#ID .lob-note+ul{padding-top:8px}' +
		'#ID ol,#ID ul{margin:0;padding:16px 0 0 1.4em}' +
		'#ID .lob-supported{font-size:15px}' +
		'#ID .lob-section .lob-supported{padding-top:6px}' +
		// A requirement: the plain words, then a quieter line with the technical name and its state.
		'#ID .lob-reqs-lead{padding:6px 0 0}' +
		'#ID .lob-req-plain,#ID .lob-req-meta{display:block}' +
		'#ID .lob-req-meta{font:400 12px/1.5 ' + MONO + ';color:var(--text-muted,GrayText)}' +
		'#ID .lob-req-missing{font-weight:700;color:var(--accent,Highlight)}' +
		'#ID h2+.lob-note{padding-top:0}' +
		// The section owns the gap above the footer rule, whichever way it ends (a button, the can't-update line, a note).
		'#ID .lob-body{padding-bottom:24px}' +
		'#ID li{padding:0 0 6px 4px}' +
		'#ID .lob-after{padding:4px 0 0;font-size:15px;color:var(--text-muted,GrayText)}' +
		// "Can't update?" as a short labeled block: the question, then one line for a work device and one for your own.
		'#ID .lob-cant{padding:18px 0 0}' +
		// Body text stays at weight 400 everywhere in the notice, and emphasis comes from the heading color. The site loads
		// Outfit one static weight at a time, and an old browser that meets a weight the page had not loaded yet draws the
		// light 300 instead and never swaps (the owner's legacy Edge: the bold lead-ins came out thin).
		'#ID .lob-cant-q{font-size:16px;font-weight:400;color:var(--text-heading,CanvasText)}' +
		// Bulleted, with the same indent as the other lists in the notice (the owner's ask).
		'#ID .lob-cant-ways{list-style:disc;padding:4px 0 0 1.4em}' +
		'#ID .lob-cant-ways li{padding:2px 0 0 4px;font-size:15px;color:var(--text-body,CanvasText)}' +
		'#ID .lob-cant-ways strong{font-weight:400;color:var(--text-heading,CanvasText)}' +
		'#ID .lob-actions{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;-webkit-box-align:center;-webkit-align-items:center;align-items:center;padding:18px 0 0}' +
		// The site's primary button: 40 px tall, 6 px corners, 14 px at weight 500.
		'#ID .lob-actions a{display:inline-block;font-size:15px;font-weight:400;line-height:40px;text-decoration:none}' +
		'#ID .lob-primary{padding:0 16px;border-radius:6px;background:var(--accent,Highlight);color:white;color:var(--on-accent,var(--bg,Canvas))}' +
		'#ID .lob-primary:hover{text-decoration:underline}' +
		// Keyboard focus is always visible, in the accent, on every control.
		'#ID a:focus,#ID button:focus{outline:2px solid var(--accent,Highlight);outline-offset:3px}' +
		'#ID .lob-foot{padding:20px 0 0;border-top:' + RULE + '}' +
		'#ID .lob-foot p,#ID .lob-foot .lob-supported{font-size:15px;color:var(--text-muted,GrayText)}' +
		'#ID .lob-section{padding:12px 0 0}' +
		// A section's toggle: its label after a drawn triangle (no typed glyph, #29) that turns when the section opens.
		'#ID .lob-toggle{position:relative;font:inherit;font-weight:400;color:inherit;background:none;border:0;padding:0 0 0 16px;cursor:pointer;text-align:left}' +
		'#ID .lob-toggle:before{content:"";display:inline-block;width:0;height:0;border-style:solid;border-width:5px 0 5px 8px;border-color:transparent transparent transparent currentColor;padding:0;position:absolute;left:0;top:.45em;-webkit-transition:transform .15s;transition:transform .15s}' +
		'#ID .lob-toggle[aria-expanded="true"]:before{-webkit-transform:rotate(90deg);transform:rotate(90deg)}' +
		'#ID .lob-section p+p{padding:6px 0 0}' +
		'#ID .lob-continue{padding:12px 0 0}' +
		'#ID .lob-go{font:inherit;font-weight:400;padding:0;background:none;border:0;color:inherit;color:var(--text-body,CanvasText);text-decoration:underline;cursor:pointer}' +
		// Wide screens: the slide sits beside the words, so the whole card fits a 1440 x 900 screen without scrolling. Grid
		// is in every browser this is for (Chrome 57, Safari 10.1, Firefox 52); one without it keeps the stacked layout.
		// `@supports` first: legacy Edge (EdgeHTML 15) has no grid, and the wide card without its two columns ran far too wide.
		'@supports (display:grid){@media (min-width:980px){#ID .lob-stage{-webkit-box-align:center;-webkit-align-items:center;align-items:center;padding:32px 32px 40px}' +
		'#ID .lob-card{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.12fr);grid-template-areas:"head media" "body media" "foot media";' +
		'grid-column-gap:44px;max-width:76rem;padding:36px 44px}' +
		'#ID .lob-head{grid-area:head}#ID .lob-body{grid-area:body}#ID .lob-foot{grid-area:foot}#ID figure{grid-area:media;-webkit-align-self:center;align-self:center;padding:0}}}' +
		'@media (max-width:560px){#ID .lob-bar{padding:0 16px}#ID .lob-stage{padding:16px 12px 32px}#ID .lob-card{padding:22px 18px}#ID h1{font-size:28px}' +
		'#ID .lob-spec{display:block}#ID .lob-spec div+div{border-left:0;border-top:' + RULE + '}' +
		'}' +
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

	/** The supported browsers, as a list, from the data the endpoint put in front of this file. */
	function supportedList() {
		var ul = el('ul', 'lob-supported');
		var j;
		for (j = 0; j < LOB.supported.length; j++) ul.appendChild(el('li', '', LOB.supported[j]));
		return ul;
	}

	/**
	 * Every capability Lattice needs, in plain words first and the technical name second, each marked in words: "Missing"
	 * or "Supported" (no check or cross glyphs, #29). The same list style as the supported browsers.
	 */
	function requirementsList() {
		var wrap = el('div');
		wrap.appendChild(el('p', 'lob-reqs-lead', 'Lattice needs everything on this list. This browser lacks the items marked Missing. If this is a work computer, show this list to your IT team.'));
		var ul = el('ul', 'lob-supported lob-reqs');
		var j;
		var k;
		var li;
		var gone;
		var meta;
		for (j = 0; j < LOB.requirements.length; j++) {
			gone = false;
			for (k = 0; k < missing.length; k++) if (missing[k] === LOB.requirements[j].label) gone = true;
			li = el('li');
			li.appendChild(el('span', 'lob-req-plain', LOB.requirements[j].plain));
			meta = el('span', 'lob-req-meta');
			meta.appendChild(el('span', 'lob-req-tech', LOB.requirements[j].label));
			meta.appendChild(document.createTextNode(' \u00b7 '));
			meta.appendChild(el('span', gone ? 'lob-req-state lob-req-missing' : 'lob-req-state', gone ? 'Missing' : 'Supported'));
			li.appendChild(meta);
			ul.appendChild(li);
		}
		wrap.appendChild(ul);
		return wrap;
	}

	/** One way forward when the reader can't update: a short bold lead-in ("On a work device:"), then what to do. */
	function way(lead, rest) {
		var li = el('li');
		li.appendChild(el('strong', '', lead));
		li.appendChild(document.createTextNode(' ' + rest));
		return li;
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

	var sections = 0;

	/**
	 * A collapsed section, opened by a real button, the same in every engine. Not `<details>`: browsers disagree about it
	 * (the original Edge has none; another engine the owner tried drew its own arrow beside ours and kept the content
	 * shut), and a feature test for it guessed wrong. A button with `aria-expanded` and `aria-controls` is the
	 * disclosure pattern screen readers know, and it needs nothing these browsers lack.
	 */
	function collapsible(label, content) {
		var wrap = el('div', 'lob-section');
		var p = el('p', 'lob-section-head');
		var b = el('button', 'lob-toggle', label);
		sections += 1;
		content.id = ID + '-section-' + sections;
		b.type = 'button';
		b.setAttribute('aria-expanded', 'false');
		b.setAttribute('aria-controls', content.id);
		content.style.display = 'none';
		// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
		b.onclick = function () {
			var opening = b.getAttribute('aria-expanded') !== 'true';
			b.setAttribute('aria-expanded', opening ? 'true' : 'false');
			content.style.display = opening ? '' : 'none';
		};
		p.appendChild(b);
		wrap.appendChild(p);
		wrap.appendChild(content);
		return wrap;
	}

	// `?lob-debug`: the colors this engine computes as the notice takes over, shown in the card so a reader on a browser we
	// can't run (legacy Edge) can send a screenshot. It reads, and saves its own readings at pagehide for the next load.
	function traceColors(card, veil, hiderText) {
		var root = document.documentElement;
		var trace = [['hider ' + (hiderText || 'none')]];
		var out = el('pre');
		out.setAttribute('data-testid', 'lob-trace');
		out.style.cssText = 'font:11px/1.4 monospace;white-space:pre-wrap;padding:8px 0 0;margin:0';
		card.appendChild(out);
		function colors() {
			return 'html ' + getComputedStyle(root).backgroundColor + ', body ' + getComputedStyle(document.body).backgroundColor + ', veil ' + getComputedStyle(veil).backgroundColor;
		}
		function sample(label) {
			var cs = getComputedStyle(root);
			trace.push([label, Date.now(), colors(), '--bg ' + cs.getPropertyValue('--bg') + ' --accent ' + cs.getPropertyValue('--accent')]);
			out.textContent = trace.join('\n');
		}
		try {
			if (sessionStorage.getItem('lob-trace-prev')) trace.push(['previous page, at pagehide: ' + sessionStorage.getItem('lob-trace-prev')]);
		} catch (_e) {}
		// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
		window.addEventListener('pagehide', function () {
			try {
				sessionStorage.setItem('lob-trace-prev', colors());
			} catch (_e) {}
		});
		sample('show');
		// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
		setTimeout(function () {
			sample('show+50ms');
		}, 50);
		// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
		setTimeout(function () {
			sample('show+600ms');
		}, 600);
	}

	function show() {
		if (document.getElementById(ID)) return;
		var root = document.documentElement;
		var dark = root.getAttribute('data-mode') === 'dark';
		var said = advice();
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
		// The color as a literal too: an engine that drops a var() with a system-color fallback would paint the veil clear.
		var bg = window.getComputedStyle ? getComputedStyle(document.body).backgroundColor : '';
		if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') veil.style.backgroundColor = bg;
		veil.setAttribute('aria-hidden', 'true');
		screen.appendChild(veil);
		// The site's top bar, so the notice reads as a page of the site. Branding only: the heading says what this is, so
		// assistive technology skips it.
		var bar = el('div', 'lob-bar');
		bar.setAttribute('aria-hidden', 'true');
		var mark = el('img');
		mark.src = LOB.mark;
		mark.alt = '';
		bar.appendChild(mark);
		bar.appendChild(el('span', '', 'Lattice'));
		screen.appendChild(bar);
		var stage = el('div', 'lob-stage');
		// An article: the notice is one self-contained piece, so its header and footer belong to it, not to the page (inside a
		// plain div they would be read as the site's own banner and footer landmarks).
		var card = el('article', 'lob-card');

		// 1. What this is: the heading and one sentence.
		var head = el('header', 'lob-head');
		var eyebrow = el('p', 'lob-eyebrow', 'Browser update needed');
		head.appendChild(eyebrow);
		var title = el('h1', '', 'Lattice needs a newer browser.');
		title.id = ID + '-title';
		title.tabIndex = -1;
		head.appendChild(title);
		var lead = el('p', 'lob-lead', 'Lattice turns a few lines of plain text into slides like this one. Your browser is too old to run Lattice. Updating it is free.');
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
		// Old Windows can't update to a browser new enough, so the section says what the reader CAN do instead.
		var oldWindows = said ? said.oldWindows === true : false;
		var h2 = el('h2', '', oldWindows ? 'What you can do' : 'How to update');
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
			// A browser we can't name: the advice points to the supported list, which sits collapsed in the footer like the
			// technical details, one click away and never on another page.
			body.appendChild(el('p', 'lob-note', "We couldn't tell which browser this is. Lattice works in current versions of Chrome, Edge, Firefox and Safari. On your own device, install or update one of them; Supported browsers below lists the versions."));
		}
		var actions;
		if (said ? !!said.link : false) {
			// The one link in the notice leads off the site, to the browser maker's own update page, which an old browser can
			// open. Nothing links to another page of this site: it would be as broken here as this one.
			actions = el('p', 'lob-actions');
			actions.appendChild(newTabLink('lob-primary', said.linkText, said.link));
			body.appendChild(actions);
		}
		// Every reader who can't update gets a way forward that respects their organization: on a work device, the IT team
		// (never a way around them); on their own, the browsers that work. Never another device (the owner's infosec rule;
		// browser-floor.ts). Old Windows says both in its note.
		var cant;
		var ways;
		if (!oldWindows) {
			cant = el('div', 'lob-cant');
			cant.appendChild(el('p', 'lob-cant-q', "Can't update?"));
			ways = el('ul', 'lob-cant-ways');
			ways.appendChild(way('On a work device:', 'ask your IT team. They manage its updates.'));
			ways.appendChild(way('On your own device:', 'use any browser in the Supported browsers list below.'));
			cant.appendChild(ways);
			body.appendChild(cant);
		}
		card.appendChild(body);

		// 4. Why it matters, the technical detail for whoever wants it, and the way past.
		var foot = el('footer', 'lob-foot');
		foot.appendChild(el('p', '', "Updating also gets you the latest security fixes, so it's worth doing anyway. Nothing is wrong with your device or your files."));
		// The supported list, collapsed like the technical details, for every reader.
		foot.appendChild(collapsible('Supported browsers', supportedList()));
		foot.appendChild(collapsible('Capability requirements', requirementsList()));
		var cont = el('p', 'lob-continue', 'You can still look around, but some pages may look broken or not work. ');
		var go = el('button', 'lob-go', 'Continue anyway');
		go.type = 'button';
		cont.appendChild(go);
		foot.appendChild(cont);
		card.appendChild(foot);

		stage.appendChild(card);
		screen.appendChild(stage);

		// The page beneath stays behind the solid veil and out of reach: hidden from assistive technology, from the pointer and,
		// where the browser knows `inert`, from the keyboard. Every attribute and style is given back on "Continue anyway".
		var touched = [];
		var kids = document.body.children;
		// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
		var hide = function (k) {
			var t;
			if (k === screen || k.nodeType !== 1 || k.tagName === 'SCRIPT') return;
			// A node the app moves within <body> arrives again as "added": it keeps its first snapshot, or Continue anyway would
			// restore the hidden state it was given the first time.
			for (t = 0; t < touched.length; t++) if (touched[t].el === k) return;
			touched.push({
				el: k,
				hidden: k.getAttribute('aria-hidden'),
				inert: k.hasAttribute('inert'),
				// Only the properties this notice changes, so a style the app sets meanwhile survives Continue anyway.
				pointerEvents: k.style.pointerEvents,
				userSelect: k.style.userSelect,
				webkitUserSelect: k.style.webkitUserSelect,
				msUserSelect: k.style.msUserSelect,
			});
			k.setAttribute('aria-hidden', 'true');
			k.setAttribute('inert', '');
			k.style.pointerEvents = 'none';
			// Nothing beneath can be selected either (a select-all would reach the hidden page).
			k.style.webkitUserSelect = 'none';
			k.style.msUserSelect = 'none';
			k.style.userSelect = 'none';
		};
		for (i = 0; i < kids.length; i++) hide(kids[i]);
		// An app keeps adding to <body> after this shows (the Studio mounts toasts and portals): each joins the page beneath.
		var watcher = null;
		if (window.MutationObserver) {
			// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
			watcher = new MutationObserver(function (records) {
				var r;
				var n;
				// A notice taken off the page some other way stops watching: it no longer owns what lies beneath.
				if (!screen.parentNode) {
					watcher.disconnect();
					return;
				}
				for (r = 0; r < records.length; r++) for (n = 0; n < records[r].addedNodes.length; n++) hide(records[r].addedNodes[n]);
			});
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
			// Said on the page too, for a tab whose storage throws (an old Safari private window): device-gate.ts reads both.
			root.setAttribute('data-old-browser', 'continued');
			try {
				sessionStorage.setItem(KEY, '1');
				// The Studio and the Playground read their own key: continuing here runs them as Lite for this tab.
				sessionStorage.setItem(LOB.deviceContinueKey, '1');
			} catch (_e) {}
			document.removeEventListener('focusin', keep, true);
			if (watcher) watcher.disconnect();
			var j;
			var t;
			for (j = 0; j < touched.length; j++) {
				t = touched[j];
				if (t.hidden === null) t.el.removeAttribute('aria-hidden');
				else t.el.setAttribute('aria-hidden', t.hidden);
				if (!t.inert) t.el.removeAttribute('inert');
				t.el.style.pointerEvents = t.pointerEvents;
				t.el.style.userSelect = t.userSelect;
				t.el.style.webkitUserSelect = t.webkitUserSelect;
				t.el.style.msUserSelect = t.msUserSelect;
			}
			root.style.overflow = overflow;
			screen.parentNode.removeChild(screen);
			style.parentNode.removeChild(style);
			if (pageHider && pageHider.parentNode) pageHider.parentNode.removeChild(pageHider);
			// Tell the page (device-gate.ts on the Studio and the Playground); `createEvent` because these browsers may not
			// construct events with `new Event`.
			var ev = document.createEvent('Event');
			ev.initEvent(LOB.continueEvent, false, false);
			document.dispatchEvent(ev);
		};

		document.body.appendChild(screen);
		if (watcher) watcher.observe(document.body, { childList: true });
		// The <head> check hid the page before its first paint (old-browser-check.es5.js); the solid veil covers it from now on.
		// Its own rule hides the page from now on, so the hider keeps only its literal <html> background, until Continue
		// anyway: legacy Edge otherwise painted <html> in the accent, and a refresh flashed the window mustard.
		var pageHider = document.getElementById('lattice-old-browser-veil');
		var hiderText = pageHider ? pageHider.textContent : '';
		if (pageHider) pageHider.textContent = hiderText.replace('body{visibility:hidden}', '');
		// A notice that arrived after the head check gave up on it (8 s, old-browser-check.es5.js) takes the page back: the
		// mark returns from "failed", so the Studio's gate takes its own screen down rather than stacking one on this.
		if (root.getAttribute('data-old-browser') === 'failed') root.setAttribute('data-old-browser', '');
		title.focus();
		// `?lob-debug`: the colors this engine computes as the notice takes over,
		// shown in the card so a reader on a browser we can't run can send a screenshot. Reads only.
		if (/[?&]lob-debug/.test(location.search)) traceColors(card, veil, hiderText);
		// biome-ignore lint/complexity/useArrowFunction: ES5 on purpose.
		setTimeout(function () {
			screen.className = 'lob-in';
		}, 30);
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
	else show();
})();
