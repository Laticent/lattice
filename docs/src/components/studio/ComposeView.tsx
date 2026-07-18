import { baseKeymap, lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import type { MarkType, Node as PMNode } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { deckSchema, deckToDoc, type EmitBaseline, emitDeck, initBaseline } from '@/lib/compose/deck-doc';
import { cn } from '@/lib/utils';

// The Compose editing MODE, on ProseMirror (Option B, one true document), dressed
// in the Quiet Page: a serif writing surface whose only chrome is a QUIET GRAMMAR
// GUTTER on the left — Lattice's registers (H1/H2/Eyebrow/Insight/Note), faint at
// rest, LIT for the block the caret is in, click-to-apply. The empty margin becomes
// the toolbar; restraint stays. One document → selection/copy/undo span slides.

type Reg = 'h1' | 'h2' | 'eyebrow' | 'insight' | 'note';
const REGISTERS: { key: Reg; glyph: string; label: string; mono?: boolean }[] = [
	{ key: 'h1', glyph: 'H1', label: 'Heading', mono: true },
	{ key: 'h2', glyph: 'H2', label: 'Section', mono: true },
	{ key: 'eyebrow', glyph: '·e·', label: 'Eyebrow', mono: true },
	{ key: 'insight', glyph: '❦', label: 'Key insight' },
	{ key: 'note', glyph: '—', label: 'Below-note' },
];

// Which register the caret's block currently IS — drives the gutter's lit state.
function activeRegister(state: EditorState): Reg | null {
	const { $from } = state.selection;
	for (let d = $from.depth; d > 0; d--) {
		if ($from.node(d).type.name === 'blockquote') return 'insight';
	}
	const block = $from.parent;
	if (block.type.name === 'heading') return (block.attrs.level as number) <= 1 ? 'h1' : 'h2';
	if (block.type.name === 'paragraph') {
		const text = block.textContent;
		if (text.startsWith('—')) return 'note';
		if (text.length > 0 && block.content.content.every((n) => !n.isText || n.marks.some((m) => m.type.name === 'code'))) return 'eyebrow';
	}
	return null;
}

// Apply a register to the caret's block (the "menu is the style sheet"). Toggles
// off to a plain paragraph when the block is already that register.
function applyRegister(view: EditorView, reg: Reg, current: Reg | null) {
	const s = deckSchema;
	const { state, dispatch } = view;
	if (reg === current && (reg === 'h1' || reg === 'h2')) {
		setBlockType(s.nodes.paragraph)(state, dispatch);
	} else if (reg === 'h1') {
		setBlockType(s.nodes.heading, { level: 1 })(state, dispatch);
	} else if (reg === 'h2') {
		setBlockType(s.nodes.heading, { level: 2 })(state, dispatch);
	} else if (reg === 'insight') {
		if (current === 'insight') lift(state, dispatch);
		else wrapIn(s.nodes.blockquote)(state, dispatch);
	} else if (reg === 'eyebrow') {
		const { $from } = view.state.selection;
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, $from.start(), $from.end())));
		toggleMark(s.marks.code)(view.state, view.dispatch);
	} else if (reg === 'note') {
		// Below-note is a PARAGRAPH treatment (a leading em-dash), so guard against
		// stamping it into a heading, and toggle it off when it's already lit.
		const { $from } = view.state.selection;
		if ($from.parent.type.name === 'paragraph') {
			const starts = $from.parent.textContent.startsWith('—');
			if (current === 'note' && starts) {
				const strip = $from.parent.textContent.startsWith('— ') ? 2 : 1;
				view.dispatch(view.state.tr.delete($from.start(), $from.start() + strip));
			} else if (!starts) {
				view.dispatch(view.state.tr.insertText('— ', $from.start()));
			}
		}
	}
	view.focus();
}

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

// The structural guard (the adversarial trio's CRITICAL). Two invariants a stray keystroke
// must never break: (1) the slide COUNT can't change from editing — Backspace at a slide
// start, Delete at its end, or a cross-slide selection-delete would otherwise `joinBackward`
// two slides into one, silently dropping the merged-away slide's `_class`; (2) a LOCKED
// slide (one whose prose Compose can't round-trip — a table, block HTML, strikethrough…)
// can't be edited, so its node identity never changes and `emitDeck` always re-emits its
// exact `raw` bytes. Selection-only transactions (no doc change) always pass, so you can
// still put the caret in / copy from a locked slide.
function structuralGuard() {
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
const collapseKey = new PluginKey<DecorationSet>('cs-collapse');
function collapsePlugin() {
	return new Plugin({
		key: collapseKey,
		state: {
			init: () => DecorationSet.empty,
			apply(tr, set) {
				let next = set.map(tr.mapping, tr.doc);
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

// A per-slide NodeView: renders the slide's content plus a LEFT-side control rail
// (move up/down · collapse · insert below · delete) that reveals on hover (desktop) or
// sits faint on touch. Structural ops rebuild the doc from the SAME node instances (so
// every unmoved slide keeps its identity → emitDeck re-emits its exact `raw` bytes) and
// carry the `slideOp` meta so the structural guard lets the count/lock change through.
// Collapse is view-only (a class on this instance) — it never touches the source.
class SlideView {
	dom: HTMLElement;
	contentDOM: HTMLElement;
	ctrl: HTMLElement;
	collapseBtn: HTMLButtonElement;
	constructor(
		node: PMNode,
		public view: EditorView,
		public getPos: () => number,
		decorations: readonly Decoration[] = [],
	) {
		const dom = document.createElement('section');
		dom.className = node.attrs.locked ? 'cs-slide cs-slide-locked' : 'cs-slide';
		const ctrl = document.createElement('div');
		ctrl.className = 'cs-slide-ctrl';
		ctrl.contentEditable = 'false';
		const mk = (label: string, glyph: string, fn: () => void) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'cs-sc-btn';
			b.title = label;
			b.setAttribute('aria-label', label);
			b.textContent = glyph;
			b.addEventListener('mousedown', (e) => e.preventDefault());
			b.addEventListener('click', (e) => {
				e.preventDefault();
				fn();
			});
			return b;
		};
		this.collapseBtn = mk('Collapse slide', '⌃', () => this.toggleCollapse());
		ctrl.append(
			mk('Move slide up', '↑', () => this.move(-1)),
			mk('Move slide down', '↓', () => this.move(1)),
			this.collapseBtn,
			mk('Insert slide below', '＋', () => this.insertBelow()),
			mk('Delete slide', '✕', () => this.remove()),
		);
		const content = document.createElement('div');
		content.className = 'cs-slide-content';
		dom.append(ctrl, content);
		this.dom = dom;
		this.contentDOM = content;
		this.ctrl = ctrl;
		this.applyCollapsed(decorations);
	}
	private applyCollapsed(decorations: readonly Decoration[]) {
		const collapsed = decorations.some((d) => (d.spec as { collapsed?: boolean } | undefined)?.collapsed);
		this.dom.classList.toggle('cs-collapsed', collapsed);
		this.collapseBtn.textContent = collapsed ? '⌄' : '⌃';
		this.collapseBtn.setAttribute('aria-label', collapsed ? 'Expand slide' : 'Collapse slide');
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
		this.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, nodes).setMeta('slideOp', true));
		this.view.focus();
	}
	private move(dir: number) {
		const i = this.index();
		const j = i + dir;
		const nodes = this.slides();
		if (i < 0 || j < 0 || j >= nodes.length) return;
		[nodes[i], nodes[j]] = [nodes[j], nodes[i]];
		this.commit(nodes);
	}
	private insertBelow() {
		const i = this.index();
		if (i < 0) return;
		const nodes = this.slides();
		const blank = deckSchema.nodes.slide.create({ directives: ['<!-- _class: content -->'], raw: '', locked: false }, deckSchema.nodes.paragraph.create());
		nodes.splice(i + 1, 0, blank);
		this.commit(nodes);
	}
	private remove() {
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
		this.dom.classList.toggle('cs-slide-locked', !!node.attrs.locked);
		this.applyCollapsed(decorations);
		return true;
	}
	ignoreMutation(m: MutationRecord | { target: Node }) {
		return this.ctrl.contains(m.target as Node);
	}
	stopEvent(e: Event) {
		return this.ctrl.contains(e.target as Node);
	}
}

function buildPlugins() {
	return [
		structuralGuard(),
		collapsePlugin(),
		history(),
		keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
		keymap({
			Enter: splitListItem(deckSchema.nodes.list_item),
			Tab: sinkListItem(deckSchema.nodes.list_item),
			'Shift-Tab': liftListItem(deckSchema.nodes.list_item),
		}),
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

export function ComposeView({ source, onChange, resetKey = '', className }: { source: string; onChange: (next: string) => void; resetKey?: string; className?: string }) {
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
	const [active, setActive] = React.useState<Reg | null>(null);
	// The floating selection bar (inline marks over a text selection), or null when there
	// is no non-empty selection. The block registers live in the gutter; this bar is the
	// inline complement — Bold / Italic / Code on the selected run.
	const [selBar, setSelBar] = React.useState<SelBar | null>(null);

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
				nodeViews: { slide: (node, nodeView, getPos, decorations) => new SlideView(node, nodeView, getPos as () => number, decorations) },
				dispatchTransaction(tr) {
					const next = view.state.apply(tr);
					view.updateState(next);
					setActive(activeRegister(next));
					if (tr.docChanged) {
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
		setActive(activeRegister(view.state));
		// The floating bar is positioned in viewport coords; a scroll of the writing surface
		// would strand it, so hide it on scroll (it returns on the next selection change).
		const host = hostRef.current;
		const hideBar = () => setSelBar(null);
		host?.addEventListener('scroll', hideBar, { passive: true });
		return () => {
			host?.removeEventListener('scroll', hideBar);
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

	const onGutter = React.useCallback((reg: Reg) => {
		const view = viewRef.current;
		if (view) applyRegister(view, reg, activeRegister(view.state));
	}, []);

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
		<div className={cn('cs-surface', className)}>
			<ComposeStyles />
			<div className="cs-frame">
				<div className="cs-gutter" role="toolbar" aria-label="Grammar registers">
					<span className="cs-gutter-label">Grammar</span>
					{REGISTERS.map((r) => (
						<button
							key={r.key}
							type="button"
							title={`${r.label} — apply to this block`}
							aria-label={r.label}
							aria-pressed={active === r.key}
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => onGutter(r.key)}
							className={cn('cs-greg', r.mono && 'cs-greg-mono', active === r.key && 'cs-greg-live')}
						>
							{r.glyph}
						</button>
					))}
				</div>
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
			/* quiet grammar gutter */
			.cs-gutter{flex:none;width:54px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:22px 0;border-right:1px solid var(--border,#e4eaf2);position:relative;background:var(--bg-alt,#f2f5fa)}
			.cs-gutter-label{position:absolute;left:7px;top:24px;writing-mode:vertical-rl;transform:rotate(180deg);font-family:var(--font-mono,ui-monospace,monospace);font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted,#6b7f9a)}
			.cs-greg{width:34px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:var(--font-serif,Georgia,serif);font-size:15px;color:var(--text-muted,#6b7f9a);background:transparent;border:none;cursor:pointer;transition:color .13s,background .13s}
			.cs-greg-mono{font-family:var(--font-mono,ui-monospace,monospace);font-size:10px;letter-spacing:.02em}
			.cs-greg:hover{color:var(--text-heading,#0a1628);background:color-mix(in oklab,var(--bg-alt,#eee),var(--text-muted) 16%)}
			.cs-greg-live{color:var(--accent,#006fa8);background:var(--accent-soft,#eff6fc);box-shadow:inset 0 0 0 1px color-mix(in oklab,var(--accent,#006fa8),transparent 60%)}
			/* the serif page */
			.cs-host{flex:1;min-width:0;overflow-y:auto;container-type:inline-size}
			.cs-host .ProseMirror{outline:none;min-height:100%;padding:6px 0 72px;font-family:var(--font-serif,Georgia,"Times New Roman",serif);font-size:16.5px;line-height:1.62;color:var(--text-body,#2b3a4f)}
			.cs-host .cs-slide{padding:20px clamp(24px,6cqw,64px);position:relative}
			/* per-slide control rail (left) — reveals on hover; faint on touch */
			.cs-slide-ctrl{position:absolute;left:2px;top:16px;display:flex;flex-direction:column;gap:3px;opacity:0;transition:opacity .12s;z-index:6;user-select:none}
			.cs-slide:hover > .cs-slide-ctrl,.cs-slide-ctrl:focus-within{opacity:1}
			@media (hover:none){.cs-slide-ctrl{opacity:.5}}
			.cs-sc-btn{width:22px;height:22px;border-radius:6px;border:1px solid var(--border,#e4eaf2);background:var(--bg-alt,#f2f5fa);color:var(--text-muted,#6b7f9a);font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:color .1s,border-color .1s}
			.cs-sc-btn:hover{color:var(--accent,#006fa8);border-color:var(--accent,#006fa8)}
			/* collapsed: keep the first block, hide the rest behind an ellipsis */
			.cs-slide.cs-collapsed .cs-slide-content > *:not(:first-child){display:none}
			.cs-slide.cs-collapsed .cs-slide-content::after{content:"⋯";display:block;color:var(--text-muted,#6b7f9a);font-size:17px;line-height:1;padding:2px 0 2px}
			.cs-host .cs-slide + .cs-slide{margin-top:6px}
			.cs-host .cs-slide + .cs-slide::before{content:"◇";display:block;text-align:center;font-size:9px;color:var(--text-muted,#6b7f9a);margin:0 0 18px;border-top:1px solid var(--border,#e4eaf2);padding-top:16px}
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
			/* MOBILE — the grammar rail becomes a bottom bar (thumb-reachable; the cramped low-
			   contrast left rail was the phone pain point). Host on top, register bar below. */
			@media (max-width:640px){
				.cs-frame{flex-direction:column}
				.cs-host{order:1}
				.cs-gutter{order:2;flex-direction:row;width:auto;height:auto;justify-content:center;gap:8px;padding:7px 12px;border-right:none;border-top:1px solid var(--border,#e4eaf2);overflow-x:auto}
				.cs-gutter-label{display:none}
				.cs-greg{width:40px;height:34px;font-size:16px}
				.cs-greg-mono{font-size:11px}
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
