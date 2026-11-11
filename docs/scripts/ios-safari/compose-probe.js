/**
 * THE COMPOSE-FIRST PROBE, run INSIDE the Studio page by WebDriver (run.mjs) on Mobile Safari in the iOS Simulator, and by
 * the Playwright self-test (probe.selftest.mjs) on WebKit. Every other Studio probe stores Source first (seed-settings.js)
 * because it types Markdown; this one loads the Studio with NOTHING stored, the way a new visitor does
 * (engineering/decisions/2026-11-10-compose-first.md), and checks on the surface the owner reported from (iPhone Safari):
 *
 *   1. the Studio opens in Compose: on a tablet the Compose segment is pressed and the Markdown editor is not on screen;
 *      on a phone, which opens on the preview, the Compose cell brings the rich editor up;
 *   2. Compose is listed before Source;
 *   3. Compose's slide toolbar keeps its place and width while the caret moves inside a slide (the owner's screen
 *      recording: it grew, shrank and jumped on every move): on up to two slides of whatever deck is open (the
 *      Simulator keeps the earlier probes' deck), through its heading, eyebrow, paragraph and list item, each read once
 *      two frames agree, and only passing when the stops offered different styles.
 *
 * One global, `latticeComposeProbe()`, resolving to a plain JSON result. Plain browser JS on purpose: WebDriver's
 * execute-script sends source text, not a module.
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeComposeProbe() {
	const COMPOSE = 'Compose — rich editor';
	const SOURCE = 'Markdown source';
	const result = { ua: navigator.userAgent, width: innerWidth, steps: [], ok: false };
	const step = (name, pass, detail) => {
		result.steps.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
		if (!pass) throw new Error(`${name}: ${detail}`);
	};
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
	const until = async (fn, ms, what) => {
		const t0 = Date.now();
		for (;;) {
			const v = fn();
			if (v) return v;
			if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
			await sleep(100);
		}
	};
	// Not inside an `inert` subtree: the pre-paint skeleton draws look-alike buttons with the same labels that do nothing.
	const visible = (el) => !!el && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const button = (label) => [...document.querySelectorAll(`button[aria-label="${label}"]`)].find(visible);
	const pm = () => {
		const e = document.querySelector('#studio-pane-editor .cs-host .ProseMirror');
		return visible(e) ? e : null;
	};
	try {
		const phone = innerWidth < 700;
		await until(() => window.__latticeRenderMetrics, 150000, "the Studio's first render (its render metrics)");
		const compose = await until(() => button(COMPOSE), 150000, 'a live Compose button');
		if (phone) {
			step('a phone opens on the preview, with Compose not yet on screen', compose.getAttribute('aria-pressed') === 'false', compose.getAttribute('aria-pressed'));
			// A tap before hydration does nothing (show-editor.js): tap again every 2 s until the rich editor shows.
			const t0 = Date.now();
			while (!pm()) {
				if (Date.now() - t0 > 150000) throw new Error('the Compose cell never brought the rich editor up');
				button(COMPOSE)?.click();
				const t = Date.now();
				while (!pm() && Date.now() - t < 2000) await sleep(100);
			}
			step('the Compose cell brings the rich editor up', true);
		} else {
			await until(() => pm(), 150000, 'the rich editor on a first visit');
			step('a first visit opens in Compose', button(COMPOSE)?.getAttribute('aria-pressed') === 'true', button(COMPOSE)?.getAttribute('aria-pressed'));
			const md = document.querySelector('[aria-label="Deck source"]');
			step('the Markdown editor is not on screen', !visible(md), md ? 'Deck source is visible' : 'absent');
		}
		const cx = button(COMPOSE)?.getBoundingClientRect().left;
		const sx = button(SOURCE)?.getBoundingClientRect().left;
		step('Compose is listed before Source', cx !== undefined && sx !== undefined && cx < sx, `Compose x ${Math.round(cx)}, Source x ${Math.round(sx)}`);

		// Put the caret in the first text of `el`, as a tap does, and return the active slide's pill box once two frames agree.
		const pillAt = async (el, what) => {
			el.scrollIntoView({ block: 'center' });
			const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
			const text = walker.nextNode();
			if (!text) throw new Error(`no text in ${what}`);
			pm().focus();
			const range = document.createRange();
			range.setStart(text, Math.min(1, text.data.length));
			range.collapse(true);
			const sel = getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
			const slide = el.closest('.cs-slide');
			await until(() => slide?.classList.contains('cs-slide-active'), 10000, `${what}'s slide to become active`);
			const pill = () => slide.querySelector(':scope > .cs-slide-bar > .cs-sb-pill');
			let last = '';
			const t0 = Date.now();
			for (;;) {
				await frame();
				await frame();
				const b = pill()?.getBoundingClientRect();
				const now = b && b.width ? `${Math.round(b.left)},${Math.round(b.width)}` : '';
				// The chip count proves the caret moved: a heading offers one style, an eyebrow line three, a list item none.
				if (now && now === last) return `${now} (${slide.querySelectorAll(':scope > .cs-slide-bar .cs-fmt-btn').length} chips)`;
				last = now;
				if (Date.now() - t0 > 10000) throw new Error(`the toolbar never settled at ${what} (last ${now})`);
			}
		};
		const slides = () => [...pm().querySelectorAll(':scope > .cs-slide')];
		await until(() => slides().length >= 1, 30000, 'a slide in Compose');
		// Whatever deck is open (on the Simulator the earlier probes leave theirs in storage): each slide's first heading,
		// eyebrow line, plain paragraph and list item. A slide with two or more of them offers different styles at different
		// stops, which is what made the toolbar move.
		const stopsOf = (s) => {
			const kinds = [
				['heading', s.querySelector('h1, h2, h3')],
				['eyebrow', [...s.querySelectorAll('p')].find((p) => p.children.length === 1 && p.firstElementChild?.tagName === 'CODE' && p.textContent.trim() === p.firstElementChild.textContent.trim())],
				['paragraph', [...s.querySelectorAll('p')].find((p) => !p.querySelector('code') && !p.closest('li') && p.textContent.trim())],
				['list item', s.querySelector('li')],
			].filter(([, el]) => el);
			return kinds.length >= 2 ? [...kinds, [`${kinds[0][0]} again`, kinds[0][1]]] : [];
		};
		const picked = slides().map((s, i) => [i + 1, s]).filter(([, s]) => stopsOf(s).length).slice(0, 2);
		step('the deck has a slide with blocks that offer different styles', picked.length > 0, `${slides().length} slides`);
		let varied = false;
		for (const [n, slide] of picked) {
			const boxes = [];
			for (const [what, el] of stopsOf(slide)) boxes.push(`${what} ${await pillAt(el, `slide ${n} ${what}`)}`);
			const xs = new Set(boxes.map((b) => b.match(/\d+,\d+/)?.[0]));
			if (new Set(boxes.map((b) => b.match(/\((\d+) chips\)/)?.[1])).size > 1) varied = true;
			step(`slide ${n}: the toolbar keeps its place and width as the caret moves`, xs.size === 1, boxes.join(' · '));
		}
		// Without this the check above could pass on stops that all offer the same styles, where nothing would resize anyway.
		step('the caret crossed blocks that offer different styles', varied, varied ? '' : 'every stop offered the same chips');
		result.ok = true;
	} catch (e) {
		result.error = String(e?.message || e);
	}
	return result;
}
