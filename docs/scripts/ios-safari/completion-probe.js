/**
 * THE COMPLETION PROBE, run INSIDE the Studio page by WebDriver (run.mjs, PROBE=completion) in real Safari: Safari on the
 * macOS runner and Mobile Safari in an iPad iOS Simulator. A one-off for PR #3174's card (the Studio autocomplete
 * audit, engineering/decisions/2026-11-13-studio-autocomplete-audit.md); run.mjs presses the keys as WebDriver key actions,
 * which Safari delivers as keydowns, and taps a menu row as a WebDriver element click. This file only sets the deck and
 * reads what the editor shows. Plain browser JS defining globals, as every probe here: execute-script sends source text.
 */
// biome-ignore-all lint/correctness/noUnusedVariables: globals for WebDriver's execute-script

function completionView() {
	return document.querySelector('.cm-content')?.cmTile?.root?.view ?? null;
}

/** Boot: show the deck editor (a phone or narrow iPad shows one pane at a time). */
globalThis.latticeCompletionReady = async function latticeCompletionReady() {
	await latticeShowDeckEditor();
	const t0 = Date.now();
	while (!completionView() && Date.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
	return { ok: !!completionView(), error: completionView() ? undefined : 'no CodeMirror view', steps: [], ua: navigator.userAgent, width: innerWidth };
};

/** Replace the deck with `doc`, caret at the end, editor focused. A dispatch, not typing, so no menu opens by itself. */
globalThis.latticeCompletionSet = function latticeCompletionSet(doc) {
	const view = completionView();
	view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc }, selection: { anchor: doc.length } });
	view.focus();
	return view.state.doc.length;
};

/** What the editor shows: the menu's option labels, whether the "No suggestions here" note is up, and the deck. */
globalThis.latticeCompletionState = function latticeCompletionState() {
	const labels = [...document.querySelectorAll('.cm-tooltip-autocomplete li .cm-completionLabel')].map((e) => e.textContent);
	return { labels, hint: !!document.querySelector('.cm-completion-empty'), doc: completionView()?.state.doc.toString() ?? '' };
};

/** Mark the first menu row whose label is `label`, so run.mjs can click it as an element. */
globalThis.latticeCompletionMark = function latticeCompletionMark(label) {
	const li = [...document.querySelectorAll('.cm-tooltip-autocomplete li')].find((e) => e.querySelector('.cm-completionLabel')?.textContent === label);
	if (li) li.setAttribute('data-probe-pick', '1');
	return !!li;
};
