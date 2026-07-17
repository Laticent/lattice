import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { COMPOSE_NODES, COMPOSE_THEME, COMPOSE_TRANSFORMERS, parseDeck, recompileDeck, slideClassOf } from './compose-lexical';

// The Compose surface — the rich-markdown editing MODE (Option B). The whole deck
// is one continuous "note": every slide's prose rendered rich, in order, with a
// slide-break between. It reads/writes the SAME `source` string CodeMirror does —
// on any edit it recompiles (front-matter + each slide's preserved directives +
// edited prose, rejoined on `\n\n---\n\n`), so the preview and Markdown mode stay
// in lock-step. This is the scaffold slice: the continuous note + breaks + rich
// prose. The Quiet Page chrome (grammar gutter, selection bar, the register
// transform) lands in the following slices.

const isJsdom = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');

// Link href allowlist — http(s) / mailto / tel / relative only. Rejects
// `javascript:`, `data:`, `vbscript:` so a pasted `[x](javascript:…)` never becomes a
// live scheme in the editor DOM (trio red-team #7). Export is sanitized downstream
// regardless; this is cheap in-editor insurance.
const SAFE_URL_RE = /^(?:https?:|mailto:|tel:|\/|#|\.)/i;
function validateUrl(url: string): boolean {
	return SAFE_URL_RE.test(url.trim());
}

// Re-seed the editor when the slide's prose changes UNDERNEATH it (an external
// source write that kept the slide count — AI apply, History restore, an Inspector
// slide transform), so Compose can't display stale content whose next keystroke
// would silently revert the external change. Only re-imports when (a) the incoming
// prose really differs from our own last export (normalized), and (b) THIS editor
// isn't focused — never clobbering the caret mid-type. (Checker finding #1.)
function ReconcilePlugin({ seedProse, lastExportRef, reconcilingRef }: { seedProse: string; lastExportRef: React.MutableRefObject<string>; reconcilingRef: React.MutableRefObject<boolean> }) {
	const [editor] = useLexicalComposerContext();
	React.useEffect(() => {
		if (seedProse.trim() === lastExportRef.current.trim()) return;
		const root = editor.getRootElement();
		const focused = !!root && typeof document !== 'undefined' && root.contains(document.activeElement);
		if (focused) return;
		lastExportRef.current = seedProse;
		// A re-import is a DISPLAY refresh, never a user edit — bracket it so the export
		// listener below stands down and can't write the (lossy) round-trip of external
		// content back into `source`. Without this, restoring a version or an AI edit to
		// one slide silently flattens the nested lists of an untouched structured slide
		// (trio red-team #2). Lexical's update + its listeners run synchronously, so the
		// flag is set for exactly the reconcile transaction.
		reconcilingRef.current = true;
		editor.update(() => {
			$convertFromMarkdownString(seedProse, COMPOSE_TRANSFORMERS);
		});
		reconcilingRef.current = false;
	}, [seedProse, editor, lastExportRef, reconcilingRef]);
	return null;
}

// One Lexical editor for a single slide's prose. Construct-once for the FIRST mount;
// later external divergence flows in through ReconcilePlugin (not a re-key, which
// would drop the caret every keystroke). Degrades to a <textarea> under jsdom so the
// unit suite never trips on Lexical's missing geometry.
function SlideBlock({ seedProse, onProseChange }: { seedProse: string; onProseChange: (prose: string) => void }) {
	const onChangeRef = React.useRef(onProseChange);
	onChangeRef.current = onProseChange;
	// Our latest export — the baseline ReconcilePlugin compares incoming prose against
	// so a user's own round-tripped edit never triggers a spurious re-import.
	const lastExportRef = React.useRef(seedProse);
	// True only while ReconcilePlugin is re-importing external content — the export
	// listener skips those transactions so a display refresh never writes to `source`.
	const reconcilingRef = React.useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: construct-once — seedProse seeds the first mount only; later syncs come via ReconcilePlugin.
	const initialConfig = React.useMemo(
		() => ({
			namespace: 'lattice-compose',
			theme: COMPOSE_THEME,
			nodes: COMPOSE_NODES as never,
			editorState: () => {
				$convertFromMarkdownString(seedProse, COMPOSE_TRANSFORMERS);
			},
			onError: (e: Error) => console.error('[compose] lexical', e),
		}),
		[],
	);
	if (isJsdom) {
		return (
			<textarea
				className="cs-fallback"
				aria-label="Slide content"
				value={seedProse}
				onChange={(e) => onProseChange(e.target.value)}
				spellCheck={false}
			/>
		);
	}
	return (
		<LexicalComposer initialConfig={initialConfig}>
			<div className="cs-slide-body">
				<RichTextPlugin
					contentEditable={<ContentEditable className="cs-editable" aria-label="Slide content" />}
					placeholder={<div className="cs-placeholder">Write this slide…</div>}
					ErrorBoundary={LexicalErrorBoundary}
				/>
				<HistoryPlugin />
				<ListPlugin />
				<LinkPlugin validateUrl={validateUrl} />
				<MarkdownShortcutPlugin transformers={COMPOSE_TRANSFORMERS} />
				<ReconcilePlugin seedProse={seedProse} lastExportRef={lastExportRef} reconcilingRef={reconcilingRef} />
				<OnChangePlugin
					// ignoreSelectionChange: an export must fire only on a real CONTENT edit,
					// never when the caret merely MOVES. Lexical's OnChangePlugin defaults this
					// to false, so a click/arrow into a nested-list slide would otherwise export
					// its flattened round-trip straight into `source` — read-only contact
					// corrupting the deck (trio Munger #1). Paired with reconcilingRef, the only
					// writes to `source` are genuine user edits.
					ignoreSelectionChange
					onChange={(state) => {
						if (reconcilingRef.current) return; // display refresh, not a user edit
						state.read(() => {
							try {
								const md = $convertToMarkdownString(COMPOSE_TRANSFORMERS);
								lastExportRef.current = md;
								onChangeRef.current(md);
							} catch (e) {
								console.error('[compose] export', e);
							}
						});
					}}
				/>
			</div>
		</LexicalComposer>
	);
}

export function ComposeSurface({ source, onChange, resetKey = '', className }: { source: string; onChange: (next: string) => void; resetKey?: string; className?: string }) {
	// Parse (CRLF-normalized) into front-matter + per-slide { directives, prose, raw }.
	const { fm, slides: chunks } = React.useMemo(() => parseDeck(source), [source]);
	// Freshest parse for the commit funnel (avoids threading it through every edit).
	const chunksRef = React.useRef(chunks);
	chunksRef.current = chunks;
	const fmRef = React.useRef(fm);
	fmRef.current = fm;

	const updateSlide = React.useCallback(
		(index: number, prose: string) => {
			const cur = chunksRef.current;
			if (cur[index] == null || cur[index].prose === prose) return;
			onChange(recompileDeck(cur, fmRef.current, index, prose));
		},
		[onChange],
	);

	return (
		<div className={cn('cs-surface', className)}>
			<ComposeStyles />
			<div className="cs-scroll">
				{chunks.map((c, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: slides are positional; the resetKey remounts all on a deck switch.
					<React.Fragment key={`${resetKey}:${i}`}>
						{i > 0 && (
							<div className="cs-break" aria-hidden="true">
								<span className="cs-break-ln" />
								<span className="cs-break-tag">◇ {slideClassOf(c.directives)}</span>
								<span className="cs-break-ln" />
							</div>
						)}
						<div className="cs-slide" data-slide={i}>
							<SlideBlock seedProse={c.prose} onProseChange={(p) => updateSlide(i, p)} />
						</div>
					</React.Fragment>
				))}
			</div>
		</div>
	);
}

// Scoped stylesheet — the Quiet Page prose look, on the studio tokens so it themes
// (light/dark) with the rest of the shell. Kept in-component so the surface is one
// self-contained unit for this slice.
function ComposeStyles() {
	return (
		<style>{`
			.cs-surface{height:100%;overflow:hidden;background:var(--bg,#fff)}
			.cs-scroll{height:100%;overflow-y:auto;padding:8px 0 64px}
			.cs-slide{padding:6px clamp(20px,6cqw,64px)}
			.cs-editable{outline:none;font-family:var(--font-serif,Georgia,"Times New Roman",serif);font-size:16.5px;line-height:1.6;color:var(--text-body,#2b3a4f)}
			.cs-placeholder{pointer-events:none;position:absolute;color:var(--text-muted,#9aa2ad);font-family:var(--font-serif,Georgia,serif);font-size:16.5px}
			.cs-slide-body{position:relative}
			.cs-h1{font-family:var(--font-serif,Georgia,serif);font-size:1.9rem;font-weight:700;line-height:1.1;margin:.15em 0 .35em;color:var(--text-heading,#14243a)}
			.cs-h2{font-family:var(--font-serif,Georgia,serif);font-size:1.45rem;font-weight:700;line-height:1.15;margin:.5em 0 .3em;color:var(--text-heading,#14243a)}
			.cs-h3{font-family:var(--font-serif,Georgia,serif);font-size:1.15rem;font-weight:600;margin:.5em 0 .25em;color:var(--text-heading,#14243a)}
			.cs-p{margin:0 0 .55em}
			.cs-quote{border-left:2.5px solid var(--accent,#1e5f96);background:var(--accent-soft,rgba(30,95,150,.08));padding:10px 16px;border-radius:0 8px 8px 0;color:var(--text-heading,#14243a);font-style:normal;margin:.5em 0}
			.cs-ul{list-style:none;padding-left:0;margin:0 0 .55em}
			.cs-ol{list-style:decimal;padding-left:1.4em;margin:0 0 .55em}
			.cs-ul>.cs-li{padding-left:22px;text-indent:-22px;margin:.15em 0}
			.cs-ul>.cs-li::before{content:"—";color:var(--accent,#1e5f96);margin-right:12px;text-indent:0;display:inline-block}
			.cs-li{margin:.12em 0}
			.cs-li-nested{list-style:circle}
			.cs-bold{font-weight:700;color:var(--text-heading,#14243a)}
			.cs-italic{font-style:italic}
			.cs-strike{text-decoration:line-through}
			.cs-code{font-family:var(--font-mono,ui-monospace,monospace);background:var(--surface-2,rgba(0,0,0,.06));padding:.05em .35em;border-radius:4px;font-size:.9em}
			.cs-codeblock{display:block;font-family:var(--font-mono,ui-monospace,monospace);background:var(--surface-2,rgba(0,0,0,.06));padding:.7em .9em;border-radius:6px;font-size:.85em;white-space:pre;overflow-x:auto;margin:.4em 0 .7em}
			.cs-link{color:var(--accent,#1e5f96);text-decoration:underline}
			.cs-break{display:flex;align-items:center;gap:14px;padding:14px clamp(20px,6cqw,64px);color:var(--text-muted,#9aa2ad)}
			.cs-break-ln{height:1px;background:var(--rule,rgba(0,0,0,.1));flex:1;max-width:160px}
			.cs-break-tag{font-family:var(--font-mono,ui-monospace,monospace);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted,#9aa2ad)}
			.cs-fallback{width:100%;min-height:120px;border:none;outline:none;resize:vertical;background:var(--bg,#fff);color:var(--text-body,#2b3a4f);font-family:var(--font-serif,Georgia,serif);font-size:16px;padding:4px 0}
		`}</style>
	);
}

export default ComposeSurface;
