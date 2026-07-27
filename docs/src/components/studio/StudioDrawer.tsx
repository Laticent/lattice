// The mobile "···" overflow, rebuilt as a bottom Sheet with five FIXED, NAMED zones
// instead of one flat scrolling DropdownMenu (2026-07-26-studio-mobile-eight-cell-
// bar.md, round 2 of the mobile-toolbar design competition). None of the six
// protected controls — Present, Share, Coach, Chat, Settings, the pane toggle —
// live here; they stay one tap, inline, on the Eight-Cell Bar. This holds only the
// genuinely secondary stuff: low-frequency editor actions, guided tours, reader
// views, the theme catalog, and workspace-level settings.
//
// Workspace leads (Library, Search, Feedback) — post-launch feedback moved it from
// last zone to first, and from a vertical Row list to a scannable icon-button row
// (IconAction below), because these get reached for far more often than "buried
// behind Look" implied. Workspace SETTINGS itself later moved out of this row
// entirely, promoted to the header (between mode and "More controls") so it's
// reachable in one tap instead of drawer-open-then-tap; keeping it here too would
// recreate the exact "same setting, two homes" problem just fixed by removing
// Slide settings from Views below (Settings is the toolbar's own cell).
//
// Long catalogs (tours, themes) scroll SIDEWAYS inside their own zone rather than
// stacking vertically — the structural fix for the old "···"'s real failure mode: an
// 18-theme, 4-tier catalog dominating one undifferentiated vertical scroll with no
// section header a user actually notices.
import { FileBox, History as HistoryIcon, ListChecks, MonitorPlay, MoreHorizontal, Plus, Search } from 'lucide-react';
import * as React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { FeedbackIcon, LensIcon } from './icons';
import type { ComponentEntry } from './SlidePicker';
import { ScrollFade } from './scroll-fade';
import { type SavedTheme, themeSelectGroups } from './ThemePicker';
import type { TourMeta } from './tours';

function Zone({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="py-3 first:pt-0">
			<div className="mb-1.5 px-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
			{children}
		</div>
	);
}

function Row({ icon, label, badge, disabled, onClick }: { icon: React.ReactNode; label: string; badge?: number; disabled?: boolean; onClick: () => void }) {
	return (
		<button type="button" disabled={disabled} onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left text-[13.5px] font-medium text-[var(--text-heading)] disabled:opacity-40 enabled:hover:bg-[var(--accent-soft)]">
			{icon}
			<span className="flex-1">{label}</span>
			{/* --warn, not --chart-2: --chart-2 is undefined everywhere in this codebase (palettes
			    define --chart-cat2, a different name), so `var(--chart-2, #9c3f00)` always fell back
			    to a hardcoded, palette-blind orange — bare text with no background compensation, it
			    measured 2.55–2.95:1 against the drawer's own --bg in every dark palette (found by the
			    adversarial trio; AA needs 4.5:1). --warn is a real per-palette/mode token. */}
			{typeof badge === 'number' && badge > 0 && <span className="font-mono text-[11px] font-semibold text-[var(--warn)]">{badge}</span>}
		</button>
	);
}

/** An icon-topped, captioned button — the Workspace zone's row, one per action, laid out
 *  as a scannable row instead of a vertical list (each `flex-1` so four actions split the
 *  width evenly; ≥44px tall keeps the touch floor). `label` is the full accessible name
 *  (matches the tablet dropdown's row name, so the two surfaces agree for a11y tooling);
 *  `caption` is the short visual text the icon-row layout has room for. */
function IconAction({ icon, label, caption, onClick }: { icon: React.ReactNode; label: string; caption: string; onClick: () => void }) {
	return (
		<button type="button" aria-label={label} onClick={onClick} className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10.5px] font-semibold text-[var(--text-heading)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]">
			{icon}
			<span aria-hidden="true">{caption}</span>
		</button>
	);
}

export function StudioDrawer({
	open,
	onOpenChange,
	onNavigate,
	effPane,
	insertComponents,
	issues,
	onInsert,
	onFixAll,
	onVersionHistory,
	onLenses,
	demoActive,
	tours,
	onStartDemo,
	onLibrary,
	onSearch,
	onFeedback,
	palette,
	savedThemes,
	onApplyPalette,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** A row that opens a further surface calls this INSTEAD of closing the drawer
	 *  itself — the host (StudioShell) closes the drawer, opens the target, and
	 *  remembers to REOPEN the drawer once that target closes, so dismissing a
	 *  child sheet returns here instead of dropping all the way back to the
	 *  toolbar (reported: it used to just vanish both).
	 *  `returns: false` for a row that opens NO sheet (Fix all issues runs an editor
	 *  method; a tour just starts) — otherwise the reopen flag arms and never clears,
	 *  and the next unrelated sheet close springs this drawer open. */
	onNavigate: (openTarget: () => void, opts?: { returns?: boolean }) => void;
	effPane: 'edit' | 'preview';
	insertComponents: ComponentEntry[];
	issues: number;
	onInsert: () => void;
	onFixAll: () => void;
	onVersionHistory: () => void;
	onLenses: () => void;
	demoActive: boolean;
	tours: TourMeta[];
	onStartDemo: (id: string) => void;
	onLibrary: () => void;
	onSearch: () => void;
	onFeedback: () => void;
	palette: string;
	savedThemes: SavedTheme[];
	onApplyPalette: (name: string) => void;
}) {
	const zoneRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
	const jumpTo = (key: string) => zoneRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	const themeGroups = React.useMemo(() => themeSelectGroups(savedThemes), [savedThemes]);
	/** Opens a further surface — the drawer reopens when that surface closes. */
	const go = (fn: () => void) => () => onNavigate(fn);
	/** Fires an action that opens NO surface — the drawer just closes, and must NOT
	 *  arm the reopen flag (see the `onNavigate` contract above). */
	const act = (fn: () => void) => () => onNavigate(fn, { returns: false });

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="bottom" className="flex h-[85dvh] flex-col gap-0 rounded-t-2xl p-0">
				<SheetHeader className="border-b border-border pb-2">
					{/* Every other Studio sheet (Settings, Lenses, Version history, Workspace) leads
					    with an accent-colored icon before its title; this one was plain text with no
					    icon at all, the one surface in the whole app that read as "a different kind
					    of thing" instead of a peer of the others (reported: confusing). The icon
					    matches the trigger that opens it ("More controls"), the same pattern every
					    other sheet's title icon follows (it matches its own toggle's icon). */}
					<SheetTitle className="flex items-center gap-2 text-[15px]"><MoreHorizontal className="size-4 text-[var(--accent)]" />Studio</SheetTitle>
					<SheetDescription className="sr-only">Editor actions, guided tours, reader views, themes, and workspace settings.</SheetDescription>
				</SheetHeader>
				<div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-3.5 py-2">
					{([['workspace', 'Workspace']] as [string, string][]).concat(effPane === 'edit' ? [['edit', 'Edit']] : []).concat([['views', 'Views'], ['show-me', 'Show me'], ['look', 'Look']]).map(([key, label]) => (
						<button key={key} type="button" onClick={() => jumpTo(key)} className="shrink-0 rounded-full border border-border px-3 py-1 font-mono text-[10.5px] font-semibold text-muted-foreground hover:text-[var(--text-heading)]">{label}</button>
					))}
				</div>
				<ScrollFade wrapperClassName="min-h-0 flex-1" className="h-full overflow-y-auto px-3.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
					{/* Workspace leads — the four lowest-frequency-per-slide, highest-frequency-
					    per-session actions (jump to a saved component, tune the workspace, jump
					    anywhere, ping us), read at a glance as an icon row rather than buried at
					    the foot of a vertical list. */}
					<div ref={(el) => { zoneRefs.current.workspace = el; }}>
						<Zone label="Workspace">
							<div className="flex gap-1">
								<IconAction icon={<FileBox className="size-5" />} label="Library" caption="Library" onClick={go(onLibrary)} />
								<IconAction icon={<Search className="size-5" />} label="Search / commands" caption="Search" onClick={go(onSearch)} />
								<IconAction icon={<FeedbackIcon className="size-5" />} label="Send feedback" caption="Feedback" onClick={go(onFeedback)} />
							</div>
						</Zone>
					</div>
					{/* This slide's editor actions — only while EDITING, so the Preview pane
					    reader doesn't see controls that act on a surface they aren't looking at. */}
					{effPane === 'edit' && (
						<div ref={(el) => { zoneRefs.current.edit = el; }}>
							<Zone label="Edit">
								{insertComponents.length > 0 && <Row icon={<Plus className="size-4 text-muted-foreground" />} label="Insert component" onClick={go(onInsert)} />}
								<Row icon={<ListChecks className="size-4 text-muted-foreground" />} label="Fix all issues" badge={issues} disabled={!issues} onClick={act(onFixAll)} />
							</Zone>
						</div>
					)}
					{/* Slide settings dropped (2026-07-27 feedback) — it duplicated the toolbar's
					    own Settings cell, which is the sole entry point now. Reader views and
					    Version history — both deck-level, neither slide-editing-specific, no
					    reason they were ever stacked as two vertical rows — read together as one
					    icon row, the same idiom as Workspace above. */}
					<div ref={(el) => { zoneRefs.current.views = el; }}>
						<Zone label="Views">
							<div className="flex gap-1">
								<IconAction icon={<LensIcon className="size-5" />} label="Reader views" caption="Reader" onClick={go(onLenses)} />
								<IconAction icon={<HistoryIcon className="size-5" />} label="Version history" caption="History" onClick={go(onVersionHistory)} />
							</div>
						</Zone>
					</div>
					{/* Hidden while a guided demo is live — same gate the old "···" tour list
					    used (StudioShell.tsx demoActive), so a take-over never fights a fresh pick. */}
					{!demoActive && (
						<div ref={(el) => { zoneRefs.current['show-me'] = el; }}>
							<Zone label="Show me">
								<ScrollFade axis="x" wrapperClassName="-mx-3.5" className="flex gap-2.5 overflow-x-auto px-3.5 pb-1">
									{tours.map((t) => (
										<button key={t.id} type="button" data-tour={t.id} onClick={act(() => onStartDemo(t.id))} className="w-[168px] shrink-0 rounded-lg border border-border bg-background p-3 text-left hover:border-[var(--accent)]">
											<span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text-heading)]"><MonitorPlay className="size-3.5 text-[var(--accent)]" />{t.label}</span>
											<span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{t.description}</span>
										</button>
									))}
								</ScrollFade>
							</Zone>
						</div>
					)}
					<div ref={(el) => { zoneRefs.current.look = el; }}>
						<Zone label="Look">
							{themeGroups.map((g) => (
								<div key={g.label ?? 'themes'} className="mb-2.5 last:mb-0">
									{g.label && <div className="mb-1 font-mono text-[10px] text-muted-foreground">{g.label}</div>}
									<ScrollFade axis="x" wrapperClassName="-mx-3.5" className="flex gap-3 overflow-x-auto px-3.5 pb-1">
										{g.options.map((opt) => (
											<button key={opt.value} type="button" aria-pressed={opt.value === palette} onClick={() => onApplyPalette(opt.value)} className="flex shrink-0 flex-col items-center gap-1">
												<span className={cn('size-7 rounded-full border-2', opt.value === palette ? 'border-[var(--accent)]' : 'border-transparent')} style={{ background: typeof opt.swatch?.background === 'string' ? opt.swatch.background : 'var(--accent)' }} />
												<span className="max-w-[52px] truncate font-mono text-[9px] text-muted-foreground">{opt.label}</span>
											</button>
										))}
									</ScrollFade>
								</div>
							))}
						</Zone>
					</div>
				</ScrollFade>
			</SheetContent>
		</Sheet>
	);
}
