// The SYSTEM diagnostic panel's body: what Lattice sees of this device, the tier it chose, and why.
// Design: engineering/decisions/2026-11-12-device-capability-tiers.md §5.
//
// Loaded lazily by SystemOverlay.tsx (the eager gate) only once the panel is switched on, so a page
// view with it off downloads none of this (the route budget, check:route-budget). It reads the
// browser once and draws the rows lib/system-report.ts builds; the wording and the rules live there,
// under unit tests.

import * as React from 'react';
import { DiagnosticPanel } from '@/components/diagnostics/diagnostic-overlay';
import { Sep } from '@/components/diagnostics/Sep';
import { browserEnv, classify, type DeviceSignals, pinnedTier, readSignals, runCpuProbe } from '@/lib/device-profile';
import { browserName, type ReportRow, type RowStatus, reportRows, reportText } from '@/lib/system-report';
import { setSystemOverlayEnabled } from '@/playground/system-overlay-prefs';

// The rating colors the Perf and Storage overlays use, so the diagnostics read as one family.
// Hex literals are the established convention for these React diagnostic islands (HARD RULE #3
// governs engine and theme CSS); 'unknown' is the neutral dot.
const STATUS_COLOR: Record<RowStatus, string> = { ok: '#16a34a', warn: '#d97706', bad: '#dc2626', unknown: '#52525b' };

type NavExtras = Navigator & {
	connection?: { effectiveType?: string; saveData?: boolean };
	userAgentData?: { brands?: { brand: string; version: string }[] };
};

export default function SystemOverlayPanel() {
	const [signals, setSignals] = React.useState<DeviceSignals | null>(null);
	const [storage, setStorage] = React.useState<{ usage: number; quota: number } | null>(null);
	const [probing, setProbing] = React.useState(false);
	const [copied, setCopied] = React.useState(false);

	// Read once on open. The WebGL read makes (and releases) one context, so it is not polled.
	React.useEffect(() => {
		setSignals(readSignals(browserEnv(window)));
		let alive = true;
		// Read directly rather than through storage-metrics' estimateQuota: sharing that module with this
		// lazy chunk split it out of the Storage overlay's eager chunk, and the split alone cost every page
		// about 1 KB of eager JS (check:route-budget's per-PR allowance).
		void navigator.storage
			?.estimate?.()
			.then(({ usage, quota }) => {
				if (alive && typeof usage === 'number' && typeof quota === 'number') setStorage({ usage, quota });
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, []);

	// The speed test blocks this page for about 140 ms by design (decision note §3.2), so it runs only
	// when asked. The paint first shows "Running…", then the probe runs on the next task.
	const runProbe = () => {
		setProbing(true);
		window.setTimeout(() => {
			const { score } = runCpuProbe({ now: () => performance.now() });
			setSignals((s) => (s ? { ...s, cpuScore: score } : s));
			setProbing(false);
		}, 0);
	};

	if (!signals) return null;
	const nav = navigator as NavExtras;
	const pinned = pinnedTier(location.search);
	const profile = classify(signals);
	const shown = pinned ? { ...profile, tier: pinned } : profile;
	const rows = reportRows({
		profile: shown,
		signals,
		pinned,
		browser: browserName(nav.userAgent, nav.userAgentData?.brands),
		storage,
		network: nav.connection ? { effectiveType: nav.connection.effectiveType, saveData: nav.connection.saveData } : null,
		reducedMotion: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
		reducedData: !!window.matchMedia?.('(prefers-reduced-data: reduce)').matches,
	});

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(reportText(rows));
			setCopied(true);
		} catch {
			setCopied(false);
		}
	};

	const sections: { name: ReportRow['section']; rows: ReportRow[] }[] = [];
	for (const r of rows) {
		const last = sections[sections.length - 1];
		if (last && last.name === r.section) last.rows.push(r);
		else sections.push({ name: r.section, rows: [r] });
	}

	return (
		<DiagnosticPanel posKey="lattice-system-overlay-pos" label="system" onClose={() => setSystemOverlayEnabled(false)} closeLabel="Hide system panel" testId="system-overlay" panelClassName="w-[268px]">
			<div className="max-h-[52svh] overflow-y-auto overscroll-contain" data-tier={shown.tier}>
				{sections.map((sec) => (
					<React.Fragment key={sec.name}>
						{sec.name !== 'Tier' && <Sep label={sec.name} />}
						<dl className="m-0">
							{sec.rows.map((r) => (
								<div key={`${r.label}:${r.value}`} className="flex items-start gap-2 py-[3px] text-[11px] leading-[1.35]">
									<span aria-hidden className="mt-[3px] size-2 shrink-0 self-start rounded-full" style={{ background: STATUS_COLOR[r.status] }} />
									<dt className="w-[92px] shrink-0 text-muted-foreground">{r.label}</dt>
									<dd className={sec.name === 'Tier' && r.label === 'Tier' ? 'm-0 min-w-0 flex-1 break-words font-semibold text-popover-foreground' : 'm-0 min-w-0 flex-1 break-words text-popover-foreground'} title={r.detail}>{r.value}</dd>
								</div>
							))}
						</dl>
					</React.Fragment>
				))}
			</div>
			{/* The actions sit outside the scroll area, so they stay in reach on a short phone screen. */}
			<div className="shrink-0">
				{/* Text-only buttons, like the read-aloud overlay's "copy trace": a lucide icon shared with an eager chunk
				    is split into its own eager chunk the moment this lazy panel imports it, and lucide's Copy did
				    exactly that (+202 gz bytes on every page, check:route-budget). */}
				<div className="mt-2 flex gap-1.5">
					<button type="button" onClick={runProbe} disabled={probing} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-popover-foreground hover:bg-muted/60 disabled:opacity-60">
						{probing ? 'Running…' : 'Run speed test'}
					</button>
					<button type="button" onClick={copy} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-popover-foreground hover:bg-muted/60">
						{copied ? 'Copied' : 'Copy report'}
					</button>
				</div>
				<p className="mb-0 mt-1.5 text-[9.5px] leading-[1.4] text-muted-foreground">The speed test pauses this page for about a fifth of a second. A gray dot means the browser doesn't report that value.</p>
			</div>
		</DiagnosticPanel>
	);
}
