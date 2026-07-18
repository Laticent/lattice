import { baseKeymap, lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { deckSchema, deckToDoc, docToDeck, type EmitBaseline, emitDeck, initBaseline } from '@/lib/compose/deck-doc';
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

function buildPlugins() {
	return [
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
				dispatchTransaction(tr) {
					const next = view.state.apply(tr);
					view.updateState(next);
					setActive(activeRegister(next));
					if (tr.docChanged) {
						// Edit-local emit: only the slide the caret changed is re-serialized;
						// every untouched slide re-emits its cached bytes (baselineRef).
						const base = baselineRef.current ?? initBaseline(next.doc);
						const src = emitDeck(next.doc, base);
						baselineRef.current = base;
						lastEmittedRef.current = src;
						onChangeRef.current(src);
					}
				},
				handleDOMEvents: {
					// D2: on blur, apply any external source that arrived while focused.
					blur() {
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
		return () => {
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
		if (source === lastEmittedRef.current) return;
		if (docToDeck(view.state.doc) === source) return;
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
			.cs-gutter{flex:none;width:54px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:22px 0;border-right:1px solid var(--rule,rgba(0,0,0,.06));position:relative;background:linear-gradient(to right,color-mix(in srgb,var(--bg) 70%,var(--rule,#eee)),transparent)}
			.cs-gutter-label{position:absolute;left:7px;top:24px;writing-mode:vertical-rl;transform:rotate(180deg);font-family:var(--font-mono,ui-monospace,monospace);font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted,#aab0bc);opacity:.7}
			.cs-greg{width:34px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:var(--font-serif,Georgia,serif);font-size:15px;color:var(--text-faint,#c8ccd4);background:transparent;border:none;cursor:pointer;transition:color .13s,background .13s}
			.cs-greg-mono{font-family:var(--font-mono,ui-monospace,monospace);font-size:10px;letter-spacing:.02em}
			.cs-greg:hover{color:var(--text-body,#2b3a4f);background:color-mix(in srgb,var(--bg) 60%,var(--rule,#eee))}
			.cs-greg-live{color:var(--accent,#1e5f96);background:var(--accent-soft,rgba(30,95,150,.1))}
			/* the serif page */
			.cs-host{flex:1;min-width:0;overflow-y:auto;container-type:inline-size}
			.cs-host .ProseMirror{outline:none;min-height:100%;padding:6px 0 72px;font-family:var(--font-serif,Georgia,"Times New Roman",serif);font-size:16.5px;line-height:1.62;color:var(--text-body,#2b3a4f)}
			.cs-host .cs-slide{padding:20px clamp(24px,6cqw,64px)}
			.cs-host .cs-slide + .cs-slide{margin-top:6px;position:relative}
			.cs-host .cs-slide + .cs-slide::before{content:"◇";display:block;text-align:center;font-size:9px;color:var(--text-faint,#c8ccd4);margin:0 0 18px;border-top:1px solid var(--rule,rgba(0,0,0,.07));padding-top:16px}
			.cs-host h1{font-family:inherit;font-size:1.95rem;font-weight:700;line-height:1.12;margin:.1em 0 .35em;color:var(--text-heading,#14243a);letter-spacing:-.01em}
			.cs-host h2{font-family:inherit;font-size:1.45rem;font-weight:700;line-height:1.18;margin:.5em 0 .32em;color:var(--text-heading,#14243a);letter-spacing:-.005em}
			.cs-host h3{font-family:inherit;font-size:1.15rem;font-weight:600;margin:.5em 0 .25em;color:var(--text-heading,#14243a)}
			.cs-host p{margin:0 0 .6em}
			/* eyebrow / subtitle: an inline-code-only paragraph reads as a mono label */
			.cs-host p > code:only-child{font-family:var(--font-mono,ui-monospace,monospace);font-size:.72em;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted,#6b7280);background:var(--surface-2,rgba(0,0,0,.05));padding:2px 7px;border-radius:4px}
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
			.cs-host code{font-family:var(--font-mono,ui-monospace,monospace);background:var(--surface-2,rgba(0,0,0,.06));padding:.05em .35em;border-radius:4px;font-size:.85em}
			.cs-host strong{font-weight:700;color:var(--text-heading,#14243a)}
			.cs-host em{font-style:italic}
			.cs-host a{color:var(--accent,#1e5f96);text-decoration:underline}
			.cs-host .ProseMirror-selectednode{outline:2px solid var(--accent,#1e5f96)}
		`}</style>
	);
}

export default ComposeView;
