/**
 * THE STUDIO PREVIEW PROBE, run INSIDE the Studio page by WebDriver (run.mjs) on Mobile Safari in the iOS
 * Simulator, and by the Playwright self-test (probe.selftest.mjs) on WebKit. It is the same check as
 * docs/e2e/studio-preview-inert-payloads.spec.ts, written without Playwright because Playwright cannot
 * drive iOS Safari:
 *
 *   1. put a deck on a `checklist` slide carrying two payloads: a `>` inside a quoted attribute (the
 *      inline-run tokenizer, followups.d 2853-p1) and the nested-<form> mXSS shape (#1993);
 *   2. assert the preview frame keeps the attribute's text, holds no <img>, and ran nothing;
 *   3. edit the heading so the Studio takes its PATCH write path (`patchSlideBody`), and assert again;
 *   4. prove the detector works on this engine: an <img onerror> written into the same frame MUST set the
 *      flag, or "nothing ran" would be vacuous (a CSP or a broken check reads the same as a safe page).
 *
 * The file defines one global function, `latticeStudioProbe()`, which resolves to a plain JSON result.
 * Plain browser JS on purpose: WebDriver's execute-script sends source text, not a module.
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeStudioProbe() {
	const DECK = [
		'---',
		'marp: true',
		'---',
		'',
		'<!-- _class: checklist -->',
		'',
		'# Payloads stay text',
		'',
		'- <span title="a><img src=x onerror=top.__pwned=1>">quoted</span> attribute **kept** as text',
		'- second <b>item</b> here',
		'- <form><math><mtext></form><form><mglyph><style></math><img src onerror=top.__pwned=2> tail <b>x</b>',
		'',
	].join('\n');
	const TITLE = 'a><img src=x onerror=top.__pwned=1>';
	const EDITED = 'Payloads stay text, edited';
	const result = { ua: navigator.userAgent, width: innerWidth, steps: [], ok: false };
	const step = (name, pass, detail) => {
		result.steps.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
		if (!pass) throw new Error(`${name}: ${detail}`);
	};
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
	// Not inside an `inert` subtree: the pre-paint skeleton draws look-alike buttons with the same labels that do nothing.
	const visible = (el) => !!el && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const button = (label) => [...document.querySelectorAll(`button[aria-label="${label}"]`)].find(visible);
	const frame = () => document.querySelector('[aria-label="Live deck preview"] iframe.live');
	const frameDoc = () => {
		try {
			return frame()?.contentDocument || null;
		} catch {
			return null;
		}
	};
	const narrow = innerWidth <= 699;

	/** Replace the deck source the way a person pasting does: one insertText into the focused editor. */
	const setDeck = async (text) => {
		// Re-taps the Markdown source pane until the editor shows, and never taps the inert skeleton (show-editor.js, #2911).
		const el = await latticeShowDeckEditor();
		el.focus();
		if (el instanceof HTMLTextAreaElement) {
			el.select();
			if (!document.execCommand('insertText', false, text)) {
				el.value = text;
				el.dispatchEvent(new Event('input', { bubbles: true }));
			}
		} else {
			document.execCommand('selectAll');
			document.execCommand('insertText', false, text);
		}
		if (narrow) {
			// Back to the Preview pane, and make sure the tap took: re-tap every 2 s until the button reads pressed. One tap,
			// unchecked, is the pattern behind #2911's editor timeouts; an iPhone run then waited 60 s on a preview it never showed.
			let tapped = 0;
			await until(() => {
				const prev = button('Preview');
				if (prev?.getAttribute('aria-pressed') === 'true') return true;
				if (prev && Date.now() - tapped > 2000) {
					tapped = Date.now();
					prev.click();
				}
				return false;
			}, 30000, 'the Preview pane (its button pressed)');
		}
	};

	/** What the preview holds, for a timeout's message: the frames, which one is `.live`, and what its document has. */
	const previewState = () => {
		const box = document.querySelector('[aria-label="Live deck preview"]');
		const frames = [...(box?.querySelectorAll('iframe') ?? [])];
		const doc = frameDoc();
		return [
			`preview box ${box ? 'present' : 'absent'}`,
			`iframes ${frames.map((f) => `[${f.className || '-'} ${Math.round(f.getBoundingClientRect().width)}w]`).join(' ') || 'none'}`,
			`live doc ${doc ? `${doc.readyState}, ${doc.querySelectorAll('section').length} sections, first heading "${doc.querySelector('h1, h2')?.textContent?.trim().slice(0, 40) ?? ''}"` : 'unreadable'}`,
			`Preview pressed ${button('Preview')?.getAttribute('aria-pressed') ?? 'n/a'}`,
		].join('; ');
	};

	const check = async (when) => {
		const doc = await until(() => {
			const d = frameDoc();
			return d?.querySelector('.lattice section li span[title]') ? d : null;
		}, 60000, `${when}: the payload slide in the preview frame`).catch((e) => {
			throw new Error(`${e.message} (${previewState()})`);
		});
		await until(() => doc.querySelector('.lattice section li .lat-run'), 15000, `${when}: the inline-run wrapper`);
		step(`${when}: inline-run wrapped the item`, true);
		const title = doc.querySelector('.lattice section li span[title]').getAttribute('title');
		step(`${when}: the attribute keeps its text`, title === TITLE, JSON.stringify(title));
		const imgs = doc.querySelectorAll('.lattice img').length;
		step(`${when}: no <img> element in the slide`, imgs === 0, `${imgs} found`);
		await sleep(1500); // give any error event a chance to fire before reading the flag
		const pwned = window.__pwned ?? frame()?.contentWindow?.__pwned;
		step(`${when}: nothing ran in either frame`, pwned === undefined, `__pwned = ${pwned}`);
	};

	try {
		// The Studio has booted and rendered once. Not "the editor exists": a phone opens on the preview and mounts the
		// editor only when its pane is shown, which setDeck does through latticeShowDeckEditor (#2911).
		await until(() => window.__latticeRenderMetrics, 150000, "the Studio's first render (its render metrics)");
		const paths = [];
		window.__latticeRenderMetrics.on((s) => paths.push(String(s.writePath)));

		await setDeck(DECK);
		await check('first write');

		paths.length = 0;
		await setDeck(DECK.replace('# Payloads stay text', `# ${EDITED}`));
		await until(() => paths.includes('patch'), 30000, `a patch render (saw: ${paths.join(',') || 'none'})`);
		step('the edit took the patch write path', true, paths.join(','));
		const h1 = await until(() => {
			const t = frameDoc()?.querySelector('.lattice section h1')?.textContent?.trim();
			return t === EDITED ? t : null;
		}, 30000, 'the edited heading in the preview');
		step('the edited heading is on screen', true, h1);
		await check('after the patch');

		// ANTI-VACUITY: the same frame, the same flag, a handler that SHOULD run.
		const doc = frameDoc();
		const holder = doc.createElement('div');
		holder.innerHTML = '<img src="x-probe-missing.png" onerror="top.__latticeProbeRan = 1">';
		doc.body.appendChild(holder);
		await until(() => window.__latticeProbeRan === 1, 10000, 'the detector control: an onerror written into the frame on purpose');
		holder.remove();
		step('detector control: a handler written on purpose DOES run and is seen', true);
		result.ok = true;
	} catch (e) {
		result.error = String(e?.message ?? e);
	}
	return result;
}
