import { Check, Copy, LifeBuoy, ShieldAlert, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { PanelBody, PanelEmpty, PanelHeader, PanelSection, PanelSheet } from '@/components/ui/panel';
import {
	type CrashReport,
	crashReportTitle,
	dismissCrashReport,
	elapsedLabel,
	formatCrashReport,
} from '@/lib/crash-sentinel';
import { buildFeedbackIssueUrl } from '@/lib/feedback-issue';

/**
 * The crash report panel — what the Studio knows about a session that ended
 * without closing cleanly.
 *
 * Reporting rides the EXISTING feedback path (lib/feedback-issue.ts): a
 * pre-filled deep link into GitHub's own new-issue form, submitted under the
 * user's own login. No token, no endpoint, no beacon — the site is a static
 * bundle and this report is local until the user decides otherwise (HARD RULE
 * #15: the reuse, and #24's posture: nothing here talks to a server of ours).
 *
 * The copy is careful about what it can prove. An unclosed record means the
 * session ended without a clean unload; it does NOT prove a crash, and the panel
 * reports only what it MEASURED and never names a cause — no browser will tell
 * a page why a tab died. That is the same discipline the chunk-load fallback follows in
 * ErrorBoundary.tsx — state what is observable, infer only what the evidence
 * carries.
 */

function when(ms: number): string {
	const d = new Date(ms);
	return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function ran(ms: number): string {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.round(s / 60);
	return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function CrashReportSheet({
	open,
	onOpenChange,
	reports,
	onDismiss,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	/** Newest first. The panel shows the newest and lists the rest. */
	reports: CrashReport[];
	/** Called after a report is discarded, so the host can drop it from its state. */
	onDismiss: (id: string) => void;
}) {
	const [selected, setSelected] = React.useState(0);
	// Land on the newest report every time the panel opens, and never hold an index
	// past the end after a dismissal shortens the list.
	React.useEffect(() => {
		if (open) setSelected(0);
	}, [open]);
	const report = reports[Math.min(selected, Math.max(0, reports.length - 1))];

	const markdown = React.useMemo(() => (report ? formatCrashReport(report) : ''), [report]);

	// The issue body IS the report the user just read — same bytes, no second
	// rendering to drift from it. `summary` names the verdict so the issue list
	// distinguishes an out-of-memory report from a plain unexplained one.
	const issueUrl = React.useMemo(
		() =>
			report
				? buildFeedbackIssueUrl({
						category: 'bug',
						summary: `Studio session ended unexpectedly — ${crashReportTitle(report).toLowerCase()}`,
						details: markdown,
						context: { Area: 'Studio crash report' },
					})
				: '',
		[report, markdown],
	);

	const [copied, setCopied] = React.useState(false);
	const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	React.useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(markdown);
			setCopied(true);
			if (copyTimer.current) clearTimeout(copyTimer.current);
			copyTimer.current = setTimeout(() => setCopied(false), 1600);
		} catch {
			/* clipboard unavailable (permissions / insecure context) — the GitHub link still works */
		}
	};

	const discard = () => {
		if (!report) return;
		dismissCrashReport(report.id);
		onDismiss(report.id);
		if (reports.length <= 1) onOpenChange(false);
		else setSelected(0);
	};

	return (
		<PanelSheet open={open} onOpenChange={onOpenChange} side="right" width="md">
			<PanelHeader
				icon={<ShieldAlert />}
				title="Crash report"
				srDescription="What the Studio recorded about a session that ended without closing cleanly."
			/>
			<PanelBody className="space-y-5">
				{!report ? (
					<PanelEmpty icon={<LifeBuoy />} title="Nothing to report">
						No session has ended unexpectedly on this device.
					</PanelEmpty>
				) : (
					<>
						<div className="rounded-xl border border-border bg-background p-3">
							<p className="text-[13px] font-semibold text-[var(--text-heading)]">{report.headline}</p>
							<p className="mt-2 text-[11px] text-muted-foreground">
								{when(report.startedAt)} · ran {ran(report.durationMs)} · last sign of life {when(report.endedAt)}
							</p>
						</div>

						{/* The caveat is suppressed ONLY where the browser itself stated the
						    reason (`confirmed`). It used to key off `ending`, which meant the
						    page-cache branch — an INFERENCE — shipped the strongest sentence with
						    no hedge at all. Weakest evidence, loudest claim: exactly the failure
						    this rewrite existed to remove.
						    No "likely cause" line. The browser will not tell a page why a tab
						    died — verified: after a real renderer crash, the next load sees no
						    crash report at all; that answer only goes to a server endpoint,
						    which this site deliberately does not have. The earlier design
						    guessed anyway and guessed badly, printing "no clear cause" directly
						    above its own evidence of a 9x memory rise. So the panel reports what
						    was MEASURED and lets the reader draw the conclusion. */}
						{!report.confirmed && (
							<p className="rounded-lg border border-border bg-[var(--accent-soft)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--text-heading)]">
								The Studio can tell you that this session ended, and what it was doing. It cannot tell you why — no browser will tell a page that.
								{report.sameTab ? ' The tab did come back on its own, so it was not closed by hand.' : ' It also cannot tell a crash apart from a force-quit or a shutdown.'} What it recorded is below.
							</p>
						)}


						<PanelSection label="What was measured">
							<ul className="space-y-1.5">
								{report.facts.map((f: string) => (
									<li key={f} className="flex gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
										<span aria-hidden="true" className="mt-[7px] size-1 shrink-0 rounded-full bg-[var(--accent)]" />
										<span className="min-w-0">{f}</span>
									</li>
								))}
							</ul>
						</PanelSection>

						{/* THE ANSWER TO "what am I supposed to do with this?" — the question the
						    first real report earned. Facts alone put the work of deciding what
						    they mean onto the reader, who is the one person in the loop who
						    cannot know. Every line is derived from THIS record (see
						    `describeSession`), and when nothing can be narrowed it says that
						    rather than inventing a chore. Given the accent card so the eye
						    lands here rather than on the measurement list above it. */}
						{report.steps.length > 0 && (
							<PanelSection label="What you can try">
								<ul className="space-y-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[var(--accent-soft)] p-2.5">
									{report.steps.map((s: string) => (
										<li key={s} className="flex gap-2 text-[12.5px] leading-relaxed text-[var(--text-heading)]">
											<span aria-hidden="true" className="mt-[7px] size-1 shrink-0 rounded-full bg-[var(--accent)]" />
											<span className="min-w-0">{s}</span>
										</li>
									))}
								</ul>
							</PanelSection>
						)}

						{report.record.failedLoads && report.record.failedLoads.length > 0 && (
							<PanelSection label="Files that failed to load">
								<ul className="max-h-32 space-y-1 overflow-auto rounded-lg border border-border bg-card p-2">
									{report.record.failedLoads.map((u: string) => (
										<li key={u} className="break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
											{u}
										</li>
									))}
								</ul>
							</PanelSection>
						)}

						{/* Deliberately BELOW the findings and the next steps. This block is
						    consent material, not a finding — and on a 390px phone the browser's
						    user-agent string alone runs four lines, which pushed everything
						    worth reading off the first screen. What happened, then what to do,
						    then what gets sent.
						    SHOW WHAT WE POST. The issue body carries the page, the browser and
						    every context label, and the panel used to render none of them —
						    while the footer told the reader to "trim anything you'd rather not
						    share" about content it never displayed. Anything that goes into the
						    issue is visible here first, or the invitation to review it is a
						    fiction. */}
						<PanelSection label="What gets shared">
							<dl className="space-y-1 rounded-lg border border-border bg-card p-2 text-[11.5px]">
								{[['Page', report.record.page], ['Browser', report.record.ua], ...Object.entries(report.record.context)].map(([k, v]) =>
									v ? (
										<div key={k} className="flex gap-2">
											<dt className="w-20 shrink-0 text-muted-foreground">{k}</dt>
											<dd className="min-w-0 break-words text-[var(--text-heading)]">{v}</dd>
										</div>
									) : null,
								)}
							</dl>
						</PanelSection>

						{report.record.lastError && (
							<PanelSection label="Last error">
								<pre className="max-h-48 overflow-auto rounded-lg border border-border bg-card p-2 text-[11px] leading-relaxed text-muted-foreground">
									{report.record.lastError.message}
									{report.record.lastError.stack ? `\n${report.record.lastError.stack}` : ''}
								</pre>
							</PanelSection>
						)}

						<PanelSection label="Trail">
							{report.record.crumbs.length ? (
								<ol className="max-h-64 space-y-1 overflow-auto rounded-lg border border-border bg-card p-2">
									{report.record.crumbs.map((c, i) => (
										// The trail is a FROZEN historical record — read from storage once, never
										// appended to, reordered or filtered. The index is needed because the same
										// labeled step can legitimately repeat at the same offset (two renders
										// inside one tick), which collides on `${t}-${k}` alone.
										// biome-ignore lint/suspicious/noArrayIndexKey: a frozen, never-reordered list — the index IS stable identity here.
										<li key={`${c.t}-${c.k}-${i}`} className="flex gap-2 text-[11px] leading-relaxed">
											<span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{elapsedLabel(c.t)}</span>
											<span className="w-16 shrink-0 text-muted-foreground">{c.k}</span>
											<span className="min-w-0 break-words text-[var(--text-heading)]">{c.m}</span>
										</li>
									))}
								</ol>
							) : (
								<p className="text-[12px] text-muted-foreground">No breadcrumbs were recorded before the end.</p>
							)}
						</PanelSection>

						{reports.length > 1 && (
							<PanelSection label={`Earlier reports (${reports.length - 1})`}>
								<div className="space-y-1.5">
									{reports.map((r, i) => (
										<button
											key={r.id}
											type="button"
											onClick={() => setSelected(i)}
											aria-pressed={i === selected}
											className={`flex w-full items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-left text-[12px] ${
												i === selected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border bg-background hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]'
											}`}
										>
											<span className="min-w-0 truncate font-semibold text-[var(--text-heading)]">{crashReportTitle(r)}</span>
											<span className="shrink-0 text-[11px] text-muted-foreground">{when(r.endedAt)}</span>
										</button>
									))}
								</div>
							</PanelSection>
						)}

						{/* The shared shadcn `Button`, not hand-rolled classes (HARD RULE #15).
						    The first cut copied ErrorBoundary's hand-built buttons, and shipped an
						    INVISIBLE primary action: a solid accent block with no readable label.
						    Measured on the real panel — the anchor computed to
						    `color: rgb(122,90,16)` on a `rgb(122,90,16)` background, with
						    `--on-accent` resolving to #fff the whole time. Cause is the cascade
						    trap landing.css already documents at its `a { color: var(--accent) }`
						    rule: that rule is UNLAYERED, Tailwind's color utilities are layered,
						    and unlayered beats layered regardless of specificity (HARD RULE #26).
						    So `text-[var(--on-accent)]` on an <a> silently loses. The escape hatch
						    is exactly this component: `.lx-ui a[data-slot='button'][data-variant]`
						    is mapped back, unlayered, in landing.css. ErrorBoundary is unaffected
						    — its recovery controls are <button>, which that `a` rule never reaches.
						    `asChild` keeps this a real <a href> — a genuine navigation no popup
						    blocker intercepts, with a URL the user can inspect first. */}
						<div className="flex flex-wrap items-center gap-2 pt-1">
							<Button asChild>
								<a href={issueUrl} target="_blank" rel="noreferrer noopener">
									Report on GitHub
								</a>
							</Button>
							<Button type="button" variant="outline" className="gap-1.5" onClick={copy}>
								{copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
								{copied ? 'Copied' : 'Copy report'}
							</Button>
							<Button type="button" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={discard}>
								<Trash2 className="size-3.5" aria-hidden="true" />
								Discard
							</Button>
						</div>
						<p className="text-[11px] leading-relaxed text-muted-foreground">
							This report never left your browser. “Report on GitHub” opens a pre-filled issue under your own account — read it over, trim
							anything you'd rather not share, and submit it yourself.
						</p>
					</>
				)}
			</PanelBody>
		</PanelSheet>
	);
}
