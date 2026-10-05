import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// The hero's right panel: a Preview / Source flip (shadcn Tabs). Preview shows
// the live-rendered slide (engine-rendered, palette/mode-reactive); Source shows
// the syntax-highlighted Markdown that produced it. WRAPS the engine via the
// shared <DeckPreview> bridge — never reimplements the render. The left copy +
// CTAs stay in the Astro page (zero JS); only this interactive flip + live render
// hydrate.

export type HeroData = {
	sample: string;
	drawn: boolean;
	codeHtml: string; // pre-highlighted source (built server-side in the Astro page)
	componentName: string;
	themeBase: string;
	runtimeUrl: string;
	engineUrl: string;
	dagreUrl: string;
	katexUrl: string;
};

export default function HeroPreview({ data }: { data: HeroData }) {
	const [view, setView] = React.useState<'preview' | 'source'>('preview');
	// katexUrl is threaded from index.astro so a hero sample's math is styled from our own
	// origin; a ```mermaid fence needs no URL (the runtime's plugin host loads the diagram
	// library from beside `runtimeUrl`). There is no CDN fallback behind any of it.
	const options = React.useMemo(
		() => ({
			themeBase: data.themeBase,
			runtimeUrl: data.runtimeUrl,
			engineUrl: data.engineUrl,
			dagreUrl: data.dagreUrl,
			katexUrl: data.katexUrl,
		}),
		[data.themeBase, data.runtimeUrl, data.engineUrl, data.dagreUrl, data.katexUrl],
	);

	return (
		<div className="lx-ui flex min-w-0 flex-col gap-3">
			<Tabs value={view} onValueChange={(v) => setView(v as 'preview' | 'source')}>
				<TabsList aria-label="Hero view">
					<TabsTrigger value="preview">Preview</TabsTrigger>
					<TabsTrigger value="source">Source</TabsTrigger>
				</TabsList>

				<TabsContent value="preview">
					{/* Radix TabsContent unmounts the inactive panel (no forceMount), so
					    switching to Source and back REMOUNTS DeckPreview — it re-renders
					    via its whenReady effect on remount (matching the pre-refactor
					    figure). `active` keeps the render correct in either model. */}
					<DeckPreview
						options={options}
						sample={data.sample}
						drawn={data.drawn}
						active={view === 'preview'}
						frame="stage"
						className="live-host relative m-0 aspect-video w-full overflow-hidden"
						aria-label={`A ${data.componentName} slide rendered by Lattice`}
					/>
				</TabsContent>

				<TabsContent value="source">
					<div className="aspect-video overflow-auto rounded-[14px] bg-[var(--surface-inverse)] p-5 shadow-lg">
						<pre className="m-0 whitespace-pre font-mono text-[12.5px] leading-[1.65] text-[var(--on-dark)]">
							{/* Pre-highlighted server-side; spans carry .ln-* classes (landing.css keeps them). */}
							<code
								// biome-ignore lint/security/noDangerouslySetInnerHtml: source is escaped + highlighted server-side in the Astro page.
								dangerouslySetInnerHTML={{ __html: data.codeHtml }}
							/>
						</pre>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
