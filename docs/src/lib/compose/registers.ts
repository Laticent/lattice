import { lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import type { Node as PMNode } from 'prosemirror-model';
import { type EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { deckSchema } from './deck-doc';
import { CLASS_RE } from './deck-source';

// The Compose "grammar registers" — the block styles the engine renders from plain structure
// (base.modifiers.css): H1/H2 headings, an inline-code label as an eyebrow (before a heading)
// or subtitle (after one), a TRAILING blockquote as a Key-insight, a TRAILING em-dash paragraph
// as a Below-note. This module is the pure apply/detect kernel — no React, no DOM — so the jank
// vectors below can be stress-tested directly (see registers.test.ts).
//
// THE INVARIANT (learned from the `- > > > >` infinite-nesting bug): a register must MUTATE and
// DETECT the SAME block, and apply only where it can produce a VALID register. Every register
// here operates on the caret's TOP-LEVEL block (doc → slide → block) and is a strict no-op when
// that block isn't a type the register can render from. That makes each one an idempotent toggle
// that can never nest or apply unboundedly — the previous `insight` path wrapped the INNER block
// (inside a list item) while `activeRegister` read the top-level list, so they never agreed and
// each tap wrapped another blockquote.
export type Reg = 'h1' | 'h2' | 'eyebrow' | 'subtitle' | 'insight' | 'note';

// True if a paragraph node's only content is inline code (the engine's eyebrow/subtitle
// construct — `p:has(> code:only-child)`).
export function isCodeLabel(block: PMNode): boolean {
	return block.type.name === 'paragraph' && block.textContent.length > 0 && block.content.content.every((n) => !n.isText || n.marks.some((m) => m.type.name === 'code'));
}

// The caret's top-level block within its slide, with the siblings the engine's positional
// register rules key on. `slide` is the depth-1 ancestor (doc → slide → block). Returns null
// unless the WHOLE selection sits in one slide's top level — a cross-slide or doc-edge selection
// has no single "current block" to register, so callers treat null as "no-op".
export function slideContext(state: EditorState) {
	const { $from, $to } = state.selection;
	if ($from.depth < 1 || $to.depth < 1) return null;
	if ($from.node(1).type.name !== 'slide') return null;
	// A selection that spans two slides has no single target block — bail (guards the
	// cross-slide wrap/setBlockType vector).
	if ($from.before(1) !== $to.before(1)) return null;
	const slide = $from.node(1);
	const index = $from.index(1);
	const block = slide.child(index);
	return {
		slide,
		index,
		block,
		isLast: index === slide.childCount - 1,
		prev: index > 0 ? slide.child(index - 1) : null,
		next: index < slide.childCount - 1 ? slide.child(index + 1) : null,
	};
}

// Which register the caret's block currently IS — EXACTLY as the engine renders it, so the
// gutter never mislabels (base.modifiers.css): a code label is an EYEBROW before a heading /
// a SUBTITLE after one; a blockquote is a KEY-INSIGHT only when TRAILING; an em-dash
// paragraph is a BELOW-NOTE only when TRAILING. Anything else lights nothing.
export function activeRegister(state: EditorState): Reg | null {
	const ctx = slideContext(state);
	if (!ctx) return null;
	const { block, isLast, prev, next } = ctx;
	const isHeading = (n: PMNode | null) => !!n && n.type.name === 'heading';
	if (block.type.name === 'heading') {
		// ONLY level 1 → H1 and level 2 → H2; an H3–H6 (reachable via the `#{1,6}` input rule or pasted
		// markdown) is a heading the register vocabulary can't name, so it lights NOTHING rather than
		// mislabeling as an active H2 — which used to make the pill's H2 button toggle the H3 to a
		// paragraph on click instead of normalizing it. With no register active, the grammar heading
		// (H1/H2) shows un-lit and applying it converts the H3–H6 to that level.
		const lvl = block.attrs.level as number;
		return lvl === 1 ? 'h1' : lvl === 2 ? 'h2' : null;
	}
	if (block.type.name === 'blockquote') return isLast ? 'insight' : null;
	if (block.type.name === 'paragraph') {
		if (isCodeLabel(block)) {
			if (isHeading(next)) return 'eyebrow'; // code label BEFORE a heading (eyebrow wins when sandwiched)
			if (isHeading(prev)) return 'subtitle'; // code label AFTER a heading
			return null; // a code label adjacent to no heading renders as neither
		}
		if (isLast && block.textContent.startsWith('—')) return 'note';
	}
	return null;
}

// A per-class HEADING register set, keyed by `_class` name → the heading level(s) the class's GRAMMAR
// anchors: `['h1']` for the title family, `['h2']` for body classes, `['h1','h2']` for a class whose
// heading slot lists both (e.g. `journey`), and an EMPTY `[]` for a KNOWN class the grammar gives no
// heading slot at all (e.g. big-number, whose hero is a list item, not a heading). Built at the
// docs-site build from every component manifest's heading/title slot (`dist/docs/grammar.json`), so
// Compose offers the SAME heading the engine renders — one source of truth (HARD RULE #1). A class
// ABSENT from the map (an unrecognized `_class`) falls back to permissive (both).
export type SlideHeadings = Record<string, ('h1' | 'h2')[]>;

// A class name → the OPTIONAL editorial blocks that layout actually renders, read from
// `authoring.blocks` in the generated manifest (#1651). Both blocks are opt-out, and a
// layout that claims its trailing blockquote / paragraph for its own anatomy renders
// neither: a `quote` takes them as the quotation and the attribution. Same injection
// shape (and the same one-source-of-truth reasoning) as `SlideHeadings` above.
export type SlideBlocks = Record<string, string[]>;

// Components whose grammar has no place for a table — the door Compose withholds.
//
// THE CRITERION: does this layout render a PRIMARY FIGURE or a FIXED ANATOMY that owns the
// stage? If it does, a table is not a second block, it is a competitor for the canvas — and
// the figure loses far more than the table gains. Measured on the shipped skeletons at
// 1280x720, adding one three-row table:
//
//   quadrant  figure 343px (48% of slide) -> 188px (26%)   -45%
//   diagram   figure 446px (62%)          -> 284px (39%)   -36%
//   piechart  figure 424px (59%)          -> 270px (38%)   -36%
//   code      figure 438px (61%)          -> 284px (39%)   -35%
//
// The table itself only takes ~20% of the slide; the rest is the fit spine rebalancing. The
// ENGINE agrees where the damage is acute — with a table added it reports quadrant's labels
// below the type-legibility floor, and clipping or overflow on journey, kpi, logo-wall and
// authority-chain. Those warnings are corroboration, not the rule: `diagram` never warns,
// because Mermaid scales its own labels down instead, and a diagram at 39% of the slide is a
// worse slide with or without a warning.
//
// Equally, a warning is not sufficient on its own. `policy-recommendation`, `q-and-a` and
// `regulatory-update` also overflow with a table added — but only because their skeletons
// already sit near capacity. That is a deck-capacity concern for `lint:deck`, not evidence
// that a table is the wrong KIND of content there, so they keep the door.
//
// CURATED, NOT DERIVED, and two failed derivations are why. A regex over manifest slots
// answers "does this component DECLARE a table?" — a different question, and it hid the
// control on 57 of 61 including `content`. A DOM census for `svg/pre/img/canvas` misses every
// component that builds its figure from divs and CSS (kanban, cycle, progress, matrix-2x2,
// verdict-grid, kpi, big-number all read as 0% and are not). Both instruments have blind
// spots; the list is judged, with the measurements as evidence.
//
// It withholds a CONTROL, not a capability: typing a pipe table or pasting one still works
// and still renders. That is the line HARD RULE #29 draws — we do not refuse the author, we
// decline to hand them a tool that makes a worse slide.
const TABLE_UNSUITED = new Set([
	// ── No body flow to join: bookends and single-utterance statements ──────────
	'title',
	'closing',
	'divider',
	'big-number',
	'quote',
	'premise', // engine clips it with a table added
	'split-panel',
	// ── The picture IS the slide ────────────────────────────────────────────────
	'image',
	'scene',
	'video',
	'contact', // QR code
	'wifi', // QR code
	// ── A PRIMARY FIGURE owns the stage — the case that started this list ───────
	// Every chart except the two whose table IS the figure (matrix-grid, roadmap).
	'funnel',
	'gantt',
	'journey', // engine clips it with a table added
	'kanban',
	'map',
	'piechart',
	'progress',
	'quadrant', // engine drops its labels below the legibility floor
	'radar',
	'state-chart',
	'timeline-list',
	'word-cloud',
	'cycle',
	'diagram', // mermaid: -36% of the figure, silently — it scales rather than warns
	'code', // the code block owns the stage, -35%
	'compare-code',
	'math', // the equation owns the stage
	// ── Fixed grids and card anatomies: the layout already allocates the stage ──
	'kpi', // engine overflows with a table added
	'stats',
	'cards-grid',
	'cards-stack',
	'matrix-2x2',
	'verdict-grid',
	'pricing',
	'logo-wall', // engine overflows with a table added
	'authority-chain', // engine overflows with a table added
	'citation-card',
	'statute-stack',
	// ── Two-sided comparisons: the anatomy IS the comparison ────────────────────
	'compare-prose',
	'redline',
	'decision',
	'split-compare', // and the engine genuinely DROPS a table here — measured
	// ── Already renders a table from its own grammar ────────────────────────────
	'glossary', // its entries ARE the table; a second one competes
]);

/**
 * Does Compose offer the "Insert table" door on the caret's slide?
 *
 * PERMISSIVE BY DEFAULT, on the same guards `rendersBlock` carries: an unclassed slide and
 * an unrecognized `_class` both say yes, so a new or custom component is never silently
 * stripped of the control. Only a name on the curated list above withholds it. The LAST
 * `_class` token that matches wins, matching the engine's directive semantics, and the
 * lookup is a `Set` so a slide naming `constructor` cannot reach up a prototype chain.
 *
 * What KEEPS the door, and why it is the shorter list: `content` (the catch-all body
 * layout), the open list-flow layouts a table can legitimately join (list, list-tabular,
 * list-criteria, list-steps, agenda, actors, checklist, inventory, q-and-a,
 * policy-recommendation, regulatory-update), and the four components whose table IS the
 * content (compare-table, matrix-grid, obligation-matrix, roadmap).
 */
export function slideTakesTable(directives: string[]): boolean {
	let declared: boolean | undefined;
	for (const d of directives) {
		const m = d.match(CLASS_PAYLOAD_RE);
		if (!m) continue;
		for (const token of m[1].trim().split(/\s+/)) {
			if (token && TABLE_UNSUITED.has(token)) declared = false;
		}
	}
	return declared ?? true;
}

/** The curated set, exported for the census test that keeps it from rotting when a
 *  component is renamed or retired. Not for runtime use — call `slideTakesTable`. */
export const TABLE_UNSUITED_NAMES: readonly string[] = [...TABLE_UNSUITED];

/** The WHOLE `_class:` payload — every token, not just the leading one that `CLASS_RE`
 *  takes. Matches the running-global `<!-- class: … -->` spelling too, so a deck that
 *  sets its layout that way is gated the same as a per-slide one. */
const CLASS_PAYLOAD_RE = /<!--\s*_?class:\s*([^>]*?)\s*-->/;

/**
 * Does the caret's slide render the block behind this register?
 *
 * PERMISSIVE BY DEFAULT, on exactly the same three guards `headingKeysFor` carries:
 * only an explicitly-classed slide is gated, the LAST `_class` wins, and the lookup is
 * `Array.isArray`-guarded so a slide naming `constructor` in its `_class` can't reach a
 * function up the prototype chain. A class absent from the map — or a missing map — is
 * offered the register, so an unrecognized class and a build that could not read the
 * manifest both behave exactly as they did before this gate existed.
 */
function rendersBlock(directives: string[], block: 'key-insight' | 'below-note', blocks?: SlideBlocks): boolean {
	if (!blocks) return true;
	// Read EVERY token of the directive, not just the first.
	//
	// `CLASS_RE` captures one token, which is all the heading gate needs — but a class
	// payload is a token LIST and the component name is not required to lead it.
	// `<!-- _class: dark quote -->` is ordinary, legal authoring, and matching the first
	// token alone resolved it to `dark`, found no entry, and fell through to permissive.
	// That is not a cosmetic miss: the register the gate then offered was `insight`, and
	// applying it to a quote's blockquote UNWRAPS it — the quotation becomes a plain
	// paragraph and the slide's whole content is gone. Found by the red-team pass.
	//
	// Scan for the token the map actually knows. The map is keyed by component name and
	// modifiers are never keys, so the first hit is the component; `Object.hasOwn` keeps
	// a slide naming `constructor` off the prototype chain.
	let declared: string[] | undefined;
	for (const d of directives) {
		const m = d.match(CLASS_PAYLOAD_RE);
		if (!m) continue;
		for (const token of m[1].trim().split(/\s+/)) {
			if (!token || !Object.hasOwn(blocks, token)) continue;
			const entry = blocks[token];
			if (Array.isArray(entry)) declared = entry; // later directives win, as the engine does
		}
	}
	if (!declared) return true;
	return declared.includes(block);
}

// Which HEADING register(s) the caret's slide grammar permits: the class's declared level(s), or —
// when the class isn't in the grammar map — both (never silently drop the control on an unknown class).
// Three guards, all from the adversarial trio:
//   - Only an EXPLICITLY-classed slide is gated. A classless slide (`slideClassOf` would default it to
//     `content`→H2) stays PERMISSIVE, so an author who hasn't committed a class — or intends a title —
//     isn't silently blocked from originating an H1 (inversion + red-team "strand the author").
//   - The LAST `_class` wins, matching the engine's directive semantics (a slide with two `_class`
//     comments renders as the last; Compose must not gate on the first and diverge).
//   - `Array.isArray` guards the plain-object lookup against `Object.prototype` keys a slide could name
//     in `_class` (`constructor`, `hasOwnProperty`, …): `headings['constructor']` resolves to a FUNCTION
//     up the prototype chain, and an unguarded `[...gh]` on it THROWS — which propagated out of the
//     format sync and skipped the source emit, silently dropping the author's edits (trio: CRITICAL).
function headingKeysFor(directives: string[], headings?: SlideHeadings): Reg[] {
	let cls: string | null = null;
	for (const d of directives) {
		const m = d.match(CLASS_RE);
		if (m) cls = m[1];
	}
	if (cls == null) return ['h1', 'h2'];
	const gh = headings?.[cls];
	// A KNOWN class carries its declared level set — INCLUDING an empty `[]` for a class with no heading
	// slot (big-number), where we offer no heading register rather than the permissive default. Only a
	// class ABSENT from the map (unrecognized `_class`) stays permissive. `Array.isArray` also guards the
	// plain-object lookup against `Object.prototype` keys a slide could name in `_class` (trio CRITICAL).
	return Array.isArray(gh) ? [...gh] : ['h1', 'h2'];
}

// The registers that APPLY to the caret's current block — the "truly context-sensitive" set the
// divider's Format group shows (no-ops are hidden, not dimmed). `active` is the one currently ON.
//   - locked slide / no context → nothing (the slide is edited in Markdown).
//   - the HEADING register follows the slide's GRAMMAR: a title-class slide offers H1, a body-class
//     slide offers H2 — never both (so H1 can't be applied on slide 2, nor H2 on a title). Passing no
//     `headings` map (e.g. in a unit test) keeps the permissive H1/H2 default.
//   - heading block → the grammar heading register (toggle level, or back to paragraph).
//   - blockquote (Key-insight) → just Key-insight (to toggle it off).
//   - paragraph → the grammar heading register; Eyebrow / Subtitle only where the engine would render
//     them (a code label adjacent to a heading) or where already active; Key-insight + Below-note
//     where the CLASS renders them (#1651 — both blocks are opt-out, and a layout that claims its
//     trailing blockquote / paragraph for its own anatomy renders neither).
//   - list / table / other container → nothing (no register can render from it).
export function applicableRegisters(state: EditorState, headings?: SlideHeadings, blocks?: SlideBlocks): { keys: Reg[]; active: Reg | null } {
	const ctx = slideContext(state);
	if (!ctx || ctx.slide.attrs.locked) return { keys: [], active: null };
	const active = activeRegister(state);
	const { block, prev, next } = ctx;
	const isHeading = (n: PMNode | null) => !!n && n.type.name === 'heading';
	const kind = block.type.name;
	const hk = headingKeysFor(ctx.slide.attrs.directives as string[], headings);
	// Always keep the block's CURRENT heading register available even if the class grammar wouldn't
	// offer it — otherwise a heading at a grammar-illegal level (e.g. an H1 typed via the `#` input
	// rule or round-tripped from markdown onto a body slide) renders as a lone WRONG button that can't
	// be lit or toggled off from the pill (recoverable only in Markdown mode). Prepend so the active,
	// lit register reads first, then the grammar target to switch to.
	if ((active === 'h1' || active === 'h2') && !hk.includes(active)) hk.unshift(active);
	const directives = ctx.slide.attrs.directives as string[];
	// NO "keep the active register" escape here, unlike the heading fallback above — the two
	// cases are not alike. A stray H1 is REAL markup that renders wrong and needs a pill to
	// fix. An "active" insight/note on a layout that drops the block is not: `activeRegister`
	// infers both POSITIONALLY (a trailing blockquote, a paragraph after a structural block),
	// and on an excluded layout that inference is simply wrong — a quote's trailing paragraph
	// is its ATTRIBUTION and renders as such. There is no stray construct to clear.
	//
	// Offering the pill anyway would be worse than useless for insight: the quotation is a
	// real `<blockquote>`, so toggling the register off would unwrap it and destroy the quote.
	const takesInsight = rendersBlock(directives, 'key-insight', blocks);
	const takesNote = rendersBlock(directives, 'below-note', blocks);
	if (kind === 'heading') return { keys: hk, active };
	if (kind === 'blockquote') return { keys: takesInsight ? ['insight'] : [], active };
	if (kind === 'paragraph') {
		const keys: Reg[] = [...hk];
		if (isHeading(next) || active === 'eyebrow') keys.push('eyebrow');
		if (isHeading(prev) || active === 'subtitle') keys.push('subtitle');
		// An ORPHAN code label (a lone inline-code paragraph next to no heading) renders as a mono label
		// but as neither eyebrow nor subtitle, so the two positional rules above skip it — leaving no
		// pill affordance to clear the code mark (recoverable only in Markdown mode). Offer eyebrow so a
		// tap toggles the code off; the register glyph is the same construct either way.
		if (isCodeLabel(block) && !keys.includes('eyebrow') && !keys.includes('subtitle')) keys.push('eyebrow');
		if (takesInsight) keys.push('insight');
		if (takesNote) keys.push('note');
		return { keys, active };
	}
	return { keys: [], active };
}

// Move the caret's top-level block to the END of its slide, replaced by `make(block)`. The
// trailing registers (Key-insight, Below-note) render only as the slide's last block, so
// applying one relocates the block there — the "naturally goes to the end of the slide" model.
export function moveToSlideEnd(view: EditorView, make: (block: PMNode) => PMNode) {
	const { state } = view;
	const { $from } = state.selection;
	if ($from.depth < 1) return;
	const slide = $from.node(1);
	const slideStart = $from.before(1);
	const index = $from.index(1);
	let blockStart = slideStart + 1;
	for (let i = 0; i < index; i++) blockStart += slide.child(i).nodeSize;
	const block = slide.child(index);
	const newNode = make(block);
	const tr = state.tr.delete(blockStart, blockStart + block.nodeSize);
	const end = tr.mapping.map(slideStart + slide.nodeSize - 1);
	tr.insert(end, newNode);
	tr.setSelection(TextSelection.near(tr.doc.resolve(end + newNode.nodeSize - 1), -1));
	view.dispatch(tr.scrollIntoView());
	view.focus();
}

// Apply a register to the caret's block (the "menu is the style sheet"). Positional registers
// place the block where the engine renders them; toggling a lit register removes it. Every
// branch guards on the TOP-LEVEL block kind so a register is a strict no-op on a list / table /
// nested container — the block types it could never render from, and where it used to nest
// without bound.
export function applyRegister(view: EditorView, reg: Reg, current: Reg | null) {
	const s = deckSchema;
	const { state, dispatch } = view;
	const ctx = slideContext(state);
	// No single target block (cross-slide / doc-edge selection): nothing to register.
	if (!ctx) {
		view.focus();
		return;
	}
	// A LOCKED slide (a construct Compose can't round-trip — math, block HTML…) is immutable:
	// the structural guard would silently FILTER any register transaction, leaving the button
	// looking like it did something. Short-circuit to a clean no-op instead of dispatching a
	// doomed change (which would also trip the emit path's parked-resync clobber). No-op is right —
	// the slide is edited in Markdown mode. (The divider's Format group also renders EMPTY on a
	// locked slide — `applicableRegisters` returns no keys — so there's no button to reach here.)
	if (ctx.slide.attrs.locked) {
		view.focus();
		return;
	}
	const kind = ctx.block.type.name;

	if (reg === 'h1' || reg === 'h2') {
		// A heading register describes a TOP-LEVEL paragraph or heading. In a list / table / quote
		// the top-level block is a container, so a heading can't render as one — no-op.
		if (kind !== 'paragraph' && kind !== 'heading') {
			view.focus();
			return;
		}
		if (reg === current) setBlockType(s.nodes.paragraph)(state, dispatch);
		else setBlockType(s.nodes.heading, { level: reg === 'h1' ? 1 : 2 })(state, dispatch);
	} else if (reg === 'eyebrow' || reg === 'subtitle') {
		// Eyebrow and Subtitle are ONE construct (a code label); position decides which the engine
		// renders. Both toggle the inline-code treatment — but only on a TOP-LEVEL paragraph
		// (guarding on ctx.block, not $from.parent, so a caret inside a list item doesn't code-mark
		// just that item, which could never render as an eyebrow anyway).
		if (kind !== 'paragraph') {
			view.focus();
			return;
		}
		const { $from } = view.state.selection;
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, $from.start(), $from.end())));
		toggleMark(s.marks.code)(view.state, view.dispatch);
	} else if (reg === 'insight') {
		// Key-insight = a TRAILING blockquote. Toggle by BLOCK KIND, not the `current` label:
		//   - already a blockquote → unwrap (lift), wherever it sits. NEVER wrap again — this is
		//     the fix for the unbounded `> > > >` nesting (a non-last or list-nested blockquote
		//     used to read as `current: null` and get re-wrapped every tap).
		//   - a top-level paragraph → wrap it (in place if last, else relocate to the slide end).
		//   - anything else (list, heading, table) → no-op.
		if (kind === 'blockquote') lift(state, dispatch);
		else if (kind === 'paragraph') {
			if (ctx.isLast) wrapIn(s.nodes.blockquote)(state, dispatch);
			else moveToSlideEnd(view, (block) => s.nodes.blockquote.create(null, block));
		}
	} else if (reg === 'note') {
		// Below-note = a TRAILING paragraph led by "— ". Top-level paragraph only.
		if (kind !== 'paragraph') {
			view.focus();
			return;
		}
		const { $from } = view.state.selection;
		if (current === 'note') {
			// strip the leading em-dash from the trailing note
			const strip = $from.parent.textContent.startsWith('— ') ? 2 : 1;
			view.dispatch(view.state.tr.delete($from.start(), $from.start() + strip));
		} else if (!ctx.block.textContent.startsWith('—')) {
			if (ctx.isLast) view.dispatch(view.state.tr.insertText('— ', $from.start())); // already last
			else moveToSlideEnd(view, (block) => s.nodes.paragraph.create(null, [s.text('— '), ...block.content.content]));
		} else {
			// A paragraph that already leads with an em-dash but ISN'T the slide's last block reads
			// as `current: null` (Below-note requires trailing) — so it was a dead-end: neither
			// stripped nor moved. Relocate it to the slide end (content preserved) so it becomes the
			// recognized trailing note and can then toggle off. (Finding 7.)
			moveToSlideEnd(view, (block) => s.nodes.paragraph.create(null, block.content.content));
		}
	}
	view.focus();
}
