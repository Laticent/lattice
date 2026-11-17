/**
 * THE EMPTY-DECK TAP PROBE, page side. run.mjs runs it in Mobile Safari on the iOS Simulator, after the Compose tap, on the
 * same page, and sends the touch itself through WebDriver between the calls below. probe.selftest.mjs runs it on Playwright's
 * WebKit with a touchscreen tap (PROBE=empty-deck). Design: engineering/decisions/2026-11-17-compose-empty-deck.md.
 *
 * An empty deck shows Compose's start grid under one empty line, and the hint says "tap here to start writing". On a phone
 * there is no keyboard until a tap, so the whole canvas below the line is that tap (StudioShell's `[data-start-grid]`
 * click calls `focusEmptyLine`). Only a real touch can show that Safari gives the editor the focus from that tap:
 *
 *   1. `latticeEmptyDeckPrep()` saves the deck's text, empties it the way a person does (select all in Source, delete),
 *      goes back to Compose, waits for the "Start your deck" region, and returns a point on the grid's own background
 *      (not a tile or a link) once that point has held still for five frames;
 *   2. the caller taps that point;
 *   3. `latticeEmptyDeckRead()` reads what the tap did: the editor has the focus, a caret (not a range) sits in the empty
 *      line, and the grid is still there, because nothing has been typed yet;
 *   4. `latticeEmptyDeckRestore(text)` puts the saved deck back in Source, so the probes after this one see the deck they
 *      expect.
 *
 * Plain browser JS on purpose: WebDriver's execute-script sends source text, not a module. Needs show-editor.js ahead of it.
 */
globalThis.latticeEmptyDeckParts = () => {
	const visible = (el) => !!el && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const button = (label) => [...document.querySelectorAll(`button[aria-label="${label}"]`)].find(visible);
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const until = async (fn, ms, what) => {
		const t0 = Date.now();
		for (;;) {
			const v = fn();
			if (v) return v;
			if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
			await sleep(100);
		}
	};
	const pm = () => {
		const e = document.querySelector('#studio-pane-editor .cs-host .ProseMirror');
		return visible(e) ? e : null;
	};
	const grid = () => {
		const g = document.querySelector('[data-start-grid]');
		return visible(g) ? g : null;
	};
	/** The Deck source editor's text: CodeMirror's lines, or the fallback textarea's value. */
	const sourceText = (el) => (el instanceof HTMLTextAreaElement ? el.value : [...el.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));
	/** Into Source, replace the whole text with `text` in one edit (studio-probe.js's `setDeck`), and read it back. */
	const replaceSource = async (text) => {
		await until(() => button('Markdown source'), 150000, 'a live Markdown source button');
		const t0 = Date.now();
		while (!document.querySelector('[aria-label="Deck source"]') || !visible(document.querySelector('[aria-label="Deck source"]'))) {
			if (Date.now() - t0 > 150000) throw new Error('the Markdown source button never brought the editor up');
			button('Markdown source')?.click();
			const t = Date.now();
			while (!visible(document.querySelector('[aria-label="Deck source"]')) && Date.now() - t < 2000) await sleep(100);
		}
		const el = await latticeShowDeckEditor();
		const before = sourceText(el);
		// One space for "empty": WebKit's `delete` command leaves CodeMirror's text as it was (Playwright WebKit, iPhone shape),
		// while `insertText` is the edit studio-probe.js's `setDeck` already relies on. A space is blank by the empty rule
		// (`isBlankDeck` trims), so it is the same deck a person who selects all and deletes ends up with.
		const put = text || ' ';
		el.focus();
		if (el instanceof HTMLTextAreaElement) {
			el.select();
			if (!document.execCommand('insertText', false, put)) {
				el.value = put;
				el.dispatchEvent(new Event('input', { bubbles: true }));
			}
		} else {
			document.execCommand('selectAll');
			document.execCommand('insertText', false, put);
		}
		await until(() => sourceText(el).trim() === text.trim(), 10000, `the Deck source to read ${text ? 'the saved deck' : 'empty'}`);
		el.blur();
		return before;
	};
	/** Back to Compose: tap its button (or cell, on a phone) every 2 s until the rich editor shows. */
	const showCompose = async () => {
		const t0 = Date.now();
		while (!pm()) {
			if (Date.now() - t0 > 60000) throw new Error('the Compose button never brought the rich editor up');
			button('Compose — rich editor')?.click();
			const t = Date.now();
			while (!pm() && Date.now() - t < 2000) await sleep(100);
		}
	};
	return { visible, until, pm, grid, replaceSource, showCompose };
};

globalThis.latticeEmptyDeckPrep = async () => {
	const { until, pm, grid, replaceSource, showCompose } = latticeEmptyDeckParts();
	document.activeElement?.blur?.();
	getSelection()?.removeAllRanges();
	const saved = await replaceSource('');
	await showCompose();
	const g = await until(grid, 20000, 'the start grid on the empty deck');
	await until(() => document.querySelector('[data-start-grid] [aria-label="Starting slides"] li'), 20000, 'the starting tiles');
	document.activeElement?.blur?.();
	getSelection()?.removeAllRanges();
	// WHERE TO TAP: the grid's own background, in its 16 px side padding (on a phone the tiles fill the rest), read once the
	// point has held still for five frames and only when the grid itself is the element under it (a tile or the link is a
	// different tap).
	const t0 = performance.now();
	let last = '';
	let still = 0;
	const at = await new Promise((done) => {
		const look = () => {
			const r = g.getBoundingClientRect();
			const x = Math.round(r.left + 6);
			const y = Math.round(r.top + Math.min(r.height / 2, 120));
			const key = `${x},${y}`;
			still = key === last ? still + 1 : 0;
			last = key;
			const under = document.elementFromPoint(x, y);
			const hit = under === g;
			if ((still >= 5 && hit) || performance.now() - t0 > 10000) done({ x, y, still, hit, under: under ? `${under.tagName}.${String(under.className).slice(0, 60)}` : 'none' });
			else requestAnimationFrame(look);
		};
		look();
	});
	return { saved, ...at, focusedBefore: !!document.activeElement?.closest?.('.ProseMirror'), editor: !!pm(), vv: visualViewport ? visualViewport.height : innerHeight };
};

globalThis.latticeEmptyDeckRead = async () => {
	const { grid } = latticeEmptyDeckParts();
	const t0 = performance.now();
	return new Promise((done) => {
		const read = () => {
			const line = document.querySelector('#studio-pane-editor .cs-host .ProseMirror .cs-slide-content > p');
			const sel = getSelection();
			const node = sel?.anchorNode;
			const inLine = !!(line && node && line.contains(node));
			const caret = !!sel?.isCollapsed;
			const focused = !!document.activeElement?.closest?.('.ProseMirror');
			const shown = !!grid();
			if ((inLine && caret && focused) || performance.now() - t0 > 4000) {
				done({ inLine, caret, focused, shown, active: document.activeElement ? String(document.activeElement.className).slice(0, 60) : 'none', where: node ? `${(node.nodeType === 3 ? node.parentElement : node)?.tagName}` : 'nothing', vv: visualViewport ? visualViewport.height : innerHeight, log: window.__tapLog || null });
			} else requestAnimationFrame(read);
		};
		read();
	});
};

globalThis.latticeEmptyDeckRestore = async (text) => {
	const { replaceSource } = latticeEmptyDeckParts();
	// Off the editor first, as the prep does, then put the text back in Source and STAY there: the icon grid probe after
	// this one starts in Source. On the iOS Simulator a switch back to Compose kept showing the empty deck, focused, with the
	// restored text parked (runs 44087025343 and 44092405081): followups.d/3288-p2-compose-parks-a-source-edit-on-a-phone.md.
	document.activeElement?.blur?.();
	getSelection()?.removeAllRanges();
	await replaceSource(text);
	return true;
};
