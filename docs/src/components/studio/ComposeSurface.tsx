import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
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
import { COMPOSE_NODES, COMPOSE_THEME, COMPOSE_TRANSFORMERS, composeSlideChunk, type SlideChunk, slideClassOf, splitSlideDirectives } from './compose-lexical';
import { frontMatterBlock, stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';

// The Compose surface — the rich-markdown editing MODE (Option B). The whole deck
// is one continuous "note": every slide's prose rendered rich, in order, with a
// slide-break between. It reads/writes the SAME `source` string CodeMirror does —
// on any edit it recompiles (front-matter + each slide's preserved directives +
// edited prose, rejoined on `\n\n---\n\n`), so the preview and Markdown mode stay
// in lock-step. This is the scaffold slice: the continuous note + breaks + rich
// prose. The Quiet Page chrome (grammar gutter, selection bar, the register
// transform) lands in the following slices.

const isJsdom = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');

// One Lexical editor for a single slide's prose. Construct-once (StrictMode-safe):
// the seed prose only seeds the first mount; later external edits re-key from the
// parent (deck switch / slide-count change). Degrades to a <textarea> under jsdom
// so the unit suite never trips on Lexical's missing geometry.
function SlideBlock({ seedProse, onProseChange }: { seedProse: string; onProseChange: (prose: string) => void }) {
	const onChangeRef = React.useRef(onProseChange);
	onChangeRef.current = onProseChange;
	// biome-ignore lint/correctness/useExhaustiveDependencies: construct-once — seedProse seeds the first mount only; later syncs come via re-key from the parent.
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
				<LinkPlugin />
				<MarkdownShortcutPlugin transformers={COMPOSE_TRANSFORMERS} />
				<OnChangePlugin
					onChange={(state) => {
						state.read(() => {
							try {
								onChangeRef.current($convertToMarkdownString(COMPOSE_TRANSFORMERS));
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
	// Parse the deck into front-matter (held aside) + per-slide { directives, prose }.
	const fm = React.useMemo(() => frontMatterBlock(source), [source]);
	const chunks = React.useMemo<SlideChunk[]>(() => splitSlides(stripFrontMatter(source)).map(splitSlideDirectives), [source]);
	// Freshest chunks for the commit funnel (avoids threading them through every edit).
	const chunksRef = React.useRef(chunks);
	chunksRef.current = chunks;
	const fmRef = React.useRef(fm);
	fmRef.current = fm;

	const recompile = React.useCallback(
		(next: SlideChunk[]) => {
			const body = next.map((c) => composeSlideChunk(c.directives, c.prose)).join('\n\n---\n\n');
			const f = fmRef.current;
			return f ? f + body : body;
		},
		[],
	);
	const updateSlide = React.useCallback(
		(index: number, prose: string) => {
			const cur = chunksRef.current;
			if (cur[index] == null || cur[index].prose === prose) return;
			const next = cur.map((c, i) => (i === index ? { ...c, prose } : c));
			onChange(recompile(next));
		},
		[onChange, recompile],
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
