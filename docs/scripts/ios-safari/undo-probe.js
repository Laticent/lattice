/**
 * THE UNDO PROBE, run INSIDE the Studio page by WebDriver (run.mjs, PROBE=undo) in real Safari: Mobile Safari in an iPad and
 * an iPhone iOS Simulator, and Safari on the macOS runner. Playwright's WebKit runs it locally first (probe.selftest.mjs).
 * It is the device half of the Filo undo checks (engineering/decisions/2026-10-27-filo-undo-history.md; PR #2959's P3):
 *
 *   1. put a deck in the editor, record UNDO_DIAG_CYCLES type → undo cycles (below), then type a word as a step of its own;
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

/**
 * Extra type → WebKit undo cycles run before the asserted one, RECORDED, not asserted. WebKit's undo missed a typed word
 * about 3 runs in 17 (followups.d/3034-p8), and one cycle per run is a thin sample of an intermittent fault: these give
 * each device thirteen. A missed cycle shows in the step's detail with WebKit's undo state, the editor element and focus at
 * each moment, so the next red run names where the step went. It does not fail the run: the asserted cycle still does.
 */
const UNDO_DIAG_CYCLES = 12;

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
	// Not inside an `inert` subtree: the pre-paint skeleton (StudioChromeSkeleton) is inert and draws look-alike buttons
	// with the same labels that do nothing, so a probe that picks one of them waits forever.
	const visible = (el) => !!el && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const button = (label) => [...document.querySelectorAll(`button[aria-label="${label}"]`)].find(visible);
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
		// Re-taps the Markdown source pane every 2 s until the editor shows, never the inert skeleton, and names what the
		// phone shows on a timeout (show-editor.js, shared with the other Studio probes, #2911).
		const el = await latticeShowDeckEditor();
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
	/**
	 * What WebKit's undo depends on, read at one moment: whether its undo and redo commands are enabled, which editor
	 * element has focus (each element the probe meets gets a number, so a remounted editor shows as a new one), and
	 * whether the page has focus at all. A failed undo step prints these, so a red run says where the step went.
	 */
	let tags = 0;
	const tag = (el) => {
		if (!el) return 'none';
		el.__undoProbeTag ??= ++tags;
		return `${el.tagName.toLowerCase()}#${el.__undoProbeTag}`;
	};
	const editorEl = () => document.querySelector('.cm-content') || document.querySelector('[aria-label="Deck source"]');
	const snapshot = () =>
		`undo ${document.queryCommandEnabled('undo')} redo ${document.queryCommandEnabled('redo')} editor ${tag(editorEl())} active ${tag(document.activeElement)} hasFocus ${document.hasFocus()}`;
	/** Type `text` as one input, the way a keyboard's committed word arrives. Returns what happened to the input. */
	const type = async (text) => {
		const el = await focusEnd();
		const seen = [];
		const before = (e) => seen.push(`beforeinput:${e.inputType}`);
		const after = (e) => seen.push(`prevented ${e.defaultPrevented}`);
		addEventListener('beforeinput', before, { capture: true });
		addEventListener('beforeinput', after);
		const ran = document.execCommand('insertText', false, text);
		removeEventListener('beforeinput', before, { capture: true });
		removeEventListener('beforeinput', after);
		if (!ran && el instanceof HTMLTextAreaElement) {
			el.setRangeText(text, el.value.length, el.value.length, 'end');
			el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
		}
		return `insertText ran ${ran} into ${tag(el)}: ${seen.join(', ') || 'no beforeinput'}; then ${snapshot()}`;
	};
	/** WebKit's own undo or redo command, with focus in the editor. Returns the inputType the page saw. */
	const command = async (which) => {
		await focusEnd();
		let seen = '';
		const log = [];
		const spy = (e) => {
			if (e.type === 'beforeinput') seen ||= e.inputType;
			log.push(`${e.type}:${e.inputType}${e.cancelable ? '' : ' (not cancelable)'}`);
		};
		// Bubble phase, after the page's own handlers: did one cancel it? Safari runs its own undo when nothing does.
		const after = (e) => log.push(`  prevented ${e.defaultPrevented}`);
		addEventListener('beforeinput', spy, { capture: true });
		addEventListener('input', spy, { capture: true });
		addEventListener('beforeinput', after);
		// WebKit raises the command's beforeinput only when it has a step to undo or redo, which is also when Edit → Undo is
		// enabled for a person. A command sent right after typing could beat the typed step into WebKit's undo stack and
		// raise nothing (#2911), so wait, briefly, for the command to be enabled, and log whether it was.
		const t0 = Date.now();
		while (!document.queryCommandEnabled(which) && Date.now() - t0 < 3000) await sleep(50);
		log.push(`enabled ${document.queryCommandEnabled(which)} after ${Date.now() - t0} ms (${snapshot()})`);
		document.execCommand(which);
		await sleep(300);
		removeEventListener('beforeinput', spy, { capture: true });
		removeEventListener('input', spy, { capture: true });
		removeEventListener('beforeinput', after);
		result.events = [...(result.events || []), `${which}: ${log.join(', ')}`];
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
			await until(() => window.__latticeRenderMetrics && (document.querySelector('[aria-label="Deck source"]') || (innerWidth <= 699 && button('Markdown source'))), 150000, 'the Studio editor');
		} catch (e) {
			// Say what the page did have, so a red device run explains itself.
			const panes = [...document.querySelectorAll('button[aria-label]')].filter(visible).map((b) => b.getAttribute('aria-label')).slice(0, 20);
			throw new Error(`${e.message} (render metrics ${!!window.__latticeRenderMetrics}, Deck source ${!!document.querySelector('[aria-label="Deck source"]')}, ${location.pathname}, ${document.readyState}, ${innerWidth}px; buttons: ${panes.join(' | ') || 'none'})`);
		}
	};
	/**
	 * Wait `ms` while watching WebKit's undo state every 25 ms. If it flips, say when, and what the page did in the
	 * 300 ms before: editor DOM mutations, CodeMirror transactions (by user event, and whether one replaced the whole
	 * document), `history` calls, selection changes and focus moves. The followup's iPhone run lost undo inside this
	 * wait with the editor and focus unchanged, so this is the window that names the cause.
	 */
	const watchUndo = async (ms) => {
		const t0 = Date.now();
		const seen = [];
		const note = (what) => seen.push([Date.now() - t0, what]);
		const mo = new MutationObserver((list) => {
			let added = 0;
			let removed = 0;
			let text = 0;
			for (const m of list) {
				added += m.addedNodes.length;
				removed += m.removedNodes.length;
				if (m.type === 'characterData') text++;
			}
			note(`dom +${added} -${removed} ~${text}`);
		});
		const ed = editorEl();
		if (ed) mo.observe(ed, { subtree: true, childList: true, characterData: true });
		const view = document.querySelector('.cm-content')?.cmTile?.root?.view;
		const dispatch = view?.dispatch;
		if (view && dispatch) {
			view.dispatch = function (...args) {
				const tr = args[0];
				const user = tr?.annotations?.find?.((a) => typeof a.value === 'string')?.value;
				const whole = tr?.changes && !tr.changes.empty && tr.changes.length === view.state.doc.length && tr.changes.newLength > 0;
				note(`cm ${user || (tr?.changes?.empty === false ? 'change' : 'other')}${whole ? ' WHOLE-DOC' : ''}`);
				return dispatch.apply(this, args);
			};
		}
		const hist = {};
		for (const f of ['pushState', 'replaceState']) {
			hist[f] = history[f];
			history[f] = function (...args) {
				note(`history.${f}`);
				return hist[f].apply(this, args);
			};
		}
		const onSel = () => note('selectionchange');
		const onFocus = (e) => note(`${e.type} ${tag(e.target)}`);
		document.addEventListener('selectionchange', onSel);
		addEventListener('focusin', onFocus, true);
		addEventListener('focusout', onFocus, true);
		let flip = '';
		let was = document.queryCommandEnabled('undo');
		while (Date.now() - t0 < ms) {
			await sleep(25);
			const now = document.queryCommandEnabled('undo');
			if (now !== was && !flip) {
				const at = Date.now() - t0;
				const near = seen.filter(([t]) => t >= at - 300 && t <= at).map(([t, w]) => `${t}:${w}`);
				flip = `undo ${was}→${now} at ${at} ms after: ${near.join(', ') || 'nothing seen'}`;
			}
			was = now;
		}
		mo.disconnect();
		if (view && dispatch) view.dispatch = dispatch;
		for (const f of Object.keys(hist)) history[f] = hist[f];
		document.removeEventListener('selectionchange', onSel);
		removeEventListener('focusin', onFocus, true);
		removeEventListener('focusout', onFocus, true);
		return flip;
	};
	return { step, sleep, until, button, deckText, said, focusEnd, type, command, storedTexts, ready, snapshot, watchUndo };
}

async function latticeUndoProbe() {
	const result = { ua: navigator.userAgent, width: innerWidth, steps: [], ok: false };
	const k = undoProbeKit(result);
	try {
		await k.ready();
		// Let the boot deck land first: it replaces whatever the editor holds, so a paste that races it is lost.
		await k.focusEnd();
		let seen = '';
		let since = Date.now();
		await k.until(
			() => {
				const now = k.deckText();
				if (now !== seen) {
					seen = now;
					since = Date.now();
				}
				return now.length > 0 && Date.now() - since > 1000;
			},
			30000,
			'the boot deck to settle',
		);
		// Paste the deck, and paste again every 3 s until it holds: on the Mac the boot deck can land after the first
		// paste and replace it. macOS Safari's selectAll can also leave the editor's empty first line, so compare trimmed
		// and take what the editor holds as the text every later undo must return to.
		let pastes = 0;
		let last = 0;
		await k
			.until(
				async () => {
					if (k.deckText().trim() === UNDO_DECK.trim()) return true;
					if (Date.now() - last > 3000) {
						last = Date.now();
						pastes++;
						const el = await k.focusEnd();
						if (el instanceof HTMLTextAreaElement) el.select();
						else document.execCommand('selectAll');
						document.execCommand('insertText', false, UNDO_DECK);
					}
					return false;
				},
				30000,
				'the deck in the editor',
			)
			.catch((e) => {
				throw new Error(`${e.message} (${pastes} pastes; the editor holds ${k.deckText().length} chars: ${JSON.stringify(k.deckText().slice(0, 80))})`);
			});
		const pasted = k.deckText();
		k.step('put the deck in the editor', true, `${pastes > 1 ? `${pastes} pastes; ` : ''}${k.snapshot()}`);
		// Recorded cycles (UNDO_DIAG_CYCLES): type → WebKit undo, with what each cycle saw.
		const cycles = [];
		for (let i = 1; i <= UNDO_DIAG_CYCLES; i++) {
			await k.sleep(1500);
			const word = ` D${i}`;
			const typing = await k.type(word);
			await k.until(() => k.deckText().includes(word), 15000, `diag word ${i}`);
			const held = k.snapshot();
			const flip = await k.watchUndo(800);
			const fired = await k.command('undo');
			const undone = await k.until(() => k.deckText() === pasted, 3000, 'diag undo').then(() => true, () => false);
			cycles.push(`#${i} ${fired || 'NONE'} undone ${undone} | typing: ${typing} | held: ${held}${flip ? ` | FLIP ${flip}` : ''} | cmd: ${(result.events || []).at(-1)}`);
			if (!undone) {
				const el = await k.focusEnd();
				if (el instanceof HTMLTextAreaElement) el.select();
				else document.execCommand('selectAll');
				document.execCommand('insertText', false, pasted);
				await k.until(() => k.deckText() === pasted, 10000, 'diag restore').catch(() => {});
			}
		}
		if (cycles.length) {
			const bad = cycles.filter((c) => !/^#\d+ historyUndo undone true/.test(c)).length;
			k.step(`recorded: ${cycles.length - bad} of ${cycles.length} type → WebKit undo cycles raised historyUndo and undid`, true, `\n    ${cycles.join('\n    ')}`);
			result.events = [];
		}
		// A new step: well past the 500 ms typing window, so the word does not join the paste on a slow runner.
		await k.sleep(1500);
		const typing = await k.type(' ONE');
		const typed = await k.until(() => (k.deckText().includes(' ONE') ? k.deckText() : ''), 15000, 'the typed word');
		k.step('typed a word as its own step', true, `${typing}; once the editor held it, ${k.snapshot()}`);
		const flip = await k.watchUndo(800);

		const undoType = await k.command('undo');
		k.step('WebKit undo command raised historyUndo (Edit → Undo, shake and three-finger swipe send this)', undoType === 'historyUndo', undoType || `no beforeinput; ${flip ? `FLIP ${flip}; ` : ''}events: ${(result.events || []).join(' ; ')}`);
		await k.until(() => k.deckText() === pasted, 10000, 'the word undone by the WebKit undo command').catch((e) => {
			// Say where the undo went: one step too many (the paste gone too) or none, and what the Studio announced.
			const now = k.deckText();
			throw new Error(`${e.message} (editor ${now.length} chars, pasted ${pasted.length}, typed ${typed.length}; ends ${JSON.stringify(now.slice(-30))}; said ${JSON.stringify(k.said())}; events ${JSON.stringify(result.events)})`);
		});
		k.step('the WebKit undo command undid the word', true);
		await k.until(() => k.said().startsWith('Undid'), 5000, 'the "Undid" announcement');
		k.step('the Studio said what it undid', true, k.said().trim());

		const redoType = await k.command('redo');
		k.step('WebKit redo command raised historyRedo', redoType === 'historyRedo', redoType || `no beforeinput; events: ${(result.events || []).join(' ; ')}`);
		await k.until(() => k.deckText() === typed, 10000, 'the word back after redo');
		k.step('the WebKit redo command brought it back', true);
		// What the page saw during both commands, so a pass also shows whether Safari's own undo ran beside Filo's.
		k.step('events around the WebKit commands', true, (result.events || []).join(' ; '));

		// The Studio draws its own Undo and Redo at phone width and on a touch-first screen (StudioShell, `historyButtons`).
		// Elsewhere, a Mac or a tablet with a pointer, undo is the Edit menu or the keyboard: the WebKit command checked above.
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
