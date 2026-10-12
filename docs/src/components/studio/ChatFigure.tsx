import { Code2, Image as ImageIcon } from 'lucide-react';
import * as React from 'react';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { ChatCodeBlock } from './ChatCodeBlock';
import { figureLabel, figureSample } from './chat-figures';
import { PooledThumbFace } from './preview-pool';
import type { ExtraTheme } from './share-export';

// A fenced figure in an Architect reply, drawn instead of printed: a mermaid diagram, an equation,
// a plot, or a whole Lattice slide. The reply's own fence is the source; the author can flip to it.
//
// DRAWN BY A POOL, NOT A FRAME PER FIGURE. `ArchitectChat` wraps its transcript in a `PreviewPool`
// of its own and each figure is a tile in it, so a conversation with forty figures holds about four
// live documents. Measured against one iframe each and against baking to SVG in
// engineering/decisions/2026-10-12-chat-figures-bakeoff.md (+95 to +159 MB at 40 figures against
// +325 to +641 MB for one iframe each; baking costs 24 to 45 s for 40).
//
// The pool renders through `createSingleSlideRenderer`, the same renderer the Studio preview uses,
// so the figure is drawn by the engine and runtime the deck is drawn by, under the deck's own theme
// and plugin admission. Nothing here writes markup into the page: the pooled frame is an iframe.

/** What a figure needs from the host to draw as the open deck would. `grounding.fitRender` carries
 *  the first five; `frontMatter` is the deck's own front-matter block. */
export type ChatFigureRender = {
	options: SingleSlideOptions;
	palette: string;
	mode: 'light' | 'dark';
	extra?: ExtraTheme;
	extraCss?: string;
	frontMatter: string;
};

export const ChatFigureContext = React.createContext<ChatFigureRender | null>(null);

export function ChatFigure({ lang, code }: { lang: string; code: string }) {
	const render = React.useContext(ChatFigureContext);
	const [source, setSource] = React.useState(false);
	const sample = React.useMemo(() => (render ? figureSample(lang, code, render.frontMatter) : null), [render, lang, code]);
	// No host context (a surface that mounts the chat without a deck), or a figure too large to draw:
	// the code block is the honest rendering.
	if (!render || !sample) return <ChatCodeBlock code={code} lang={lang} />;
	if (source) return <FigureFrame label={figureLabel(lang)} showing="source" onToggle={() => setSource(false)}><ChatCodeBlock code={code} lang={lang} /></FigureFrame>;
	return (
		<FigureFrame label={figureLabel(lang)} showing="figure" onToggle={() => setSource(true)}>
			{/* `specimen`: a figure the author did not write into the deck has no overflow alarm to raise. */}
			<PooledThumbFace options={render.options} sample={sample} paletteOverride={render.palette} extraTheme={render.extra} modeOverride={render.mode} extraCss={render.extraCss} specimen className="pointer-events-none aspect-video w-full" />
		</FigureFrame>
	);
}

function FigureFrame({ label, showing, onToggle, children }: { label: string; showing: 'figure' | 'source'; onToggle: () => void; children: React.ReactNode }) {
	return (
		<figure className="mx-0 my-1.5 flex flex-col gap-1" data-testid="chat-figure" data-showing={showing}>
			{children}
			<figcaption className="flex items-center justify-between gap-2 px-0.5 text-[10.5px] text-muted-foreground">
				<span className="font-mono uppercase tracking-widest">{label}</span>
				<button type="button" onClick={onToggle} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]" aria-label={showing === 'figure' ? `Show the ${label.toLowerCase()} source` : `Show the ${label.toLowerCase()}`}>
					{showing === 'figure' ? <Code2 className="size-3" /> : <ImageIcon className="size-3" />}
					{showing === 'figure' ? 'Source' : 'Figure'}
				</button>
			</figcaption>
		</figure>
	);
}
