// Live STORAGE diagnostic overlay — a small on-screen readout of the client-side
// state that accumulates in a REGULAR profile but never in private browsing, which
// is exactly why an incognito reload stays fast while a normal one slowly degrades
// (engineering/decisions/2026-07-21-storage-accumulation-diagnostic.md). It shows
// the origin's storage-quota usage, the Studio's localStorage footprint broken
// down by category, the service-worker Cache Storage entry counts, and a LIVE
// full-scan timing — the same O(n) boot-path cost (hasPriorStudioUse /
// deckContentStats / loadDeckList) that grows as the store fills.
//
// Mirrors PerfOverlay.tsx / ViewportDebugOverlay.tsx: a React island that renders
// NOTHING (and measures nothing) until the shared pref is on (storage-overlay-
// prefs.ts — the Studio switch + the `?storage` param), so a normal page view pays
// nothing. The draggable shell + the enable/singleton gate are the shared
// diagnostic-overlay chassis (diagnostic-overlay.tsx); this file is only the
// storage read + the readout body. While mounted it re-scans on a ~1.5s poll and
// on every storage / visibility change.

import * as React from 'react';
import { DiagnosticPanel, type OverlayClaim, useDiagnosticGate } from '@/components/diagnostics/diagnostic-overlay';
import { Sep } from '@/components/diagnostics/Sep';
import { cn } from '@/lib/utils';
import {
	type CacheScan,
	estimateQuota,
	formatBytes,
	formatMs,
	type LocalScan,
	type QuotaEstimate,
	type Rating,
	rate,
	scanCaches,
	scanLocalStorage,
} from '@/playground/storage-metrics';
import {
	applyStorageOverlayUrlParam,
	onStorageOverlayEnabledChange,
	STORAGE_OVERLAY_AVAILABLE,
	setStorageOverlayEnabled,
	storageOverlayEnabled,
} from '@/playground/storage-overlay-prefs';

// Per-overlay singleton token — a duplicate include of THIS overlay still shows one.
const claim: OverlayClaim = { held: false };

export default function StorageOverlay() {
	const active = useDiagnosticGate({
		available: STORAGE_OVERLAY_AVAILABLE,
		isEnabled: storageOverlayEnabled,
		subscribe: onStorageOverlayEnabledChange,
		applyUrlParam: applyStorageOverlayUrlParam,
		claim,
	});
	if (!active) return null;
	return <Overlay />;
}

// The value-rating palette, mirrored from the performance overlay (MetricDetail's
// RATING_COLOR) so the two debug popups read the same. Hardcoded hexes are the
// established convention for these docs-site diagnostic islands (HARD RULE #3
// governs engine/theme CSS, not React chrome); NEUTRAL is the neutral / no-rating dot.
const RATING_COLOR: Record<Rating, string> = { good: '#16a34a', 'needs-improvement': '#d97706', poor: '#dc2626' };
const NEUTRAL = '#52525b';
const colorFor = (r: Rating | null) => (r ? RATING_COLOR[r] : NEUTRAL);

// The mounted overlay — scans storage only while shown (mount = poll, unmount =
// interval + listeners torn down).
function Overlay() {
	const [local, setLocal] = React.useState<LocalScan | null>(null);
	const [quota, setQuota] = React.useState<QuotaEstimate | null>(null);
	// `cacheScan`, not `caches` — the global Cache Storage `caches` API lives in this
	// scope too, and shadowing it invites a future direct-`caches.*` footgun.
	const [cacheScan, setCacheScan] = React.useState<CacheScan | null>(null);
	// Whether the async APIs (quota / Cache Storage) have answered at least once, so
	// "—" reads as "measuring" on first paint but "unavailable" once they've resolved null.
	const [asyncReady, setAsyncReady] = React.useState(false);
	// Which row's explanation is PINNED open (tap / click). Touch has no hover, so a tap
	// must latch the detail; a second tap closes it. Single-open keeps the panel calm.
	const [open, setOpen] = React.useState<string | null>(null);
	const [hover, setHover] = React.useState<string | null>(null);
	const canHover = React.useRef(false);
	React.useEffect(() => {
		canHover.current = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
	}, []);

	React.useEffect(() => {
		let alive = true;
		const readSync = () => setLocal(scanLocalStorage());
		// A monotonic generation guards against out-of-order async resolution: a slow
		// scan (the Cache Storage walk is slower exactly when the cache is bloated — the
		// case this tool is for) from tick N must not clobber tick N+1's fresher answer.
		let gen = 0;
		const readAsync = async () => {
			const mine = ++gen;
			const [q, c] = await Promise.all([estimateQuota(), scanCaches()]);
			if (!alive || mine !== gen) return;
			setQuota(q);
			setCacheScan(c);
			setAsyncReady(true);
		};
		const readAll = () => {
			readSync();
			void readAsync();
		};
		readAll();
		// Skip the poll's work while the tab is hidden — a backgrounded overlay measuring
		// nothing anyone's looking at is pure GC churn on the (big) store; the
		// `visibilitychange` handler re-reads the moment the tab returns.
		const id = window.setInterval(() => {
			if (document.visibilityState === 'visible') readAll();
		}, 1500);
		// A write in ANOTHER tab fires `storage`; a burst (tab A autosaving while this
		// overlay is open in tab B) would otherwise fire one full synchronous store scan
		// PER write. Coalesce to at most one rescan per animation frame.
		let rafId = 0;
		const onStorage = () => {
			if (rafId) return;
			rafId = requestAnimationFrame(() => {
				rafId = 0;
				readSync();
			});
		};
		const onVis = () => document.visibilityState === 'visible' && readAll();
		window.addEventListener('storage', onStorage);
		document.addEventListener('visibilitychange', onVis);
		return () => {
			alive = false;
			window.clearInterval(id);
			if (rafId) cancelAnimationFrame(rafId);
			window.removeEventListener('storage', onStorage);
			document.removeEventListener('visibilitychange', onVis);
		};
	}, []);

	// ── Derived ratings ───────────────────────────────────────────────────────
	// Quota %: shown for context but DELIBERATELY UNRATED. `storage.estimate()` returns a
	// coarse, padded quota (often tens–hundreds of GB — ~60% of free disk on Chrome), and
	// some browsers exclude localStorage from `usage` entirely, so the ratio is ~0% no
	// matter how bloated the profile is. A green "quota" chip here would be false comfort
	// during the exact slowdown this tool explains — so it gets a neutral dot, never a rating.
	const pct = quota && quota.quota > 0 ? Math.round((quota.usage / quota.quota) * 100) : null;
	// localStorage caps at ~5MB: green under 1MB, amber to 3MB, red beyond.
	const localRating: Rating | null = local ? rate(local.bytes, 1024 * 1024, 3 * 1024 * 1024) : null;
	// The SW assets cache caps at 300 (+ pages 60 + fonts 40 = 400): green under 250, red near the cap.
	const cacheRating: Rating | null = cacheScan ? rate(cacheScan.totalEntries, 250, 350) : null;
	// The boot-scan proxy: a healthy store reads in <1ms; a bloated one drags. (This is the
	// localStorage READ time only — the parse the boot adds on top is not counted; see the row.)
	const scanRating: Rating | null = local ? rate(local.scanMs, 5, 20) : null;

	const rowState = (key: string) => ({
		expanded: open === key || (canHover.current && hover === key),
		pinned: open === key,
		onToggle: () => setOpen((o) => (o === key ? null : key)),
		onHover: (on: boolean) => canHover.current && setHover(on ? key : (h) => (h === key ? null : h)),
	});

	const maxCat = local?.categories.length ? Math.max(...local.categories.map((c) => c.bytes)) : 0;
	const maxCache = cacheScan?.caches.length ? Math.max(...cacheScan.caches.map((c) => c.entries)) : 0;

	return (
		<DiagnosticPanel
			posKey="lattice-storage-overlay-pos"
			label="storage · live"
			onClose={() => setStorageOverlayEnabled(false)}
			closeLabel="Hide storage overlay"
			id="lattice-storage-overlay"
			panelClassName="w-[248px] font-mono"
		>
			{local == null ? (
				<div className="text-[11px] text-muted-foreground">Measuring…</div>
			) : (
				<div className="max-h-[64svh] overflow-y-auto overscroll-contain">
					{/* Verdict strip — the at-a-glance answers. SCAN is here too: it's the
					    thesis metric (the boot read cost), so it belongs in the glance-view,
					    not buried below. Quota is unrated (neutral dot) — see above. */}
					<div className="mb-1.5 flex flex-wrap gap-1">
						<Chip label="local" value={formatBytes(local.bytes)} rating={localRating} />
						<Chip label="scan" value={formatMs(local.scanMs)} rating={scanRating} />
						<Chip label="caches" value={cacheScan == null ? '—' : `${cacheScan.totalEntries}`} rating={cacheRating} />
						<Chip label="quota" value={pct == null ? '—' : `${pct}%`} rating={null} />
					</div>

					<Sep label="quota" />
					<Row
						{...rowState('quota')}
						label="used"
						value={quota == null ? (asyncReady ? 'n/a' : '…') : `${formatBytes(quota.usage)} / ${formatBytes(quota.quota)}`}
						rating={null}
						what="Everything this site has stored on your device, from the browser's own Storage API — it counts Cache Storage and IndexedDB, not just the decks below."
						rel={
							quota == null
								? asyncReady
									? 'the Storage API is unavailable on this browser.'
									: null
								: quota.usage < local.bytes
									? `only ${formatBytes(quota.usage)} — LESS than the ${formatBytes(local.bytes)} of local storage below, because this browser (e.g. iOS Safari) excludes localStorage from the estimate. Trust the footprint + scan, not this.`
									: pct != null
										? `${pct}% of a quota the browser reports coarsely (often GBs) — a low % here does NOT mean the boot is cheap; read local + scan below.`
										: null
						}
					/>

					<Sep label="local storage" />
					<Row
						{...rowState('local')}
						label="footprint"
						value={`${local.keys} keys · ${formatBytes(local.bytes)}`}
						rating={localRating}
						what="The Studio persists your decks, edits, checkpoints, AI chats, and preview snapshots here. The app re-reads and re-parses this on every boot, so a bigger store means a slower reload — the tax private browsing never pays."
						rel={local.largest ? `biggest single item: ${keyShort(local.largest.key)} at ${formatBytes(local.largest.bytes)}.` : 'empty — nothing stored yet.'}
					/>
					{local.categories.length > 0 && (
						<div className="mt-0.5 flex flex-col gap-1 pb-0.5">
							{local.categories.map((c) => (
								<Bar key={c.key} label={c.label} count={c.keys} detail={formatBytes(c.bytes)} frac={maxCat ? c.bytes / maxCat : 0} />
							))}
						</div>
					)}

					<Sep label="caches (service worker)" />
					<Row
						{...rowState('caches')}
						label="entries"
						value={cacheScan == null ? (asyncReady ? 'n/a' : '…') : `${cacheScan.totalEntries}`}
						rating={cacheRating}
						what="The service worker keeps a stale-while-revalidate copy of assets so the site works offline. It re-validates and trims on every request, and accumulates across deploys — a fresh private window's cache is empty, so it skips that work."
						rel={cacheScan == null ? (asyncReady ? "no service worker here (dev / private browsing), so this row can't show the cache a returning visitor accumulates in a normal, deployed window." : null) : `${cacheScan.caches.length} cache${cacheScan.caches.length === 1 ? '' : 's'} · assets cap is 300.`}
					/>
					{cacheScan && cacheScan.caches.length > 0 && (
						<div className="mt-0.5 flex flex-col gap-1 pb-0.5">
							{cacheScan.caches.map((c) => (
								<Bar key={c.name} label={cacheShort(c.name)} count={c.entries} frac={maxCache ? c.entries / maxCache : 0} />
							))}
						</div>
					)}

					<Sep label="boot cost" />
					<Row
						{...rowState('scan')}
						label="scan"
						value={formatMs(local.scanMs)}
						rating={scanRating}
						what="How long it just took to READ every localStorage entry — the O(n) scan the boot path pays (like hasPriorStudioUse / deckContentStats). The per-deck parse the boot ALSO does (splitSlides / JSON.parse in loadDeckList) costs more and isn't counted here, so treat this as a floor, not the whole boot. Near zero on an empty store; climbs as it fills."
						rel={`over ${local.keys} key${local.keys === 1 ? '' : 's'}. Browsers coarsen this timer (Firefox private rounds it hard), so read it as a threshold, not a stopwatch. Clear decks in Workspace → Privacy & Data to reset it.`}
					/>

					<p className="mb-0 mt-1.5 text-[9.5px] leading-[1.4] text-muted-foreground">
						Private browsing starts empty every session, so it never pays these costs — why an incognito reload stays fast while a normal one degrades. Tap a row for what it means.
					</p>
				</div>
			)}
		</DiagnosticPanel>
	);
}

/** Shorten a localStorage key for the "biggest item" line (drop the long prefix). */
function keyShort(key: string): string {
	return key.replace(/^lattice-(studio-|docs-)?/, '').slice(0, 28) || key;
}
/** Shorten a cache name to its bucket (`lattice-v1-assets` → `assets`). */
function cacheShort(name: string): string {
	return name.replace(/^lattice-v\d+-/, '') || name;
}

// A verdict chip — one computed answer with a rating dot. Mirrors the performance
// overlay's compact HUD styling (a colored dot + label + value), so the two debug
// popups read as one family.
function Chip({ label, value, rating }: { label: string; value: string; rating: Rating | null }) {
	return (
		<span className="inline-flex items-baseline gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
			<span aria-hidden className="inline-block size-2 shrink-0 self-center rounded-full" style={{ background: colorFor(rating) }} />
			<span className="opacity-80">{label}</span>
			<span className="font-semibold tabular-nums text-popover-foreground">{value}</span>
		</span>
	);
}

// One metric row: a rating dot + label + live value, tappable (touch) / hoverable
// (desktop) to reveal its plain-language definition + a live relationship line.
// A real <button> so it's keyboard-focusable and announces aria-expanded.
function Row({
	label,
	value,
	rating,
	what,
	rel,
	expanded,
	pinned,
	onToggle,
	onHover,
}: {
	label: string;
	value: string;
	rating: Rating | null;
	what: string;
	rel: string | null;
	expanded: boolean;
	pinned: boolean;
	onToggle: () => void;
	onHover: (on: boolean) => void;
}) {
	return (
		<div className="border-b border-border/40 last:border-b-0">
			<button
				type="button"
				aria-expanded={expanded}
				onClick={onToggle}
				onPointerEnter={() => onHover(true)}
				onPointerLeave={() => onHover(false)}
				className="flex w-full items-baseline gap-2 rounded px-0.5 py-1 text-left text-[11px] hover:bg-muted/40"
			>
				<span aria-hidden className={cn('shrink-0 self-center text-[8px] text-muted-foreground transition-transform', expanded && 'rotate-90')}>▶</span>
				<span aria-hidden className="size-2 shrink-0 self-center rounded-full" style={{ background: colorFor(rating) }} />
				<span className="w-[60px] shrink-0 text-muted-foreground">{label}</span>
				<span className="flex-1 text-right tabular-nums text-popover-foreground">{value}</span>
			</button>
			{expanded && (
				<div className="pb-1.5 pl-[26px] pr-1 text-[10.5px] leading-[1.4]">
					<p className="m-0 text-muted-foreground">{what}</p>
					{rel && <p className="m-0 mt-1 text-popover-foreground">{rel}</p>}
					{pinned && <span className="sr-only">(pinned — tap again to close)</span>}
				</div>
			)}
		</div>
	);
}

// A breakdown bar — one localStorage category or one cache bucket: label, a
// proportional bar, a count, and (localStorage only) a size. Mirrors MetricDetail's
// EngineBreakdown bar so the two overlays share a visual language.
function Bar({ label, count, detail, frac }: { label: string; count: number; detail?: string; frac: number }) {
	return (
		<div className="flex items-center gap-2 text-[10.5px]">
			<span className="w-[92px] shrink-0 truncate text-muted-foreground" title={label}>{label}</span>
			<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
				<span className="block h-full rounded-full bg-[var(--accent,#6366f1)]" style={{ width: `${Math.max(2, frac * 100)}%` }} />
			</span>
			<span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{count}</span>
			{detail != null && <span className="w-12 shrink-0 text-right tabular-nums text-popover-foreground">{detail}</span>}
		</div>
	);
}
