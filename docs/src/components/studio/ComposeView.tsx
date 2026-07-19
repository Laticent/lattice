import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { Fragment, type MarkType, type Node as PMNode, Slice } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { type Command, EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import {
	addColumnAfter,
	addColumnBefore,
	addRowAfter,
	addRowBefore,
	deleteColumn,
	deleteRow,
	deleteTable,
	goToNextCell,
	isInTable,
	selectedRect,
	tableEditing,
} from 'prosemirror-tables';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { deckSchema, deckToDoc, type EmitBaseline, emitDeck, initBaseline } from '@/lib/compose/deck-doc';
import { activeRegister, applicableRegisters, applyRegister, type Reg, type SlideHeadings } from '@/lib/compose/registers';
import { cn } from '@/lib/utils';
import { getFrontMatter } from './front-matter';
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
// GFM tables are real, editable nodes (deck-markdown). The structural ops come from
// prosemirror-tables (add/delete row+column, delete table); alignment is Lattice's own
// column command because GFM alignment is per-COLUMN, and it's read from the header row on
// serialize. We deliberately expose NO merge/split and NO column-resize — neither survives
// the GFM round-trip (2026-07-19-compose-table-editing.md, Axis B).

/** Set GFM column alignment on every cell of the caret's column (so it renders consistently
 *  and the header cell — which the serializer reads — carries it). `null` clears it. */
export function setColumnAlign(align: 'left' | 'center' | 'right' | null): Command {
	return (state, dispatch) => {
		if (!isInTable(state)) return false;
		if (dispatch) {
			const rect = selectedRect(state);
			const tr = state.tr;
			const seen = new Set<number>();
			for (let col = rect.left; col < rect.right; col++) {
				for (let row = 0; row < rect.map.height; row++) {
					const rel = rect.map.map[row * rect.map.width + col];
					if (seen.has(rel)) continue; // a merged cell appears once per span; forbidden here, deduped anyway
					seen.add(rel);
					const pos = rect.tableStart + rel;
					const cell = tr.doc.nodeAt(pos);
					if (cell) tr.setNodeMarkup(pos, undefined, { ...cell.attrs, align });
				}
			}
			dispatch(tr);
		}
		return true;
	};
}

type ColAlign = 'left' | 'center' | 'right' | null;

/** The caret column's GFM alignment, read from its top cell — drives the align pressed-state. */
export function currentColumnAlign(state: EditorState): ColAlign {
	if (!isInTable(state)) return null;
	try {
		const rect = selectedRect(state);
		const rel = rect.map.map[rect.top * rect.map.width + rect.left];
		return (state.doc.nodeAt(rect.tableStart + rel)?.attrs.align as ColAlign) ?? null;
	} catch {
		return null;
	}
}

// Clamp a pasted slice to the GFM-expressible table shape: strip cell spans (colspan/rowspan/
// colwidth) so a MERGED cell pasted from Excel / a web page / Google Sheets can't enter the doc
// and later serialize to a corrupted, ragged grid. The design's no-merge rule (Axis B) is enforced
// on the toolbar; this closes the paste path the toolbar can't see (adversarial-trio gap). The
// span is dropped to 1×1 — content is preserved in one cell; `fixTables` fills any resulting hole
// with empty cells, so the grid stays rectangular and round-trips.
export function stripCellSpans(fragment: Fragment): Fragment {
	const out: PMNode[] = [];
	fragment.forEach((node) => {
		const content = stripCellSpans(node.content);
		if ((node.type.name === 'table_cell' || node.type.name === 'table_header') && (node.attrs.colspan !== 1 || node.attrs.rowspan !== 1 || node.attrs.colwidth)) {
			out.push(node.type.create({ ...node.attrs, colspan: 1, rowspan: 1, colwidth: null }, content, node.marks));
		} else {
			out.push(node.copy(content));
		}
	});
	return Fragment.fromArray(out);
}

// Tab inside a table: hop to the next cell, and at the LAST cell append a row and step into it —
// the behavior a table editor is expected to have (`prosemirror-tables`' `goToNextCell` alone does
// NOT append; it just returns false at the end). Outside a table it returns false so Tab falls
// through to list-item sink.
export const tabToNextCellOrAddRow: Command = (state, dispatch, view) => {
	if (goToNextCell(1)(state, dispatch, view)) return true;
	if (!isInTable(state)) return false;
	if (dispatch && view) {
		addRowAfter(state, dispatch);
		goToNextCell(1)(view.state, view.dispatch, view);
	}
	return true;
};

// The table overflow menu's model: where to anchor (the `⋯` button's viewport rect, so the menu
// portals to <body> and dodges the surface clipping) and the caret column's alignment (pressed
// L/C/R state). null = closed. The FREQUENT table ops (insert row / column) live inline in the
// slide's context-sensitive divider bar; this menu holds the LESS-frequent ones so the bar stays
// compact on mobile — there is NO separate always-on table toolbar.
type TableMenu = { left: number; top: number; align: ColAlign };

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
function stateMarkerPlugin() {
	return new Plugin({
		props: {
			decorations(state) {
				const decos: Decoration[] = [];
				state.doc.descendants((node, pos) => {
					if (node.type.name !== 'table_cell' && node.type.name !== 'table_header') return true;
					const m = CELL_MARKER_RE.exec(node.textContent);
					if (m) {
						const from = pos + 1; // inline content starts just inside the cell
						decos.push(Decoration.inline(from, from + 3, { class: `cs-cellmark cs-cellmark-${MARKER_STATE[m[1]]}` }));
					}
					return true; // a cell can hold nested inline, but the marker is only ever at its start
				});
				return DecorationSet.create(state.doc, decos);
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
	constructor(
		node: PMNode,
		public view: EditorView,
		public getPos: () => number,
		decorations: readonly Decoration[] = [],
		onSettings?: (index: number) => void,
		private getHeadings?: () => SlideHeadings | undefined,
		onInsertBelow?: (index: number) => void,
		private onTableMenu?: (anchor: DOMRect, align: ColAlign) => void,
	) {
		this.locked = !!node.attrs.locked;
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
		if (!this.dom.classList.contains('cs-slide-active')) {
			if (this.fmtGroup.childElementCount) {
				this.fmtGroup.replaceChildren();
				this.fmtGroup.dataset.sig = '';
			}
			return;
		}
		// When the caret is inside a table, the context-sensitive Format group becomes the TABLE
		// group — the frequent ops inline (insert row / column) plus a `⋯` that opens the overflow
		// menu (align, insert-before, deletes). No separate floating toolbar; the divider bar is the
		// one context-sensitive surface, and it stays compact on mobile (three buttons). A LOCKED
		// table slide (a cell holds math/HTML/…) is read-only, so it must NOT offer these controls —
		// the structural guard would silently eat every command (the register footgun, HARD RULE #18).
		if (isInTable(this.view.state) && !this.locked) {
			const sig = 'tbl';
			if (this.fmtGroup.dataset.sig === sig) return;
			this.fmtGroup.dataset.sig = sig;
			this.fmtGroup.replaceChildren(
				this.tblBtn('Insert row below', '＋Row', () => this.runTable(addRowAfter)),
				this.tblBtn('Insert column right', '＋Col', () => this.runTable(addColumnAfter)),
				this.tblBtn('More table actions', '⋯', (btn) => this.onTableMenu?.(btn.getBoundingClientRect(), currentColumnAlign(this.view.state)), true),
			);
			return;
		}
		const { keys, active } = applicableRegisters(this.view.state, this.getHeadings?.());
		const sig = `${keys.join(',')}|${active ?? ''}`;
		if (this.fmtGroup.dataset.sig === sig) return;
		this.fmtGroup.dataset.sig = sig;
		this.fmtGroup.replaceChildren();
		for (const key of keys) {
			const meta = REGISTERS.find((r) => r.key === key);
			if (!meta) continue;
			const b = document.createElement('button');
			b.type = 'button';
			b.className = `cs-fmt-btn${meta.mono ? ' cs-fmt-mono' : ''}${active === key ? ' cs-fmt-on' : ''}`;
			b.textContent = meta.glyph;
			b.title = `${meta.label} — apply to this block`;
			b.setAttribute('aria-label', meta.label);
			b.setAttribute('aria-pressed', active === key ? 'true' : 'false');
			b.addEventListener('mousedown', (e) => e.preventDefault());
			b.addEventListener('click', (e) => {
				e.preventDefault();
				applyRegister(this.view, key, activeRegister(this.view.state));
			});
			this.fmtGroup.append(b);
		}
	}
	// A table-control button in the Format group. Same mono chip as the register buttons, so the
	// bar reads as ONE context-sensitive toolbar. `fn` receives the button (the `⋯` needs its rect
	// to anchor the overflow menu).
	private tblBtn(label: string, glyph: string, fn: (btn: HTMLButtonElement) => void, isMore = false): HTMLButtonElement {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = `cs-fmt-btn cs-fmt-mono cs-fmt-tbl${isMore ? ' cs-fmt-more' : ''}`;
		b.textContent = glyph;
		b.title = label;
		b.setAttribute('aria-label', label);
		if (isMore) b.setAttribute('aria-haspopup', 'menu');
		b.addEventListener('mousedown', (e) => e.preventDefault());
		b.addEventListener('click', (e) => {
			e.preventDefault();
			fn(b);
		});
		return b;
	}
	private runTable(cmd: Command) {
		cmd(this.view.state, this.view.dispatch);
		this.view.focus();
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
	// The table OVERFLOW menu (less-frequent ops: align, insert-before, deletes), opened from the
	// `⋯` button in the slide's divider bar, else null. Portaled to <body> like the selection bar.
	// The frequent ops (insert row/column) live inline in the bar, so the bar has no separate toolbar.
	const [tableMenu, setTableMenu] = React.useState<TableMenu | null>(null);

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
						new SlideView(node, nodeView, getPos as () => number, decorations, (i) => onOpenSlideSettingsRef.current?.(i), () => slideHeadingsRef.current, onInsertBelowRef.current ? (i) => onInsertBelowRef.current?.(i) : undefined, (anchor, align) => setTableMenu((m) => (m ? null : { left: anchor.left + anchor.width / 2, top: anchor.bottom + 6, align }))),
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
					blur(_view, event) {
						setSelBar(null); // the selection bar never outlives focus
						// Keep the overflow menu open when focus moves INTO it (keyboard operation);
						// only close it when focus lands anywhere else.
						const to = (event as FocusEvent).relatedTarget as HTMLElement | null;
						if (!to?.closest?.('.cs-tbl-menu')) setTableMenu(null);
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
		// A scroll of the writing surface would strand the viewport-positioned overlays: hide the
		// selection bar (it returns on the next selection) and close the table overflow menu.
		const onScroll = () => {
			setSelBar(null);
			setTableMenu(null);
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

	// Run a table command from the overflow menu, keeping focus in the editor. Structural ops close
	// the menu; alignment keeps it open (you may retarget L→C→R) and refreshes its pressed state.
	const runTableCmd = React.useCallback((cmd: Command, keepOpen = false) => {
		const view = viewRef.current;
		if (!view) return;
		cmd(view.state, view.dispatch);
		if (keepOpen) {
			// Alignment: keep the menu open (retarget L→C→R) and refresh its pressed state; leave
			// focus in the menu so a keyboard user stays put.
			setTableMenu((m) => (m ? { ...m, align: currentColumnAlign(view.state) } : null));
		} else {
			// Structural op: return focus to the editor and dismiss.
			view.focus();
			setTableMenu(null);
		}
	}, []);

	// The overflow menu is a lightweight popover: dismiss it on an outside pointer-down or Escape,
	// and focus its first item on open so it's keyboard-operable (Tab through items, Enter, Escape).
	React.useEffect(() => {
		if (!tableMenu) return;
		const menu = document.querySelector('.cs-tbl-menu');
		if (menu && !menu.contains(document.activeElement)) (menu.querySelector('button') as HTMLElement | null)?.focus();
		const onDown = (e: PointerEvent) => {
			const t = e.target as HTMLElement | null;
			// Ignore a click on the `⋯` anchor itself — its own handler toggles the menu; closing here
			// too would fight it (the close→reopen flicker).
			if (!t?.closest('.cs-tbl-menu') && !t?.closest('.cs-fmt-more')) setTableMenu(null);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setTableMenu(null);
				viewRef.current?.focus();
			}
		};
		document.addEventListener('pointerdown', onDown, true);
		document.addEventListener('keydown', onKey, true);
		return () => {
			document.removeEventListener('pointerdown', onDown, true);
			document.removeEventListener('keydown', onKey, true);
		};
	}, [tableMenu]);

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
			{tableMenu &&
				createPortal(
					<div
						className="cs-tbl-menu"
						role="menu"
						aria-label="Table actions"
						// Clamp the (translateX(-50%), min-width 132px) menu so it never clips off-screen
						// on a narrow viewport where `⋯` sits near the right edge.
						style={{ left: `${Math.max(74, Math.min(tableMenu.left, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 74))}px`, top: `${tableMenu.top}px` }}
						onMouseDown={(e) => e.preventDefault()}
					>
						<div className="cs-tbl-sec" aria-hidden="true">
							Insert
						</div>
						<button type="button" role="menuitem" className="cs-tbl-item" onClick={() => runTableCmd(addRowBefore)}>
							Row above
						</button>
						<button type="button" role="menuitem" className="cs-tbl-item" onClick={() => runTableCmd(addRowAfter)}>
							Row below
						</button>
						<button type="button" role="menuitem" className="cs-tbl-item" onClick={() => runTableCmd(addColumnBefore)}>
							Column left
						</button>
						<button type="button" role="menuitem" className="cs-tbl-item" onClick={() => runTableCmd(addColumnAfter)}>
							Column right
						</button>
						<div className="cs-tbl-sec" aria-hidden="true">
							Align column
						</div>
						<div className="cs-tbl-aligns">
							{(['left', 'center', 'right'] as const).map((a) => (
								<button
									key={a}
									type="button"
									role="menuitemradio"
									className={cn('cs-tbl-align', tableMenu.align === a && 'cs-tbl-on')}
									aria-label={`Align column ${a}`}
									aria-checked={tableMenu.align === a}
									onClick={() => runTableCmd(setColumnAlign(tableMenu.align === a ? null : a), true)}
								>
									{a === 'left' ? 'L' : a === 'center' ? 'C' : 'R'}
								</button>
							))}
						</div>
						<div className="cs-tbl-sec" aria-hidden="true">
							Delete
						</div>
						<button type="button" role="menuitem" aria-label="Delete row" className="cs-tbl-item" onClick={() => runTableCmd(deleteRow)}>
							Row
						</button>
						<button type="button" role="menuitem" aria-label="Delete column" className="cs-tbl-item" onClick={() => runTableCmd(deleteColumn)}>
							Column
						</button>
						<button type="button" role="menuitem" aria-label="Delete table" className="cs-tbl-item cs-tbl-danger" onClick={() => runTableCmd(deleteTable)}>
							Table
						</button>
					</div>,
					document.body,
				)}
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
				/* space is tight — collapse the quick +Row/+Col chips into the ⋯ menu (which already
				   holds Row below / Column right), leaving just ⋯ inline. Desktop keeps the shortcuts. */
				.cs-fmt-tbl:not(.cs-fmt-more){display:none}
			}
			/* floating selection bar — inline marks over a text selection (portaled to body).
			   DESKTOP ONLY: on touch the OS selection menu owns formatting (see canFloatBar). */
			.cs-selbar{position:fixed;z-index:60;display:flex;gap:2px;padding:3px;border-radius:9px;background:var(--bg-alt,#fff);border:1px solid var(--border,rgba(0,0,0,.1));box-shadow:0 6px 20px -6px rgba(0,0,0,.28),0 1px 2px rgba(0,0,0,.14);animation:cs-sb-in .1s ease-out}
			@keyframes cs-sb-in{from{opacity:0;scale:.94}to{opacity:1;scale:1}}
			.cs-sb-btn{min-width:28px;height:26px;padding:0 6px;border:none;border-radius:6px;background:transparent;color:var(--text-body,#1e3a5f);font-family:var(--font-serif,Georgia,serif);font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .1s,background .1s}
			.cs-sb-mono{font-family:var(--font-mono,ui-monospace,monospace);font-size:11px}
			.cs-sb-btn:hover{background:color-mix(in oklab,var(--bg-alt,#eee),var(--text-muted) 16%);color:var(--text-heading,#0a1628)}
			.cs-sb-on{color:var(--accent,#006fa8);background:var(--accent-soft,#eff6fc)}
				/* table controls in the context-sensitive Format group — the insert-row/column chips read
				   as label voice like the register buttons; the ellipsis opens the overflow menu. */
				.cs-fmt-tbl{letter-spacing:.01em}
				.cs-fmt-more{font-size:14px;font-weight:700}
				/* the table OVERFLOW menu — a small popover of the less-frequent ops (portaled to body),
				   opened from the ellipsis button. Keeps the divider bar compact on mobile: no second toolbar. */
				.cs-tbl-menu{position:fixed;z-index:60;transform:translateX(-50%);display:flex;flex-direction:column;min-width:132px;padding:5px;gap:1px;border-radius:10px;background:var(--bg-alt,#fff);border:1px solid var(--border,rgba(0,0,0,.1));box-shadow:0 10px 28px -8px rgba(0,0,0,.32),0 2px 6px -2px rgba(0,0,0,.16);animation:cs-sb-in .1s ease-out}
				.cs-tbl-sec{font-family:var(--font-mono,ui-monospace,monospace);font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted,#6b7f9a);padding:6px 8px 2px}
				.cs-tbl-item{appearance:none;text-align:left;border:none;border-radius:6px;background:transparent;padding:6px 9px;font-family:var(--font-serif,Georgia,serif);font-size:13.5px;color:var(--text-body,#1e3a5f);cursor:pointer;transition:color .1s,background .1s}
				.cs-tbl-item:hover{background:var(--accent-soft,#eff6fc);color:var(--accent,#006fa8)}
				.cs-tbl-danger:hover{background:color-mix(in oklab,var(--fail,#b3261e),transparent 90%);color:var(--fail,#b3261e)}
				.cs-tbl-aligns{display:flex;gap:3px;padding:2px 8px 3px}
				.cs-tbl-align{flex:1;height:26px;border:1px solid var(--border,#e4eaf2);border-radius:6px;background:transparent;font-family:var(--font-mono,ui-monospace,monospace);font-size:11px;font-weight:700;color:var(--text-muted,#6b7f9a);cursor:pointer;transition:color .1s,background .1s,border-color .1s}
				.cs-tbl-align:hover{color:var(--accent,#006fa8);border-color:var(--accent,#006fa8)}
				.cs-tbl-on,.cs-tbl-on:hover{color:var(--on-accent,#fff);background:var(--accent,#006fa8);border-color:var(--accent,#006fa8)}
		`}</style>
	);
}

export default ComposeView;
