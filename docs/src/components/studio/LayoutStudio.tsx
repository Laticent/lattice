import { FileCode2, ShieldCheck, TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';
import { CodeField } from './CodeField';

// A starter that PASSES the gate out of the box — palette-blind (every colour a
// token), scoped to `.callout`, and invoked by its skeleton. Edit from here.
// Exported so the unified Studio (Fabricate) can seed the component tab's state.
export const STARTER_NAME = 'callout';
export const STARTER_DESCRIPTION = 'A centered callout — a big accent headline over a supporting line.';
// A complete, gate-valid default manifest so the manual starter (and the panel)
// open with a coherent contract, not blank axes.
export const STARTER_META = {
	function: 'statement',
	form: 'canvas',
	substance: 'prose',
	bucket: 'statement',
	tags: ['callout', 'centered', 'accent'],
	adapt: { mode: 'native' },
	capacity: { sweet: 1, soft: 1, hard: 1 },
};
export const STARTER_CSS = `section.callout {
  display: grid;
  place-content: center;
  gap: 1.25rem;
  padding: 4rem;
  text-align: center;
  background: var(--bg-alt);
}
section.callout h2 {
  margin: 0;
  color: var(--accent);
  font-size: var(--fs-display);
}
section.callout p {
  margin: 0;
  color: var(--text-body);
  font-size: var(--fs-lead);
}`;
export const STARTER_SKELETON = `<!-- _class: callout -->

## A callout that pops

A local component you styled here — palette-blind, scope-checked, live.`;

export type Finding = { level: string; rule: string; line?: number; message: string };

// The component-tab BODY of the unified Studio. Naming, description, save, and
// export now live in Fabricate's shared header (so the Theme and Component tabs
// share one save/export UX), so this is a CONTROLLED editor: it owns no name or
// save state — it renders the CSS + skeleton editors, the live gate findings,
// and the preview, and reports edits up. `findings`/`nameOk` are computed by the
// parent (the same bundled gate) so the header's Save button and this panel agree.
export function LayoutStudio({
	options,
	name,
	css,
	skeleton,
	onCss,
	onSkeleton,
	findings,
	nameOk,
	manifest,
}: {
	options: SingleSlideOptions;
	name: string;
	css: string;
	skeleton: string;
	onCss: (v: string) => void;
	onSkeleton: (v: string) => void;
	findings: Finding[];
	nameOk: boolean;
	// The Manifest panel, rendered as the RIGHT column on desktop (the unified
	// Studio passes it; below desktop it places the panel itself, so this is unset).
	manifest?: React.ReactNode;
}) {
	const errors = findings.filter((f) => f.level === 'error');
	const warnings = findings.filter((f) => f.level !== 'error');
	const ok = errors.length === 0;

	return (
		<div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto md:grid md:overflow-hidden', manifest ? 'md:[grid-template-columns:340px_1fr_360px]' : 'md:[grid-template-columns:360px_1fr]')}>
			<aside className="flex shrink-0 flex-col border-b border-border md:overflow-y-auto md:border-r md:border-b-0">
				<div className="flex min-h-[120px] flex-col border-b border-border px-4 py-3.5">
					<span className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><FileCode2 className="size-3.5" />Styles — <span className="normal-case text-muted-foreground/80">.{name || '…'}-scoped, palette-blind</span></span>
					<CodeField language="css" ariaLabel="Component CSS" value={css} onChange={onCss} className="w-full flex-1 rounded-lg border border-border bg-[var(--bg)] focus-within:border-[var(--accent)]" />
				</div>
				<div className="flex min-h-[100px] flex-col border-b border-border px-4 py-3.5">
					<span className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Skeleton — the slide that uses it</span>
					<CodeField language="markdown" ariaLabel="Component skeleton" value={skeleton} onChange={onSkeleton} className="w-full flex-1 rounded-lg border border-border bg-[var(--bg)] focus-within:border-[var(--accent)]" />
				</div>
				<div className="px-4 py-3.5">
					<div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
						{ok ? <ShieldCheck className="size-3.5 text-[var(--chart-3,#2e6f00)]" /> : <TriangleAlert className="size-3.5 text-[var(--chart-2,#9c3f00)]" />}
						{ok ? (warnings.length ? `Gate — ${warnings.length} note${warnings.length === 1 ? '' : 's'}` : 'Gate — all clear') : `Gate — ${errors.length} to fix`}
					</div>
					{findings.length === 0 ? (
						<p className="text-[12px] text-muted-foreground">Palette-blind and scoped — ready to save.</p>
					) : (
						<ul className="space-y-1.5">
							{findings.map((f) => {
								const isErr = f.level === 'error';
								const color = isErr ? 'var(--chart-2,#9c3f00)' : 'var(--chart-4,#9a6a00)';
								return (
									<li key={`${f.rule}:${f.line ?? ''}:${f.message}`} className="flex items-start gap-2 text-[12px] leading-snug text-foreground">
										<span className="mt-px shrink-0" style={{ color }}><TriangleAlert className="size-3.5" /></span>
										<span><span className="font-mono text-[11px] text-muted-foreground">{f.rule}{f.line ? `:${f.line}` : ''}</span> — {f.message}</span>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</aside>
			<div className="flex flex-col items-center gap-4 bg-card p-4 md:overflow-y-auto md:p-7">
				<span className="self-start font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Live preview — your component, rendered</span>
				{nameOk ? (
					<DeckPreview options={options} sample={skeleton} mermaid={false} extraCss={css} coalesce className="relative aspect-video w-full max-w-[620px] overflow-hidden rounded-xl border border-border bg-background shadow-[0_8px_24px_rgba(10,22,40,.10)]" aria-label="Component preview" />
				) : (
					<div className="grid aspect-video w-full max-w-[620px] place-content-center rounded-xl border border-dashed border-border bg-background text-center text-[13px] text-muted-foreground">Name your component to preview it.</div>
				)}
			</div>
			{manifest && <aside className="shrink-0 border-t border-border bg-card md:overflow-y-auto md:border-l md:border-t-0">{manifest}</aside>}
		</div>
	);
}
