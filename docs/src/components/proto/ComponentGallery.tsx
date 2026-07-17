import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { SingleSlideOptions } from '@/lib/single-slide-render';

// ISOLATED PROTOTYPE — the "Add component" visual gallery. The button the user
// asked for: like the present-mode slide picker, a grid of LIVE previews of
// every available component (rendered by the real engine, not screenshots), so
// you pick by SEEING, not by remembering a name. Grouped by bucket, searchable.

export type GalleryComponent = { name: string; bucket: string; description: string; skeleton: string };

const BUCKET_ORDER = ['anchor', 'statement', 'inventory', 'comparison', 'progression', 'evidence', 'imagery', 'chart', 'diagram', 'math', 'code', 'legal', 'connect'];

// Live thumbnail, lazily mounted the first time it scrolls into view — so
// opening the gallery doesn't spin up 56 engine renderers at once. Once mounted
// it stays mounted (re-mount churn on scroll would be worse than the memory).
function LazyThumb({ options, sample, ratio }: { options: SingleSlideOptions; sample: string; ratio: [number, number] }) {
	const ref = React.useRef<HTMLDivElement>(null);
	const [show, setShow] = React.useState(false);
	React.useEffect(() => {
		const el = ref.current;
		if (!el || show) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					setShow(true);
					io.disconnect();
				}
			},
			{ rootMargin: '120px' },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [show]);
	return (
		<div ref={ref} className="relative w-full overflow-hidden rounded-md bg-[var(--bg,#fff)]" style={{ aspectRatio: `${ratio[0]} / ${ratio[1]}` }}>
			{show ? (
				<DeckPreview options={options} sample={sample} mermaid={false} className="absolute inset-0 m-0 h-full w-full" role="presentation" />
			) : (
				<div className="absolute inset-0 animate-pulse bg-[var(--surface-2,rgba(0,0,0,0.05))]" />
			)}
		</div>
	);
}

export function ComponentGallery({ open, onOpenChange, options, components, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; options: SingleSlideOptions; components: GalleryComponent[]; onPick: (c: GalleryComponent) => void }) {
	const [q, setQ] = React.useState('');
	const groups = React.useMemo(() => {
		const needle = q.trim().toLowerCase();
		const match = (c: GalleryComponent) => !needle || `${c.name} ${c.bucket} ${c.description}`.toLowerCase().includes(needle);
		const byBucket = new Map<string, GalleryComponent[]>();
		for (const c of components) {
			if (!match(c)) continue;
			const list = byBucket.get(c.bucket) ?? [];
			list.push(c);
			byBucket.set(c.bucket, list);
		}
		const order = (b: string) => { const i = BUCKET_ORDER.indexOf(b); return i === -1 ? BUCKET_ORDER.length : i; };
		return [...byBucket.entries()]
			.sort((a, b) => order(a[0]) - order(b[0]))
			.map(([bucket, list]) => ({ bucket, list: [...list].sort((x, y) => x.name.localeCompare(y.name)) }));
	}, [components, q]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] w-[min(92vw,1040px)] max-w-none overflow-hidden p-0 sm:max-w-none">
				<DialogHeader className="border-b border-[var(--rule,rgba(0,0,0,0.1))] px-5 pb-3 pt-4">
					<DialogTitle className="text-base">Add a component</DialogTitle>
					<Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${components.length} components — pick by seeing it`} className="mt-2" />
				</DialogHeader>
				<div className="max-h-[calc(85vh-96px)] overflow-auto px-5 py-4">
					{groups.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No matching component.</p>}
					{groups.map(({ bucket, list }) => (
						<section key={bucket} className="mb-6">
							<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{bucket}</h3>
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
								{list.map((c) => (
									<button
										key={c.name}
										type="button"
										onClick={() => { onPick(c); onOpenChange(false); }}
										className="group flex flex-col overflow-hidden rounded-lg border border-[var(--rule,rgba(0,0,0,0.12))] text-left transition-shadow hover:border-[var(--accent,#6366f1)] hover:shadow-md"
									>
										<LazyThumb options={options} sample={c.skeleton} ratio={[16, 9]} />
										<div className="px-2.5 py-1.5">
											<div className="truncate font-mono text-[12px] font-semibold text-[var(--text-heading,#111)]">{c.name}</div>
											<div className="truncate text-[11px] text-muted-foreground">{c.description}</div>
										</div>
									</button>
								))}
							</div>
						</section>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
