import { LayoutGrid, Sparkles } from 'lucide-react';
import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import { Button } from '@/components/ui/button';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { ComponentGallery, type GalleryComponent } from './ComponentGallery';
import { ComposeEditor } from './ComposeEditor';
import { composeSlide, splitSkeleton } from './lexical-lattice';

// ISOLATED PROTOTYPE — the Compose leg spike shell. Answers the "what is
// markdown?" problem: a person picks a component from a visual gallery and TYPES
// its content richly (no syntax visible), while the real slide renders live
// beside them. The Markdown tab is the proof panel — it shows the Lattice
// markdown the typing GENERATED, so we can see the round-trip with our own eyes.

type Leg = 'compose' | 'markdown';

export default function ComposeProto({ options, components }: { options: SingleSlideOptions; components: GalleryComponent[] }) {
	// Seed with a friendly, prose-friendly component so the first screen isn't blank.
	const first = React.useMemo(() => components.find((c) => c.name === 'title') ?? components.find((c) => c.name === 'statement') ?? components[0], [components]);
	const firstParts = React.useMemo(() => (first ? splitSkeleton(first.skeleton) : { cls: null, directives: [], body: '# Your headline here\n\nSay the one thing that matters.' }), [first]);
	const [componentName, setComponentName] = React.useState(first?.name ?? 'title');
	const [directives, setDirectives] = React.useState<string[]>(firstParts.directives);
	const [seed, setSeed] = React.useState(firstParts.body);
	const [seedToken, setSeedToken] = React.useState(0);
	const [body, setBody] = React.useState(firstParts.body);
	const [leg, setLeg] = React.useState<Leg>('compose');
	const [galleryOpen, setGalleryOpen] = React.useState(false);

	const slideMarkdown = React.useMemo(() => composeSlide(componentName, directives, body), [componentName, directives, body]);

	const pick = React.useCallback((c: GalleryComponent) => {
		const parts = splitSkeleton(c.skeleton);
		setComponentName(c.name);
		setDirectives(parts.directives);
		setSeed(parts.body);
		setBody(parts.body);
		setSeedToken((t) => t + 1); // force the editor to re-import the new skeleton
	}, []);

	const active = components.find((c) => c.name === componentName);

	return (
		<div className="flex h-[100dvh] flex-col bg-[var(--bg,#fff)] text-[var(--text-body,#222)]">
			{/* Top chrome: identity + the component chip + Add-component */}
			<header className="flex items-center gap-3 border-b border-[var(--rule,rgba(0,0,0,0.1))] px-4 py-2.5">
				<div className="flex items-center gap-2">
					<Sparkles className="size-4 text-[var(--accent,#6366f1)]" />
					<span className="text-sm font-semibold">Compose</span>
					<span className="rounded bg-[var(--surface-2,rgba(0,0,0,0.06))] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">prototype</span>
				</div>
				<span className="mx-1 h-5 w-px bg-[var(--rule,rgba(0,0,0,0.12))]" />
				<Button variant="outline" size="sm" onClick={() => setGalleryOpen(true)} className="gap-2">
					<LayoutGrid className="size-4" />
					<span className="font-mono text-[12px]">{componentName}</span>
					<span className="text-muted-foreground">· change</span>
				</Button>
				{active && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{active.description}</span>}
				<div className="ml-auto flex items-center gap-1 rounded-lg bg-[var(--surface-2,rgba(0,0,0,0.05))] p-0.5">
					<LegTab id="compose" leg={leg} setLeg={setLeg}>Compose</LegTab>
					<LegTab id="markdown" leg={leg} setLeg={setLeg}>Markdown</LegTab>
				</div>
			</header>

			{/* Body: active leg (left) + always-live Preview (right) */}
			<div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
				<div className="min-h-0 border-b border-[var(--rule,rgba(0,0,0,0.1))] lg:border-b-0 lg:border-r">
					{leg === 'compose' ? (
						<ComposeEditor seedMarkdown={seed} seedToken={seedToken} componentName={componentName} onMarkdownChange={setBody} />
					) : (
						<div className="h-full overflow-auto">
							<div className="border-b border-[var(--rule,rgba(0,0,0,0.08))] px-4 py-2 text-xs text-muted-foreground">The markdown your typing generated — this is what the engine renders.</div>
							<pre className="whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-relaxed text-[var(--text-body,#222)]">{slideMarkdown}</pre>
						</div>
					)}
				</div>
				<div className="min-h-0 bg-[var(--surface-1,rgba(0,0,0,0.02))]">
					<div className="flex h-full items-center justify-center p-6">
						<div className="w-full" style={{ maxWidth: 'min(100%, 900px)' }}>
							<DeckPreview
								options={options}
								sample={slideMarkdown}
								mermaid={false}
								coalesce
								className="relative m-0 aspect-video w-full overflow-hidden rounded-lg bg-[var(--bg,#fff)] shadow-lg ring-1 ring-[var(--rule,rgba(0,0,0,0.1))]"
								aria-label="Live slide preview"
							/>
						</div>
					</div>
				</div>
			</div>

			<ComponentGallery open={galleryOpen} onOpenChange={setGalleryOpen} options={options} components={components} onPick={pick} />
		</div>
	);
}

function LegTab({ id, leg, setLeg, children }: { id: Leg; leg: Leg; setLeg: (l: Leg) => void; children: React.ReactNode }) {
	const on = leg === id;
	return (
		<button
			type="button"
			onClick={() => setLeg(id)}
			aria-pressed={on}
			className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${on ? 'bg-[var(--bg,#fff)] text-[var(--text-heading,#111)] shadow-sm' : 'text-muted-foreground hover:text-[var(--text-body)]'}`}
		>
			{children}
		</button>
	);
}
