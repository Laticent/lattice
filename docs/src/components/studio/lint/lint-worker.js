// THE STUDIO'S LINT, OFF THE MAIN THREAD. The editor's squiggles and the Coach's assessment both lint the whole deck, and
// on a large deck each pass held the page: on a deck of three phone photos Firefox froze for about 5 s a pass, twice an
// edit (PR #3153, Gecko profile). Here the pass runs beside the page, and typing never waits for it.
//
// The page sends the lint core's address (the same `esm/lint.js` the page itself loads, so the browser fetches it once),
// the text, lint-core's vocabulary and the plugins the deck's admission leaves off. One pass serves both callers: the
// editor and the Coach lint the same text, and when their vocabularies agree the second reuses the first's findings.
//
// Replies: `{ findings }` for a lint, `{ scorecard, findings }` for an assessment, `{ threw }` when the lint itself threw
// on this deck (the caller reports "no answer", as it does on the main thread, and the worker stays in service), and
// `{ error }` when the lint core will not load here (the pool then falls back to the main thread for good).
import { assessWith } from './assess-kernel.js';

let core = null;
let coreUrl = '';
/** The last lint pass, by text and vocabulary. */
let last = null;

// Keyed by the vocabulary AND the plugins the deck's admission leaves off: the same text parses differently under a
// narrower plugin set (math off: a `---` inside `$$` splits a slide).
function lintOnce(m, text, vocab, key) {
	if (last && last.key === key && last.text === text) return last.findings;
	const findings = m.lintCore.lintTextWith(text, vocab);
	last = { text, key, findings };
	return findings;
}

self.onmessage = async (e) => {
	const { id, url, op, text, vocab, vocabKey, off, components, profileOverride } = e.data;
	let m;
	try {
		if (!core || coreUrl !== url) {
			coreUrl = url;
			core = import(/* @vite-ignore */ url);
		}
		m = await core;
	} catch (err) {
		core = null;
		self.postMessage({ id, error: `the lint core did not load in the worker: ${err?.message || err}` });
		return;
	}
	try {
		// The deck's plugin admission, as the page's copy follows it (src/lib/plugin-admission.ts): with math off, a `---`
		// inside `$$` is a slide break here too. This copy of the parser belongs to the worker, so it is switched per pass.
		m.setBoundaryPluginsOff(off);
		const key = `${(off ?? []).join(',')}\u0000${vocabKey}`;
		if (op === 'lint') self.postMessage({ id, findings: lintOnce(m, text, vocab, key) });
		else self.postMessage({ id, ...assessWith(m, text, vocab, components, profileOverride, (s, v) => lintOnce(m, s, v, key)) });
	} catch (err) {
		self.postMessage({ id, threw: String(err?.message || err) });
	}
};
