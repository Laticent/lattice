// Inline validation glue — turn the shared lint-core's findings into CodeMirror
// diagnostics (the wavy underlines + hover tooltips the editor's `linter()` paints).
//
// This is the bridge between the deterministic authoring linter (the SAME pure
// lib/authoring/lint-core.js the Node CLI and the Architect panel run) and the
// editor surface: the Architect renders the findings as a side-panel list; the
// editor renders the SAME findings inline, anchored to the offending line. Both
// are views of one stream — the rule logic lives in lint-core, never here.
//
// Kept dependency-free (it takes a CodeMirror `Text` doc and plain finding
// objects, returns plain diagnostic objects) so it unit-tests without a DOM and
// without the authoring-core bundle.

// 1-based source line where each REAL slide begins, indexed by the HUMAN slide
// number (front matter skipped) — so `starts[slide]` maps a finding to its line,
// matching lint-core / review-core's numbering. `starts[0]` = 1 (deck top) for
// deck-level findings (slide 0). This is the SINGLE copy: the Architect imports
// it from here so the panel's "Reveal" and the editor's underline land on the
// same line.
// KNOWN EDGE (pre-existing, low-frequency): a malformed front-matter CLOSE fence
// with trailing whitespace (`--- `) is tolerated by lint-core's `fmChunks` regex
// but NOT by its `source.split(/^---$/m)`, so a finding on slide 1 can be numbered
// `slide: 0`; here that anchors the underline to the deck top rather than the real
// line. The root cause is lint-core's slide numbering, not this mapper — left as
// is rather than reshaping the shared kernel for a rare malformed fence.
export function chunkStartLines(src) {
	const text = String(src || '');
	const lines = text.split('\n');
	let i = 0;
	if (/^---\r?\n/.test(text) && lines[0].trim() === '---') {
		i = 1;
		while (i < lines.length && lines[i].trim() !== '---') i++;
		i++; // step past the closing front-matter delimiter
	}
	const starts = [1, i + 1]; // [deck top, slide 1]
	for (; i < lines.length; i++) {
		if (lines[i] === '---') starts.push(i + 2);
	}
	return starts;
}

// Rehydrate the build-time lint vocabulary (serialized as arrays for the JSON
// handoff) into the Sets/shape lint-core's `lintTextWith(source, vocab)` expects.
// The SAME builder feeds the editor's inline linter and the Architect panel, so a
// `_class` is judged known/unknown identically in both places. Pure data; no
// model call validates a name.
/**
 * @typedef {Object} VocabSets
 * @property {Set<string>} names
 * @property {Set<string>} modifiers
 * @property {Record<string, { valid: Set<string>; names: string[] }>} [mapRegions]
 * @property {string[]} [finishNames]
 * @property {string[]} [modeNames]
 * @property {string[]} [splitNames]
 * @property {Record<string, { axis: string; hard: number }>} [capacity]
 */

/** @returns {VocabSets} */
export function buildVocabSets(vocab) {
	const v = vocab || {};
	/** @type {VocabSets} */
	const sets = {
		names: new Set(v.names || []),
		modifiers: new Set(v.modifiers || []),
	};
	// Map region/group vocabulary — { us, world }, each { valid, names }.
	if (v.mapRegions) {
		sets.mapRegions = {};
		for (const [which, mv] of Object.entries(v.mapRegions)) {
			sets.mapRegions[which] = { valid: new Set(mv.valid || []), names: mv.names || [] };
		}
	}
	if (v.finishNames) sets.finishNames = v.finishNames; // deck-wide `finish:` validator
	if (v.modeNames) sets.modeNames = v.modeNames; // deck-wide `mode:` validator
	if (v.splitNames) sets.splitNames = v.splitNames; // deck-wide `split:` validator
	if (v.stampStyleNames) sets.stampStyleNames = v.stampStyleNames; // deck-wide `stamp:` validator
	if (v.toneStyleNames) sets.toneStyleNames = v.toneStyleNames; // deck-wide `tone:` validator
	if (v.spectrumNames) sets.spectrumNames = v.spectrumNames; // deck-wide `spectrum:` validator
	if (v.capacity) sets.capacity = v.capacity; // per-layout content-capacity contract
	// The registered `@size` geometry, so the browser linter DERIVES the deck's
	// adaptive family the same way the CLI does. Without it lint-core falls back to
	// a name table that a newly-registered `@size` slips past — the drift class the
	// family stamp exists to end (#1218).
	if (v.sizes) sets.sizes = v.sizes;
	if (v.exclusiveAxes) sets.exclusiveAxes = v.exclusiveAxes; // conflicting-variants axes
	return sets;
}

function clamp(n, lo, hi) {
	return Math.max(lo, Math.min(hi, n));
}

// Map lint-core findings onto a CodeMirror document as Diagnostic objects.
//   doc      — a CodeMirror `Text` (the live document)
//   findings — lint-core findings: { slide, rule, severity, line?, message, fix?, autofixable? }
//   opts.onFix(view, finding) — wired by the editor for autofixable findings; it
//              runs lint-core's applyFix and writes the result back. Omitted
//              (e.g. in tests) → no quick-fix action is attached.
//
// Anchoring: a finding carries a 1-based human `slide` and (usually) the offending
// source `line` text. We resolve the slide's line range from `chunkStartLines`,
// then find the line whose text matches `finding.line` within that slide; absent a
// line match (deck-level findings, or a line that has since changed) we fall back
// to the slide's first line. The underline spans the trimmed content (so leading
// indentation isn't underlined), and the tooltip carries the message + fix.
/**
 * @typedef {Object} EditorDiagnostic
 * @property {number} from
 * @property {number} to
 * @property {string} severity
 * @property {string} message
 * @property {string} source
 * @property {Array<{ name: string; apply: (view: unknown, from: number, to: number) => void }>} [actions]
 */

/** @returns {EditorDiagnostic[]} */
export function findingsToDiagnostics(doc, findings, opts = {}) {
	const onFix = opts.onFix;
	const starts = chunkStartLines(doc.toString());
	const total = doc.lines;
	/** @type {EditorDiagnostic[]} */
	const out = [];
	for (const f of findings || []) {
		if (!f) continue;
		const slide = f.slide || 0;
		const startLine = clamp(starts[slide] || 1, 1, total);
		const nextStart = starts[slide + 1] || total + 1;
		let lineNo = startLine;
		if (f.line) {
			const needle = String(f.line).trim();
			// Prefer an EXACT line match anywhere in the slide; only fall back to a
			// substring match if none exists (so a superset line like `- foobar`
			// doesn't win over the exact `- foo` later in the slide).
			let exact = 0;
			let loose = 0;
			for (let n = startLine; n < nextStart && n <= total; n++) {
				const text = doc.line(n).text;
				if (text.trim() === needle) {
					exact = n;
					break;
				}
				if (!loose && needle && text.includes(needle)) loose = n;
			}
			if (exact || loose) lineNo = exact || loose;
		}
		lineNo = clamp(lineNo, 1, total);
		const line = doc.line(lineNo);
		const trimmed = line.text.trim();
		const lead = trimmed ? line.text.length - line.text.trimStart().length : 0;
		const from = line.from + lead;
		let to = line.to;
		if (to <= from) to = Math.min(doc.length, from + 1); // a visible range on a blank/short line
		const severity = f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'info';
		const message = f.fix ? `${f.message}\n\nFix: ${f.fix}` : f.message;
		const d = { from, to, severity, message, source: f.rule };
		if (f.autofixable && onFix) {
			d.actions = [{ name: 'Quick fix', apply: (view) => onFix(view, f) }];
		}
		out.push(d);
	}
	// CodeMirror requires diagnostics ordered by position.
	out.sort((a, b) => a.from - b.from || a.to - b.to);
	return out;
}
