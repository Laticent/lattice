// Slide-context detection + completion logic for the editor's autocomplete.
//
// Pure and import-free (no CodeMirror) so the Node unit suite can exercise it
// directly — the same split focus-block.js uses against drawing-board-focus.js.
// The CodeMirror wiring lives in complete.js; this module is just the grammar.
//
// "Slide context" = the `<!-- _class: name modifier* -->` directive that
// governs the cursor's slide. Marp splits slides on a standalone `---`, so we
// walk back from the cursor to the nearest directive without crossing that
// boundary. This is the single place that knows "what component am I in",
// replacing the per-feature backward-walkers that used to drift from the
// grammar (see the map default-basemap bug, fixed in map-complete.js).

// The class directive, matched anywhere on a line. Mirrors the class-token
// notion in lib/authoring/lint-core.js so completion and lint agree by
// construction. Module-private — used by slideClassAt below.
const CLASS_RE = /<!--\s*_class:\s*([^>]+?)\s*-->/;

const SLIDE_BREAK = /^---\s*$/;

// Walk back from 1-based `lineNo` to the active `_class` directive. `getLine(n)`
// returns the text of 1-based line n (the caller adapts CodeMirror's doc, or a
// test passes a plain array accessor). Returns
// `{ name, modifiers, tokens, directiveLine }` or `null` when the cursor is not
// inside a classed slide (between slides, in front matter, or no directive
// above it on this slide).
export function slideClassAt(getLine, lineNo) {
	for (let n = lineNo; n >= 1; n--) {
		const text = getLine(n) ?? '';
		if (n !== lineNo && SLIDE_BREAK.test(text)) return null; // crossed a boundary
		const m = text.match(CLASS_RE);
		if (m) {
			const tokens = m[1].split(/\s+/).filter(Boolean);
			if (!tokens.length) return null;
			return { name: tokens[0], modifiers: tokens.slice(1), tokens, directiveLine: n };
		}
	}
	return null;
}

// What to complete given the current line's text BEFORE the cursor, when that
// cursor sits inside an as-yet-unclosed `_class:` directive (the `-->` is typed
// last, or not yet). Returns one of:
//   { kind: 'class',    from, typed }                 — the first token (component name)
//   { kind: 'modifier', from, typed, name, present }  — a modifier on `name`
//   null                                              — not in a class directive
// `from` is the COLUMN (offset within `before`) where the partial token starts;
// callers add the line's start offset to map it into the document.
export function classDirectiveCompletion(before) {
	// Everything after `_class:` up to the cursor, containing no `>` — so once
	// `-->` is typed before the cursor this stops matching (we're past the
	// directive and back in slide body / prose, where these sources stay quiet).
	const m = before.match(/<!--\s*_class:\s*([^>]*)$/);
	if (!m) return null;
	const tail = m[1];
	const partial = (tail.match(/(\S*)$/) || ['', ''])[1];
	const from = before.length - partial.length;
	const prior = tail.slice(0, tail.length - partial.length).split(/\s+/).filter(Boolean);
	if (prior.length === 0) return { kind: 'class', from, typed: partial };
	return { kind: 'modifier', from, typed: partial, name: prior[0], present: prior.slice(1) };
}

// Component-name completion options from the compact catalog (name + bucket).
// `type` drives CodeMirror's icon class; `detail` is the bucket chip.
export function classOptions(catalog) {
	return (catalog || []).map((c) => ({
		label: c.name,
		type: 'class',
		detail: c.bucket || '',
		info: c.summary || undefined,
	}));
}

// Modifier completion options for component `name`: its own declared variants
// first (most relevant), then the universal modifiers, minus any already
// present on the directive. Variants/universals may be multi-token decoration
// strings ('tint-corner at-tl'), so each fragment registers as its own option.
export function modifierOptions(name, catalog, universalModifiers, present = []) {
	const seen = new Set(present);
	const out = [];
	const push = (label, kind) => {
		if (!label || seen.has(label)) return;
		seen.add(label);
		out.push({ label, type: 'modifier', detail: kind });
	};
	const comp = (catalog || []).find((c) => c.name === name);
	if (comp) for (const v of comp.variants || []) for (const tok of String(v).split(/\s+/)) push(tok, 'variant');
	// Family (scoped) modifiers in scope for this component (e.g. `checks-*` /
	// `heat` on state-bearing layouts, `canvas` on charts) — offered after the
	// component's own variants, before the universals.
	if (comp) for (const f of comp.familyModifiers || []) for (const tok of String(f).split(/\s+/)) push(tok, 'modifier');
	for (const u of universalModifiers || []) for (const tok of String(u).split(/\s+/)) push(tok, 'universal');
	return out;
}

// Which basemap a `map` slide uses. The world map is the DEFAULT; `us` (alias
// `usa`) switches to US states — matching map.docs.md. Earlier code inverted
// this and defaulted to `us`, hiding every country + group (Global South,
// blocs, continents) behind a redundant `world` token. Returns 'us' | 'world',
// or null when `info` is not a map slide. Pure (no basemap JSON) so it's unit
// testable; map-complete.js feeds the result into the baked option lists.
export function mapBasemapFor(info) {
	if (!info || info.name !== 'map') return null;
	const mods = info.modifiers || [];
	return mods.includes('us') || mods.includes('usa') ? 'us' : 'world';
}

// ── Surface C: skeleton drop-in ──────────────────────────────────────────────

// True when the slide owning `directiveLine` has an EMPTY body: every line from
// the directive down to the next slide break (`---`) or EOF is blank or itself
// an HTML-comment directive line. Gates skeleton insertion so it never clobbers
// a slide that already has content. `getLine(n)` is 1-based; `total` is the
// document's line count. `skipLine` (the cursor's line) is excluded so the
// partial word an author types to TRIGGER the skeleton doesn't count as content.
export function slideBodyEmpty(getLine, total, directiveLine, skipLine = 0) {
	for (let n = directiveLine + 1; n <= total; n++) {
		if (n === skipLine) continue; // the line being typed to trigger insertion
		const text = getLine(n) ?? '';
		if (SLIDE_BREAK.test(text)) break; // reached the next slide
		if (text.trim() === '') continue; // blank
		if (/^\s*<!--.*-->\s*$/.test(text)) continue; // another directive line
		return false; // real content present
	}
	return true;
}

// The body of a component skeleton — its slot scaffold with the leading
// directive comment line(s) and surrounding blank lines stripped, since the
// `_class:` directive already exists when we drop a skeleton in. Returns a
// trimmed multi-line string (no trailing whitespace).
export function skeletonBody(skeleton) {
	const lines = String(skeleton || '').split('\n');
	let i = 0;
	while (i < lines.length && (lines[i].trim() === '' || /^\s*<!--.*-->\s*$/.test(lines[i]))) i++;
	return lines.slice(i).join('\n').replace(/\s+$/, '');
}

// The cursor's position on a blank slide-body line, for skeleton insertion: the
// text before the cursor must be only leading whitespace + an optional partial
// word (no other content). Returns `{ from, typed }` (from = the column where
// the word starts) or null when the line already holds content.
export function blankBodyPartial(before) {
	const m = before.match(/^(\s*)([\w-]*)$/);
	if (!m) return null;
	return { from: m[1].length, typed: m[2] };
}

// ── Surface D: per-component data-source registry ────────────────────────────

// Wrap a body-data completer with the shared slide detection. `fn(context,
// info, line)` runs only when the cursor's slide is one of `components`. CM-free
// (operates on the duck-typed completion context), so it's unit testable and
// lets a data component register declaratively (see data-sources.js).
export function makeDataSource(components, fn) {
	const set = new Set(components);
	return (context) => {
		const doc = context.state.doc;
		const line = doc.lineAt(context.pos);
		const info = slideClassAt((n) => doc.line(n).text, line.number);
		if (!info || !set.has(info.name)) return null;
		return fn(context, info, line);
	};
}

// ── Front matter: the deck's opening YAML block ──────────────────────────────

// True when 1-based `lineNo` sits inside the deck's front matter — the YAML
// block fenced by `---` at the very top of the file. Line 1 must be the opening
// fence; the cursor is in the block until a closing `---` appears above it (an
// unterminated block mid-typing still counts, so completion works as you write
// the header). `getLine(n)` is 1-based.
export function inFrontMatter(getLine, lineNo) {
	if (lineNo < 2) return false; // line 1 is the opening fence itself
	if ((getLine(1) ?? '').trim() !== '---') return false;
	for (let n = 2; n < lineNo; n++) {
		if ((getLine(n) ?? '').trim() === '---') return false; // a closing fence sits above the cursor
	}
	return true;
}

// The cursor's position on a `theme:` front-matter line, for theme-name
// completion: the text before the cursor must be `theme:` then an optional
// partial value (no trailing content). Returns `{ from, typed }` (from = the
// column where the value starts) or null.
export function themeValuePosition(before) {
	const m = before.match(/^(\s*theme:\s*)(\S*)$/);
	if (!m) return null;
	return { from: m[1].length, typed: m[2] };
}

// The cursor's position on a value being typed after the deck-level `form:`
// front-matter key — `form: m|`. Returns `{ from, typed }` or null, so the
// off/standard/minimal vocabulary completes here.
export function formValuePosition(before) {
	const m = before.match(/^(\s*form:\s*)(\S*)$/);
	if (!m) return null;
	return { from: m[1].length, typed: m[2] };
}

// The cursor's position on a `split:` front-matter line, for split-mode
// completion (`rule` / `headings`).
export function splitValuePosition(before) {
	const m = before.match(/^(\s*split:\s*)([\w-]*)$/);
	if (!m) return null;
	return { from: m[1].length, typed: m[2] };
}

// The cursor's position on a `size:` front-matter line, for slide-size
// completion (hd / story / square / …). The value charset includes `:` and `.`
// so the aspect-alias names (`16:9`, `9:16`, `4:5`, `1:1`) complete too.
export function sizeValuePosition(before) {
	const m = before.match(/^(\s*size:\s*)([\w:.-]*)$/);
	if (!m) return null;
	return { from: m[1].length, typed: m[2] };
}

// The cursor's position on a `finish:` front-matter line, for finish-register
// completion (the deck-wide finish: boardroom / sketch / sketch-clean). Mirrors
// themeValuePosition — `finish:` then an optional partial value, no trailing
// content. Returns `{ from, typed }` or null.
export function finishValuePosition(before) {
	const m = before.match(/^(\s*finish:\s*)(\S*)$/);
	if (!m) return null;
	return { from: m[1].length, typed: m[2] };
}

// The cursor sits on an INDENTED axis line inside a `backdrop:` front-matter map
// (e.g. `  stren|`). Returns the axis-name completion spot + this line's indent;
// the caller confirms the enclosing block header is `backdrop:` via the document
// (this line-local check can't see prior lines). Lattice's one nested key.
export function backdropAxisPosition(before) {
	const m = before.match(/^(\s+)([A-Za-z][\w-]*)?$/);
	if (!m) return null;
	return { indent: m[1].length, from: m[1].length, typed: m[2] || '' };
}

// ── Slide directives + fences (Tier 2) ───────────────────────────────────────

// The cursor's position on a directive NAME being typed inside an HTML comment,
// before any colon — `<!-- _pag|`. Returns `{ from, typed }` (typed keeps the
// leading `_`) or null. Once the colon is typed this stops matching, so the
// per-directive value/grammar sources take over (e.g. `_class:` → component
// names).
export function directiveNameAt(before) {
	const m = before.match(/^(\s*<!--\s*)(_?[\w-]*)$/);
	if (!m) return null;
	return { from: m[1].length, typed: m[2] };
}

// The cursor's position on a `_paginate:` value inside an HTML comment —
// `<!-- _paginate: fa|`. Returns `{ from, typed }` or null.
export function paginateValuePosition(before) {
	const m = before.match(/^(\s*<!--\s*_paginate:\s*)([\w-]*)$/);
	if (!m) return null;
	return { from: m[1].length, typed: m[2] };
}

// The cursor's position on a `_focusStyle:` value inside an HTML comment —
// `<!-- _focusStyle: ri|`. Returns `{ from, typed }` or null. Distinct from the
// axis detector below: `_focusStyle:` never matches the `_focus(Steps)?:` axis
// pattern, so the two sources never both fire.
export function focusStyleValuePosition(before) {
	const m = before.match(/^(\s*<!--\s*_focusStyle:\s*)([\w-]*)$/);
	if (!m) return null;
	return { from: m[1].length, typed: m[2] };
}

// The cursor's position on a `_focus:` / `_focusSteps:` AXIS keyword — the word
// right after the colon or a `,` (focus) / `|` (steps) separator, with only
// whitespace between: `<!-- _focus: ro|`, `<!-- _focus: row 4, it|`,
// `<!-- _focusSteps: row 1 | ro|`. Fires only on the axis word, never while an
// ordinal is being typed (`row 4|`), since the ordinal isn't completable.
export function focusAxisPosition(before) {
	if (!/^\s*<!--\s*_focus(?:Steps)?:/.test(before)) return null;
	const m = before.match(/[:,|]\s*([a-z]*)$/);
	if (!m) return null;
	return { from: before.length - m[1].length, typed: m[1] };
}

// The cursor's position on a fenced-code info string — the language id right
// after the opening ``` / ~~~ on a fence line. Returns `{ from, typed }` or
// null.
export function fenceLangAt(before) {
	const m = before.match(/^(\s*(?:```|~~~))([\w-]*)$/);
	if (!m) return null;
	return { from: m[1].length, typed: m[2] };
}

// ── Inside a fenced block (Tier 3) ───────────────────────────────────────────

const FENCE_LINE = /^\s*(?:```|~~~)\s*([\w-]*)/;

// Which fenced language the cursor's line sits INSIDE, walking up to the nearest
// fence line: an opening fence carries a language (` ```mermaid `), a closing
// fence is bare (` ``` `). Returns the language if it's one of `langs`, else
// null (bare/closing fence, a different language, or no fence above). `getLine`
// is 1-based; the cursor's own line is not examined (the fence-info-string
// source owns the opening line).
export function inFencedLang(getLine, lineNo, langs) {
	if (FENCE_LINE.test(getLine(lineNo) ?? '')) return null; // the cursor's own line is a fence boundary
	for (let n = lineNo - 1; n >= 1; n--) {
		const m = (getLine(n) ?? '').match(FENCE_LINE);
		if (m) {
			const lang = m[1];
			return lang && langs.includes(lang) ? lang : null; // bare fence (closing) or other lang → not inside
		}
	}
	return null;
}

// The identifier being typed immediately before the cursor (letter-led, may
// carry digits/hyphens, e.g. `stateDiagram-v2`). Returns `{ from, typed }` or
// null — used to anchor keyword completion inside a fenced sub-language.
export function identifierBefore(before) {
	const m = before.match(/([A-Za-z][\w-]*)$/);
	if (!m) return null;
	return { from: before.length - m[1].length, typed: m[1] };
}

// ── Proactive type-ahead: which grammar context the cursor sits in ───────────

// Classify the cursor's position into the completable grammar context it sits
// in — for the editor's proactive "type-ahead" trigger (auto-open the popup on
// ENTERING a context, before any character is typed). Pure mirror of the source
// gating in complete.js; returns one of:
//   'class' | 'modifier'                        — inside `<!-- _class: … -->`
//   'directive'                                 — a directive NAME `<!-- _pag…`
//   'paginate'                                  — a `<!-- _paginate: … value
//   'fence'                                     — a fence info string ` ```…`
//   'theme' | 'finish' | 'form' | 'split'       — front-matter value lines
//   null                                        — none of the above
// `getLine(n)` is the 1-based line accessor; `lineNo` the cursor's line; `before`
// the line text up to the cursor. This function only CLASSIFIES — it owns no
// policy; the caller (editor.js) decides which kinds trigger per the workspace
// mode. The contexts are mutually exclusive by construction (each keys off a
// distinct prefix), so order here is for readability, not disambiguation.
//
// Mermaid is deliberately ABSENT: its source needs a typed identifier (it
// returns null on a bare position even when explicit), so it cannot be opened
// proactively — it stays type-to-fire, the same as the map/data sources.
export function typeaheadContext(getLine, lineNo, before) {
	const cls = classDirectiveCompletion(before);
	if (cls) return cls.kind; // 'class' | 'modifier'
	if (directiveNameAt(before)) return 'directive';
	if (paginateValuePosition(before)) return 'paginate';
	if (focusStyleValuePosition(before)) return 'focus-style';
	if (focusAxisPosition(before)) return 'focus';
	if (fenceLangAt(before)) return 'fence';
	if (inFrontMatter(getLine, lineNo)) {
		if (themeValuePosition(before)) return 'theme';
		if (finishValuePosition(before)) return 'finish';
		if (formValuePosition(before)) return 'form';
		if (splitValuePosition(before)) return 'split';
		if (sizeValuePosition(before)) return 'size';
	}
	return null;
}
