import { ArrowRight, ArrowUp } from 'lucide-react';
import type * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { joinBase } from '@/lib/base-url.mjs';
import { inlineMd } from '@/lib/component-inline';
import { playgroundQuery } from '@/lib/playground-controller';

/**
 * A code block that a keyboard can reach.
 *
 * Below about tablet width these blocks overflow horizontally, and a scroll container
 * nothing can focus is reachable only by pointer — the content past the right edge is
 * simply unavailable to a keyboard user (WCAG 2.1.1). axe reports it as
 * `scrollable-region-focusable`, at 390px only, which is why a desktop-only scan called
 * these pages clean.
 *
 * One component rather than a `tabIndex` on each `<pre>`, so the rule exemption below is
 * argued once instead of three times.
 *
 * A TAB STOP AND NOTHING ELSE — no `role`, no `aria-label`. A `role` would REPLACE the
 * `<pre>` role, and three named `region`s per page is landmark noise that helps nobody;
 * an `aria-label` without one is a name on a generic element, which is not reliably
 * exposed (the linter is right about that). The `label` prop stays because it says at
 * each call site what the block is, and reads as an ordinary React prop rather than an
 * accessibility promise the DOM does not keep.
 */
const ScrollableCode = ({ label, children }: { label: string; children: React.ReactNode }) => (
	// Without the tab stop, the content past the right edge is unreachable by keyboard at
	// mobile width — axe fails it as `scrollable-region-focusable`. See the docblock above.
	// biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG 2.1.1 requires a scrollable region to be focusable
	<pre data-code-block={label} tabIndex={0} className="m-0 overflow-x-auto rounded-md border border-border bg-card p-4">
		{children}
	</pre>
);


// Section heading shared across the docs sections (mono, eyebrow-style rule).
function SectionH2({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="mb-2.5 mt-7 border-b border-border pb-1.5 font-mono text-sm uppercase tracking-wide text-muted-foreground">
			{children}
		</h2>
	);
}

type Manifest = {
	name: string;
	purpose?: string;
	tags?: string[];
	whenToUse?: { title: string; body: string }[];
	antiPatterns?: { title: string; body: string }[];
	commonMistakes?: { mistake: string; fix: string }[];
	slots?: Record<string, { selector: string; required?: boolean; description: string }>;
	skeleton?: string;
	dataShapeGuidance?: string[];
	variants?: string[];
	variantDocs?: Record<string, { label?: string; summary?: string; sample?: string }>;
	variantDecisionRule?: { variant: string; useWhen: string }[];
	related?: { name: string; when: string }[];
};

/**
 * Per-component documentation, rendered to STATIC HTML server-side (no client:
 * directive → zero JS). Faithful to the old ComponentDocs.astro: when/when-not,
 * authoring skeleton, the slots TABLE, anatomy ASCII, variants, related.
 *
 * The variant action buttons keep their `data-variant-select` /
 * `data-open-playground` attributes — the (vanilla, untouched) specimen.js wires
 * them by delegation, so previewing/opening a variant from the docs still works.
 */
export function ComponentDocsView({
	m,
	anatomy,
	nameToBucket,
	base,
}: {
	m: Manifest;
	anatomy: string | null;
	nameToBucket: Record<string, string>;
	base: string;
}) {
	const tags = Array.isArray(m.tags) ? m.tags : [];
	const whenToUse = Array.isArray(m.whenToUse) ? m.whenToUse : [];
	const antiPatterns = Array.isArray(m.antiPatterns) ? m.antiPatterns : [];
	const commonMistakes = Array.isArray(m.commonMistakes) ? m.commonMistakes : [];
	const slots = m.slots && Object.keys(m.slots).length ? Object.entries(m.slots) : [];
	const dataShapeGuidance = Array.isArray(m.dataShapeGuidance) ? m.dataShapeGuidance : [];
	const variantDocs = m.variantDocs || {};
	const variantKeys = Array.isArray(m.variants) ? m.variants.filter((v) => variantDocs[v]) : [];
	const variantDecisionRule = Array.isArray(m.variantDecisionRule) ? m.variantDecisionRule : [];
	const related = Array.isArray(m.related) ? m.related : [];
	const skeleton = (m.skeleton || '').replace(/\n$/, '');

	return (
		<div className="lx-ui leading-relaxed text-foreground">
			{m.purpose && <p className="m-0 text-base text-foreground">{inlineMd(m.purpose)}</p>}

			{tags.length > 0 && (
				<div className="mt-3.5 flex flex-wrap gap-1.5">
					{tags.map((t) => (
						<Badge key={t} className="rounded-full bg-accent px-2.5 font-mono text-[11px] font-normal text-accent-foreground">
							{t}
						</Badge>
					))}
				</div>
			)}

			{whenToUse.length > 0 && (
				<section>
					<SectionH2>When to use</SectionH2>
					<ul className="m-0 list-disc pl-5">
						{whenToUse.map((it) => (
							<li key={it.title} className="my-1.5">
								<strong className="text-[var(--text-heading)]">{inlineMd(it.title)}.</strong> {inlineMd(it.body)}
							</li>
						))}
					</ul>
				</section>
			)}

			{antiPatterns.length > 0 && (
				<section>
					<SectionH2>When not to use</SectionH2>
					<ul className="m-0 list-disc pl-5">
						{antiPatterns.map((it) => (
							<li key={it.title} className="my-1.5">
								<strong className="text-destructive">{inlineMd(it.title)}.</strong> {inlineMd(it.body)}
							</li>
						))}
					</ul>
				</section>
			)}

			{commonMistakes.length > 0 && (
				<section>
					<SectionH2>Common mistakes</SectionH2>
					<ul className="m-0 list-disc pl-5">
						{commonMistakes.map((it) => (
							<li key={it.mistake} className="my-1.5">
								<strong className="text-[var(--text-heading)]">{inlineMd(it.mistake)}</strong> {inlineMd(it.fix)}
							</li>
						))}
					</ul>
				</section>
			)}

			<section>
				<SectionH2>Authoring</SectionH2>
				<ScrollableCode label="Authoring skeleton">
					<code className="whitespace-pre font-mono text-[13px] leading-relaxed text-foreground">{skeleton}</code>
				</ScrollableCode>
			</section>

			{slots.length > 0 && (
				<section>
					<SectionH2>Slots</SectionH2>
					<Table className="text-[13.5px]">
						<TableHeader>
							<TableRow>
								<TableHead className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Slot</TableHead>
								<TableHead className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Selector</TableHead>
								<TableHead className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Required</TableHead>
								<TableHead className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Description</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{slots.map(([name, slot]) => (
								<TableRow key={name} className="align-top">
									<TableCell>
										<code className="font-mono text-[12.5px] text-primary">{name}</code>
									</TableCell>
									<TableCell>
										<code className="font-mono text-[12.5px] text-primary">{slot.selector}</code>
									</TableCell>
									<TableCell>
										<Badge
											variant={slot.required ? 'default' : 'secondary'}
											className={
												slot.required
													? 'rounded-full bg-accent px-2 font-mono text-[11px] font-normal text-accent-foreground'
													: 'rounded-full px-2 font-mono text-[11px] font-normal text-muted-foreground'
											}
										>
											{slot.required ? 'yes' : 'no'}
										</Badge>
									</TableCell>
									<TableCell className="whitespace-normal">{inlineMd(slot.description)}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</section>
			)}

			{dataShapeGuidance.length > 0 && (
				<section>
					<SectionH2>Data shape</SectionH2>
					<ul className="m-0 list-disc pl-5">
						{dataShapeGuidance.map((rule) => (
							<li key={rule} className="my-1.5">
								{inlineMd(rule)}
							</li>
						))}
					</ul>
				</section>
			)}

			{anatomy && (
				<section>
					<SectionH2>Anatomy</SectionH2>
					<ScrollableCode label="Anatomy">
						<code className="whitespace-pre font-mono text-xs leading-tight text-muted-foreground">{anatomy}</code>
					</ScrollableCode>
				</section>
			)}

			{variantDecisionRule.length > 0 && (
				<section>
					<SectionH2>Variant decision rule</SectionH2>
					<ul className="m-0 list-disc pl-5">
						{variantDecisionRule.map((entry) => (
							<li key={entry.variant} className="my-1.5">
								<strong className="text-[var(--text-heading)]">
									{entry.variant === 'default' ? (
										'default (no modifier)'
									) : (
										<code className="font-mono text-primary">{entry.variant}</code>
									)}
								</strong>
								{' — '}
								{inlineMd(entry.useWhen)}
							</li>
						))}
					</ul>
				</section>
			)}

			{variantKeys.length > 0 && (
				<section>
					<SectionH2>Variants</SectionH2>
					{variantKeys.map((v, i) => {
						const vd = variantDocs[v];
						return (
							<div key={v} className={i === 0 ? 'mt-4' : 'mt-4 border-t border-dashed border-border pt-3'}>
								<h3 className="m-0 mb-1 text-[15px] text-[var(--text-heading)]">
									<code className="font-mono text-primary">{v}</code>
									{vd.label && <span className="text-sm font-normal text-muted-foreground"> — {vd.label}</span>}
								</h3>
								{vd.summary && <p className="m-0 mb-2">{inlineMd(vd.summary)}</p>}
								<ScrollableCode label="Variant example">
									<code className="whitespace-pre font-mono text-[13px] leading-relaxed text-foreground">
										{(vd.sample || '').replace(/\n$/, '')}
									</code>
								</ScrollableCode>
								<div className="mt-2 flex flex-wrap gap-2">
									<Button type="button" variant="outline" size="sm" data-variant-select={v}>
										Preview <ArrowUp aria-hidden="true" />
									</Button>
									{/* A Read deep link, not a handoff (decision §4, PR 6): the docs
									    reference points AT the walk position — it carries a pointer,
									    not content, so it can never clobber a draft. */}
									<Button asChild variant="outline" size="sm">
										<a href={joinBase(base, 'playground/') + playgroundQuery({ c: m.name, view: 'read', s: `variant:${v}` })}>
											Explore in Playground <ArrowRight aria-hidden="true" />
										</a>
									</Button>
								</div>
							</div>
						);
					})}
				</section>
			)}

			{related.length > 0 && (
				<section>
					<SectionH2>Related</SectionH2>
					<ul className="m-0 list-none p-0">
						{related.map((r) => {
							const b = nameToBucket[r.name];
							return (
								<li key={r.name} className="my-1.5 flex flex-wrap items-baseline gap-2.5">
									{b ? (
										<Badge asChild variant="outline" className="rounded-full px-2.5 font-mono text-[12.5px] font-normal text-primary">
											<a href={joinBase(base, `components/${b}/${r.name}/`)} className="no-underline">
												{r.name}
											</a>
										</Badge>
									) : (
										<Badge variant="outline" className="rounded-full px-2.5 font-mono text-[12.5px] font-normal text-primary">
											{r.name}
										</Badge>
									)}
									<span className="text-[13.5px] text-muted-foreground">{inlineMd(r.when)}</span>
								</li>
							);
						})}
					</ul>
				</section>
			)}
		</div>
	);
}

export default ComponentDocsView;
