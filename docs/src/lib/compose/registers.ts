import { lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import type { Node as PMNode } from 'prosemirror-model';
import { type EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { deckSchema } from './deck-doc';
import { slideClassOf } from './deck-source';

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
	if (block.type.name === 'heading') return (block.attrs.level as number) <= 1 ? 'h1' : 'h2';
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

// A per-class HEADING register, keyed by `_class` name → the heading level the class's GRAMMAR
// anchors ('h1' for the title family, 'h2' for body classes). Built at the docs-site build from the
// component manifests' heading/title slot (`dist/docs/grammar.json`), so Compose offers the SAME
// heading the engine renders — one source of truth (HARD RULE #1). A class absent from the map
// (unknown, or one with no heading slot at all, e.g. big-number) falls back to permissive (both).
export type SlideHeadings = Record<string, 'h1' | 'h2'>;

// Which HEADING register(s) the caret's slide grammar permits: the class's declared level, or —
// when the class isn't in the grammar map — both (never silently drop the control on an unknown class).
function headingKeysFor(directives: string[], headings?: SlideHeadings): Reg[] {
	const cls = slideClassOf(directives);
	const gh = headings?.[cls];
	return gh === 'h1' ? ['h1'] : gh === 'h2' ? ['h2'] : ['h1', 'h2'];
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
//     always (these are BASE modifiers the engine renders on any class, so they stay block-driven).
//   - list / table / other container → nothing (no register can render from it).
export function applicableRegisters(state: EditorState, headings?: SlideHeadings): { keys: Reg[]; active: Reg | null } {
	const ctx = slideContext(state);
	if (!ctx || ctx.slide.attrs.locked) return { keys: [], active: null };
	const active = activeRegister(state);
	const { block, prev, next } = ctx;
	const isHeading = (n: PMNode | null) => !!n && n.type.name === 'heading';
	const kind = block.type.name;
	const hk = headingKeysFor(ctx.slide.attrs.directives as string[], headings);
	if (kind === 'heading') return { keys: hk, active };
	if (kind === 'blockquote') return { keys: ['insight'], active };
	if (kind === 'paragraph') {
		const keys: Reg[] = [...hk];
		if (isHeading(next) || active === 'eyebrow') keys.push('eyebrow');
		if (isHeading(prev) || active === 'subtitle') keys.push('subtitle');
		keys.push('insight', 'note');
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
	// A LOCKED slide (a construct Compose can't round-trip — a table, block HTML…) is immutable:
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
