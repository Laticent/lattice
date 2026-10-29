/**
 * THE PHOTO VERDICT PROBE, run INSIDE the Studio page by WebDriver (run.mjs) on Mobile Safari in the iOS Simulator, and by
 * the Playwright self-test (probe.selftest.mjs) on WebKit. It checks, on the surface the owner tests on, what
 * docs/e2e/photo-contrast-coach.spec.ts checks in Chromium and Linux WebKit (engineering/decisions/2026-10-26-photo-contrast-coach.md,
 * "One verdict, two views"):
 *
 *   1. a statement over a bright photo with its scrim cleared: the Coach flags it, and the EDITOR underlines the same slide
 *      with the same message and the same button;
 *   2. the Coach's button fixes it, and the preview never leaves that slide while the fix lands (the jump to the last slide
 *      this PR fixed); both warnings then clear;
 *   3. a thin spotlight card: the Coach's message and button equal the editor tooltip's;
 *   4. leaving a flagged slide drops its finding at once, not a second later with its button hidden.
 *
 * Every number it reads is from the page: the preview frame's slide, the Coach's text, the editor's tooltip. The file
 * defines one global function, `latticePhotoProbe()`, which resolves to a plain JSON result. Plain browser JS on purpose:
 * WebDriver's execute-script sends source text, not a module.
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticePhotoProbe() {
	// A bright photo: a flat light PNG, embedded so the probe needs no network. The same one the e2e uses.
	const BRIGHT =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAABsCAIAAACzYCrFAAAA1klEQVR42u3SMQ0AAAgEsfcvEwEMKMADYWxSBZfLdMFZJMBAGAgDYSAwEAbCQBgIDISBMBAGAgNhIAyEgcBAGAgDYSAMBAbCQBgIA4GBMBAGwkBgIAyEgTAQGAgDYSAMhIHAQBgIA2EgMBAGwkAYCAyEgTAQBgIDYSAMhIHAQBgIA2EgDAQGwkAYCAOBgTAQBsJAYCAMhIEwEBgIA2EgDISBwEAYCANhIDAQBsJAGAgMhIEwEAYCA2EgDISBMBAYCANhIAwEBsJAGAgDgYEwEAbCQGAgPi0bG28SdoIc2AAAAABJRU5ErkJggg==';
	const SLIDES = [
		['<!-- _class: image statement card-clear -->', '## A quiet harbor.', 'The words sit straight on a bright photo.', `![bg](${BRIGHT})`],
		['<!-- _class: image spotlight card-clear -->', '## A dark photo.', 'The theme ink sits on a dark picture.', '![bg](sample:photo-wide.svg)'],
		['## Next steps', 'A plain slide after the photos.'],
	];
	// No front matter: a select-all-and-insert in WebKit can leave a blank first line, and front matter that does not start the
	// document is a slide of its own, which would shift every slide this probe counts.
	const DECK = `${SLIDES.map((s) => s.join('\n\n')).join('\n\n---\n\n')}\n`;
	const HEADINGS = ['A quiet harbor.', 'A dark photo.', 'Next steps'];

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
			await sleep(50);
		}
	};
	const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const byLabel = (label) => [...document.querySelectorAll(`button[aria-label="${label}"]`)].find(visible);
	const byText = (re) => [...document.querySelectorAll('button')].find((b) => visible(b) && re.test(b.textContent.trim()));
	const narrow = innerWidth <= 699;
	const frameDoc = () => {
		try {
			return document.querySelector('[aria-label="Live deck preview"] iframe.live')?.contentDocument || null;
		} catch {
			return null;
		}
	};
	/** The heading of the slide the preview frame shows: the slide on screen, as the reader sees it. */
	const shown = () => frameDoc()?.querySelector('section h1, section h2')?.textContent?.trim() ?? '';
	const editorText = () => document.querySelector('[aria-label="Deck source"]')?.textContent ?? '';
	/** The Coach's photo finding, as text, and its fix button's label. */
	const coachFinding = () => [...document.querySelectorAll('p')].find((p) => visible(p) && /^The text on this photo reads at/.test(p.textContent.trim()));
	const coachButton = () => byText(/^(Set card ink (light|dark)|Pin this slide (light|dark)|Use a solid card)$/);

	const coachOpen = () => [...document.querySelectorAll('*')].some((e) => visible(e) && e.textContent?.trim() === 'Deck read');
	/** Whether the editor is what a tap on it would reach, not something laid over it (the Coach as a sheet). */
	const editorOnTop = () => {
		const ed = document.querySelector('[aria-label="Deck source"]');
		if (!visible(ed)) return false;
		// The middle of the part of the editor inside the window: the editor's own toolbar sits at its top edge.
		const r = ed.getBoundingClientRect();
		const top = Math.max(0, r.top);
		const bottom = Math.min(innerHeight, r.bottom);
		if (bottom <= top) return false;
		return !!document.elementFromPoint(r.left + r.width / 2, (top + bottom) / 2)?.closest('.cm-editor');
	};
	const openSource = async () => {
		// Where the Coach is a sheet OVER the editor (a phone, or iPad Safari's desktop-site width), close it with its back
		// button, as a person would, or every tap below lands on an editor nobody can see.
		// Where the sheet has no back button (iPad Safari's width), press its own close button, as a person does. A synthetic
		// Escape was the only way here once, and in the iPad simulator one in a run was sometimes never honored (#2961); it is
		// kept as the last resort, and each way gets a few seconds before the next is tried.
		const closed = () => !coachOpen() || editorOnTop();
		for (let i = 0; i < 3 && !closed(); i++) {
			const back = byText(/^Deck$/);
			const x = [...document.querySelectorAll('[role="dialog"] button[aria-label="Close"]')].find(visible);
			if (back) back.click();
			else if (x && i < 2) x.click();
			else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			const t0 = Date.now();
			while (!closed() && Date.now() - t0 < 4000) await sleep(100);
		}
		await until(closed, 1000, 'the Coach sheet to close');
		if (!narrow) return;
		(await until(() => byLabel('Markdown source'), 15000, 'the Markdown source button')).click();
		await until(() => visible(document.querySelector('[aria-label="Deck source"]')), 15000, 'the editor');
	};
	const openCoach = async () => {
		// A click that lands before the panel's code has loaded can be lost: click again until the panel is up.
		// Where the bar has room, Coach is its own button; where it does not (iPad Safari asks for the desktop site and lays the
		// Studio out at about 1030 px), it is an item in the "More controls" menu, as docs/e2e's openCoach allows.
		const menuCoach = () => [...document.querySelectorAll('[role="menuitem"]')].find((m) => visible(m) && /^Coach/.test(m.textContent.trim()));
		for (let i = 0; i < 4 && !coachOpen(); i++) {
			// The live menu trigger carries aria-expanded; the loading skeleton's look-alike does not, and does nothing.
			const liveMenu = () => [...document.querySelectorAll('button[aria-label="More controls"]')].find((b) => visible(b) && b.hasAttribute('aria-expanded'));
			const coach = await until(() => byLabel('Toggle Coach') || byText(/^Coach$/) || liveMenu(), 30000, 'the Coach button');
			if (coach.getAttribute('aria-label') === 'More controls') {
				// A Radix menu trigger opens on a mouse-type pointerdown, not on a bare click event. One press only: a second
				// one (or an Enter) toggles the menu shut again. The editor lets go of focus first, as a tap elsewhere makes it:
				// with the caret still in the editor the menu opens and shuts at once.
				if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
				coach.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerType: 'mouse', isPrimary: true }));
				const item = await until(menuCoach, 5000, 'the Coach item in More controls').catch(() => null);
				if (!item) continue;
				item.click();
			} else if (coach.getAttribute('aria-pressed') !== 'true') coach.click();
			const t0 = Date.now();
			while (!coachOpen() && Date.now() - t0 < 5000) await sleep(100);
		}
		await until(coachOpen, 1000, 'the Coach panel');
	};
	/**
	 * Put this probe's deck in the editor and keep it there. The Studio's starter deck can land after the editor is up and
	 * replace what was typed, so wait for the editor to hold OUR deck (a heading no starter deck has) and for the preview to
	 * render it, and type it again if the starter won the race.
	 */
	const setDeck = async (text) => {
		const ours = () => editorText().includes('A quiet harbor.') && editorText().includes('A plain slide after the photos.');
		for (let i = 0; i < 4; i++) {
			await openSource();
			const el = document.querySelector('[aria-label="Deck source"]');
			el.focus();
			document.execCommand('selectAll');
			document.execCommand('insertText', false, text);
			// A cold first render can take seconds: give the preview time to draw our deck before deciding it was replaced.
			const t0 = Date.now();
			while (!(ours() && HEADINGS.includes(shown())) && Date.now() - t0 < 8000) await sleep(200);
			if (ours() && HEADINGS.includes(shown())) return;
		}
		throw new Error(`the probe deck did not stay (the editor ${ours() ? 'holds it' : 'does not hold it'}; the preview shows "${shown()}")`);
	};
	/**
	 * Put the caret on the editor line holding `text`, the way a tap does, and wait for the preview to follow it to the
	 * slide headed `heading`. On a phone the editor is rebuilt when its tab opens, so a caret set on the old view is lost:
	 * place it again until the preview moves.
	 */
	const caretTo = async (text, heading) => {
		for (let i = 0; i < 4; i++) {
			await openSource();
			await sleep(400);
			const line = await until(() => [...document.querySelectorAll('.cm-line')].find((l) => l.isConnected && l.textContent.includes(text)), 15000, `the line "${text}"`);
			document.querySelector('[aria-label="Deck source"]').focus();
			const sel = getSelection();
			sel.removeAllRanges();
			const r = document.createRange();
			r.setStart(line.firstChild ?? line, 0);
			r.collapse(true);
			sel.addRange(r);
			document.dispatchEvent(new Event('selectionchange'));
			const t0 = Date.now();
			while (shown() !== heading && Date.now() - t0 < 6000) await sleep(100);
			if (shown() === heading) return;
		}
		throw new Error(`the preview did not follow the caret to "${heading}" (it shows "${shown()}")`);
	};
	/** Open the editor's lint tooltip on the range on the line holding `text`, with a pointer move over it, and read it. */
	const editorTooltip = async (text) => {
		await openSource();
		const range = await until(() => {
			const line = [...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes(text));
			return line?.querySelector('.cm-lintRange-warning');
		}, 20000, `an editor warning on the line "${text}"`);
		range.scrollIntoView({ block: 'center' });
		await sleep(200);
		// Close whatever tooltip an earlier read left open: the pointer leaves the editor, and CodeMirror needs a moment.
		const content = document.querySelector('.cm-content');
		content.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, clientX: 0, clientY: 0 }));
		await until(() => !document.querySelector('.cm-tooltip-lint'), 5000, 'the earlier tooltip to close').catch(() => null);
		await sleep(400);
		const box = range.getBoundingClientRect();
		const hover = (dx) => {
			const at = { clientX: box.left + Math.min(8 + dx, box.width / 2), clientY: box.top + box.height / 2, bubbles: true };
			range.dispatchEvent(new PointerEvent('pointermove', at));
			range.dispatchEvent(new MouseEvent('mousemove', at));
		};
		hover(0);
		const t0 = Date.now();
		// The lint gutter's marker for the same line opens the same tooltip from a plain mouseover: the fallback when a
		// synthetic pointer move does not open the hover tooltip (CodeMirror can ignore one that follows another).
		const marker = () =>
			[...document.querySelectorAll('.cm-lint-marker')].find((m) => {
				const r = m.getBoundingClientRect();
				return r.bottom > box.top - 2 && r.top < box.top + box.height + 2;
			});
		let markerTried = false;
		const tip = await until(() => {
			// CodeMirror opens a hover tooltip only for a pointer that has rested; nudge it while waiting.
			if (Date.now() - t0 > 1500 && !document.querySelector('.cm-tooltip-lint')) hover((Date.now() / 500) % 2);
			if (Date.now() - t0 > 3000 && !markerTried && !document.querySelector('.cm-tooltip-lint') && marker()) {
				markerTried = true;
				marker().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
			}
			const t = document.querySelector('.cm-tooltip-lint');
			return t && !/Checking the photo/.test(t.textContent) && t.querySelector('.cm-diagnosticAction') ? t : null;
		}, 20000, 'the editor tooltip with its fix');
		return { text: tip.textContent, button: tip.querySelector('.cm-diagnosticAction')?.textContent?.trim() };
	};

	try {
		await until(() => window.__latticeRenderMetrics && document.querySelector('[aria-label="Deck source"]'), 90000, 'the Studio editor');
		// The Studio's first load (its starter deck, its first preview render) settles before anything is typed, as it has by
		// the time a person starts: typing into it mid-load can be replaced by the starter deck landing late.
		await until(() => shown() !== '', 90000, 'the first preview render');
		await sleep(1000);
		await setDeck(DECK);

		// 1. The statement: the Coach flags it, the editor underlines it, same words and same button.
		await caretTo('A quiet harbor.', HEADINGS[0]);
		await openCoach();
		const finding1 = await until(coachFinding, 30000, 'the Coach photo finding on slide 1');
		const said1 = finding1.textContent.trim();
		step('slide 1: the Coach flags the statement under 4.5:1', /reads at [0-3]\.\d:1 \(needs 4\.5:1\)/.test(said1), said1);
		step('slide 1: the Coach offers the dark card ink', coachButton()?.textContent.trim() === 'Set card ink dark', coachButton()?.textContent);
		const tip1 = await editorTooltip('![bg](data:');
		step('slide 1: the editor says what the Coach says', tip1.text.includes(said1), tip1.text);
		step('slide 1: the editor offers the same button', tip1.button === 'Set card ink dark', tip1.button);

		// 2. The Coach's button fixes it, and the preview never leaves slide 1 on the way.
		await openCoach();
		const seen = new Set();
		let watching = true;
		(async () => {
			while (watching) {
				seen.add(shown());
				await sleep(16);
			}
		})();
		const t0 = performance.now();
		(await until(coachButton, 10000, 'the Coach button')).click();
		await until(() => editorText().includes('image statement card-clear ink-dark'), 15000, 'ink-dark written on slide 1');
		await until(() => !coachFinding(), 20000, 'the Coach finding to clear');
		await sleep(1500);
		watching = false;
		step('slide 1: the fix lands and the Coach finding clears', true, `${Math.round(performance.now() - t0)} ms`);
		seen.delete('');
		step('slide 1: the preview never left the slide while the fix landed', seen.size === 1 && seen.has(HEADINGS[0]), [...seen].join(' | '));
		await openSource();
		await sleep(1500);
		const left = [...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes('![bg](data:'))?.querySelector('.cm-lintRange-warning');
		step('slide 1: the editor warning clears too', !left, left ? 'still underlined' : '');

		// 3. A thin spotlight card: the Coach and the editor tooltip agree word for word.
		await caretTo('A dark photo.', HEADINGS[1]);
		await openCoach();
		const finding2 = await until(coachFinding, 30000, 'the Coach photo finding on slide 2');
		const said2 = finding2.textContent.trim();
		const button2 = coachButton()?.textContent.trim();
		step('slide 2: the Coach flags the thin card and offers a card ink', /^Set card ink (light|dark)$/.test(button2 ?? ''), `${said2} [${button2}]`);
		const tip2 = await editorTooltip('_class: image spotlight card-clear');
		step('slide 2: the editor tooltip says what the Coach says', tip2.text.includes(said2), tip2.text);
		step('slide 2: the editor tooltip offers the same button', tip2.button === button2, `${tip2.button} vs ${button2}`);

		// 4. Leaving a flagged slide: its finding goes with the slide, not a second later.
		await openCoach();
		await until(coachFinding, 30000, 'the slide 2 finding before leaving');
		await caretTo('Next steps', HEADINGS[2]);
		const moved = performance.now();
		await openCoach();
		const gone = await until(() => (!coachFinding() ? performance.now() : 0), 10000, 'the slide 2 finding to go');
		step('slide 3: the finding for the slide left behind is gone', true, `${Math.max(0, Math.round(gone - moved))} ms after the preview moved`);

		result.ok = true;
	} catch (e) {
		result.error = String(e?.message ?? e);
	}
	return result;
}
