import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { type MarkType, type Node as PMNode, Slice } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { goToNextCell, isInTable, tableEditing } from 'prosemirror-tables';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { deckSchema, deckToDoc, type EmitBaseline, emitDeck, initBaseline } from '@/lib/compose/deck-doc';
import { slideClassOf } from '@/lib/compose/deck-source';
import { activeRegister, applicableRegisters, applyRegister, type Reg, type SlideHeadings } from '@/lib/compose/registers';
import { insertStarterTable, stripCellSpans, tabToNextCellOrAddRow } from '@/lib/compose/table-commands';
import { cn } from '@/lib/utils';
import { getFrontMatter } from './front-matter';
import { TableControls } from './table-controls';
import { useRailLayout, useVisualViewport } from './use-visual-viewport';

// The slide divider borrows the deck's STRUCTURAL TRIM (`spectrum-trim:`) — the same
// register that colors the rendered deck's `hr` rules, table rails, and timeline spine —
// so the Compose dividers preview the deck's chosen trim rather than a flat neutral line.
// Values mirror spectrum-trim-catalog.ts: off (quiet accent-tinted hairline, the default),
// restrained (a single-hue accent ramp), on (the full deck `--spectrum`, accent-ramp
// fallback when `--spectrum` isn't in scope). Returns the CSS the divider paints.
function trimGradient(source: string): string {
	switch (getFrontMatter(source, 'spectrum-trim') || 'off') {
		case 'on':
			return 'var(--spectrum, linear-gradient(90deg, var(--accent,#006fa8), color-mix(in oklab, var(--accent,#006fa8) 40%, var(--bg,#fff))))';
		case 'restrained':
			return 'linear-gradient(90deg, var(--accent,#006fa8), color-mix(in oklab, var(--accent,#006fa8) 35%, var(--bg,#fff)))';
		default:
			return 'color-mix(in oklab, var(--accent,#006fa8) 55%, var(--border,#e4eaf2))';
	}
}

// The Compose editing MODE, on ProseMirror (Option B, one true document), dressed
// in the Quiet Page: a serif writing surface whose only chrome is a QUIET GRAMMAR
// GUTTER on the left — Lattice's registers (H1/H2/Eyebrow/Insight/Note), faint at
// rest, LIT for the block the caret is in, click-to-apply. The empty margin becomes
// the toolbar; restraint stays. One document → selection/copy/undo span slides.

const REGISTERS: { key: Reg; glyph: string; label: string; mono?: boolean }[] = [
	{ key: 'h1', glyph: 'H1', label: 'Heading', mono: true },
	{ key: 'h2', glyph: 'H2', label: 'Section', mono: true },
	{ key: 'eyebrow', glyph: '·e·', label: 'Eyebrow', mono: true },
	{ key: 'subtitle', glyph: '·s·', label: 'Subtitle', mono: true },
	{ key: 'insight', glyph: '❦', label: 'Key insight' },
	{ key: 'note', glyph: '—', label: 'Below-note' },
];

// Whether a mark is on across the current selection (or in the stored marks at an
// empty caret) — drives the floating bar's pressed state.
function markActive(state: EditorState, type: MarkType): boolean {
	const { from, to, empty, $from } = state.selection;
	if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
	return state.doc.rangeHasMark(from, to, type);
}

// The floating selection bar's model: where to sit (viewport coords, so it portals to
// <body> and dodges the surface's `overflow:hidden` + `container-type` clipping) and
// which inline marks are live. null = no non-empty text selection, so no bar.
type SelBar = { left: number; top: number; below: boolean; strong: boolean; em: boolean; code: boolean };

// The floating bar shows ONLY on a fine-pointer/hover device (desktop). On touch, the OS
// selection menu (Cut/Copy/Paste + Format B/I/U) owns formatting — our bar would fight it,
// stacking on top of the native popover (the iOS screenshots). So on coarse pointers we
// stand down and let the OS menu drive; its Bold/Italic map to our marks, Underline no-ops.
function canFloatBar(): boolean {
	return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function computeSelBar(view: EditorView): SelBar | null {
	if (!canFloatBar()) return null;
	const { state } = view;
	const sel = state.selection;
	if (sel.empty || !(sel instanceof TextSelection)) return null;
	const start = view.coordsAtPos(sel.from);
	const end = view.coordsAtPos(sel.to);
	const anchorTop = Math.min(start.top, end.top);
	// Near the top of the viewport there's no room above — flip below the selection.
	const below = anchorTop < 56;
	return {
		left: (start.left + end.left) / 2,
		top: below ? Math.max(start.bottom, end.bottom) : anchorTop,
		below,
		strong: markActive(state, deckSchema.marks.strong),
		em: markActive(state, deckSchema.marks.em),
		code: markActive(state, deckSchema.marks.code),
	};
}

// ── Tables ──────────────────────────────────────────────────────────────────
// The pure table commands live in `@/lib/compose/table-commands` (shared with TableControls);
// the divider-bar controls are the React `TableControls` island, mounted into a pill slot.
// We expose NO merge/split and NO column-resize — neither survives the GFM round-trip
// (2026-07-19-compose-table-editing.md, Axis B).

// The structural guard (the adversarial trio's CRITICAL). Two invariants a stray keystroke
// must never break: (1) the slide COUNT can't change from editing — Backspace at a slide
// start, Delete at its end, or a cross-slide selection-delete would otherwise `joinBackward`
// two slides into one, silently dropping the merged-away slide's `_class`; (2) a LOCKED
// slide (one whose prose Compose can't round-trip — a table, block HTML, strikethrough…)
// can't be edited, so its node identity never changes and `emitDeck` always re-emits its
// exact `raw` bytes. Selection-only transactions (no doc change) always pass, so you can
// still put the caret in / copy from a locked slide.
export function structuralGuard() {
	return new Plugin({
		filterTransaction(tr, state) {
			if (!tr.docChanged) return true;
			// A deliberate slide op (insert/delete/move from the slide rail) is allowed to
			// change the count and touch locked slides — it's intentional, not an accident.
			if (tr.getMeta('slideOp')) return true;
			const oldDoc = state.doc;
			const newDoc = tr.doc;
			if (oldDoc.childCount !== newDoc.childCount) return false; // no accidental merge/split
			for (let i = 0; i < oldDoc.childCount; i++) {
				if (oldDoc.child(i).attrs.locked && oldDoc.child(i) !== newDoc.child(i)) return false; // locked slide is immutable
			}
			return true;
		},
	});
}

// Collapse is view-only state that must OUTLIVE a nodeView recreation (a real click can
// make ProseMirror rebuild the slide's view), so it lives in a plugin as a node decoration
// — not on the SlideView instance. Toggling dispatches a `collapseKey` meta (doc unchanged,
// so the structural guard waves it through); the decoration maps through edits, and each
// SlideView reads it in its constructor/update to add the `cs-collapsed` class.
export const collapseKey = new PluginKey<DecorationSet>('cs-collapse');
export function collapsePlugin() {
	return new Plugin({
		key: collapseKey,
		state: {
			init: () => DecorationSet.empty,
			apply(tr, set) {
				let next: DecorationSet;
				if (tr.getMeta('slideOp')) {
					// A structural op (SlideView.commit) rebuilds the whole doc from the SAME node
					// instances via one full-content replace step, so position-mapping the collapse
					// decorations through it DROPS them (their span falls inside the replaced range) —
					// collapsed slides would pop open on every move/insert/delete. Re-establish collapse
					// by NODE IDENTITY: note which slide instances were collapsed in the pre-op doc, then
					// re-decorate those same instances at their new offsets.
					const beforeDoc = tr.docs.length ? tr.docs[0] : tr.doc;
					const collapsed = new Set<PMNode>();
					for (const d of set.find()) {
						const n = beforeDoc.nodeAt(d.from);
						if (n) collapsed.add(n);
					}
					const decos: Decoration[] = [];
					tr.doc.forEach((node, offset) => {
						if (collapsed.has(node)) decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'cs-collapsed' }, { collapsed: true }));
					});
					next = DecorationSet.create(tr.doc, decos);
				} else {
					next = set.map(tr.mapping, tr.doc);
				}
				const toggle = tr.getMeta(collapseKey) as { pos: number } | undefined;
				if (toggle) {
					const node = tr.doc.nodeAt(toggle.pos);
					if (node) {
						const existing = next.find(toggle.pos, toggle.pos + 1);
						next = existing.length ? next.remove(existing) : next.add(tr.doc, [Decoration.node(toggle.pos, toggle.pos + node.nodeSize, { class: 'cs-collapsed' }, { collapsed: true })]);
					}
				}
				return next;
			},
		},
		props: {
			decorations(state) {
				return collapseKey.getState(state);
			},
		},
	});
}

// View-only badge chips for the four LFM state markers at the START of a table cell — the
// signature obligation-matrix / roadmap grammar. The underlying text stays the literal
// `[x]`/`[-]`/`[ ]`/`[/]` (so the round-trip is untouched and the marker is still editable); an
// inline decoration just tints it to the engine's stoplight semantics. Recomputed from the doc
// each update (tables are small), the same view-only pattern as the collapse decoration.
const CELL_MARKER_RE = /^\[([x\-/ ])\]/;
const MARKER_STATE: Record<string, string> = { x: 'pass', '-': 'warn', '/': 'skip', ' ': 'todo' };

// The PIPE-TABLE components whose BODY cells carry LFM state markers the engine paints as stoplight
// chips (`obligationMatrixBadges` / roadmap gate on `<td>`, spec LFM-1.0 §3.2). The other stateful
// components (checklist / verdict-grid / pricing) carry markers in LIST items, not table cells, so
// they are correctly out of a table picker's scope. This is the single source of truth for BOTH the
// marker picker (which classes offer it) AND the badge decoration below (which cells get painted) —
// so the two never diverge. Add a class here when a new marker-bearing pipe-table component ships.
const STATEFUL_CLASSES = new Set(['obligation-matrix', 'roadmap']);
function isStatefulClass(slide: PMNode): boolean {
	return STATEFUL_CLASSES.has(slideClassOf((slide.attrs.directives as string[]) || []));
}
function stateMarkerPlugin() {
	// Memoize by doc IDENTITY: `decorations` is called on every view update, but the marker set only
	// changes when the DOC changes — so a selection-only update (a caret move, the common case) skips
	// the whole-doc rescan and returns the cached set. Behavior is identical; it just avoids O(nodes)
	// work per keystroke-less update on a large deck.
	let cachedDoc: PMNode | null = null;
	let cached: DecorationSet = DecorationSet.empty;
	return new Plugin({
		props: {
			decorations(state) {
				if (state.doc === cachedDoc) return cached;
				const decos: Decoration[] = [];
				state.doc.descendants((node, pos) => {
					// Only paint where the ENGINE renders a stoplight chip: a marker-bearing pipe-table
					// component's BODY cell. Descend stateful slides only (skip the rest wholesale — also
					// faster), and decorate `table_cell`, never `table_header` (headers carry column labels,
					// not statuses — `obligationMatrixBadges`/roadmap gate on `<td>`). Anything else the
					// author typed stays literal, matching what the export produces (no WYSIWYG lie).
					if (node.type.name === 'slide') return isStatefulClass(node);
					if (node.type.name !== 'table_cell') return true;
					// Measure off the leading TEXT node: a leading inline atom (image) would offset the range.
					const first = node.firstChild;
					if (!first?.isText) return true;
					const m = CELL_MARKER_RE.exec(first.text ?? '');
					if (m) {
						const from = pos + 1; // inline content starts just inside the cell
						decos.push(Decoration.inline(from, from + 3, { class: `cs-cellmark cs-cellmark-${MARKER_STATE[m[1]]}` }));
					}
					return true; // a cell can hold nested inline, but the marker is only ever at its start
				});
				cachedDoc = state.doc;
				cached = DecorationSet.create(state.doc, decos);
				return cached;
			},
		},
	});
}

// Marks the slide the caret is inside with a `cs-slide-active` node decoration so its
// control bar shows only when you're "inside the slide boundary" (recomputed from the
// selection every state change — stateless, no stored set).
function activeSlidePlugin() {
	return new Plugin({
		props: {
			decorations(state) {
				const { $from } = state.selection;
				if ($from.depth < 1) return DecorationSet.empty;
				const node = $from.node(1);
				if (node.type.name !== 'slide') return DecorationSet.empty;
				const pos = $from.before(1);
				return DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, {}, { active: true })]);
			},
		},
	});
}

// Lucide icon geometry, inlined for the vanilla NodeView (a ProseMirror NodeView is
// imperative DOM, so the `lucide-react` components can't be used here). These are the exact
// lucide paths, so the slide bar matches the rest of the Studio — the move icons are the
// vertical twins of the filmstrip's ArrowLeftToLine/ArrowRightToLine, insert is Plus and
// delete is Trash2 (same as the filmstrip's slide controls). Keep in sync with lucide.
const LUCIDE_PATHS: Record<string, string> = {
	'arrow-up-to-line': '<path d="M5 3h14"/><path d="m18 13-6-6-6 6"/><path d="M12 7v14"/>',
	'arrow-down-to-line': '<path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/>',
	plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
	'trash-2': '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
	'chevron-right': '<path d="m9 18 6-6-6-6"/>',
	'chevron-down': '<path d="m6 9 6 6 6-6"/>',
	check: '<path d="M20 6 9 17l-5-5"/>',
	x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	'sliders-horizontal': '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
	'grid-2x2-plus': '<path d="M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3"/><path d="M16 19h6"/><path d="M19 22v-6"/>',
};
function lucideSvg(name: keyof typeof LUCIDE_PATHS): string {
	return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${LUCIDE_PATHS[name]}</svg>`;
}

// A per-slide NodeView — the slide's ONE control bar, on its top divider line, full-width and
// grouped: [collapse toggle] · [context-sensitive Format registers] · [insert · settings] · [delete].
// Controls show only when the caret is inside this slide (the cs-slide-active decoration).
// Structural ops rebuild the doc from the SAME node instances (identity preserved → emitDeck
// re-emits exact bytes) with a `slideOp` meta so the structural guard allows the count/lock change.
// Collapse is view-only (a class), never touching the source.
//
// Live instances are tracked so `formatSyncPlugin` can re-sync the Format group on every caret
// move — the applicable registers change as the caret moves between blocks WITHIN a slide, which
// no node- or outer-decoration change would otherwise signal.
const liveSlideViews = new Set<SlideView>();
function formatSyncPlugin() {
	return new Plugin({
		view() {
			return {
				update() {
					// Defense in depth: syncFormat rebuilds DOM from the pure register kernel; a throw here
					// runs inside view.updateState, so it would propagate out and ABORT the transaction's
					// emit branch — silently dropping the author's edits. Contain any per-view error so one
					// bad slide can never wedge the whole editor.
					for (const sv of liveSlideViews) {
						try {
							sv.syncFormat();
						} catch (e) {
							console.error('[compose] syncFormat', e);
						}
					}
				},
			};
		},
	});
}

class SlideView {
	dom: HTMLElement;
	contentDOM: HTMLElement;
	ctrl: HTMLElement;
	collapseBtn: HTMLButtonElement;
	private fmtGroup: HTMLElement;
	private dangerGroup: HTMLElement;
	private deleteBtn: HTMLButtonElement;
	private confirmTimer = 0;
	private locked: boolean;
	private stateful: boolean; // slide is a stateful table component (obligation-matrix / roadmap) → offer the marker picker
	private tableHosted = false; // whether this slide's Format group currently hosts the React TableControls
	constructor(
		node: PMNode,
		public view: EditorView,
		public getPos: () => number,
		decorations: readonly Decoration[] = [],
		onSettings?: (index: number) => void,
		private getHeadings?: () => SlideHeadings | undefined,
		onInsertBelow?: (index: number) => void,
		private mountTable?: (slot: HTMLElement | null, owner: SlideView, stateful: boolean) => void,
	) {
		this.locked = !!node.attrs.locked;
		this.stateful = isStatefulClass(node);
		const dom = document.createElement('section');
		dom.className = this.locked ? 'cs-slide cs-slide-locked' : 'cs-slide';
		const bar = document.createElement('div');
		bar.className = 'cs-slide-bar';
		bar.contentEditable = 'false';

		// THE LINE — the STRUCTURAL register, on EVERY slide: circular caps sitting on the hairline,
		// collapse at the left, delete at the right. Shape (circle) — not color — distinguishes this
		// structural/destructive register from the content pill below, so it reads for colorblind users.
		const line = document.createElement('div');
		line.className = 'cs-sb-line';
		line.setAttribute('role', 'group');
		line.setAttribute('aria-label', 'Slide'); // the structural register (collapse · delete) as a named set
		this.collapseBtn = this.btn('Collapse slide', 'chevron-down', () => this.toggleCollapse(), 'cs-sc-cap');
		this.dangerGroup = document.createElement('div');
		this.dangerGroup.className = 'cs-sb-danger';
		this.deleteBtn = this.btn('Delete slide', 'trash-2', () => this.askDelete(), 'cs-sc-cap cs-sc-delete');
		this.dangerGroup.append(this.deleteBtn);
		line.append(this.collapseBtn, this.dangerGroup);

		// THE PILL — the CONTENT register, shown only on the ACTIVE slide (below the line): the
		// context-sensitive Format group, a divider (grouping), then insert · settings. Rounded-rect
		// shape marks it as the content register; the active slide's pill blooms a soft accent halo.
		const pill = document.createElement('div');
		pill.className = 'cs-sb-pill';
		pill.setAttribute('role', 'toolbar');
		pill.setAttribute('aria-label', 'Slide formatting');
		this.fmtGroup = document.createElement('div');
		this.fmtGroup.className = 'cs-sb-format';
		this.fmtGroup.setAttribute('role', 'group');
		this.fmtGroup.setAttribute('aria-label', 'Formatting');
		const div = document.createElement('span');
		div.className = 'cs-sb-div';
		div.setAttribute('aria-hidden', 'true');
		const actions = document.createElement('div');
		actions.className = 'cs-sb-actions';
		// "Insert below" opens the unified add-slide gallery (SlidePicker) for this slide when
		// wired (onInsertBelow) — the #1058 "one insert door", its Blank tile a tap away — and
		// falls back to a direct blank insert if it isn't.
		actions.append(this.btn('Insert slide below', 'plus', () => { const i = this.index(); if (i < 0) return; if (onInsertBelow) onInsertBelow(i); else this.insertBelow(); }, 'cs-pill-btn'));
		// Insert a starter table into THIS slide at the caret (distinct from the add-slide `+` and the
		// in-table edit dropdown). insertStarterTable is a no-op inside an existing table / a locked slide.
		actions.append(this.btn('Insert table', 'grid-2x2-plus', () => { insertStarterTable(this.view.state, this.view.dispatch); this.view.focus(); }, 'cs-pill-btn cs-insert-table'));
		if (onSettings) actions.append(this.btn('Slide settings', 'sliders-horizontal', () => { const i = this.index(); if (i >= 0) onSettings(i); }, 'cs-pill-btn'));
		pill.append(this.fmtGroup, div, actions);

		bar.append(line, pill);
		const content = document.createElement('div');
		content.className = 'cs-slide-content';
		dom.append(bar, content);
		this.dom = dom;
		this.contentDOM = content;
		this.ctrl = bar;
		liveSlideViews.add(this);
		this.applyDecos(decorations);
	}
	private btn(label: string, icon: keyof typeof LUCIDE_PATHS, fn: () => void, cls: string): HTMLButtonElement {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = cls;
		b.title = label;
		b.setAttribute('aria-label', label);
		b.innerHTML = lucideSvg(icon);
		b.addEventListener('mousedown', (e) => e.preventDefault());
		b.addEventListener('click', (e) => {
			e.preventDefault();
			fn();
		});
		return b;
	}
	// Rebuild the Format group from the registers that APPLY to the caret's block — only when THIS
	// slide is active. Runs on every state change (formatSyncPlugin) so it tracks the caret; a
	// signature check skips the DOM churn when nothing changed.
	syncFormat() {
		const active = this.dom.classList.contains('cs-slide-active');
		// Caret inside an editable table → the Format group hosts the React TableControls island
		// (a shadcn dropdown + quick inserts), mounted by ComposeView into the slot below. A LOCKED
		// table slide is read-only (the guard eats every command), so it gets the register path, not
		// the controls (the register footgun, HARD RULE #18).
		const inTable = active && !this.locked && isInTable(this.view.state);
		// Hide the "insert table" action while the caret is in a table — there it's a no-op, and the
		// table-edit dropdown already shows a table icon (avoid the doubled glyph).
		this.dom.classList.toggle('cs-caret-in-table', inTable);
		if (!inTable) this.clearTableHost(); // leaving the table unmounts the React controls
		if (!active) {
			if (this.fmtGroup.childElementCount) {
				this.fmtGroup.replaceChildren();
				this.fmtGroup.dataset.sig = '';
			}
			return;
		}
		if (inTable) {
			if (this.fmtGroup.dataset.sig === 'tbl') return; // already hosting — leave the slot mounted
			this.fmtGroup.dataset.sig = 'tbl';
			const slot = document.createElement('span');
			slot.className = 'cs-tblc-slot';
			this.fmtGroup.replaceChildren(slot);
			this.tableHosted = true;
			this.mountTable?.(slot, this, this.stateful);
			return;
		}
		const { keys, active: activeReg } = applicableRegisters(this.view.state, this.getHeadings?.());
		const sig = `${keys.join(',')}|${activeReg ?? ''}`;
		if (this.fmtGroup.dataset.sig === sig) return;
		this.fmtGroup.dataset.sig = sig;
		this.fmtGroup.replaceChildren();
		for (const key of keys) {
			const meta = REGISTERS.find((r) => r.key === key);
			if (!meta) continue;
			const b = document.createElement('button');
			b.type = 'button';
			b.className = `cs-fmt-btn${meta.mono ? ' cs-fmt-mono' : ''}${activeReg === key ? ' cs-fmt-on' : ''}`;
			b.textContent = meta.glyph;
			b.title = `${meta.label} — apply to this block`;
			b.setAttribute('aria-label', meta.label);
			b.setAttribute('aria-pressed', activeReg === key ? 'true' : 'false');
			b.addEventListener('mousedown', (e) => e.preventDefault());
			b.addEventListener('click', (e) => {
				e.preventDefault();
				applyRegister(this.view, key, activeRegister(this.view.state));
			});
			this.fmtGroup.append(b);
		}
	}
	// Unmount the React TableControls this slide was hosting (caret left the table / slide went
	// inactive / view destroyed). Owner-keyed on the ComposeView side, so a late null from the
	// previous host can't clobber the new host.
	private clearTableHost() {
		if (!this.tableHosted) return;
		this.tableHosted = false;
		this.mountTable?.(null, this, false);
	}
	private applyDecos(decorations: readonly Decoration[]) {
		const has = (k: 'collapsed' | 'active') => decorations.some((d) => (d.spec as Record<string, boolean> | undefined)?.[k]);
		const collapsed = has('collapsed');
		this.dom.classList.toggle('cs-collapsed', collapsed);
		this.dom.classList.toggle('cs-slide-active', has('active'));
		this.collapseBtn.innerHTML = lucideSvg(collapsed ? 'chevron-right' : 'chevron-down');
		this.collapseBtn.setAttribute('aria-label', collapsed ? 'Expand slide' : 'Collapse slide');
		this.collapseBtn.title = collapsed ? 'Expand slide' : 'Collapse slide';
		// Expose the disclosure state programmatically, not just via the flipped label/glyph (trio a11y).
		this.collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
		if (!this.dom.classList.contains('cs-slide-active')) this.resetDelete();
		this.syncFormat();
	}
	private slides(): PMNode[] {
		const arr: PMNode[] = [];
		this.view.state.doc.forEach((n) => {
			arr.push(n);
		});
		return arr;
	}
	private index(): number {
		const pos = this.getPos();
		const doc = this.view.state.doc;
		let off = 0;
		for (let k = 0; k < doc.childCount; k++) {
			if (off === pos) return k;
			off += doc.child(k).nodeSize;
		}
		return -1;
	}
	private commit(nodes: PMNode[]) {
		const { state } = this.view;
		// Preserve the caret's slide across the full-doc rebuild. The delete cap now acts on NON-active
		// slides too, so deleting a slide OTHER than the caret's must not fling the caret to doc start
		// (a full replaceWith collapses the mapped selection). We reuse the SAME node instances, so the
		// caret's slide keeps its identity unless it's the one removed — re-anchor to it at the same
		// in-slide offset. (Trio red-team: non-active delete displaced the caret.)
		const { $from } = state.selection;
		const caretSlide = $from.depth >= 1 ? $from.node(1) : null;
		const offsetInSlide = caretSlide ? $from.pos - $from.before(1) : 0;
		const tr = state.tr.replaceWith(0, state.doc.content.size, nodes).setMeta('slideOp', true);
		if (caretSlide) {
			let start = -1;
			tr.doc.forEach((n, off) => {
				if (start < 0 && n === caretSlide) start = off;
			});
			if (start >= 0) {
				const target = Math.min(start + offsetInSlide, start + caretSlide.nodeSize - 1);
				tr.setSelection(TextSelection.near(tr.doc.resolve(target)));
			}
		}
		this.view.dispatch(tr);
		this.view.focus();
	}
	private insertBelow() {
		const i = this.index();
		if (i < 0) return;
		const nodes = this.slides();
		const blank = deckSchema.nodes.slide.create({ directives: ['<!-- _class: content -->'], raw: '', locked: false }, deckSchema.nodes.paragraph.create());
		nodes.splice(i + 1, 0, blank);
		this.commit(nodes);
	}
	// Two-step delete: the button asks in place (like the app's other delete actions), auto-cancels.
	// Works on a LOCKED slide too — removing a whole slide is a structural `slideOp` (waved through
	// by the structural guard), not a content round-trip, so it's safe even for a slide Compose can't
	// otherwise edit. (Guarding it here would leave a dead trash button and drop a capability the
	// pre-divider bar had.)
	private askDelete() {
		this.dangerGroup.classList.add('cs-confirming');
		this.dangerGroup.replaceChildren();
		const ask = document.createElement('span');
		ask.className = 'cs-sc-ask';
		ask.textContent = 'Delete?';
		this.dangerGroup.append(ask, this.btn('Confirm delete slide', 'check', () => this.remove(), 'cs-sc-cap cs-sc-confirm'), this.btn('Keep slide', 'x', () => this.resetDelete(), 'cs-sc-cap'));
		clearTimeout(this.confirmTimer);
		this.confirmTimer = window.setTimeout(() => this.resetDelete(), 4000);
	}
	private resetDelete() {
		clearTimeout(this.confirmTimer);
		this.dangerGroup.classList.remove('cs-confirming');
		if (this.dangerGroup.firstElementChild !== this.deleteBtn) this.dangerGroup.replaceChildren(this.deleteBtn);
	}
	private remove() {
		this.resetDelete();
		const nodes = this.slides();
		if (nodes.length <= 1) return; // a deck always keeps at least one slide
		const i = this.index();
		if (i < 0) return;
		nodes.splice(i, 1);
		this.commit(nodes);
	}
	private toggleCollapse() {
		const pos = this.getPos();
		this.view.dispatch(this.view.state.tr.setMeta(collapseKey, { pos }));
		this.view.focus();
	}
	update(node: PMNode, decorations: readonly Decoration[]) {
		if (node.type.name !== 'slide') return false;
		this.locked = !!node.attrs.locked;
		this.stateful = isStatefulClass(node);
		this.dom.classList.toggle('cs-slide-locked', this.locked);
		this.applyDecos(decorations);
		return true;
	}
	ignoreMutation(m: MutationRecord | { target: Node }) {
		return this.ctrl.contains(m.target as Node);
	}
	stopEvent(e: Event) {
		return this.ctrl.contains(e.target as Node);
	}
	destroy() {
		clearTimeout(this.confirmTimer);
		this.clearTableHost();
		liveSlideViews.delete(this);
	}
}

function buildPlugins() {
	return [
		structuralGuard(),
		collapsePlugin(),
		activeSlidePlugin(),
		stateMarkerPlugin(),
		formatSyncPlugin(),
		history(),
		keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
		// Table cell navigation FIRST — Tab hops cells and appends a row off the end
		// (tabToNextCellOrAddRow), Shift-Tab hops back. Both return false outside a table, so Tab
		// falls through to list-item sink/lift. Enter is a no-op inside a table: a GFM cell is
		// single-line, and the default splitBlock would fracture the cell (cells are `inline*`
		// textblocks) — corrupting the grid.
		keymap({ Tab: tabToNextCellOrAddRow, 'Shift-Tab': goToNextCell(-1), Enter: (state) => isInTable(state) }),
		keymap({
			Enter: splitListItem(deckSchema.nodes.list_item),
			Tab: sinkListItem(deckSchema.nodes.list_item),
			'Shift-Tab': liftListItem(deckSchema.nodes.list_item),
		}),
		// prosemirror-tables' editing plugin — cell selection, structural integrity, the
		// commands the toolbar drives. No columnResizing (GFM has no column widths).
		tableEditing(),
		keymap({ 'Mod-b': toggleMark(deckSchema.marks.strong), 'Mod-i': toggleMark(deckSchema.marks.em) }),
		keymap(baseKeymap),
		inputRules({
			rules: [
				wrappingInputRule(/^\s*([-*])\s$/, deckSchema.nodes.bullet_list),
				wrappingInputRule(/^(\d+)\.\s$/, deckSchema.nodes.ordered_list, (m) => ({ order: +m[1] }), (m, node) => node.childCount + (node.attrs.order as number) === +m[1]),
				wrappingInputRule(/^\s*>\s$/, deckSchema.nodes.blockquote),
				textblockTypeInputRule(/^(#{1,6})\s$/, deckSchema.nodes.heading, (m) => ({ level: m[1].length })),
			],
		}),
	];
}

// `visible` = whether the Compose surface is the active/visible pane. On mobile the editor and
// preview panes both stay mounted (the inactive one `inert`+hidden), and the grammar rail is
// portaled to <body> so it ESCAPES that hidden subtree — so it must render only for the active
// pane, else it would paint over the live preview (the body-portal render-gate).
export function ComposeView({ source, onChange, resetKey = '', className, visible = true, onTypingCollapse, onOpenSlideSettings, slideHeadings, onInsertBelow }: { source: string; onChange: (next: string) => void; resetKey?: string; className?: string; visible?: boolean; onTypingCollapse?: (collapsed: boolean) => void; onOpenSlideSettings?: (index: number) => void; slideHeadings?: SlideHeadings; onInsertBelow?: (index: number) => void }) {
	const hostRef = React.useRef<HTMLDivElement>(null);
	const viewRef = React.useRef<EditorView | null>(null);
	const onChangeRef = React.useRef(onChange);
	onChangeRef.current = onChange;
	const lastEmittedRef = React.useRef(source);
	const baselineRef = React.useRef<EmitBaseline | null>(null);
	// An external source change that arrived while the editor held focus — parked here
	// and flushed on blur so it is never silently lost (D2). null = nothing pending.
	const pendingResyncRef = React.useRef<string | null>(null);
	const [failed, setFailed] = React.useState(false);
	// The floating selection bar (inline marks over a text selection) on DESKTOP, or null when there
	// is no non-empty selection — Bold / Italic / Code on the selected run. The block registers now
	// live on the slide's divider bar (context-sensitive), not a persistent gutter/rail.
	const [selBar, setSelBar] = React.useState<SelBar | null>(null);
	// The pill slot (a DOM node owned by the ACTIVE table slide's divider bar) into which the React
	// `TableControls` island is portaled. null = the caret isn't in an editable table. The mount is
	// owner-keyed (tableHostRef) so a late unmount from the previous host can't clobber the new one.
	const [tableMount, setTableMount] = React.useState<{ slot: HTMLElement; stateful: boolean } | null>(null);
	const tableHostRef = React.useRef<object | null>(null);
	const mountTable = React.useCallback((slot: HTMLElement | null, owner: object, stateful: boolean) => {
		if (slot) {
			tableHostRef.current = owner;
			setTableMount({ slot, stateful });
		} else if (tableHostRef.current === owner) {
			tableHostRef.current = null;
			setTableMount(null);
		}
	}, []);

	// The mobile shell (coarse pointer / ≤699px) drives the TYPING-MODE chrome collapse: when the
	// software keyboard is up, the shell's top bands collapse for a full writing surface.
	// `useVisualViewport` publishes the keyboard geometry only here, so desktop pays nothing.
	const railLayout = useRailLayout();
	const mobileShell = visible && railLayout && !failed;
	const { inset } = useVisualViewport(mobileShell);
	const keyboardUp = inset > 0;

	// TYPING MODE — when the software keyboard is up, the shell's top chrome collapses so the
	// writing surface gets the screen (the "so many toolbars while typing" fix). SCROLL is the
	// reveal driver: opening the keyboard collapses the chrome; scrolling UP on the writing
	// surface brings it back, scrolling down re-hides it — so every control stays reachable while
	// typing (a scroll-up away), which answers the inversion's keyboard-only-reachability objection.
	const onTypingRef = React.useRef(onTypingCollapse);
	onTypingRef.current = onTypingCollapse;
	// Ref-backed so the construct-once NodeView factory always calls the CURRENT handler.
	const onOpenSlideSettingsRef = React.useRef(onOpenSlideSettings);
	onOpenSlideSettingsRef.current = onOpenSlideSettings;
	// The per-class grammar heading map (build-static), read live by each SlideView's syncFormat so
	// the Format group offers the grammar-correct heading register per the caret slide's `_class`.
	const slideHeadingsRef = React.useRef(slideHeadings);
	slideHeadingsRef.current = slideHeadings;
	const onInsertBelowRef = React.useRef(onInsertBelow);
	onInsertBelowRef.current = onInsertBelow;
	const [chromeRevealed, setChromeRevealed] = React.useState(true);
	// Opening the keyboard collapses; closing it always restores the chrome.
	React.useEffect(() => {
		setChromeRevealed(!keyboardUp);
	}, [keyboardUp]);
	React.useEffect(() => {
		if (!mobileShell) return;
		const host = hostRef.current;
		if (!host) return;
		let last = host.scrollTop;
		const onScroll = () => {
			const y = host.scrollTop;
			const dy = y - last;
			if (Math.abs(dy) < 8) return; // ignore sub-threshold jitter
			if (dy < 0) setChromeRevealed(true); // scroll UP → reveal
			else if (y > 40) setChromeRevealed(false); // scroll DOWN (past the top) → hide
			last = y;
		};
		host.addEventListener('scroll', onScroll, { passive: true });
		return () => host.removeEventListener('scroll', onScroll);
	}, [mobileShell]);
	const chromeCollapsed = mobileShell && keyboardUp && !chromeRevealed;
	React.useEffect(() => {
		onTypingRef.current?.(chromeCollapsed);
	}, [chromeCollapsed]);

	// Re-import `src` into the editor, rebuilding the emit baseline. Shared by the
	// external-source effect and the on-blur flush.
	const resyncFrom = React.useCallback((view: EditorView, src: string) => {
		const doc = deckToDoc(src);
		view.updateState(EditorState.create({ doc, plugins: view.state.plugins }));
		baselineRef.current = initBaseline(doc);
		lastEmittedRef.current = src;
		pendingResyncRef.current = null;
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: construct-once per deck; `source` seeds the doc and syncs separately.
	React.useEffect(() => {
		if (!hostRef.current) return;
		setFailed(false); // D3: a prior deck's parse failure must not stick to this one.
		let view: EditorView;
		try {
			const doc = deckToDoc(source);
			baselineRef.current = initBaseline(doc);
			view = new EditorView(hostRef.current, {
				state: EditorState.create({ doc, plugins: buildPlugins() }),
				nodeViews: {
					slide: (node, nodeView, getPos, decorations) =>
						new SlideView(node, nodeView, getPos as () => number, decorations, (i) => onOpenSlideSettingsRef.current?.(i), () => slideHeadingsRef.current, onInsertBelowRef.current ? (i) => onInsertBelowRef.current?.(i) : undefined, mountTable),
				},
				// Strip merged-cell spans on paste so the no-merge invariant holds on the DOCUMENT,
				// not just the toolbar — a pasted colspan/rowspan can't corrupt the serialized grid.
				transformPasted: (slice) => new Slice(stripCellSpans(slice.content), slice.openStart, slice.openEnd),
				dispatchTransaction(tr) {
					const prevDoc = view.state.doc;
					const next = view.state.apply(tr);
					view.updateState(next);
					// Guard on the APPLIED doc, NOT `tr.docChanged`: a transaction the structural
					// guard REJECTS (a keystroke inside a locked slide, or a delete spanning a slide
					// boundary) still reports `tr.docChanged === true` — but `state.apply` returns the
					// unchanged state, so `next.doc === prevDoc`. Running the emit branch on that
					// no-op would null a PARKED external resync (`pendingResyncRef`), silently dropping
					// an external `_class`/AI/undo change on the next blur — for a keystroke that did
					// nothing. Only a real doc change supersedes the parked author.
					if (next.doc !== prevDoc) {
						// A fresh local edit supersedes any parked external change — otherwise the
						// blur flush would replay a now-stale snapshot over the user's typing (the
						// trio's resync race). Favor the actively-typing author.
						pendingResyncRef.current = null;
						// Edit-local emit: only the slide the caret changed is re-serialized;
						// every untouched slide re-emits its cached bytes (baselineRef).
						const base = baselineRef.current ?? initBaseline(next.doc);
						const src = emitDeck(next.doc, base);
						baselineRef.current = base;
						lastEmittedRef.current = src;
						onChangeRef.current(src);
					}
					// Selection-bar geometry LAST and guarded — a throw in coordsAtPos must never
					// abort the transaction and swallow the emit above.
					try {
						setSelBar(computeSelBar(view));
					} catch {
						setSelBar(null);
					}
				},
				handleDOMEvents: {
					// D2: on blur, apply any external source that arrived while focused.
					blur() {
						setSelBar(null); // the selection bar never outlives focus
						const pending = pendingResyncRef.current;
						if (pending != null && viewRef.current) {
							try {
								resyncFrom(viewRef.current, pending);
							} catch (e) {
								console.error('[compose] blur resync', e);
							}
						}
						return false;
					},
				},
			});
		} catch (e) {
			console.error('[compose] prosemirror', e);
			setFailed(true);
			return;
		}
		viewRef.current = view;
		// The floating bar is positioned in viewport coords; a scroll of the writing surface
		// would strand it, so hide it on scroll (it returns on the next selection change).
		const host = hostRef.current;
		// A scroll of the writing surface would strand the viewport-positioned selection bar; hide it
		// (it returns on the next selection). The table controls live in the bar, so they scroll with it.
		const onScroll = () => {
			setSelBar(null);
		};
		host?.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			host?.removeEventListener('scroll', onScroll);
			view.destroy();
			viewRef.current = null;
			baselineRef.current = null;
			pendingResyncRef.current = null;
		};
	}, [resetKey, resyncFrom]);

	// External source change → re-import, unless it's our own edit. While the editor is
	// focused we never clobber the caret mid-type: the change is PARKED and flushed on
	// blur (D2), so a concurrent actor (Inspector stamping `_class`, an AI apply, undo)
	// can't be silently lost. One document → one clean re-baseline.
	React.useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		// `lastEmittedRef` is the exact string this editor last emitted, so this skips our
		// OWN echo without the old `docToDeck(doc) === source` guard — which compared through
		// the LOSSY serializer and so never matched a rich deck (dead code, per the trio).
		if (source === lastEmittedRef.current) return;
		if (view.hasFocus()) {
			pendingResyncRef.current = source;
			return;
		}
		try {
			resyncFrom(view, source);
		} catch (e) {
			console.error('[compose] resync', e);
		}
	}, [source, resyncFrom]);

	// Toggle an inline mark from the floating bar, keeping the selection (the buttons
	// preventDefault on mousedown so focus never leaves the editor).
	const onMark = React.useCallback((mark: 'strong' | 'em' | 'code') => {
		const view = viewRef.current;
		if (!view) return;
		toggleMark(deckSchema.marks[mark])(view.state, view.dispatch);
		view.focus();
		setSelBar(computeSelBar(view));
	}, []);

	if (failed) {
		return (
			<textarea
				className={cn('h-full w-full resize-none border-none bg-[var(--bg)] p-4 font-mono text-[13px] text-[var(--text-body)] outline-none', className)}
				value={source}
				onChange={(e) => onChange(e.target.value)}
				spellCheck={false}
				aria-label="Deck source"
			/>
		);
	}
	return (
		<div className={cn('cs-surface', className)} style={{ '--cs-trim': trimGradient(source) } as React.CSSProperties}>
			<ComposeStyles />
			{/* No persistent formatting gutter/rail — the registers live on each slide's divider bar
			    (context-sensitive). Just the writing surface. */}
			<div className="cs-frame">
				<div ref={hostRef} className="cs-host" />
			</div>
			{selBar &&
				createPortal(
					<div
						className="cs-selbar"
						role="toolbar"
						aria-label="Text formatting"
						style={{ left: `${selBar.left}px`, top: `${selBar.top}px`, transform: selBar.below ? 'translate(-50%, 8px)' : 'translate(-50%, calc(-100% - 8px))' }}
						onMouseDown={(e) => e.preventDefault()}
					>
						<button type="button" aria-label="Bold" aria-pressed={selBar.strong} className={cn('cs-sb-btn', selBar.strong && 'cs-sb-on')} onClick={() => onMark('strong')} style={{ fontWeight: 700 }}>
							B
						</button>
						<button type="button" aria-label="Italic" aria-pressed={selBar.em} className={cn('cs-sb-btn', selBar.em && 'cs-sb-on')} onClick={() => onMark('em')} style={{ fontStyle: 'italic' }}>
							I
						</button>
						<button type="button" aria-label="Code" aria-pressed={selBar.code} className={cn('cs-sb-btn cs-sb-mono', selBar.code && 'cs-sb-on')} onClick={() => onMark('code')}>
							{'</>'}
						</button>
					</div>,
					document.body,
				)}
			{tableMount && createPortal(<TableControls view={viewRef.current as EditorView} stateful={tableMount.stateful} />, tableMount.slot)}
		</div>
	);
}

// The Quiet Page — serif writing surface + the quiet grammar gutter, on the studio
// tokens so it themes light + dark with the shell.
function ComposeStyles() {
	return (
		<style>{`
			.cs-surface{height:100%;overflow:hidden;background:var(--bg,#fff)}
			.cs-frame{display:flex;height:100%}
			/* the serif page — no persistent gutter; formatting lives on each slide's divider bar. */
			.cs-host{flex:1;min-width:0;overflow-y:auto;container-type:inline-size}
			.cs-host .ProseMirror{outline:none;min-height:100%;padding:6px 0 calc(72px + var(--cs-kb-inset,0px));font-family:var(--font-serif,Georgia,"Times New Roman",serif);font-size:16.5px;line-height:1.62;color:var(--text-body,#2b3a4f)}
			.cs-host .cs-slide{padding:0 clamp(24px,6cqw,64px) 22px;position:relative}
			/* THE DIVIDER = the slide's control bar, as a COLUMN: a full-width hairline carrying circular
			   STRUCTURAL caps (collapse left, delete right) on EVERY slide, and — only on the ACTIVE slide —
			   a centered CONTENT pill (context Format · insert · settings) below it. SHAPE (circle vs rounded
			   pill), not color, marks the two registers apart, so the split reads for colorblind users. The
			   line previews the deck's spectrum-trim. */
			.cs-slide-bar{position:relative;display:grid;align-items:center;justify-items:center;margin:12px calc(-1 * clamp(24px,6cqw,64px));padding:0 clamp(16px,4cqw,44px);user-select:none}
			/* the line + caps — structural register, on every slide */
			.cs-sb-line{grid-area:1/1;justify-self:stretch;position:relative;display:flex;align-items:center;justify-content:space-between;height:22px}
			.cs-sb-line::before{content:"";position:absolute;left:0;right:0;top:50%;height:2px;transform:translateY(-50%);border-radius:2px;background:var(--cs-trim,var(--border,#e4eaf2))}
			.cs-sc-cap{position:relative;z-index:1;flex:none;width:22px;height:22px;padding:0;border:1px solid var(--border,#e4eaf2);border-radius:999px;background:var(--bg,#fff);color:var(--text-muted,#6b7f9a);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .12s,border-color .12s,background .12s}
			.cs-sc-cap svg{display:block;width:13px;height:13px}
			.cs-sc-cap:hover{color:var(--text-heading,#0a1628);border-color:var(--accent,#006fa8);background:var(--accent-soft,#eff6fc)}
			.cs-sc-delete:hover{color:var(--fail,#b3261e);border-color:var(--fail,#b3261e);background:color-mix(in oklab,var(--fail,#b3261e),transparent 90%)}
			.cs-sc-confirm{color:var(--fail,#b3261e);border-color:color-mix(in oklab,var(--fail,#b3261e),transparent 55%)}
			.cs-sc-confirm:hover{color:var(--fail,#b3261e);border-color:var(--fail,#b3261e);background:color-mix(in oklab,var(--fail,#b3261e),transparent 88%)}
			/* delete → in-place confirm: "Delete?" + check/x, on a bg chip masking the line behind it */
			.cs-sb-danger{position:relative;z-index:1;display:flex;align-items:center;gap:4px}
			.cs-sb-danger.cs-confirming{background:var(--bg,#fff);border-radius:999px;padding-left:9px}
			.cs-sc-ask{font-family:var(--font-mono,ui-monospace,monospace);font-size:9.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--fail,#b3261e);align-self:center}
			/* content pill — content register, ONLY on the active slide; a soft accent bloom (only the active
			   slide's pill is ever shown, so it never becomes a column of glows) */
			/* The pill RESERVES its space on every slide (visibility, not display) so focusing a slide
				   never reflows content down — it fades in place. Hidden = non-interactive + out of tab order. */
			.cs-sb-pill{grid-area:1/1;justify-self:center;z-index:1;display:inline-flex;visibility:hidden;opacity:0;align-items:center;gap:3px;padding:3px 5px;background:var(--bg-alt,#f2f5fa);border:1px solid var(--border,#e4eaf2);border-radius:12px;box-shadow:0 5px 15px -8px color-mix(in oklab,var(--accent,#006fa8),transparent 66%),0 1px 3px -1px color-mix(in oklab,var(--text-heading,#0a1628),transparent 84%);transition:opacity .12s ease}
			.cs-slide-active > .cs-slide-bar > .cs-sb-pill{visibility:visible;opacity:1}
			.cs-sb-format{display:inline-flex;align-items:center;gap:2px}
			.cs-sb-actions{display:inline-flex;align-items:center;gap:2px}
			.cs-sb-div{flex:none;width:1px;height:14px;border-radius:1px;background:var(--border,#e4eaf2)}
			.cs-sb-format:empty,.cs-sb-format:empty + .cs-sb-div{display:none}
			/* content-register buttons — ghost glyph; the ACTIVE one is a SOLID accent chip (in-effect highlight) */
			.cs-fmt-btn{min-width:22px;height:22px;padding:0 7px;border:none;border-radius:7px;background:transparent;font-family:var(--font-mono,ui-monospace,monospace);font-size:10.5px;font-weight:600;letter-spacing:.02em;line-height:1;color:var(--text-muted,#6b7f9a);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .12s,background .12s,box-shadow .12s}
			.cs-fmt-btn:not(.cs-fmt-mono){font-family:var(--font-serif,Georgia,serif);font-size:13px;font-weight:500;letter-spacing:0}
			.cs-fmt-btn:hover{color:var(--accent,#006fa8);background:var(--accent-soft,#eff6fc)}
			.cs-fmt-on,.cs-fmt-on:hover{color:var(--on-accent,#fff);background:var(--accent,#006fa8);font-weight:700;box-shadow:0 1px 3px -1px color-mix(in oklab,var(--accent,#006fa8),transparent 45%)}
			.cs-pill-btn{flex:none;width:22px;height:22px;padding:0;border:none;border-radius:7px;background:transparent;color:var(--text-muted,#6b7f9a);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .12s,background .12s}
			.cs-pill-btn svg{display:block;width:13px;height:13px}
			.cs-pill-btn:hover{color:var(--accent,#006fa8);background:var(--accent-soft,#eff6fc)}
			/* collapsed: keep the first block, hide the rest behind an ellipsis */
			.cs-slide.cs-collapsed .cs-slide-content > *:not(:first-child){display:none}
			.cs-slide.cs-collapsed .cs-slide-content::after{content:"⋯";display:block;color:var(--text-muted,#6b7f9a);font-size:17px;line-height:1;padding:2px 0 2px}
			/* a locked slide carries a construct Compose can't round-trip (table, block HTML,
			   strikethrough…) — read-only here, edited in Markdown mode. Dim it and badge it. */
			.cs-host .cs-slide-locked{position:relative;opacity:.72}
			.cs-host .cs-slide-locked::after{content:"◔ edit in Markdown";position:absolute;top:8px;right:clamp(12px,4cqw,40px);font-family:var(--font-mono,ui-monospace,monospace);font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted,#6b7f9a);background:var(--bg-alt,#f2f5fa);border:1px solid var(--border,#e4eaf2);padding:2px 7px;border-radius:4px;pointer-events:none}
			.cs-host h1{font-family:inherit;font-size:1.95rem;font-weight:700;line-height:1.12;margin:.1em 0 .35em;color:var(--text-heading,#14243a);letter-spacing:-.01em}
			.cs-host h2{font-family:inherit;font-size:1.45rem;font-weight:700;line-height:1.18;margin:.5em 0 .32em;color:var(--text-heading,#14243a);letter-spacing:-.005em}
			.cs-host h3{font-family:inherit;font-size:1.15rem;font-weight:600;margin:.5em 0 .25em;color:var(--text-heading,#14243a)}
			.cs-host p{margin:0 0 .6em}
			/* eyebrow / subtitle: an inline-code-only paragraph reads as a mono label */
			.cs-host p > code:only-child{font-family:var(--font-mono,ui-monospace,monospace);font-size:.72em;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in oklab,var(--text-muted,#6b7f9a),var(--text-heading) 35%);background:var(--bg-alt,#f2f5fa);border:1px solid var(--border,#e4eaf2);padding:2px 7px;border-radius:4px}
			/* key-insight panel: a blockquote */
			.cs-host blockquote{border-left:2.5px solid var(--accent,#1e5f96);background:var(--accent-soft,rgba(30,95,150,.08));padding:11px 17px;border-radius:0 8px 8px 0;margin:.6em 0;color:var(--text-heading,#14243a)}
			.cs-host blockquote > *:last-child{margin-bottom:0}
			/* hung bullets + numbers, marker in the margin, text flows normally */
			.cs-host ul,.cs-host ol{list-style:none;padding-left:1.5em;margin:0 0 .6em}
			.cs-host li{position:relative;margin:.18em 0}
			.cs-host li > p{margin:0}
			.cs-host ul > li::before{content:"—";position:absolute;left:-1.4em;color:var(--accent,#1e5f96)}
			.cs-host ol{counter-reset:cs-ol}
			.cs-host ol > li{counter-increment:cs-ol}
			.cs-host ol > li::before{content:counter(cs-ol) ".";position:absolute;left:-1.6em;color:var(--text-muted,#6b7280);font-variant-numeric:tabular-nums}
			.cs-host li ul,.cs-host li ol{margin:.15em 0 .1em}
			.cs-host code{font-family:var(--font-mono,ui-monospace,monospace);background:var(--bg-alt,#f2f5fa);border:1px solid var(--border,#e4eaf2);padding:.03em .32em;border-radius:4px;font-size:.85em}
			.cs-host strong{font-weight:700;color:var(--text-heading,#14243a)}
			.cs-host em{font-style:italic}
			.cs-host a{color:var(--accent,#1e5f96);text-decoration:underline}
			.cs-host .ProseMirror-selectednode{outline:2px solid var(--accent,#006fa8)}
				/* GFM TABLES — the editable grid, previewing the rendered compare-table: a label-voice header on an accent rail, hairline body rows, emphasized first column. Column alignment comes from each cell's inline text-align (the align attr). */
				.cs-host table{border-collapse:collapse;width:100%;table-layout:auto;margin:.5em 0;font-size:.92em}
				.cs-host th,.cs-host td{position:relative;border:1px solid var(--border,#e4eaf2);padding:6px 10px;vertical-align:top;text-align:left}
				.cs-host tr:first-child th,.cs-host thead th{font-family:var(--font-mono,ui-monospace,monospace);font-size:.72em;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:var(--text-heading,#0a1628);background:var(--bg-alt,#f2f5fa);border-bottom:2px solid var(--accent,#006fa8)}
				.cs-host td:first-child{font-weight:600;color:var(--text-heading,#0a1628)}
				.cs-host table p{margin:0}
				.cs-host .selectedCell{background:color-mix(in oklab,var(--accent,#006fa8),transparent 86%)}
				/* view-only badge chips for the four LFM state markers in a cell — literal text, just tinted */
				.cs-host .cs-cellmark{font-family:var(--font-mono,ui-monospace,monospace);font-size:.82em;font-weight:700;padding:.04em .34em;border-radius:5px;letter-spacing:-.02em}
				.cs-host .cs-cellmark-pass{color:var(--ok,#1a7f5a);background:color-mix(in oklab,var(--ok,#1a7f5a),transparent 88%)}
				.cs-host .cs-cellmark-warn{color:var(--warn,#b7791f);background:color-mix(in oklab,var(--warn,#b7791f),transparent 86%)}
				.cs-host .cs-cellmark-skip{color:var(--text-muted,#6b7f9a);background:color-mix(in oklab,var(--text-muted,#6b7f9a),transparent 88%);text-decoration:line-through}
				.cs-host .cs-cellmark-todo{color:var(--text-muted,#6b7f9a);background:color-mix(in oklab,var(--border,#e4eaf2),transparent 40%)}
				/* the React TableControls island, mounted into the divider bar's Format-group slot: quick
				   insert-row/column buttons + a table-icon trigger for the shadcn dropdown (menu itself is
				   styled by shadcn/Tailwind, portaled by Radix). Buttons match the pill's icon buttons. */
				.cs-tblc-slot{display:inline-flex}
				.cs-tblc{display:inline-flex;align-items:center;gap:2px}
				.cs-tblc-quick,.cs-tblc-more{flex:none;width:22px;height:22px;padding:0;border:none;border-radius:7px;background:transparent;color:var(--text-muted,#6b7f9a);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .12s,background .12s}
				.cs-tblc-quick svg,.cs-tblc-more svg{width:14px;height:14px}
				.cs-tblc-quick:hover,.cs-tblc-more:hover,.cs-tblc-more[data-state=open]{color:var(--accent,#006fa8);background:var(--accent-soft,#eff6fc)}
				/* state-marker picker (obligation-matrix / roadmap): click to set the caret cell's marker;
				   each chip carries the engine's stoplight color, matching the rendered cell chip. */
				.cs-tblc-marks{display:inline-flex;align-items:center;gap:1px}
				.cs-tblc-mark{flex:none;width:22px;height:22px;padding:0;border:none;border-radius:7px;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s}
				.cs-tblc-mark svg{width:13px;height:13px}
				.cs-tblc-mark:hover{background:color-mix(in oklab,currentColor,transparent 86%)}
				.cs-mk-pass{color:var(--ok,#1a7f5a)}
				.cs-mk-warn{color:var(--warn,#b7791f)}
				.cs-mk-todo,.cs-mk-skip{color:var(--text-muted,#6b7f9a)}
				.cs-tblc-div{flex:none;width:1px;height:14px;background:var(--border,#e4eaf2);margin:0 3px}
				.cs-caret-in-table .cs-insert-table{display:none}
			/* MOBILE — bigger touch targets; caps on every line, content pill on the active slide. */
			@media (max-width:640px){
				.cs-slide-bar{margin-left:0;margin-right:0;padding:0 4px}
				.cs-sb-line{height:28px}
				.cs-sc-cap{width:28px;height:28px}
				.cs-sc-cap svg{width:15px;height:15px}
				.cs-sb-pill{gap:4px;padding:4px 6px;border-radius:14px}
				.cs-sb-div{height:16px}
				.cs-fmt-btn{min-width:28px;height:28px;padding:0 9px;font-size:12px}
				.cs-fmt-btn:not(.cs-fmt-mono){font-size:15px}
				.cs-pill-btn{width:28px;height:28px}
				.cs-pill-btn svg{width:15px;height:15px}
				/* space is tight — collapse the quick insert-row/column buttons into the table menu
				   (which holds all inserts), leaving just the table-icon dropdown. Desktop keeps them. */
				.cs-tblc-quick{display:none}
				.cs-tblc-more{width:28px;height:28px}
				.cs-tblc-more svg{width:16px;height:16px}
				/* keep the state-marker picker — it's the point of obligation-matrix / roadmap — just bigger */
				.cs-tblc-mark{width:28px;height:28px}
				.cs-tblc-mark svg{width:15px;height:15px}
			}
			/* floating selection bar — inline marks over a text selection (portaled to body).
			   DESKTOP ONLY: on touch the OS selection menu owns formatting (see canFloatBar). */
			.cs-selbar{position:fixed;z-index:60;display:flex;gap:2px;padding:3px;border-radius:9px;background:var(--bg-alt,#fff);border:1px solid var(--border,rgba(0,0,0,.1));box-shadow:0 6px 20px -6px rgba(0,0,0,.28),0 1px 2px rgba(0,0,0,.14);animation:cs-sb-in .1s ease-out}
			@keyframes cs-sb-in{from{opacity:0;scale:.94}to{opacity:1;scale:1}}
			.cs-sb-btn{min-width:28px;height:26px;padding:0 6px;border:none;border-radius:6px;background:transparent;color:var(--text-body,#1e3a5f);font-family:var(--font-serif,Georgia,serif);font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .1s,background .1s}
			.cs-sb-mono{font-family:var(--font-mono,ui-monospace,monospace);font-size:11px}
			.cs-sb-btn:hover{background:color-mix(in oklab,var(--bg-alt,#eee),var(--text-muted) 16%);color:var(--text-heading,#0a1628)}
			.cs-sb-on{color:var(--accent,#006fa8);background:var(--accent-soft,#eff6fc)}
		`}</style>
	);
}

export default ComposeView;
