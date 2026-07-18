import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { deckSchema, deckToDoc, docToDeck } from '@/lib/compose/deck-doc';
import { cn } from '@/lib/utils';

// The Compose editing MODE, on ProseMirror (Option B, one true document). The
// whole deck is a single editor — selection / copy / undo span slides — bound to
// the same `source` string CodeMirror edits. The lossless round-trip lives in the
// deck-model library (@/lib/compose); this is just the view + the source binding.
// Quiet Page chrome (grammar gutter, register transform) lands in the next slice;
// this slice is the working continuous note with its slide breaks.

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
	// The last source WE emitted — so the external-sync effect can tell our own
	// round-tripped edit (skip) from a genuine external write (re-import).
	const lastEmittedRef = React.useRef(source);
	const [failed, setFailed] = React.useState(false);

	// Construct once per deck (resetKey = deck id). A deck switch rebuilds; edits and
	// same-deck external writes flow through the source-sync effect below.
	// biome-ignore lint/correctness/useExhaustiveDependencies: construct-once per deck; `source` seeds the doc and syncs separately.
	React.useEffect(() => {
		if (!hostRef.current) return;
		let view: EditorView;
		try {
			view = new EditorView(hostRef.current, {
				state: EditorState.create({ doc: deckToDoc(source), plugins: buildPlugins() }),
				dispatchTransaction(tr) {
					const next = view.state.apply(tr);
					view.updateState(next);
					if (tr.docChanged) {
						const src = docToDeck(next.doc);
						lastEmittedRef.current = src;
						onChangeRef.current(src);
					}
				},
			});
		} catch (e) {
			console.error('[compose] prosemirror', e);
			setFailed(true);
			return;
		}
		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, [resetKey]);

	// External source change (AI apply / History restore / rail slide op) → re-import,
	// unless it's our own edit round-tripping or the editor is focused (never clobber
	// the caret mid-type). One document, so this is a single clean re-baseline.
	React.useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		if (source === lastEmittedRef.current) return;
		if (docToDeck(view.state.doc) === source) return;
		if (view.hasFocus()) return;
		try {
			view.updateState(EditorState.create({ doc: deckToDoc(source), plugins: view.state.plugins }));
			lastEmittedRef.current = source;
		} catch (e) {
			console.error('[compose] resync', e);
		}
	}, [source]);

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
			<div ref={hostRef} className="cs-host" />
		</div>
	);
}

// Scoped Quiet-Page-leaning styles (refined in the next slice). Serif writing
// surface on the studio tokens (light + dark), slide sections with a hairline
// break between them.
function ComposeStyles() {
	return (
		<style>{`
			.cs-surface{height:100%;overflow:hidden;background:var(--bg,#fff)}
			.cs-host{height:100%;overflow-y:auto}
			.cs-host .ProseMirror{outline:none;min-height:100%;padding:8px 0 64px;font-family:var(--font-serif,Georgia,"Times New Roman",serif);font-size:16.5px;line-height:1.6;color:var(--text-body,#2b3a4f)}
			.cs-host .cs-slide{padding:14px clamp(20px,6cqw,60px);position:relative}
			.cs-host .cs-slide + .cs-slide::before{content:"◇";position:absolute;top:-2px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--text-muted,#9aa2ad)}
			.cs-host .cs-slide + .cs-slide{border-top:1px solid var(--rule,rgba(0,0,0,.08))}
			.cs-host h1{font-family:var(--font-serif,Georgia,serif);font-size:1.9rem;font-weight:700;line-height:1.1;margin:.15em 0 .35em;color:var(--text-heading,#14243a)}
			.cs-host h2{font-family:var(--font-serif,Georgia,serif);font-size:1.45rem;font-weight:700;line-height:1.15;margin:.5em 0 .3em;color:var(--text-heading,#14243a)}
			.cs-host h3{font-family:var(--font-serif,Georgia,serif);font-size:1.15rem;font-weight:600;margin:.5em 0 .25em;color:var(--text-heading,#14243a)}
			.cs-host p{margin:0 0 .55em}
			.cs-host blockquote{border-left:2.5px solid var(--accent,#1e5f96);background:var(--accent-soft,rgba(30,95,150,.08));padding:10px 16px;border-radius:0 8px 8px 0;margin:.5em 0}
			.cs-host ul{list-style:none;padding-left:0;margin:0 0 .55em}
			.cs-host ul>li{padding-left:22px;text-indent:-22px;margin:.15em 0}
			.cs-host ul>li::before{content:"—";color:var(--accent,#1e5f96);margin-right:12px;text-indent:0;display:inline-block}
			.cs-host ol{padding-left:1.5em;margin:0 0 .55em}
			.cs-host ol>li{margin:.12em 0}
			.cs-host ul ul>li,.cs-host ol ul>li{list-style:none}
			.cs-host code{font-family:var(--font-mono,ui-monospace,monospace);background:var(--surface-2,rgba(0,0,0,.06));padding:.05em .35em;border-radius:4px;font-size:.9em}
			.cs-host strong{font-weight:700;color:var(--text-heading,#14243a)}
			.cs-host a{color:var(--accent,#1e5f96);text-decoration:underline}
		`}</style>
	);
}

export default ComposeView;
