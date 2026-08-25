import { BookOpen, Cloud, Cpu, Database, Download, ExternalLink, FileBox, FolderTree, KeyRound, Languages, LifeBuoy, MessageSquareText, MonitorDown, MousePointer2, PencilLine, PencilRuler, Plug, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload, Volume2, Wallet, Zap } from 'lucide-react';
import * as React from 'react';
import { orSupportsCache } from '@/components/studio/ai/or-cache.js';
import { fmtPrice, fmtTokens, fmtUSD } from '@/components/studio/ai/or-catalog.js';
import { readCachingEnabled, readDedupEnabled, writeCachingEnabled, writeDedupEnabled } from '@/components/studio/ai/spend.js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PanelBody, PanelHeader, PanelSheet } from '@/components/ui/panel';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { clearCrashReports, collectCrashReports, crashReportStats, OPEN_CRASH_REPORT_EVENT, startCrashSentinel, stopCrashSentinel } from '@/lib/crash-sentinel';
import { cn } from '@/lib/utils';
import { FIDELITY_OVERLAY_AVAILABLE, fidelityOverlayEnabled, onFidelityOverlayEnabledChange, setFidelityOverlayEnabled } from '@/playground/fidelity-overlay-prefs';
import { DEFAULT_BITRATE_KBPS, lookaheadPref, narrationBitrate, narrationCacheEnabled, pacePref, setLookaheadPref, setNarrationBitrate, setNarrationCacheEnabled, setPacePref } from '@/playground/narration-prefs.js';
import { onPerfOverlayEnabledChange, PERF_OVERLAY_AVAILABLE, perfOverlayEnabled, setPerfOverlayEnabled } from '@/playground/perf-overlay-prefs';
import { onReadAloudOverlayEnabledChange, READALOUD_OVERLAY_AVAILABLE, readAloudOverlayEnabled, setReadAloudOverlayEnabled } from '@/playground/readaloud-overlay-prefs';
import { onStorageOverlayEnabledChange, STORAGE_OVERLAY_AVAILABLE, setStorageOverlayEnabled, storageOverlayEnabled } from '@/playground/storage-overlay-prefs';
import { onToursEnabledChange, setToursEnabled, toursEnabled } from '@/playground/tour-prefs.js';
import { onViewportDebugEnabledChange, setViewportDebugEnabled, VIEWPORT_DEBUG_AVAILABLE, viewportDebugEnabled } from '@/playground/viewport-debug-prefs';
import { onVizOverlayEnabledChange, setVizOverlayEnabled, VIZ_OVERLAY_AVAILABLE, vizOverlayEnabled } from '@/playground/viz-overlay-prefs';
import { architectSpend, connectOpenRouter, disconnectOpenRouter, setBudget, setStudioTier, useArchitectStatus } from './architect';
import { clearDownloadedModels, clearEverything, clearLibraryAssets, clearNarrationAudio, clearSiteCache, fmtBytes, type GovernanceStats, loadGovernanceStats } from './governance';
import { LensIcon } from './icons';
import { CAN_INSTALL_EVENT, type InstallState, installState, promptInstall } from './install-app';
import { LanguageSelect } from './LanguageSelect';
import { DeleteBtn } from './Library';
import { ModelPicker } from './ModelPicker';
import { OnDeviceTier } from './OnDeviceTier';
import { languageFor } from './studio-language';
import {
	clearAllDecks,
	type HandleStyle,
	lastBackupAt,
	loadInstructions,
	loadOnDeviceInstructions,
	loadSettings,
	markBackupTaken,
	ON_DEVICE_INSTRUCTIONS_MAX,
	type PdfPages,
	type Posture,
	type StandingOverflowMarker,
	saveInstructions,
	saveOnDeviceInstructions,
	saveSettings,
	truncateCodePoints,
} from './studio-store';
import { TtsSettings } from './TtsSettings';
import { downloadBlob, isEvictionProneBrowser, packWorkspace, restoreWorkspace, storageSummary, WORKSPACE_ZIP_NAME } from './workspace-backup';

const pct = (used: number, total: number) => (total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0);

// Workspace Settings — "your setup", distinct from the deck Inspector's "deck-wide".
// Two tabs: General holds the non-AI workspace prefs — the workspace LANGUAGE (the
// default every deck inherits and both AI tiers write in; a deck overrides it from
// its Inspector), placement-handle style, PDF page format, and where decks live; AI
// holds everything about the model, in stacked sections:
//   · Model — the GENERATION switch (Cloud / On-device) that picks the ACTIVE tier.
//     Connection ≠ active (Studio Policy B): the cloud stays connected but dormant while
//     you run on-device, and one tap resumes it.
//   · Spend — the authoritative OpenRouter account balance beside the live session tally
//     and your client-side cap.
//   · Instructions — the standing voice + generation prefs.
// Language is a GENERAL workspace default, not an AI knob: it describes the deck's own
// language (its `lang`, carried into every export + read-aloud), which the AI merely
// inherits — so it lives under General, and cloud/on-device share it rather than each
// carrying their own. Spend + Instructions used to be their own tabs; they're facets of
// the AI model, so they live as sections under AI rather than as sibling tabs.
const TABS = ['General', 'AI', 'Data'] as const;
type Tab = (typeof TABS)[number];
type GenView = 'cloud' | 'ondevice';

const ON_DEVICE_TIERS = new Set(['prompt-api', 'webllm', 'universal']);

// Was a hand-rolled mono-11px-uppercase row — one of four near-identical subhead
// treatments across the drawers. Now a thin shim over `PanelSection`'s head so this
// surface shares the one grammar; kept as a named component because ~20 call sites
// pass `{icon}` + children rather than a `label` string.
function GroupLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
	return <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold leading-normal text-[var(--text-heading)] [&_svg]:size-3.5">{icon}{children}</h3>;
}

// A secondary section inside the AI tab (Spend, Instructions) — each sits below the Model
// section behind a hairline divider + top space, so the long scroll reads as distinct
// regions rather than one undifferentiated column.
function AiSection({ children }: { children: React.ReactNode }) {
	return <div className="mt-6 border-t border-border pt-5">{children}</div>;
}

// A single Data-tab row — one storage category, its stat line, and the same
// two-tap DeleteBtn the Library uses (HARD RULE #15: one delete affordance,
// not a bespoke one per surface).
function GovRow({ icon, title, description, stat, armed, busy, onArm, onConfirm, onCancel }: { icon: React.ReactNode; title: string; description: string; stat?: string; armed: boolean; busy: boolean; onArm: () => void; onConfirm: () => void; onCancel: () => void }) {
	return (
		<div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
			<span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">{icon}</span>
			<div className="min-w-0 flex-1">
				<div className="text-[13px] font-semibold text-[var(--text-heading)]">{title}</div>
				<p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{description}</p>
				{stat && <div className="mt-1 font-mono text-[11px] text-muted-foreground">{stat}</div>}
			</div>
			<div className="shrink-0 pt-0.5">{busy ? <span className="px-1 text-[11px] text-muted-foreground">…</span> : <DeleteBtn armed={armed} onArm={onArm} onConfirm={onConfirm} onCancel={onCancel} label={title} />}</div>
		</div>
	);
}

// The two on-canvas placement-handle styles the General tab offers (mirrors the finish
// designer's CanvasHandles): a familiar grab-knob, or a precise see-through reticle.
// The three posture stops, as a WORKSPACE preference — which surface the Studio
// opens on. Previously the boot stop was only ever DERIVED (first visit → Read)
// and then silently pinned by the first use of the dial, so there was no way to
// state a preference (#1286). Order matches the posture dial, quietest first.
const POSTURE_CHOICES: { value: Posture; title: string; blurb: string; icon: React.ReactNode }[] = [
	{ value: 'read', title: 'Read', icon: <BookOpen className="size-4" />, blurb: 'The deck, full-bleed — no editor. For reviewing and presenting.' },
	{ value: 'write', title: 'Write', icon: <PencilLine className="size-4" />, blurb: 'Editor beside the preview. The default — enough to work, none of the extra chrome.' },
	{ value: 'craft', title: 'Craft', icon: <PencilRuler className="size-4" />, blurb: 'The full surface — panels, activity bar, every tool docked.' },
];

const HANDLE_CHOICES: { value: HandleStyle; title: string; blurb: string }[] = [
	{ value: 'knob', title: 'Familiar', blurb: 'A grab-handle knob — obviously draggable' },
	{ value: 'reticle', title: 'Precision', blurb: 'A see-through crosshair for exact placement' },
];

// The two Share → PDF page-image formats the General tab offers. PNG is the
// lossless default; JPEG is the informed speed/size trade-off (about 2× faster
// export and several-times-smaller files, with JPEG's edge artifacts) — a call
// that belongs to the user, so it's a preference, not a hardcoded default.
const PDF_PAGE_CHOICES: { value: PdfPages; title: string; blurb: string }[] = [
	{ value: 'png', title: 'Lossless', blurb: 'PNG pages — pixel-perfect, the default' },
	{ value: 'jpeg', title: 'Fast', blurb: 'JPEG pages — ~2× faster export, much smaller file' },
];

// Who the overflow marker speaks to in a bundle you export. A clipped slide is
// always marked here — this is the tone, not whether.
//
// "No marker" is deliberately ABSENT. It is available per export (the Share → Marp
// bundle step), never as a standing default: a persistent silence nobody can see is
// the failure this setting exists to prevent, and a workspace preference would apply
// it to every future export with nothing to notice it by.
const OVERFLOW_MARKER_CHOICES: { value: StandingOverflowMarker; title: string; blurb: string }[] = [
	{ value: 'reader', title: 'For the reader', blurb: 'A calm "Content clipped" tag — the default' },
	{ value: 'author', title: 'For me', blurb: 'The full editing signal: red ring, "Fix Me" tags' },
];

// A miniature of each handle style for the picker card (accent-toned).
function HandlePreview({ kind }: { kind: HandleStyle }) {
	if (kind === 'knob') {
		return (
			<span className="grid size-8 place-items-center">
				<span
					className="size-5 rounded-full border-[1.5px] shadow-[0_2px_6px_rgba(4,10,22,.4)]"
					style={{ background: 'radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--accent) 26%, #fff) 0%, var(--accent) 60%, color-mix(in srgb, var(--accent) 72%, #000) 100%)', borderColor: 'color-mix(in srgb, var(--accent) 80%, #fff 10%)' }}
				/>
			</span>
		);
	}
	return (
		<span className="grid size-8 place-items-center">
			<span className="relative size-6 rounded-full border-[1.5px]" style={{ borderColor: 'var(--accent)' }}>
				<span className="absolute inset-0 m-auto size-1 rounded-full" style={{ background: 'var(--accent)' }} />
				<span className="absolute left-1/2 -top-1 h-1.5 w-[1.5px] -translate-x-1/2" style={{ background: 'var(--accent)' }} />
				<span className="absolute left-1/2 -bottom-1 h-1.5 w-[1.5px] -translate-x-1/2" style={{ background: 'var(--accent)' }} />
				<span className="absolute top-1/2 -left-1 h-[1.5px] w-1.5 -translate-y-1/2" style={{ background: 'var(--accent)' }} />
				<span className="absolute top-1/2 -right-1 h-[1.5px] w-1.5 -translate-y-1/2" style={{ background: 'var(--accent)' }} />
			</span>
		</span>
	);
}

export function WorkspaceSheet({ open, onOpenChange, notify }: { open: boolean; onOpenChange: (v: boolean) => void; notify: (msg: string) => void }) {
	const [tab, setTab] = React.useState<Tab>('AI');
	const [dedup, setDedup] = React.useState(true);
	React.useEffect(() => { setDedup(readDedupEnabled()); }, []);
	const [caching, setCaching] = React.useState(true);
	React.useEffect(() => { setCaching(readCachingEnabled()); }, []);
	const [tours, setTours] = React.useState(true);
	React.useEffect(() => {
		setTours(toursEnabled());
		const off = onToursEnabledChange(setTours);
		return () => {
			off();
		};
	}, []);

	// Performance overlay — wired to the shared cross-surface pref (SSOT), NOT a
	// StudioSettings field: one flag governs the Studio and the Playground alike,
	// and the ?perf URL param writes the same thing. Subscribe so the
	// switch tracks a flip made elsewhere (the × on the overlay, ?perf).
	const [perfOverlay, setPerfOverlay] = React.useState(false);
	React.useEffect(() => {
		setPerfOverlay(perfOverlayEnabled());
		const off = onPerfOverlayEnabledChange(setPerfOverlay);
		return () => {
			off();
		};
	}, []);
	// Read-aloud diagnostics overlay — same shared-pref pattern as the perf overlay;
	// the `?readaloud-debug=1` URL param writes the same flag.
	const [readAloudOverlay, setReadAloudOverlay] = React.useState(false);
	React.useEffect(() => {
		setReadAloudOverlay(readAloudOverlayEnabled());
		return onReadAloudOverlayEnabledChange(setReadAloudOverlay);
	}, []);
	// Viz diagnostics overlay — same shared-pref pattern; the `?viz` URL param and
	// the overlay's own × write the same flag.
	const [vizOverlay, setVizOverlay] = React.useState(false);
	React.useEffect(() => {
		setVizOverlay(vizOverlayEnabled());
		return onVizOverlayEnabledChange(setVizOverlay);
	}, []);
	// Preview-fidelity overlay — same shared-pref pattern; the `?fidelity` URL param and
	// the overlay's own × write the same flag.
	const [fidelityOverlay, setFidelityOverlay] = React.useState(false);
	React.useEffect(() => {
		setFidelityOverlay(fidelityOverlayEnabled());
		return onFidelityOverlayEnabledChange(setFidelityOverlay);
	}, []);
	// Crash reports — a switch (off by default, see StudioSettings.crashReports)
	// plus the standing way into a report and the way to forget them. Recounted
	// each time the panel opens, because the shell can discard one while it is
	// closed.
	const [crashCount, setCrashCount] = React.useState(0);
	const [crashArmed, setCrashArmed] = React.useState(false);
	// Whether the sentinel records at all. OFF by default — see StudioSettings.
	const [crashOn, setCrashOn] = React.useState(() => loadSettings().crashReports);
	// Stored records, which is NOT the same number as reportable ones: a record can
	// be on disk and not yet eligible to report (the staleness window). The clear
	// control keys off THIS, so a record can never be present-but-unclearable.
	const [crashStored, setCrashStored] = React.useState(0);
	React.useEffect(() => {
		if (!open) return;
		setCrashCount(collectCrashReports(Date.now()).length);
		setCrashStored(crashReportStats().count);
		// RE-READ THE SWITCH, don't trust mount state. Another tab can have turned it
		// off since this component mounted, and the sheet is long-lived — showing a
		// stale ON over a recorder that is stopped is a lie about a privacy control.
		setCrashOn(loadSettings().crashReports);
		setCrashArmed(false); // never re-open mid-confirmation
	}, [open]);
	// Viewport-debug overlay — same shared-pref pattern; the `?vvdebug` URL param and
	// the overlay's own × write the same flag.
	const [viewportDebug, setViewportDebug] = React.useState(false);
	React.useEffect(() => {
		setViewportDebug(viewportDebugEnabled());
		return onViewportDebugEnabledChange(setViewportDebug);
	}, []);
	// Storage overlay — same shared-pref pattern; the `?storage` URL param and the
	// overlay's own close button write the same flag.
	const [storageOverlay, setStorageOverlay] = React.useState(false);
	// Present narration prefs (narration-prefs.js). Read on open rather than at mount so a
	// change made in another tab is reflected when the sheet is next opened.
	const [lookahead, setLookaheadState] = React.useState<string>('auto');
	const [narrationCache, setNarrationCacheState] = React.useState(true);
	const [narrationBitrateState, setNarrationBitrateState] = React.useState(DEFAULT_BITRATE_KBPS);
	const [pace, setPaceState] = React.useState('natural');
	React.useEffect(() => {
		if (!open) return;
		setLookaheadState(String(lookaheadPref()));
		setNarrationCacheState(narrationCacheEnabled());
		setNarrationBitrateState(narrationBitrate());
		setPaceState(pacePref());
	}, [open]);
	React.useEffect(() => {
		setStorageOverlay(storageOverlayEnabled());
		return onStorageOverlayEnabledChange(setStorageOverlay);
	}, []);
	// Bump on open so the live status (incl. the authoritative account spend) re-fetches.
	const [pulse, setPulse] = React.useState(0);
	const ai = useArchitectStatus(pulse);
	// Only a connected model whose vendor takes an EXPLICIT cache breakpoint can honor the
	// switch — `withCachedSystem` no-ops for everyone else, and the auto-caching vendors
	// cache server-side whatever this says. Gate the control rather than lie about it.
	const cacheUsable = ai.openRouterReady && orSupportsCache(ai.modelId ?? '');
	const [genView, setGenView] = React.useState<GenView>('cloud');
	const userPickedView = React.useRef(false);
	const [instructions, setInstructions] = React.useState(loadInstructions);
	// Separate, capped on-device standing instructions — a small local model loses
	// the thread past a short brief, so it's its own field, not a truncation of the
	// cloud one above (2026-07-09-studio-cloud-ondevice-config-split.md).
	const [odInstructions, setOdInstructions] = React.useState(loadOnDeviceInstructions);
	// The workspace default language every deck inherits — its document language + the
	// language the AI writes in (seeded from the browser the first time; see studio-store).
	const [language, setLanguage] = React.useState(() => loadSettings().language);
	// Which posture the Studio opens on. Writing it here makes the stop an explicit
	// CHOICE rather than something inferred from whether this browser has been used.
	const [posture, setPostureState] = React.useState<Posture>(() => loadSettings().posture);
	// How the Fabricate finish designer draws its on-canvas placement handles.
	const [handleStyle, setHandleStyle] = React.useState<HandleStyle>(() => loadSettings().handleStyle);
	// Share → PDF page-image format (lossless PNG / fast JPEG).
	const [pdfPages, setPdfPages] = React.useState<PdfPages>(() => loadSettings().pdfPages);
	const [overflowMarker, setOverflowMarker] = React.useState<StandingOverflowMarker>(() => loadSettings().overflowMarker);
	// Whether decks inherit the workspace default reader views (the curated two — Bottom line + The evidence).
	const [lensDefaults, setLensDefaults] = React.useState(() => loadSettings().lensDefaults);
	// Whether the add-slide gallery answers a described intent, not just a remembered name.
	const [intentSearch, setIntentSearch] = React.useState(() => loadSettings().intentSearch);
	const [storeInCloud, setStoreInCloud] = React.useState(false);
	const [connecting, setConnecting] = React.useState(false);
	const [spend, setSpend] = React.useState(() => architectSpend());
	// Backup & restore (General tab): the passive tier of the durability story —
	// a last-backup line + storage readout that are simply always there.
	const [backupAt, setBackupAt] = React.useState<number | null>(() => lastBackupAt());
	const [storageLine, setStorageLine] = React.useState('');
	const [busy, setBusy] = React.useState<'backup' | 'restore' | null>(null);
	const restoreInput = React.useRef<HTMLInputElement>(null);
	// Install-the-app (General tab): four honest states — see install-app.ts.
	// Chromium can park its prompt at any moment, so track the announce event.
	const [install, setInstall] = React.useState<InstallState>(() => installState());
	React.useEffect(() => {
		const sync = () => setInstall(installState());
		window.addEventListener(CAN_INSTALL_EVENT, sync);
		return () => window.removeEventListener(CAN_INSTALL_EVENT, sync);
	}, []);
	const doInstall = async () => {
		const outcome = await promptInstall();
		if (outcome === 'accepted') { setInstall('installed'); notify('Installed — Lattice Studio is on your home screen / launcher.'); }
		else if (outcome === 'dismissed') { setInstall(installState()); notify('No problem — install any time from here.'); }
	};
	React.useEffect(() => {
		if (open) {
			setSpend(architectSpend());
			setPulse((p) => p + 1);
			setBackupAt(lastBackupAt());
			storageSummary().then(setStorageLine).catch(() => {});
		}
	}, [open]);

	// Data tab (delete cache / decks / Library / OpenRouter / downloaded models).
	const [gov, setGov] = React.useState<GovernanceStats | null>(null);
	const [govArmed, setGovArmed] = React.useState<string | null>(null);
	const [govBusy, setGovBusy] = React.useState<string | null>(null);
	const [deleteAllOpen, setDeleteAllOpen] = React.useState(false);
	const [deleteAllText, setDeleteAllText] = React.useState('');
	const [deletingAll, setDeletingAll] = React.useState(false);
	const refreshGov = React.useCallback(() => { loadGovernanceStats().then(setGov).catch(() => {}); }, []);
	React.useEffect(() => {
		if (open && tab === 'Data') { refreshGov(); return; }
		// Disarm every two-tap delete the moment the sheet closes OR the user
		// navigates to another tab (mirrors Library.tsx's `else { setArmed(null) }`
		// on !open) — WorkspaceSheet is mounted unconditionally by StudioShell, so
		// its state otherwise survives both, and a stale "armed" button would fire
		// a destructive clear on the NEXT single, unrelated click.
		setGovArmed(null);
		setDeleteAllOpen(false);
		setDeleteAllText('');
	}, [open, tab, refreshGov]);
	const clearCategory = async (key: string, fn: () => void | Promise<void>, msg: string) => {
		setGovBusy(key);
		try {
			await fn();
			if (key === 'decks') {
				// The live editor's in-memory deck/source state has no invalidation
				// path from this sheet — without a reload, its 400ms debounced
				// autosave would silently rewrite the just-cleared deck straight
				// back into localStorage on the next keystroke. Same fix + same
				// delay as the General tab's restore-backup flow (below), which
				// hits the identical problem for the same reason.
				notify(`${msg} Reloading…`);
				setTimeout(() => window.location.reload(), 1100);
				return; // stay busy/armed through the reload — nothing else is clickable meanwhile
			}
			notify(msg);
			refreshGov();
			if (key === 'openrouter') setPulse((p) => p + 1); // re-fetch AI status
			setGovBusy(null);
			setGovArmed(null);
		} catch (e) {
			notify(`Couldn't clear that: ${(e as Error)?.message || 'unknown error'}`);
			setGovBusy(null);
			setGovArmed(null);
		}
	};
	const deleteEverything = async () => {
		setDeletingAll(true);
		try {
			const { failed } = await clearEverything();
			notify(failed.length ? `Cleared decks, Library, OpenRouter, downloaded models, and cache — except: ${failed.join(', ')} (try that row on its own). Reloading…` : 'Everything cleared — decks, Library, OpenRouter, downloaded models, and cache. Reloading…');
			// Decks are always part of this clear — same reload requirement as the
			// per-category "Decks" row above (the live editor can't see the clear
			// otherwise). Stay in the disabled/deleting state through the reload.
			setTimeout(() => window.location.reload(), 1100);
		} catch (e) {
			notify(`Couldn't clear everything: ${(e as Error)?.message || 'unknown error'}`);
			setDeletingAll(false);
		}
	};

	const downloadBackup = async () => {
		setBusy('backup');
		try {
			const now = Date.now();
			downloadBlob(WORKSPACE_ZIP_NAME, await packWorkspace(now));
			markBackupTaken(now);
			setBackupAt(now);
			notify('Backup downloaded — your whole workspace, yours to keep.');
		} catch (e) {
			notify(`Backup failed: ${(e as Error)?.message || 'unknown error'}`);
		} finally {
			setBusy(null);
		}
	};
	const restoreBackup = async (file: File) => {
		setBusy('restore');
		try {
			const s = await restoreWorkspace(file, Date.now());
			const decks = s.added + s.restoredCopies;
			const assets = s.themes + s.components + s.finishes + s.scenes;
			notify(`Workspace restored — ${decks} deck${decks === 1 ? '' : 's'}${assets ? ` + ${assets} library asset${assets === 1 ? '' : 's'}` : ''} in. Reloading…`);
			// The restore touches decks, settings, and the Library across several
			// stores; a reload is the one honest way to re-derive every view of them.
			setTimeout(() => window.location.reload(), 1100);
		} catch (e) {
			notify(`Restore failed: ${(e as Error)?.message || 'not a workspace backup'}`);
			setBusy(null);
		}
	};

	const cloudActive = ai.generation === 'openrouter';
	const onDeviceActive = ON_DEVICE_TIERS.has(ai.generation);
	// Seed the visible pane from the ACTIVE tier — but only until the user picks a
	// pane themselves, so a later status refresh can't yank them off their selection.
	React.useEffect(() => {
		if (userPickedView.current) return;
		if (onDeviceActive) setGenView('ondevice');
		else if (cloudActive) setGenView('cloud');
	}, [cloudActive, onDeviceActive]);

	const connect = async () => {
		setConnecting(true);
		try {
			await connectOpenRouter(); // navigates away to the OAuth page
		} catch (e) {
			notify(`Connect failed: ${(e as Error)?.message || 'unavailable here'}`);
			setConnecting(false);
		}
	};
	const disconnect = async () => {
		await disconnectOpenRouter();
		notify('OpenRouter disconnected.');
	};
	const pickCloud = async () => {
		userPickedView.current = true;
		setGenView('cloud');
		if (ai.openRouterReady) {
			await setStudioTier('auto'); // resume the connected cloud as the active tier
			setPulse((p) => p + 1);
			notify('Cloud is your active tier.');
		}
	};
	const pickOnDevice = () => {
		userPickedView.current = true;
		setGenView('ondevice');
	};


	return (
		<PanelSheet open={open} onOpenChange={onOpenChange} side="right" width="md">
			{/* A plain title. This carried an inline `your setup` in 10px mono uppercase —
			    the app's only eyebrow, hand-rolled TRAILING the title, in the one position
			    `PanelHeader`'s own (never-used) `eyebrow` slot did not support. The panel is
			    launched from a control labeled "Workspace settings"; the title does not need
			    to re-explain itself in a treatment no other header uses. */}
			<PanelHeader
				icon={<Cloud />}
				title="Workspace"
				srDescription="Your workspace setup — preferences and app install under General; the AI model, spend, and standing instructions under AI; where decks live, backup, storage, and deletion under Data."
			/>
			<PanelBody padded={false} className="p-5">
					<PillTabs
						className="mb-4"
						ariaLabel="Workspace settings"
						value={tab}
						onValueChange={(v) => setTab(v as Tab)}
						tabs={TABS.map((t) => ({ value: t, label: t }))}
					/>

					{tab === 'General' && (
						<div>
							{/* ── LANGUAGE — the workspace-wide default every deck inherits and both AI
							    tiers write in. A deck overrides it from its Inspector (`lang:` front
							    matter). English only for now; the picker widens as data later. ── */}
							<GroupLabel icon={<Languages className="size-3.5" />}>Language</GroupLabel>
							<p className="mb-3 text-xs text-muted-foreground">The default language for this workspace. Every deck inherits it — its document language and the language the AI writes content in (slides, refine, chat) — unless a deck sets its own in the Inspector. English only for now.</p>
							<LanguageSelect
								value={language}
								ariaLabel="Workspace language"
								onValueChange={(v) => { setLanguage(v); saveSettings({ language: v }); notify(`Workspace language: ${languageFor(v).label}. Every deck inherits it unless it sets its own.`); }}
							/>
							<p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><SlidersHorizontal className="size-3" /> Both AI tiers — cloud and on-device — write in this language; component and theme names stay in English.</p>

							<div className="mt-6">
								<GroupLabel icon={<LensIcon className="size-3.5" />}>Default reader views</GroupLabel>
								<div className="flex items-start gap-3 rounded-xl border border-border bg-background p-3">
									<Switch
										checked={lensDefaults}
										onCheckedChange={(v) => { setLensDefaults(v); saveSettings({ lensDefaults: v }); notify(v ? 'Default reader views on — every deck starts with two starter views.' : 'Default reader views off — untouched starters are hidden; views you’ve worked on stay.'); }}
										aria-label="Default reader views"
										className="mt-0.5"
									/>
									<span className="flex flex-col gap-0.5">
										<span className="text-[13px] font-semibold text-[var(--text-heading)]">Start every deck with two reader views</span>
										<span className="text-[11px] leading-snug text-muted-foreground"><strong className="font-semibold text-foreground">Bottom line</strong> (the answer) and <strong className="font-semibold text-foreground">The evidence</strong> (the proof) appear in the Reader views panel as <em>Starter</em> views you fill in and approve — nothing is written to a deck until you tag or approve one. Turn this off and any starter you haven’t touched is hidden across your decks; views you’ve tagged or approved stay put.</span>
									</span>
								</div>
							</div>

							<div className="mt-6">
							<GroupLabel icon={<PencilLine className="size-3.5" />}>Starting mode</GroupLabel>
							<p className="mb-3 text-xs text-muted-foreground">Which surface the Studio opens on. You can always move between them with the mode dial in the header — this is only where you start.</p>
							<div className="grid grid-cols-3 gap-2.5">
								{POSTURE_CHOICES.map((c) => {
									const active = posture === c.value;
									return (
										<label
											key={c.value}
											className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)]', active ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-border bg-background hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]')}
										>
											<input
												type="radio"
												name="starting-posture"
												value={c.value}
												checked={active}
												onChange={() => { setPostureState(c.value); saveSettings({ posture: c.value }); notify(`Studio opens on ${c.title}.`); }}
												className="sr-only"
											/>
											<span className="text-[var(--accent)]" aria-hidden>{c.icon}</span>
											<span className="flex flex-col gap-0.5">
												<span className="text-[13px] font-semibold text-[var(--text-heading)]">{c.title}</span>
												<span className="text-[11px] leading-snug text-muted-foreground">{c.blurb}</span>
											</span>
										</label>
									);
								})}
							</div>
							</div>

							<div className="mt-6">
							<GroupLabel icon={<MousePointer2 className="size-3.5" />}>Placement handles</GroupLabel>
							<p className="mb-3 text-xs text-muted-foreground">How the finish designer draws the drag handles you place a wash, mark, or spotlight with — on the canvas over your specimen.</p>
							<div className="grid grid-cols-2 gap-2.5">
								{HANDLE_CHOICES.map((c) => {
									const active = handleStyle === c.value;
									return (
										<label
											key={c.value}
											className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)]', active ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-border bg-background hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]')}
										>
											<input
												type="radio"
												name="handle-style"
												value={c.value}
												checked={active}
												onChange={() => { setHandleStyle(c.value); saveSettings({ handleStyle: c.value }); notify(`Placement handles: ${c.title.toLowerCase()}.`); }}
												className="sr-only"
											/>
											<HandlePreview kind={c.value} />
											<span className="flex flex-col gap-0.5">
												<span className="text-[13px] font-semibold text-[var(--text-heading)]">{c.title}</span>
												<span className="text-[11px] leading-snug text-muted-foreground">{c.blurb}</span>
											</span>
										</label>
									);
								})}
							</div>
							<p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><SlidersHorizontal className="size-3" /> Applies to every finish handle; changes take effect live in the designer.</p>
							</div>

							{/* ── PRESENT — how narrated delivery fetches and keeps its audio ──────── */}
							<div className="mt-6">
								<GroupLabel icon={<Volume2 className="size-3.5" />}>Narration in Present</GroupLabel>
								<p className="mb-3 text-xs text-muted-foreground">How narrated delivery is paced, how far ahead Present fetches its audio, and whether what it fetched is kept for next time.</p>
								<div className="mb-2 rounded-xl border border-border bg-background px-3 py-2.5">
									<label htmlFor="ws-pace" className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Pace</label>
									<p className="mb-2 mt-0.5 text-[11px] leading-relaxed text-muted-foreground">How long Present holds on a new slide before it starts speaking. The slide appears first and the beat gives the room time to read it — the order every presentation coach prescribes. A <strong>divider</strong> slide opens a section and gets a longer beat, the way a chapter break does.</p>
									<Select value={pace} onValueChange={(v) => { setPaceState(v); setPacePref(v); notify(`Pace: ${v}.`); }}>
										<SelectTrigger id="ws-pace" className="w-full"><SelectValue /></SelectTrigger>
										<SelectContent>
											<SelectItem value="brisk">Brisk — 0.8s between slides, 1.6s between sections</SelectItem>
											<SelectItem value="natural">Natural — 1.4s / 2.6s (recommended)</SelectItem>
											<SelectItem value="deliberate">Deliberate — 2.2s / 4.0s</SelectItem>
										</SelectContent>
									</Select>
									<p className="mt-1.5 text-[11px] text-muted-foreground">Deliberate suits a technical or non-native audience; Brisk suits a demo or a room that already knows the material.</p>
								</div>
								<div className="rounded-xl border border-border bg-background px-3 py-2.5">
									<label htmlFor="ws-lookahead" className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Fetch ahead</label>
									<p className="mb-2 mt-0.5 text-[11px] leading-relaxed text-muted-foreground">How many upcoming slides to synthesize in the background while you present. <strong>Automatic</strong> sizes it from how fast your voice has actually been responding on this network — deeper on a slow link, shallower on a fast one — so you shouldn't normally need to change it. <strong>The whole deck</strong> fetches everything up front, so delivery never touches the network — worth it before a room that matters.</p>
									<Select value={String(lookahead)} onValueChange={(v) => { setLookaheadState(v); setLookaheadPref(v === 'auto' || v === 'all' ? v : Number(v)); notify(v === 'auto' ? 'Fetch ahead: automatic.' : v === 'all' ? 'Fetch ahead: the whole deck — it will be ready to present offline.' : `Fetch ahead: ${v} slide${v === '1' ? '' : 's'}.`); }}>
										<SelectTrigger id="ws-lookahead" className="w-full"><SelectValue /></SelectTrigger>
										<SelectContent>
											<SelectItem value="auto">Automatic (recommended)</SelectItem>
											<SelectItem value="0">Off — only the current slide</SelectItem>
											<SelectItem value="1">1 slide ahead</SelectItem>
											<SelectItem value="2">2 slides ahead</SelectItem>
											<SelectItem value="3">3 slides ahead</SelectItem>
											<SelectItem value="4">4 slides ahead</SelectItem>
											<SelectItem value="all">The whole deck</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="mt-2 rounded-xl border border-border bg-background px-3 py-2.5">
									<label htmlFor="ws-narration-bitrate" className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Audio quality</label>
									<p className="mb-2 mt-0.5 text-[11px] leading-relaxed text-muted-foreground">How much detail to keep in the audio of a deck you <strong>share</strong>. This is the single biggest lever on its size — a 300-sentence deck is about 22 MB at 64 kbps and 44 MB at 128. It applies when the file is built, so it never affects how narration sounds while you are reading here, and it only reaches the two voices that produce uncompressed audio (<strong>on-device</strong> and <strong>Gemini</strong>); every other voice arrives already compressed and is passed through untouched. Speech carries almost nothing above 8 kHz, so the higher settings mostly buy bytes rather than clarity.</p>
									<Select value={String(narrationBitrateState)} onValueChange={(v) => { setNarrationBitrateState(Number(v)); setNarrationBitrate(Number(v)); notify(`Audio quality: ${v} kbps for shared decks. Reading here is unaffected.`); }}>
										<SelectTrigger id="ws-narration-bitrate" className="w-full"><SelectValue /></SelectTrigger>
										<SelectContent>
											<SelectItem value="48">48 kbps — smallest file</SelectItem>
											<SelectItem value="64">64 kbps — recommended</SelectItem>
											<SelectItem value="96">96 kbps</SelectItem>
											<SelectItem value="128">128 kbps — largest file</SelectItem>
										</SelectContent>
									</Select>
									<p className="mt-1.5 text-[11px] text-muted-foreground">Applies to every export, including decks you rehearsed before changing it — nothing is re-synthesized and nothing is re-billed. Narration kept on this device is always stored exactly as the voice made it.</p>
								</div>
								<label htmlFor="ws-narration-cache" className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
									<Switch id="ws-narration-cache" aria-label="Keep narration on this device" checked={narrationCache} onCheckedChange={(next) => { setNarrationCacheState(next); setNarrationCacheEnabled(next); notify(next ? 'Narration is kept on this device — a rehearsed deck presents instantly.' : 'Narration is no longer kept between sessions.'); }} />
									<span className="min-w-0">
										<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Keep narration on this device</span>
										<span className="block text-[11px] text-muted-foreground">Store spoken lines in this browser so a deck you've already rehearsed presents instantly, offline, and without paying to synthesize the same words again. Held under a size budget, oldest dropped first; see and clear it under Data → Narration audio.</span>
									</span>
								</label>
							</div>

							<div className="mt-6">
								<GroupLabel icon={<Download className="size-3.5" />}>PDF export pages</GroupLabel>
								<p className="mb-3 text-xs text-muted-foreground">How Share → PDF embeds each slide's page image. Lossless is pixel-perfect; Fast accepts slight JPEG compression (rarely visible) for a much quicker export and a far smaller file — handy for long decks and phones.</p>
								<div className="grid grid-cols-2 gap-2.5">
									{PDF_PAGE_CHOICES.map((c) => {
										const active = pdfPages === c.value;
										return (
											<label
												key={c.value}
												className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)]', active ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-border bg-background hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]')}
											>
												<input
													type="radio"
													name="pdf-pages"
													value={c.value}
													checked={active}
													onChange={() => { setPdfPages(c.value); saveSettings({ pdfPages: c.value }); notify(`PDF pages: ${c.title.toLowerCase()} (${c.value.toUpperCase()}).`); }}
													className="sr-only"
												/>
												<span className="grid size-8 place-items-center">
													{c.value === 'png'
														? <span className="grid size-6 place-items-center rounded-md border-[1.5px] font-mono text-[9px] font-bold" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>1:1</span>
														: <Zap className="size-5" style={{ color: 'var(--accent)' }} />}
												</span>
												<span className="flex flex-col gap-0.5">
													<span className="text-[13px] font-semibold text-[var(--text-heading)]">{c.title}</span>
													<span className="text-[11px] leading-snug text-muted-foreground">{c.blurb}</span>
												</span>
											</label>
										);
									})}
								</div>
								<p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><SlidersHorizontal className="size-3" /> Applies to Share → PDF in this Studio; PowerPoint and Print are unaffected.</p>
							</div>

							<div className="mt-6">
								<GroupLabel icon={<Download className="size-3.5" />}>Overflow marker on export</GroupLabel>
								<p className="mb-3 text-xs text-muted-foreground">A slide with more content than fits is <strong>clipped</strong> — the overflow is not scrollable and does not print. Exported decks say so rather than losing it quietly. This is who the marker speaks to, not whether it appears.</p>
								<div className="grid gap-2.5">
									{OVERFLOW_MARKER_CHOICES.map((c) => {
										const active = overflowMarker === c.value;
										return (
											<label
												key={c.value}
												className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)]', active ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-border bg-background hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]')}
											>
												<input
													type="radio"
													name="overflow-marker"
													value={c.value}
													checked={active}
													onChange={() => { setOverflowMarker(c.value); saveSettings({ overflowMarker: c.value }); notify(`Overflow marker on export: ${c.title.toLowerCase()}.`); }}
													className="sr-only"
												/>
												<span className="flex flex-col gap-0.5">
													<span className="text-[13px] font-semibold text-[var(--text-heading)]">{c.title}</span>
													<span className="text-[11px] leading-snug text-muted-foreground">{c.blurb}</span>
												</span>
											</label>
										);
									})}
								</div>
								<p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><SlidersHorizontal className="size-3" /> Applies to Share → Marp bundle in this Studio; the other formats are unaffected. You can change it for one export in that step, and while editing here you always see the full signal.</p>
							</div>

							{/* Install the app — the Studio IS the app (the manifest launches here).
							    Four honest states; never a dead button. */}
							<div className="mt-6">
								<GroupLabel icon={<MonitorDown className="size-3.5" />}>Install the app</GroupLabel>
								{install === 'installed' ? (
									<p className="text-xs text-muted-foreground"><span className="font-semibold text-[var(--text-heading)]">Installed on this device</span> — the icon launches straight into the Studio, and it works offline.</p>
								) : install === 'promptable' ? (
									<div>
										<p className="mb-2.5 text-xs text-muted-foreground">Put the Studio on your home screen or dock: its own window, its own icon, works offline.</p>
										<button type="button" onClick={doInstall} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground"><MonitorDown className="size-4" />Install app</button>
									</div>
								) : install === 'ios-manual' ? (
									<div className="rounded-xl border border-border bg-card p-3">
										<p className="text-[12.5px] font-semibold text-[var(--text-heading)]">Add to your home screen</p>
										<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">iPhone/iPad installs by hand: tap <span className="font-semibold text-[var(--text-heading)]">Share</span> (the square with the arrow), then <span className="font-semibold text-[var(--text-heading)]">Add to Home Screen</span>. The icon launches straight into the Studio and works offline.</p>
									</div>
								) : (
									<p className="text-[11px] leading-relaxed text-muted-foreground">Your browser installs from its own menu — look for “Install app” or “Add to Home Screen”.</p>
								)}
							</div>

							{/* Guided tours — a shared cross-surface flag the PLAYGROUND's tour reads
							    (playground-tour.js → guided-tour.js). Its only switch used to live in the
							    Drawing Board's settings panel, so when that route was deleted anyone who
							    had turned tours off could never turn them back on. It lives here now. */}
							<div className="mt-6">
								<GroupLabel icon={<LifeBuoy className="size-3.5" />}>Guided tours</GroupLabel>
								<label htmlFor="ws-tours" className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
									<Switch id="ws-tours" aria-label="Guided tours" checked={tours} onCheckedChange={(next) => { setTours(next); setToursEnabled(next); }} />
									<span className="min-w-0">
										<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Guided tours</span>
										<span className="block text-[11px] text-muted-foreground">First-visit walkthroughs and the “Tour” button on the Playground. Turn off to hide them everywhere.</span>
									</span>
								</label>
							</div>

							{/* Diagnostics — the live performance overlay. Off by default; the
							    switch drives the shared cross-surface pref, so it also governs
							    the Playground and mirrors the ?perf URL param. */}
							{PERF_OVERLAY_AVAILABLE && (
								<div className="mt-6">
									<GroupLabel icon={<Cpu className="size-3.5" />}>Diagnostics</GroupLabel>
									<label htmlFor="ws-perf-overlay" className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
										<Switch id="ws-perf-overlay" aria-label="Performance overlay" checked={perfOverlay} onCheckedChange={(next) => { setPerfOverlay(next); setPerfOverlayEnabled(next); notify(next ? 'Performance overlay on — live render, vitals & runtime.' : 'Performance overlay off.'); }} />
										<span className="min-w-0">
											<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Performance overlay</span>
											<span className="block text-[11px] text-muted-foreground">A live on-screen readout: render-pipeline timings (engine, sanitize, frame, fit), Core Web Vitals, and runtime FPS/memory. Drag to reposition; measured by your own browser.</span>
										</span>
									</label>
									{READALOUD_OVERLAY_AVAILABLE && (
										<label htmlFor="ws-readaloud-overlay" className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
											<Switch id="ws-readaloud-overlay" aria-label="Read-aloud diagnostics" checked={readAloudOverlay} onCheckedChange={(next) => { setReadAloudOverlay(next); setReadAloudOverlayEnabled(next); notify(next ? 'Read-aloud diagnostics on — voice, sync & cadence in Present.' : 'Read-aloud diagnostics off.'); }} />
											<span className="min-w-0">
												<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Read-aloud diagnostics</span>
												<span className="block text-[11px] text-muted-foreground">A live readout in Present while narrating: active voice/model, AudioContext state, sync (spoken vs. cues), cadence drift, and a per-sentence trace. Drag to reposition; also via <code>?readaloud-debug=1</code>.</span>
											</span>
										</label>
									)}
									{VIZ_OVERLAY_AVAILABLE && (
										<label htmlFor="ws-viz-overlay" className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
											<Switch id="ws-viz-overlay" aria-label="Viz diagnostics" checked={vizOverlay} onCheckedChange={(next) => { setVizOverlay(next); setVizOverlayEnabled(next); notify(next ? 'Viz diagnostics on — flags chart colors that dropped to black.' : 'Viz diagnostics off.'); }} />
											<span className="min-w-0">
												<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Viz diagnostics</span>
												<span className="block text-[11px] text-muted-foreground">A live readout on the slide you're editing: SVG chart paint (map/quadrant/radar/…) that resolved to black because a themed color dropped — a scoping or token break. The on-device twin of the <code>check:render</code> CI guard; also via <code>?viz</code>.</span>
											</span>
										</label>
									)}
									{FIDELITY_OVERLAY_AVAILABLE && (
										<label htmlFor="ws-fidelity-overlay" className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
											<Switch id="ws-fidelity-overlay" aria-label="Preview fidelity" checked={fidelityOverlay} onCheckedChange={(next) => { setFidelityOverlay(next); setFidelityOverlayEnabled(next); notify(next ? 'Preview fidelity on — shows how this slide was rendered, and whether it matches the deck.' : 'Preview fidelity off.'); }} />
											<span className="min-w-0">
												<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Preview fidelity</span>
												<span className="block text-[11px] text-muted-foreground">A live readout of how the slide you're editing was rendered: which route ran (that slide alone, or the whole deck), which deck-wide fact forced it, and the page/section position it was handed — plus an on-demand diff against the full-deck render. Reach for it when a page number, a progress rail, or a panel color looks wrong. The on-device twin of <code>npm run equiv</code>; drag to reposition, also via <code>?fidelity</code>.</span>
											</span>
										</label>
									)}
									{VIEWPORT_DEBUG_AVAILABLE && (
										<label htmlFor="ws-viewport-debug" className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
											<Switch id="ws-viewport-debug" aria-label="Viewport debug" checked={viewportDebug} onCheckedChange={(next) => { setViewportDebug(next); setViewportDebugEnabled(next); notify(next ? 'Viewport debug on — live layout/visual-viewport geometry.' : 'Viewport debug off.'); }} />
											<span className="min-w-0">
												<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Viewport debug</span>
												<span className="block text-[11px] text-muted-foreground">A live readout of the geometry headless CI can't see: layout viewport, visual viewport (size + offset), what <code>svh</code>/<code>dvh</code>/<code>lvh</code> resolve to on this device, the cinema stage height, and the preview frame's rect. Drag to reposition; also via <code>?vvdebug</code>.</span>
											</span>
										</label>
									)}
									{STORAGE_OVERLAY_AVAILABLE && (
										<label htmlFor="ws-storage-overlay" className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
											<Switch id="ws-storage-overlay" aria-label="Storage overlay" checked={storageOverlay} onCheckedChange={(next) => { setStorageOverlay(next); setStorageOverlayEnabled(next); notify(next ? 'Storage overlay on — live client-storage footprint & boot cost.' : 'Storage overlay off.'); }} />
											<span className="min-w-0">
												<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Storage overlay</span>
												<span className="block text-[11px] text-muted-foreground">A live readout of the client-side state that accumulates in a normal profile but not in private browsing: storage-quota usage, your localStorage footprint by category (decks, checkpoints, chats, snapshots), the service-worker cache entry counts, and the O(n) boot scan cost that slows reloads as it fills. Drag to reposition; also via <code>?storage</code>.</span>
											</span>
										</label>
									)}
								</div>
							)}
							{/* Crash reports — its OWN group, not a row inside Diagnostics above,
							    because that whole block sits behind PERF_OVERLAY_AVAILABLE (a GA
							    gate that is expected to go false one day). A crash report is not a
							    developer overlay; it is how an author finds out why their work
							    vanished, and it has to outlive that gate.
							    A SWITCH, and off by default. The module used to argue the opposite in
							    its own comments — "a crash you must opt into recording is a crash you
							    never catch" — and that was a real cost honestly stated, but it was the
							    wrong trade for what this records: a rolling diary of the session on
							    this device, including whatever a third-party library chose to pass to
							    `console.error`. Diagnostics you did not ask for should not be the
							    default, however careful they are. The cost is named in the off copy
							    rather than hidden, so turning it on is an informed choice and the
							    first crash after a fresh install is genuinely not caught.
							    Since the boot toast was removed this group is also the ONLY way in —
							    the sentinel never interrupts anyone, because the endings it can see
							    are mostly the browser unloading an idle tab, and a notice that is
							    usually a false alarm spends the credibility the true one needs.
							    ALWAYS PRESENT, including at zero. The first cut hid the whole group
							    when there was nothing to report — "don't show a permanently-empty
							    row" — and that was wrong for a DIAGNOSTIC. It was reported from a real
							    phone as "I don't see it": a hidden row is indistinguishable from a
							    feature that never shipped, or one that has silently broken.
							    The reports row and the destructive control still appear only when
							    there is something to show or destroy. */}
							<div className="mt-6">
								<GroupLabel icon={<ShieldAlert className="size-3.5" />}>Crash reports</GroupLabel>
								<label htmlFor="ws-crash-reports" className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
									<Switch
										id="ws-crash-reports"
										aria-label="Record what the Studio was doing before a crash"
										checked={crashOn}
										onCheckedChange={(next) => {
											setCrashOn(next);
											saveSettings({ crashReports: next });
											// TAKE EFFECT NOW, not on the next load. Turning it on mid-session
											// starts the recorder (idempotent); turning it off stops it AND drops
											// the half-written record of the session you were in the middle of —
											// consent withdrawn is not the same as a clean exit. Past reports are
											// left alone; the two-tap control below is how those go.
											if (next) {
												startCrashSentinel();
												notify('Recording. If a session ends unexpectedly, the report lands here — on this device.');
											} else {
												stopCrashSentinel();
												setCrashCount(collectCrashReports(Date.now()).length);
												setCrashStored(crashReportStats().count);
												notify('Stopped recording. Reports already saved are still here until you clear them.');
											}
										}}
										className="mt-0.5"
									/>
									<span className="min-w-0">
										<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Record what the Studio was doing before a crash</span>
										<span className="block text-[11px] leading-snug text-muted-foreground">
											{crashOn
												? 'Keeps a rolling record on this device — what you were doing, how memory was trending, and every error it saw, including the ones only the console showed. Nothing is sent anywhere: reporting one opens a pre-filled GitHub issue you read over and submit yourself. Kept for seven days, then dropped.'
												: 'Off. Nothing is recorded, so a crash that happens now leaves no trail to read. Turn it on and the Studio keeps a rolling record on this device — what you were doing, memory, and the errors it saw — so the NEXT one is diagnosable. It never sends anything anywhere, and it never interrupts you.'}
										</span>
									</span>
								</label>
								{crashStored > 0 && (
									<div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
										<span className="min-w-0 flex-1">
											<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">
												{crashCount === 0
													? crashStored === 1
														? '1 recorded session'
														: `${crashStored} recorded sessions`
													: crashCount === 1
														? '1 session ended unexpectedly'
														: `${crashCount} sessions ended unexpectedly`}
											</span>
											<span className="block text-[11px] text-muted-foreground">
												{crashCount === 0
													? 'Nothing in these ended unexpectedly, or they are too recent to tell yet. Kept on this device for seven days.'
													: 'What the Studio was doing, how memory was trending, and every error it saw. Recorded on this device.'}
											</span>
										</span>
										<span className="flex shrink-0 items-center gap-1.5">
											{crashCount > 0 && (
											<Button
												size="sm"
												variant="outline"
												onClick={() => {
													// The report sheet lives in StudioShell (it owns the collected
													// reports and their dismissal state); this panel is a sibling, so
													// the hand-off is an event rather than a prop drilled through the
													// whole shell. Close this one first — two stacked bottom sheets on
													// a phone is exactly the pile-up panel.tsx exists to prevent.
													onOpenChange(false);
													dispatchEvent(new CustomEvent(OPEN_CRASH_REPORT_EVENT));
												}}
											>
												View
											</Button>
											)}
											{/* The SAME two-tap delete the Library and the Data tab use — HARD
											    RULE #15: one delete affordance, not a bespoke one per surface. */}
											<DeleteBtn
												armed={crashArmed}
												onArm={() => setCrashArmed(true)}
												onCancel={() => setCrashArmed(false)}
												onConfirm={() => {
													clearCrashReports();
													setCrashArmed(false);
													setCrashCount(0);
													setCrashStored(crashReportStats().count);
													notify('Crash reports cleared.');
												}}
												label="crash reports"
											/>
										</span>
									</div>
								)}
							</div>
						</div>
					)}

					{tab === 'AI' && (
						<div>
							{/* ── MODEL — the active-generation tier ─────────────────── */}
							<GroupLabel icon={<Sparkles className="size-3.5" />}>Model</GroupLabel>
							{/* The active-tier SWITCH — picking a side sets which tier generates. */}
							<div className="flex gap-1 rounded-lg border border-border p-0.5" role="tablist" aria-label="Active generation tier">
								{([['cloud', 'Cloud', <Cloud key="c" className="size-3.5" />, pickCloud], ['ondevice', 'On-device', <Cpu key="d" className="size-3.5" />, pickOnDevice]] as const).map(([key, label, icon, onPick]) => (
									<button type="button" key={key} role="tab" aria-selected={genView === key} onClick={onPick} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-semibold', genView === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-[var(--text-heading)]')}>{icon}{label}</button>
								))}
							</div>
							<p className="mb-3 mt-1.5 px-0.5 text-[11px] text-muted-foreground">
								<span className="font-semibold text-[var(--text-heading)]">{cloudActive ? 'Cloud is active' : onDeviceActive ? 'On-device is active' : 'No tier active yet'}</span>
								{cloudActive ? ' — edits run on OpenRouter.' : onDeviceActive ? ' — free & private on this device.' : ' — connect a cloud model or load one on-device.'}
							</p>

							{genView === 'cloud' ? (
								ai.openRouterReady ? (
									<div>
										<div className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', cloudActive ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}>
											<span className={cn('grid size-[30px] place-items-center rounded-lg', cloudActive ? 'bg-primary text-primary-foreground' : 'bg-[var(--accent-soft)] text-[var(--accent)]')}><Zap className="size-4" /></span>
											<span><div className="text-[13px] font-semibold text-[var(--text-heading)]">OpenRouter — {cloudActive ? 'active' : 'connected, dormant'}</div><div className="text-[11px] text-muted-foreground">{ai.remaining != null ? `${fmtUSD(ai.remaining)} left` : 'Connected'}</div></span>
											<button type="button" onClick={disconnect} className="ml-auto rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)]">Disconnect</button>
										</div>
										<div className="mt-3"><ModelPicker status={ai} notify={notify} /></div>
										<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground"><span className="text-[var(--accent)]">●</span> Metered per request · the deck text leaves your device.</p>
									</div>
								) : (
									<div>
										<button type="button" onClick={connect} disabled={connecting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"><Plug className="size-4" />{connecting ? 'Opening OpenRouter…' : 'Connect OpenRouter (one click)'}</button>
										<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Connecting uses your own OpenRouter account (one-click OAuth — no key to paste). You then pick from 500+ models, defaulting to the latest Claude Sonnet. Or switch to On-device to run free &amp; private with no account.</p>
									</div>
								)
							) : (
								<div>
									<OnDeviceTier status={ai} notify={notify} />
									{ai.openRouterReady && (
										<div className="mt-2.5 flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
											<span className="grid size-[30px] place-items-center rounded-lg bg-[color-mix(in_srgb,var(--text-muted)_12%,transparent)] text-muted-foreground"><Cloud className="size-4" /></span>
											<span><div className="text-[13px] font-semibold text-muted-foreground">OpenRouter — connected, dormant</div><div className="text-[11px] text-muted-foreground">{ai.remaining != null ? `${fmtUSD(ai.remaining)} left · ` : ''}stays linked while you run on-device</div></span>
											<button type="button" onClick={pickCloud} className="ml-auto rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)]">Use Cloud</button>
										</div>
									)}
								</div>
							)}

							{/* ── SPEND — a facet of the model, not its own tab. Cloud only — */}
							{/* on-device is unconditionally free, so a cap/gauge don't apply. */}
							{genView === 'cloud' ? (
							<AiSection>
								<GroupLabel icon={<Wallet className="size-3.5" />}>Spend</GroupLabel>

								{/* 1 · WALLET — the real account money (/credits). Authoritative. */}
								{ai.wallet ? (
									<div className="rounded-2xl border border-border bg-[var(--accent-soft)] p-3.5">
										<div className="flex items-baseline justify-between"><span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Wallet · OpenRouter</span><span className="text-[24px] font-extrabold text-[var(--text-heading)]">{fmtUSD(ai.wallet.balance)}</span></div>
										<div className="flex items-baseline justify-between"><span className="text-[11px] text-muted-foreground">your real balance</span><span className="text-[11px] text-muted-foreground">left of {fmtUSD(ai.wallet.credits)}</span></div>
										<div className="mt-2 h-[6px] overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct(ai.wallet.usage, ai.wallet.credits)}%` }} /></div>
										<div className="mt-1.5 font-mono text-[11px] text-muted-foreground">{fmtUSD(ai.wallet.usage)} used all-time</div>
									</div>
								) : (
									<div className="rounded-2xl border border-border bg-card p-3.5">
										<p className="text-[13px] font-semibold text-[var(--text-heading)]">{ai.openRouterReady ? 'Wallet balance unavailable' : 'No model connected'}</p>
										<p className="mt-1 text-[11px] text-muted-foreground">{ai.openRouterReady ? "This key can't read your account balance." : 'Connect OpenRouter (Model section above) to see your real balance — or run On-device, free.'}</p>
									</div>
								)}

								{/* 2 · THIS KEY — the per-key server-enforced cap (set in the OR dashboard). */}
								{ai.openRouterReady && (
									<div className="mt-2 flex items-start gap-2.5 border-t border-border pt-2.5">
										<span className="grid size-[26px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]"><KeyRound className="size-3.5" /></span>
										<span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">This key · Lattice Studio</span>{ai.limit != null ? <span className="block text-[11px] text-muted-foreground">server-enforced{ai.limitReset ? ` · resets ${ai.limitReset}` : ''}</span> : <a href={ai.keySettingsUrl ?? '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)]">Set a hard cap <ExternalLink className="size-3" /></a>}</span>
										{ai.limit != null && <span className="text-right"><span className="block font-mono text-[12.5px] text-muted-foreground">{ai.remaining != null ? `${fmtUSD(ai.remaining)} left` : '—'}</span><span className="block text-[11px] text-muted-foreground">of {fmtUSD(ai.limit)}</span></span>}
									</div>
								)}

								{/* 3 · THIS SESSION — live local tally from each reply's usage.cost. */}
								<div className="mt-1 flex items-start gap-2.5 border-t border-border pt-2.5">
									<span className="grid size-[26px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]"><Download className="size-3.5" /></span>
									<span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">This session</span><span className="block font-mono text-[11px] text-muted-foreground">{spend.sessionTokens ? `${fmtTokens(spend.sessionTokens)} tokens` : 'no spend yet'}</span></span>
									<span className="font-mono text-[12.5px] text-muted-foreground">{fmtUSD(spend.session)}</span>
								</div>

								{/* 4 · YOUR CAP — client defense-in-depth + the binding-constraint gauge. */}
								<div className="mt-2 rounded-xl border border-border p-3">
									<div className="flex items-center gap-2">
										<label htmlFor="ws-cap" className="text-[12.5px] font-semibold text-[var(--text-heading)]">Your cap</label>
										<span className="text-[12.5px] text-muted-foreground">$</span>
										<input id="ws-cap" type="number" min={0} step={0.5} defaultValue={spend.cap || ''} placeholder="none" onBlur={(e) => { setBudget(Number(e.target.value) || null, spend.mode as 'alert' | 'stop'); setSpend(architectSpend()); }} className="w-[64px] rounded-md border border-border bg-background px-2 py-1 text-[12.5px] text-foreground outline-none focus:border-[var(--accent)]" />
										<Select value={spend.mode} onValueChange={(v) => { setBudget(spend.cap || null, v as 'alert' | 'stop'); setSpend(architectSpend()); }}>
											<SelectTrigger aria-label="Budget enforcement mode" className="ml-auto h-auto gap-2 border-border bg-background px-2 py-1 text-[12.5px] font-semibold text-[var(--text-heading)]">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="alert">Warn 80%</SelectItem>
												<SelectItem value="stop">Hard stop</SelectItem>
											</SelectContent>
										</Select>
									</div>
									{spend.cap > 0 && (
										<div className="mt-2.5 h-[6px] overflow-hidden rounded-full bg-border"><span className={cn('block h-full rounded-full', spend.status.level === 'over' ? 'bg-[var(--fail,#b3261e)]' : spend.status.level === 'warn' ? 'bg-[var(--warn,#9a6a00)]' : 'bg-primary')} style={{ width: `${Math.min(100, pct(spend.session, spend.cap))}%` }} /></div>
									)}
									<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{spend.cap > 0 ? `${spend.mode === 'stop' ? 'AI edits stop' : 'Warns'} at your $${spend.cap.toFixed(2)} cap — the tightest of wallet / key / cap binds. Hard stop refuses a send whose estimate would breach it.` : 'No cap — metered per request. On-device tiers are always free.'}{spend.status.message ? ` ${spend.status.message}.` : ''}</p>
								</div>

								{/* Active model price + cost levers. */}
								{ai.openRouterReady && (
									<div className="mt-2 flex items-start gap-2.5 border-t border-border pt-2.5">
										<span className="grid size-[26px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]"><Sparkles className="size-3.5" /></span>
										<span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Active model{ai.modelName ? ` · ${ai.modelName}` : ''}</span><span className="block font-mono text-[11px] text-muted-foreground">{ai.price && ai.price.promptPerM != null ? `${fmtPrice(ai.price.promptPerM)}/M in · ${fmtPrice(ai.price.completionPerM)}/M out` : 'price loads with the catalog'}</span></span>
									</div>
								)}
								<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Iterating a draft? <button type="button" onClick={pickOnDevice} className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">Switch to On-device</button> — free &amp; private.</p>
							</AiSection>
							) : (
							<AiSection>
								<GroupLabel icon={<Wallet className="size-3.5" />}>Spend</GroupLabel>
								<p className="text-[11px] leading-relaxed text-muted-foreground">On-device runs free &amp; private, on this device — nothing to configure here.</p>
							</AiSection>
							)}

							{/* Output language used to live here as its own AI knob. It's now a GENERAL
							    workspace default (General tab) that both tiers inherit — it describes the
							    deck's language, not the model — with a per-deck override in the Inspector. */}

							{/* ── STANDING INSTRUCTIONS — separate cloud/on-device fields, not one shared+truncated field ── */}
							<AiSection>
								<GroupLabel icon={<MessageSquareText className="size-3.5" />}>Standing instructions{genView === 'ondevice' ? ' · on-device' : ''}</GroupLabel>
								{genView === 'cloud' ? (
									<div>
										<p className="mb-2 text-xs text-muted-foreground">A standing voice note, sent with every cloud generation. Leave blank for none.</p>
										<textarea
											value={instructions}
											onChange={(e) => {
												setInstructions(e.target.value);
												saveInstructions(e.target.value);
											}}
											rows={5}
											placeholder="e.g. Confident, board-ready voice. Lead each slide with the number. Avoid hedging."
											aria-label="Standing instructions"
											className="w-full resize-none rounded-xl border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--accent)]"
										/>
										<div className="mt-1 text-right font-mono text-[11px] text-muted-foreground">{instructions.length} chars · saved</div>
									</div>
								) : (
									<div>
										<p className="mb-2 text-xs text-muted-foreground">A shorter, separate note for on-device generation — a small local model loses the thread past a brief instruction, so this is capped and independent of the cloud field above.</p>
										<textarea
											value={odInstructions}
											onChange={(e) => {
												const next = truncateCodePoints(e.target.value, ON_DEVICE_INSTRUCTIONS_MAX);
												setOdInstructions(next);
												saveOnDeviceInstructions(next);
											}}
											rows={3}
											maxLength={ON_DEVICE_INSTRUCTIONS_MAX}
											placeholder="e.g. Short, punchy bullets."
											aria-label="On-device standing instructions"
											className="w-full resize-none rounded-xl border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--accent)]"
										/>
										<div className="mt-1 text-right font-mono text-[11px] text-muted-foreground">{odInstructions.length}/{ON_DEVICE_INSTRUCTIONS_MAX} chars · saved</div>
									</div>
								)}
							</AiSection>

							{/* ── READ-ALOUD VOICE — cloud (OpenRouter TTS) or on-device (Kokoro), never both at once ── */}
							<AiSection>
								<GroupLabel icon={<Volume2 className="size-3.5" />}>Read-aloud voice{genView === 'ondevice' ? ' · on-device' : ' · cloud'}</GroupLabel>
								<TtsSettings tier={genView} notify={notify} />
							</AiSection>

							{/* ── ON-DEVICE — what runs locally that is NOT the generation tier. The Model
							    switch above chooses where GENERATION happens; this section is for the
							    local work that happens regardless, with no model and no download. ── */}
							<AiSection>
								<GroupLabel icon={<Cpu className="size-3.5" />}>On-device</GroupLabel>
								<label htmlFor="ws-intent-search" className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
									<Switch
										id="ws-intent-search"
										aria-label="Search slides by what you want to say"
										checked={intentSearch}
										onCheckedChange={(next) => {
											setIntentSearch(next);
											saveSettings({ intentSearch: next });
											notify(next ? 'Slide search now understands plain English — describe the slide, not its name.' : 'Slide search is back to matching names and tags literally.');
										}}
										className="mt-0.5"
									/>
									<span className="min-w-0">
										<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Search slides by what you want to say</span>
										<span className="block text-[11px] leading-snug text-muted-foreground">
											Type <em>“who owns what”</em> or <em>“where do users drop off”</em> in the add-slide gallery and get a ranked shortlist with a match score, instead of nothing. It reads the component descriptions already in this page — no model, no download, no request leaves this device — so it costs nothing and works offline. Turn it off to match names and tags literally.
										</span>
									</span>
								</label>
							</AiSection>

							<AiSection>
								<GroupLabel icon={<Sparkles className="size-3.5" />}>Component generation</GroupLabel>
									<label htmlFor="ws-dedup" className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
										<Switch id="ws-dedup" aria-label="Suggest similar components" checked={dedup} onCheckedChange={(next) => { setDedup(next); writeDedupEnabled(next); }} />
										<span className="min-w-0">
											<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Suggest similar components</span>
											<span className="block text-[11px] text-muted-foreground">Before generating, surface near-duplicate components so you can reuse instead of adding another.</span>
										</span>
									</label>
							</AiSection>

							<AiSection>
								<GroupLabel icon={<Zap className="size-3.5" />}>Prompt caching</GroupLabel>
									{/* Honesty gate: the switch only does something on a model that takes an
									    explicit cache breakpoint. The panel this replaced disabled it otherwise;
									    losing that turned `orSupportsCache` into dead code and left the control
									    promising a saving it could not deliver on most of the catalog. */}
									<label htmlFor="ws-caching" className={cn('mt-2 flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5', cacheUsable ? 'cursor-pointer' : 'opacity-60')}>
										<Switch id="ws-caching" aria-label="Reuse the cached prompt" disabled={!cacheUsable} checked={caching} onCheckedChange={(next) => { setCaching(next); writeCachingEnabled(next); }} />
										<span className="min-w-0">
											<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">Reuse the cached prompt</span>
											<span className="block text-[11px] text-muted-foreground">
												{cacheUsable
													? 'Chat re-sends a large, unchanging preamble every turn. Caching it bills that part at about a tenth on later turns, for a small surcharge the first time — worth leaving on for any real conversation.'
													: ai.openRouterReady
														? 'This model does not take a cache breakpoint, so the setting has no effect on it. Anthropic and Google models do.'
														: 'Connect a cloud model in Model above and this applies to it.'}
											</span>
										</span>
									</label>
							</AiSection>
						</div>
					)}

					{tab === 'Data' && (
						<div>
						<div className="mt-1">
							<GroupLabel icon={<FolderTree className="size-3.5" />}>Where decks live</GroupLabel>
							<button type="button" onClick={() => { setStoreInCloud(false); notify('Decks are stored on this device (localStorage).'); }} className={cn('my-2 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left', !storeInCloud ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}>
								<span className="text-[13px] font-semibold text-[var(--text-heading)]">This device only</span><span className="ml-auto text-[11px] text-muted-foreground">local · how Studio stores today</span>
							</button>
							<button type="button" onClick={() => { setStoreInCloud(true); notify('Cloud sync is not enabled in this build — decks stay on this device.'); }} className={cn('my-2 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left', storeInCloud ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}>
								<span className="text-[13px] font-semibold text-[var(--text-heading)]">Cloud workspace</span><span className="ml-auto text-[11px] text-muted-foreground">synced — coming soon</span>
							</button>
						</div>

						{/* Backup & restore — ownership framing, never alarm. The one place a
						    browser-specific sentence appears is a Safari TAB (the storage-
						    eviction case); the installed app and other browsers don't get it. */}
						<div className="mt-6">
							<GroupLabel icon={<LifeBuoy className="size-3.5" />}>Backup &amp; restore</GroupLabel>
							<p className="mb-3 text-xs text-muted-foreground">
								Your decks live in this browser — private to this device. A backup keeps them yours even if the browser clears its data.
								{isEvictionProneBrowser() ? ' Safari clears unused site data after a week — a backup makes that a non-event.' : ''}
							</p>
							<div className="grid grid-cols-2 gap-2.5">
								<button type="button" onClick={downloadBackup} disabled={busy != null} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-60">
									<Download className="size-4" />{busy === 'backup' ? 'Packing…' : 'Download backup'}
								</button>
								<button type="button" onClick={() => restoreInput.current?.click()} disabled={busy != null} className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-[13px] font-semibold text-[var(--text-heading)] disabled:opacity-60">
									<Upload className="size-4" />{busy === 'restore' ? 'Restoring…' : 'Restore backup'}
								</button>
								<input ref={restoreInput} type="file" accept=".zip" aria-label="Restore a workspace backup" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) restoreBackup(f); }} />
							</div>
							<p className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
								<SlidersHorizontal className="size-3" />
								Last backup: {backupAt ? new Date(backupAt).toLocaleDateString() : 'never'}{storageLine ? ` · ${storageLine}` : ''}
							</p>
							<p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">One zip: every deck (readable .md copies included), version history, chats, settings, and your Library — saved themes, components, finishes, and reference docs. Restoring never overwrites — a deck that changed since the backup comes back beside the current one as “(restored)”. Your OpenRouter connection is never in the file.</p>
						</div>
							<div className="mb-2 flex items-center justify-between gap-2">
								<GroupLabel icon={<ShieldCheck className="size-3.5" />}>Your data</GroupLabel>
								{gov && gov.totalBytes > 0 && <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--text-heading)]">{fmtBytes(gov.totalBytes)} total</span>}
							</div>
							<p className="mb-3 text-xs text-muted-foreground">Everything the Studio has stored in this browser — clear one thing, or start over completely. Nothing here reaches a server; it's all local to this device. Your preferences (language, placement handles, etc.) are never touched here.</p>
							<div className="flex flex-col gap-2.5">
								<GovRow
									icon={<FolderTree className="size-4" />}
									title="Decks"
									description="Every deck in your switcher — edited source, checkpoints, and chat threads. Resets to the built-in starter decks."
									stat={gov ? `${gov.decks.count} deck${gov.decks.count === 1 ? '' : 's'}${gov.decks.bytes ? ` · ${fmtBytes(gov.decks.bytes)}` : ''}` : undefined}
									armed={govArmed === 'decks'}
									busy={govBusy === 'decks'}
									onArm={() => setGovArmed('decks')}
									onConfirm={() => clearCategory('decks', clearAllDecks, 'Decks cleared — back to the starter set.')}
									onCancel={() => setGovArmed(null)}
								/>
								<GovRow
									icon={<FileBox className="size-4" />}
									title="Library assets"
									description="Saved themes, components, finishes, and reference docs."
									stat={gov ? `${gov.library.count} asset${gov.library.count === 1 ? '' : 's'}${gov.library.bytes ? ` · ${fmtBytes(gov.library.bytes)}` : ''}` : undefined}
									armed={govArmed === 'library'}
									busy={govBusy === 'library'}
									onArm={() => setGovArmed('library')}
									onConfirm={() => clearCategory('library', clearLibraryAssets, 'Library cleared.')}
									onCancel={() => setGovArmed(null)}
								/>
								<GovRow
									icon={<KeyRound className="size-4" />}
									title="OpenRouter credentials"
									description="Your OpenRouter connection — disconnects the key this browser holds (shared with the Drawing Board, if you use it); reconnect any time with one click."
									stat={ai.openRouterReady ? 'connected' : 'not connected'}
									armed={govArmed === 'openrouter'}
									busy={govBusy === 'openrouter'}
									onArm={() => setGovArmed('openrouter')}
									onConfirm={() => clearCategory('openrouter', disconnectOpenRouter, 'OpenRouter disconnected.')}
									onCancel={() => setGovArmed(null)}
								/>
								<GovRow
									icon={<Cpu className="size-4" />}
									title="Downloaded models"
									description="On-device AI model files your browser cached after first download (WebLLM / Transformers.js). The next on-device use re-downloads them."
									stat={gov ? `${gov.models.count} cache${gov.models.count === 1 ? '' : 's'}${gov.models.bytes ? ` · ${fmtBytes(gov.models.bytes)}` : ''}` : undefined}
									armed={govArmed === 'models'}
									busy={govBusy === 'models'}
									onArm={() => setGovArmed('models')}
									onConfirm={() => clearCategory('models', clearDownloadedModels, 'Downloaded models cleared.')}
									onCancel={() => setGovArmed(null)}
								/>
								<GovRow
									icon={<Volume2 className="size-4" />}
									title="Narration audio"
									description="Spoken narration Present synthesized and kept on this device, so a deck you've rehearsed presents instantly and without paying for the same lines twice. Clearing it re-synthesizes on the next present."
									stat={gov ? `${gov.narration.count} line${gov.narration.count === 1 ? '' : 's'}${gov.narration.bytes ? ` · ${fmtBytes(gov.narration.bytes)}` : ''}` : undefined}
									armed={govArmed === 'narration'}
									busy={govBusy === 'narration'}
									onArm={() => setGovArmed('narration')}
									onConfirm={() => clearCategory('narration', clearNarrationAudio, 'Narration audio cleared.')}
									onCancel={() => setGovArmed(null)}
								/>
								<GovRow
									icon={<Database className="size-4" />}
									title="Cache"
									description="Offline app cache — pages, scripts, and fonts. Nothing breaks; the next visit re-caches while online."
									stat={gov ? `${gov.siteCache.count} cache${gov.siteCache.count === 1 ? '' : 's'}${gov.siteCache.bytes ? ` · ${fmtBytes(gov.siteCache.bytes)}` : ''}` : undefined}
									armed={govArmed === 'cache'}
									busy={govBusy === 'cache'}
									onArm={() => setGovArmed('cache')}
									onConfirm={() => clearCategory('cache', clearSiteCache, 'Cache cleared.')}
									onCancel={() => setGovArmed(null)}
								/>
							</div>

							<div className="mt-6 rounded-xl border border-[color-mix(in_srgb,var(--fail,#c0392b)_35%,transparent)] bg-[color-mix(in_srgb,var(--fail,#c0392b)_6%,transparent)] p-3.5">
								<div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--fail,#c0392b)]"><Trash2 className="size-3.5" />Delete everything</div>
								<p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">Clears every category above in one go — decks, Library, OpenRouter, downloaded models, and cache. This can't be undone.</p>
								<button type="button" onClick={() => { setDeleteAllText(''); setDeleteAllOpen(true); }} className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--fail,#c0392b)_40%,transparent)] bg-[color-mix(in_srgb,var(--fail,#c0392b)_12%,transparent)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--fail,#c0392b)]">
									<Trash2 className="size-3.5" />Delete everything…
								</button>
							</div>

							<Dialog open={deleteAllOpen} onOpenChange={(o) => { if (!deletingAll) setDeleteAllOpen(o); }}>
								<DialogContent>
									<DialogHeader>
										<DialogTitle className="flex items-center gap-2 text-[var(--fail,#c0392b)]"><Trash2 className="size-4" />Delete everything?</DialogTitle>
										<DialogDescription>
											This deletes every deck, your whole Library, disconnects OpenRouter, and clears downloaded models + cache — in this browser. It cannot be undone. Type <span className="font-mono font-semibold text-foreground">delete</span> to confirm.
										</DialogDescription>
									</DialogHeader>
									<input
										autoFocus
										value={deleteAllText}
										onChange={(e) => setDeleteAllText(e.target.value)}
										placeholder="delete"
										aria-label='Type "delete" to confirm'
										className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-[var(--fail,#c0392b)]"
									/>
									<DialogFooter>
										<Button variant="outline" onClick={() => setDeleteAllOpen(false)} disabled={deletingAll}>Cancel</Button>
										<Button variant="destructive" disabled={deleteAllText.trim().toLowerCase() !== 'delete' || deletingAll} onClick={deleteEverything}>
											{deletingAll ? 'Deleting…' : 'Delete everything'}
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						</div>
					)}

			</PanelBody>
		</PanelSheet>
	);
}
