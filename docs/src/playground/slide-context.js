// Slide-context detection + completion logic for the editor's autocomplete.
//
// Pure and import-free (no CodeMirror) so the Node unit suite can exercise it
// directly — the same pure-core/wiring split the editor uses elsewhere.
// The CodeMirror wiring lives in complete.js; this module is just the grammar.
//
// "Slide context" = the `<!-- _class: name modifier* -->` directive that
// governs the cursor's slide. Marp splits slides on a standalone `---`, so we
// walk back from the cursor to the nearest directive without crossing that
// boundary. This is the single place that knows "what component am I in",
// replacing the per-feature backward-walkers that used to drift from the
// grammar (see the map default-basemap bug, fixed in map-complete.js).

// THE class-directive reader, shared with the deck linter so completion and lint
// agree by construction rather than by comment. See lib/core/class-directive-scan.mjs.
import { classDirectiveAt } from '../../../lib/core/class-directive-scan.mjs';

const SLIDE_BREAK = /^---\s*$/;

// Which `_class` directive governs 1-based `lineNo`. `getLine(n)` returns the
// text of 1-based line n (the caller adapts CodeMirror's doc, or a test passes a
// plain array accessor). Returns `{ name, modifiers, tokens, directiveLine }` or
// `null` when the cursor is not inside a classed slide.
//
// A FORWARD SCAN, not the backward walk this used to do, and the difference is
// three defects rather than a refactor:
//
//   · the running GLOBAL `<!-- class: … -->` — which governs from its own slide
//     to the end of the deck — is now visible. A backward walk stopped at the
//     first slide boundary, so on a deck using the global form completion offered
//     the wrong component's variants from that slide onward;
//   · a directive QUOTED in prose (`` the docs write `<!-- _class: kpi -->` ``)
//     no longer counts: only a whole-line comment can be a directive, which is
//     the same shape markdown-it requires to open an `html_block`;
//   · a directive inside a fenced code block is skipped.
//
// Still O(lines-above-the-cursor) with one regex per line — this runs on every
// keystroke, and the backward walk it replaces was the same order of work.
export function slideClassAt(getLine, lineNo) {
	const hit = classDirectiveAt(getLine, lineNo);
	if (!hit) return null;
	const tokens = hit.payload.split(/\s+/).filter(Boolean);
	if (!tokens.length) return null;
	return { name: tokens[0], modifiers: tokens.slice(1), tokens, directiveLine: hit.line };
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
		info: c.summary || c.description || undefined,
	}));
}

// ── `_class:` completion, positional (shell-style) ─────────────────────────
//
// A `_class:` line has a grammar — `<component> [modifier …]` — and completion
// follows it the way shell completion follows a command line: the first word is a
// component, every later word is something THAT component accepts, and each
// choice narrows the next. See
// engineering/decisions/2026-09-24-positional-class-completion.md.
//
// `vocab` is either the lint vocab (`{ modifierGroups, exclusiveAxes,
// universalModifiers }`, from lib/authoring/lint.js buildVocab) or, for older
// callers, a flat array of universal tokens. The group registry is
// lib/components/index.js MODIFIER_GROUPS; a catalog entry carries the
// component's `variants`, `variantAxes`, `familyModifiers` and
// `excludedModifiers` (manifest `excludes` + unhosted surfaces, computed at build).

// The component a slide falls back to when it names none (#1292).
const DEFAULT_COMPONENT = 'content';

const splitTokens = (v) => String(v).split(/\s+/).filter(Boolean);

// Section ranks: CodeMirror orders sections by rank, so the component's own looks
// come first, then any group acting on something THIS slide already contains, then
// the remaining groups in registry order. Finishes go LAST: a per-slide finish is
// rare (a finish is usually deck-wide front matter), and twenty-odd of them ahead
// of the modifier groups buried the groups on the real Studio menu.
const RANK = { next: 0, variant: 1, family: 2, present: 4, group: 10, finish: 1000 };

// The surfaces an author can add to any slide by writing them. Mirrors
// CONTENT_SURFACES in lib/components/surfaces.js (pinned by the parity test).
export const CONTENT_SURFACES = ['heading', 'eyebrow', 'table'];

// What the slide being completed actually contains, as surface names. Reads the
// markdown BELOW the `_class:` line up to the next slide break. A `>` blockquote is
// reported as `key-insight` — used only to rank, never to enable, because whether a
// blockquote becomes a Key Insight is the component's call (a quote absorbs it).
export function slideSurfaces(body) {
	const out = new Set();
	const text = String(body || '');
	if (/^#{1,6}\s+\S/m.test(text)) out.add('heading');
	if (/^\s*`[^`\n]+`\s*$/m.test(text)) out.add('eyebrow');
	if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(text)) out.add('table');
	if (/^\s*>/m.test(text)) out.add('key-insight');
	return out;
}

// The markdown of the slide whose `_class:` directive sits on 1-based `lineNo`:
// the lines after it, up to where the next slide starts. A `---` always starts one;
// under the default `split: headings` so does the SECOND h1/h2 (the first is this
// slide's own heading). A fenced block is read through — a `---` or `##` inside
// one is code, not a slide break.
export function slideBodyAfter(getLine, total, lineNo, { split = 'headings' } = {}) {
	const lines = [];
	let fenced = false;
	let headings = 0;
	for (let n = lineNo + 1; n <= total; n++) {
		const t = getLine(n) ?? '';
		if (/^\s*(```|~~~)/.test(t)) fenced = !fenced;
		else if (!fenced) {
			if (SLIDE_BREAK.test(t)) break;
			if (split !== 'rule' && /^#{1,2}\s+\S/.test(t) && ++headings > 1) break;
		}
		lines.push(t);
	}
	return lines.join('\n');
}

// The deck's `split:` register, read from the leading front matter (`headings`
// when absent) — what slideBodyAfter needs to know where a slide ends.
export function deckSplit(docText) {
	const fm = String(docText || '').match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
	const m = fm?.[1].match(/^split:[ \t]*["']?(\w+)/m);
	return m ? m[1] : 'headings';
}

function groupsOf(vocab) {
	if (Array.isArray(vocab)) return [{ name: 'universal', label: 'universal', tokens: vocab.flatMap(splitTokens), legacy: true }];
	if (vocab && Array.isArray(vocab.modifierGroups) && vocab.modifierGroups.length) return vocab.modifierGroups;
	const flat = (vocab && (vocab.universalModifiers || vocab.modifiers)) || [];
	return [{ name: 'universal', label: 'universal', tokens: [...flat].flatMap(splitTokens), legacy: true }];
}

// The surface token `t` of group `g` acts on (lib/components/index.js surfaceOf).
function surfaceOf(g, t) {
	if (!g.surface) return 'slide';
	if (typeof g.surface === 'string') return g.surface;
	return g.surface[t] || g.surface['*'] || 'slide';
}

// Every set of mutually exclusive tokens that applies to `comp`: the registry's
// axes, the engine's EXCLUSIVE_AXES, the component's own exclusive variantAxes, and
// the finish classes (one finish per slide).
function exclusiveSets(groups, vocab, comp, finishClasses) {
	const sets = [];
	for (const g of groups) {
		if (g.exclusive) sets.push(g.tokens);
		for (const a of g.axes || []) sets.push(a);
		// One placement per lead: `tint-corner` has a single radial slot, so a second
		// corner would only override the first.
		for (const deps of Object.values(g.follows || {})) sets.push(deps);
	}
	if (vocab && !Array.isArray(vocab)) for (const a of Object.values(vocab.exclusiveAxes || {})) sets.push(a);
	for (const a of comp?.variantAxes || []) if (a.exclusive) sets.push(a.members);
	if (finishClasses.length) sets.push(finishClasses);
	return sets;
}

// How far up its section a token floats: how often authors write it after this
// component, and (weighted lower) after any component. CodeMirror adds `boost` to
// the match score inside a section, so a common modifier leads without hiding the rest.
function usageBoost(token, comp, usage) {
	const own = comp?.modifierUsage?.[token] || 0;
	const all = usage?.[token] || 0;
	if (!own && !all) return 0;
	return Math.min(60, Math.round(10 * Math.log2(1 + own) + 3 * Math.log2(1 + all)));
}

// Modifier completion options for component `name`, given the tokens already on
// the line (`present`). Offered, in sections: the dependents of a token just typed
// (`tint-corner` → `at-tl` …), the component's own variants, its family modifiers,
// then the modifier groups — first those acting on something this slide already
// contains, then the rest in registry order — and the finish classes last. A group is offered
// only where the surface it acts on exists: on every slide (`slide`), on a component
// that has it (`comp.surfaces`), or on a slide whose content adds it (a table, a
// heading, an eyebrow). Dropped: anything already present, the other members of an
// exclusive axis once one is picked, a dependent whose lead is absent, and the
// manifest's own `excludedModifiers`. A component with no `surfaces` (a local one,
// or an older catalog) is offered every group. `variantSurfaces` and
// `inertSurfaces` come from the render proof (tools/check-modifier-effects.js).
export function modifierOptions(name, catalog, vocab, present = [], { finishClasses = [], slideText = '', usage = null } = {}) {
	const comp = (catalog || []).find((c) => c.name === name);
	const groups = groupsOf(vocab);
	const excluded = new Set(comp?.excludedModifiers || []);
	const on = new Set([name, ...present]);
	// The component's surfaces, plus any a variant already on the line adds
	// (`kpi ops` gains the card lift plain `kpi` lacks).
	const has = Array.isArray(comp?.surfaces) ? new Set(comp.surfaces) : null;
	if (has) for (const t of on) for (const surf of comp.variantSurfaces?.[t] || []) has.add(surf);
	// A content surface the render proof found inert here stays hidden even when
	// the slide has one: its modifiers were measured to do nothing on this component.
	const inert = new Set(comp?.inertSurfaces || []);
	const content = slideSurfaces(slideText);
	const hasSurface = (surf) => surf === 'slide' || !has || has.has(surf) || (CONTENT_SURFACES.includes(surf) && content.has(surf) && !inert.has(surf));
	const blocked = new Set();
	for (const set of exclusiveSets(groups, vocab, comp, finishClasses)) {
		if (set.some((t) => on.has(t))) for (const t of set) blocked.add(t);
	}
	const globalUsage = usage || (vocab && !Array.isArray(vocab) ? vocab.modifierUsage : null);
	const seen = new Set();
	const out = [];
	// With the grouped registry, each row sits under a section header that already
	// names its kind, so a per-row `detail` repeating it ("dark  Canvas") is noise;
	// only a detail that adds something (`after tint-corner`) is kept. The legacy
	// flat vocabulary has no groups, so it keeps its kind labels.
	const legacy = groups.some((g) => g.legacy);
	const push = (label, detail, section, rank, { keepDetail = false } = {}) => {
		if (!label || seen.has(label) || on.has(label) || blocked.has(label)) return;
		seen.add(label);
		const boost = usageBoost(label, comp, globalUsage);
		out.push({ label, type: 'modifier', ...(legacy || keepDetail ? { detail } : {}), section: { name: section, rank }, ...(boost ? { boost } : {}) });
	};
	// A dependent is the obvious next word, so it leads the menu.
	for (const g of groups) {
		for (const [lead, deps] of Object.entries(g.follows || {})) {
			if (on.has(lead) && !excluded.has(lead)) for (const d of deps) if (!excluded.has(d)) push(d, `after ${lead}`, 'Next', RANK.next, { keepDetail: true });
		}
	}
	if (comp) for (const v of comp.variants || []) for (const tok of splitTokens(v)) push(tok, 'variant', `${comp.name} variants`, RANK.variant);
	if (comp) for (const f of comp.familyModifiers || []) for (const tok of splitTokens(f)) push(tok, 'modifier', 'Family', RANK.family);
	for (const f of finishClasses) push(f, 'finish', 'Finish', RANK.finish);
	const dependents = new Set(groups.flatMap((g) => Object.values(g.follows || {}).flat()));
	groups.forEach((g, i) => {
		if (g.offer === false) return;
		for (const tok of g.tokens) {
			if (excluded.has(tok) || dependents.has(tok)) continue;
			const surf = surfaceOf(g, tok);
			if (!hasSurface(surf)) continue;
			// A group acting on something this slide already contains leads the universals.
			const rank = surf !== 'slide' && content.has(surf) ? RANK.present : RANK.group + i;
			push(tok, g.legacy ? 'universal' : g.label, g.legacy ? 'Universal' : g.label, rank);
		}
	});
	return out;
}

// All `_class:` completion, by position. `spot` is classDirectiveCompletion's
// result. The first word offers components; when what the author typed matches
// no component name (`_class: dar`), it offers the modifiers of the default
// `content` slide instead, so `_class: dark` keeps working. A later word offers
// what the named component accepts — and a first word that is itself a modifier
// (`_class: dark ▮`) counts as a `content` slide carrying it.
export function classTokenOptions(spot, catalog, vocab, extra = {}) {
	return classTokenResult(spot, catalog, vocab, extra).options;
}

// classTokenOptions plus the `validFor` CodeMirror needs. CodeMirror keeps the list
// it already has while the typed word still matches `validFor`, and only asks again
// once it stops matching. A plain word pattern therefore froze the first-word list
// on components: typing `dark` never reached the fallback, because `d`, `da` and
// `dar` all match some component (`radar`) and the source was never asked again.
// On the first word the list stays valid only while the text still names a
// component (or, for the fallback, still names none), so the switch happens on the
// keystroke that needs it.
export function classTokenResult(spot, catalog, vocab, extra = {}) {
	const WORD = /^[\w-]*$/;
	if (!spot) return { options: [], validFor: WORD };
	const names = (catalog || []).map((c) => c.name);
	if (spot.kind === 'class') {
		const namesComponent = (text) => {
			const t = String(text || '').toLowerCase();
			return !t || names.some((n) => n.includes(t));
		};
		if (!namesComponent(spot.typed)) {
			return { options: modifierOptions(DEFAULT_COMPONENT, catalog, vocab, [], extra), validFor: (text) => WORD.test(text) && !namesComponent(text) };
		}
		return { options: classOptions(catalog), validFor: (text) => WORD.test(text) && namesComponent(text) };
	}
	if (names.includes(spot.name)) return { options: modifierOptions(spot.name, catalog, vocab, spot.present, extra), validFor: WORD };
	return { options: modifierOptions(DEFAULT_COMPONENT, catalog, vocab, [spot.name, ...(spot.present || [])], extra), validFor: WORD };
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
//   'theme' | 'finish' | 'split'                 — front-matter value lines
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
		if (splitValuePosition(before)) return 'split';
		if (sizeValuePosition(before)) return 'size';
	}
	return null;
}
