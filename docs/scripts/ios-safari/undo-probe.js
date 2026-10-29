/**
 * THE UNDO PROBE, run INSIDE the Studio page by WebDriver (run.mjs, PROBE=undo) in real Safari: Mobile Safari in an iPad and
 * an iPhone iOS Simulator, and Safari on the macOS runner. Playwright's WebKit runs it locally first (probe.selftest.mjs).
 * It is the device half of the Filo undo checks (engineering/decisions/2026-10-27-filo-undo-history.md; PR #2959's P3):
 *
 *   1. put a deck in the editor, then type a word as a step of its own;
 *   2. run WebKit's own undo command, `document.execCommand('undo')`. Safari's Edit → Undo, the iOS shake and the
 *      three-finger swipe all send this command, which reaches the page as a `historyUndo` beforeinput: the probe
 *      asserts that event fired (the witness), that the word went, and that the Studio said "Undid". The gesture
 *      and the menu themselves cannot be driven here, which the result says;
 *   3. redo through the same command (`historyRedo`), then, at phone width where the Studio draws them, tap its own
 *      Undo and Redo buttons;
 *   4. type a second word and wait until Filo's IndexedDB store holds it, so run.mjs can reload the page and run
 *      `latticeUndoAfterReload`, which undoes (the button on a phone, the WebKit command wider) until the stored history
 *      lands, and asserts the second word went.
 *
 * Two global functions, each resolving to a plain JSON result. Plain browser JS on purpose: WebDriver's
 * execute-script sends source text, not a module.
 */
// biome-ignore-all lint/correctness/noUnusedVariables: globals for WebDriver's execute-script and Playwright's addScriptTag

const UNDO_DECK = ['# Undo on a device', '', 'First slide.', '', '---', '', '# Second', '', 'Second slide.', ''].join('\n');

function undoProbeKit(result) {
	const step = (name, pass, detail) => {
		result.steps.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
		if (!pass) throw new Error(`${name}: ${detail}`);
	};
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const until = async (fn, ms, what) => {
		const t0 = Date.now();
		for (;;) {
			const v = await fn();
			if (v) return v;
			if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
			await sleep(100);
		}
	};
	const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const button = (label) => [...document.querySelectorAll(`button[aria-label="${label}"]`)].find(visible);
	const editor = () => {
		const e = document.querySelector('[aria-label="Deck source"]');
		return visible(e) ? e : null;
	};
	/** The deck text the editor holds: CodeMirror's own document, or the plain textarea's value. */
	const deckText = () => {
		const e = document.querySelector('[aria-label="Deck source"]');
		if (e instanceof HTMLTextAreaElement) return e.value;
		const view = document.querySelector('.cm-content')?.cmTile?.root?.view;
		return view ? view.state.doc.toString() : (e?.innerText ?? '');
	};
	const said = () =>
		[...document.querySelectorAll('span[role="status"][aria-live="polite"]')].map((s) => s.textContent ?? '').find((t) => /^(Undid|Redid|Nothing)/.test(t)) ?? '';
	/** Show the editor (a phone shows one pane at a time) and put the caret at the end of the deck. */
	const focusEnd = async () => {
		// A tap that lands before the app has hydrated does nothing, so tap again every 2 s until the editor shows.
		let tapped = 0;
		const el = await until(
			() => {
				const e = editor();
				if (!e && innerWidth <= 699 && Date.now() - tapped > 2000) {
					tapped = Date.now();
					button('Markdown source')?.click();
				}
				return e;
			},
			30000,
			'a visible Deck source editor',
		);
		el.focus();
		if (el instanceof HTMLTextAreaElement) el.setSelectionRange(el.value.length, el.value.length);
		else {
			const sel = getSelection();
			sel.selectAllChildren(el);
			sel.collapseToEnd();
		}
		await sleep(50);
		return el;
	};
	/** Type `text` as one input, the way a keyboard's committed word arrives. */
	const type = async (text) => {
		const el = await focusEnd();
		if (!document.execCommand('insertText', false, text) && el instanceof HTMLTextAreaElement) {
			el.setRangeText(text, el.value.length, el.value.length, 'end');
			el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
		}
	};
	/** WebKit's own undo or redo command, with focus in the editor. Returns the inputType the page saw. */
	const command = async (which) => {
		await focusEnd();
		let seen = '';
		const spy = (e) => {
			seen ||= e.inputType;
		};
		addEventListener('beforeinput', spy, { capture: true });
		document.execCommand(which);
		removeEventListener('beforeinput', spy, { capture: true });
		return seen;
	};
	/** Every stored history's text, from Filo's IndexedDB store (studio-filo-persist.ts FILO_DB). */
	const storedTexts = () =>
		new Promise((resolve) => {
			const req = indexedDB.open('lattice-filo');
			req.onerror = () => resolve([]);
			req.onsuccess = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains('histories')) {
					db.close();
					resolve([]);
					return;
				}
				const all = db.transaction('histories', 'readonly').objectStore('histories').getAll();
				all.onsuccess = () => {
					db.close();
					resolve(all.result.map((r) => r.snap?.text ?? ''));
				};
				all.onerror = () => resolve([]);
			};
		});
	const ready = async () => {
		try {
			// A phone opens on the preview, so its editor mounts only once the Markdown source pane is shown (focusEnd).
			await until(() => window.__latticeRenderMetrics && (document.querySelector('[aria-label="Deck source"]') || button('Markdown source')), 90000, 'the Studio editor');
		} catch (e) {
			// Say what the page did have, so a red device run explains itself.
			const panes = [...document.querySelectorAll('button[aria-label]')].filter(visible).map((b) => b.getAttribute('aria-label')).slice(0, 20);
			throw new Error(`${e.message} (render metrics ${!!window.__latticeRenderMetrics}, Deck source ${!!document.querySelector('[aria-label="Deck source"]')}, ${location.pathname}, ${document.readyState}, ${innerWidth}px; buttons: ${panes.join(' | ') || 'none'})`);
		}
	};
	return { step, sleep, until, button, deckText, said, focusEnd, type, command, storedTexts, ready };
}

async function latticeUndoProbe() {
	const result = { ua: navigator.userAgent, width: innerWidth, steps: [], ok: false };
	const k = undoProbeKit(result);
	try {
		await k.ready();
		const el = await k.focusEnd();
		if (el instanceof HTMLTextAreaElement) el.select();
		else document.execCommand('selectAll');
		document.execCommand('insertText', false, UNDO_DECK);
		// The paste must land; macOS Safari's selectAll can leave the editor's empty first line in place, so compare
		// trimmed and take what the editor holds as the text every later undo must return to.
		await k.until(() => k.deckText().trim() === UNDO_DECK.trim(), 30000, 'the deck in the editor').catch((e) => {
			throw new Error(`${e.message} (the editor holds ${k.deckText().length} chars: ${JSON.stringify(k.deckText().slice(0, 80))})`);
		});
		const pasted = k.deckText();
		k.step('put the deck in the editor', true);
		// A new step: past the 500 ms typing window, so the word does not join the paste.
		await k.sleep(800);
		await k.type(' ONE');
		const typed = await k.until(() => (k.deckText().includes(' ONE') ? k.deckText() : ''), 15000, 'the typed word');
		k.step('typed a word as its own step', true);
		await k.sleep(800);

		const undoType = await k.command('undo');
		k.step('WebKit undo command raised historyUndo (Edit → Undo, shake and three-finger swipe send this)', undoType === 'historyUndo', undoType || 'no beforeinput');
		await k.until(() => k.deckText() === pasted, 10000, 'the word undone by the WebKit undo command');
		k.step('the WebKit undo command undid the word', true);
		await k.until(() => k.said().startsWith('Undid'), 5000, 'the "Undid" announcement');
		k.step('the Studio said what it undid', true, k.said().trim());

		const redoType = await k.command('redo');
		k.step('WebKit redo command raised historyRedo', redoType === 'historyRedo', redoType || 'no beforeinput');
		await k.until(() => k.deckText() === typed, 10000, 'the word back after redo');
		k.step('the WebKit redo command brought it back', true);

		// The Studio draws its own Undo and Redo only at phone width (StudioShell, `mobile`). Wider, a tablet's undo
		// is the keyboard bar's undo key, the shake or the three-finger swipe: the WebKit command checked above.
		const undoBtn = k.button('Undo');
		if (undoBtn) {
			undoBtn.click();
			await k.until(() => k.deckText() === pasted, 10000, "the word undone by the Studio's Undo button");
			k.step("tapping the Studio's Undo button undid the word", true);
			(await k.until(() => k.button('Redo'), 10000, "the Studio's Redo button")).click();
			await k.until(() => k.deckText() === typed, 10000, 'the word back after the Redo button');
			k.step('tapping Redo brought it back', true);
		} else k.step('no on-screen Undo at this width: undo is the WebKit command above', true, `${innerWidth}px`);

		await k.sleep(800);
		await k.type(' TWO');
		const second = await k.until(() => (k.deckText().includes(' TWO') ? k.deckText() : ''), 15000, 'the second word');
		await k.until(async () => (await k.storedTexts()).includes(second), 20000, "the second word in Filo's IndexedDB store");
		k.step('the history, with the second word, is stored for the reload', true);
		result.before = typed;
		result.after = second;
		result.ok = true;
	} catch (e) {
		result.error = String(e?.message ?? e);
	}
	return result;
}

/** After run.mjs reloads the page: tap Undo until the stored history lands, and assert it undid the second word. */
async function latticeUndoAfterReload(before, after) {
	const result = { ua: navigator.userAgent, width: innerWidth, steps: [], ok: false };
	const k = undoProbeKit(result);
	try {
		await k.ready();
		await k.focusEnd();
		await k.until(() => k.deckText() === after, 30000, 'the deck as it was before the reload');
		k.step('the reload kept the deck', true);
		// The history loads from IndexedDB a moment after the Studio paints; until then an undo has nothing to take
		// back and says so. Undo, then wait for that undo's own outcome before the next, so none takes a step too many.
		// A phone taps the Studio's Undo. Wider there is none, and a tablet's undo is the WebKit command its keyboard
		// bar, shake and swipe send; WebKit offers it only while its own undo list holds something, which a fresh page's
		// does not, so the probe records whether WebKit raised the command at all.
		const phone = !!k.button('Undo');
		let raised = false;
		const t0 = Date.now();
		while (k.deckText() === after) {
			if (Date.now() - t0 > 30000) break;
			const prev = k.said();
			const btn = k.button('Undo');
			if (phone && (!btn || btn.disabled)) {
				await k.sleep(200);
				continue;
			}
			if (phone) btn.click();
			else if ((await k.command('undo')) === 'historyUndo') raised = true;
			else {
				await k.sleep(500);
				continue;
			}
			await k.until(() => k.deckText() !== after || k.said() !== prev, 10000, "the undo's outcome");
		}
		result.path = phone ? 'the Studio Undo button' : 'the WebKit undo command';
		if (!phone)
			k.step(
				'after a reload, WebKit offers its undo command (Edit → Undo, shake, keyboard bar)',
				raised,
				raised
					? ''
					: document.queryCommandEnabled('undo')
						? "WebKit's undo command is enabled but raised no historyUndo, so the system undo does not reach the stored history (and this width draws no Undo button)"
						: "queryCommandEnabled('undo') is false: a fresh page's own undo list is empty, so the system undo has nothing to send and this width draws no Undo button",
			);
		k.step('Undo after the reload took back the edit made before it', k.deckText() === before, JSON.stringify(k.deckText().slice(-40)));
		result.ok = true;
	} catch (e) {
		result.error = String(e?.message ?? e);
	}
	return result;
}
