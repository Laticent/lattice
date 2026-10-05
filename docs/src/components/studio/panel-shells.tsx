import { ArrowUp, Cloud, Cpu, FileBox, Paperclip, RotateCcw, Sparkles, Unlock, Upload, Wallet } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { PanelBody, PanelDock, PanelHeader, PanelSearch, PanelSection, PanelSheet, SETTING_SCOPE } from '@/components/ui/panel';
import { PillTabs } from '@/components/ui/pill-tabs';
import { SettingsTierSwitch } from '@/components/ui/settings-view';
import { Textarea } from '@/components/ui/textarea';
import { useBreakpoint, useLandscapePhone } from '@/lib/use-breakpoint';
import { cn } from '@/lib/utils';
import { SHARE_HEADER, SHARE_MENU, ShareRow } from './share-menu';
import { loadChat } from './studio-store';

// Loading shells for the six panels that load on first open (`lazy-panel.tsx`). Each one draws
// its panel's REAL frame — the same PanelSheet width, PanelHeader, tabs and search box, from
// the same primitives with the same props — and puts gray blocks only where the panel's
// content depends on data. So the frame does not move when the panel arrives; only the blocks
// fill in. Text a shell and its panel both show lives here (or in `share-menu.tsx`) and the
// panel imports it, so the two cannot drift.
//
// This module loads with the Studio. Keep it to UI primitives and constants: importing a
// panel, or anything a panel is heavy with, would put it straight back on the startup path.
// See engineering/decisions/2026-09-26-studio-panel-lazy-loading.md.

/** A gray placeholder block, hidden from assistive tech. */
function Block({ className, w, h }: { className?: string; w?: string; h?: number }) {
	return <div aria-hidden="true" className={cn('rounded-md bg-muted-foreground/10', className)} style={{ width: w, height: h }} />;
}

/** The one line a screen reader hears, following `ComposeSkeleton`. `data-panel-shell` lets tests wait for the real panel (`src/test/panels.ts`). */
function Loading({ what }: { what: string }) {
	return (
		<span className="sr-only" role="status" data-panel-shell="">
			Loading {what}…
		</span>
	);
}

/** Real controls drawn in a shell are inert: they look like the panel but take no input or focus. */
function Inert({ children, className = 'contents' }: { children: React.ReactNode; className?: string }) {
	return (
		<div inert className={className}>
			{children}
		</div>
	);
}

// ── Share ────────────────────────────────────────────────────────────────────

export function ShareShell({ open, onOpenChange, deckTitle, children }: { open: boolean; onOpenChange: (v: boolean) => void; deckTitle: string; children?: React.ReactNode }) {
	return (
		<PanelSheet open={open} onOpenChange={onOpenChange} side="right" width="md">
			<PanelHeader icon={SHARE_HEADER.icon} title={SHARE_HEADER.title(deckTitle)} srDescription={SHARE_HEADER.srDescription} />
			<PanelBody padded={false} className="space-y-6 p-5">
				{children ?? (
					<>
						{/* The menu itself: fixed text, so the shell shows it exactly. */}
						<Inert className="space-y-6">
							{SHARE_MENU.map((section) => (
								<PanelSection key={section.label} label={section.label}>
									<p className="text-xs text-muted-foreground">{section.blurb}</p>
									{section.rows.map((r) => (
										<ShareRow key={r.id} icon={r.icon} title={r.title} desc={r.desc} dev={r.dev} pending />
									))}
								</PanelSection>
							))}
						</Inert>
						<Loading what="Share" />
					</>
				)}
			</PanelBody>
		</PanelSheet>
	);
}

// ── Workspace ────────────────────────────────────────────────────────────────

export const WORKSPACE_TABS = ['General', 'AI', 'Data'] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];
export const WORKSPACE_DEFAULT_TAB: WorkspaceTab = 'AI';
export const WORKSPACE_HEADER = {
	icon: <Cloud />,
	title: 'Workspace',
	srDescription:
		'Your workspace setup — preferences and app install under General; the AI model, spend, and standing instructions under AI; where decks live, backup, storage, and deletion under Data.',
} as const;

/** A Workspace group heading, shared with `WorkspaceSheet.tsx`. */
export function WorkspaceGroupLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
	return (
		<h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold leading-normal text-[var(--text-heading)] [&_svg]:size-3.5">
			{icon}
			{children}
		</h3>
	);
}

/**
 * A secondary section inside the Workspace AI tab (Spend, Instructions), shared with
 * `WorkspaceSheet.tsx` — each sits below the Model section behind a hairline divider and top
 * space, so the long scroll reads as distinct regions rather than one undifferentiated column.
 */
export function WorkspaceAiSection({ children }: { children: React.ReactNode }) {
	return <div className="mt-6 border-t border-border pt-5">{children}</div>;
}

export function WorkspaceShell({ open, onOpenChange, children }: { open: boolean; onOpenChange: (v: boolean) => void; children?: React.ReactNode }) {
	return (
		<PanelSheet open={open} onOpenChange={onOpenChange} side="right" width="md">
			<PanelHeader icon={WORKSPACE_HEADER.icon} title={WORKSPACE_HEADER.title} srDescription={WORKSPACE_HEADER.srDescription} />
			<PanelBody padded={false} className="p-5">
				<Inert>
					<PillTabs className="mb-4" ariaLabel="Workspace settings" value={WORKSPACE_DEFAULT_TAB} onValueChange={() => {}} tabs={WORKSPACE_TABS.map((t) => ({ value: t, label: t }))} />
				</Inert>
				{children ?? (
					<>
						{/* The AI tab, where the sheet opens. The headings and the tier switch's labels are
						    fixed; which tier is active and what the account shows are not, so those are blocks. */}
						<Inert className="block">
							<WorkspaceGroupLabel icon={<Sparkles />}>Model</WorkspaceGroupLabel>
							<div className="flex gap-1 rounded-lg border border-border p-0.5">
								{(
									[
										['Cloud', <Cloud key="c" className="size-3.5" />],
										['On-device', <Cpu key="d" className="size-3.5" />],
									] as const
								).map(([label, icon]) => (
									<span key={label} className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-muted-foreground">
										{icon}
										{label}
									</span>
								))}
							</div>
							<Block className="mt-1.5 mb-3" w="72%" h={14} />
							<Block className="rounded-xl" h={42} />
							<Block className="mt-2" w="96%" />
							<Block className="mt-1.5" w="90%" />
							<Block className="mt-1.5" w="50%" />
							<WorkspaceAiSection>
								<WorkspaceGroupLabel icon={<Wallet />}>Spend</WorkspaceGroupLabel>
								<Block className="rounded-xl" h={122} />
							</WorkspaceAiSection>
						</Inert>
						<Loading what="Workspace settings" />
					</>
				)}
			</PanelBody>
		</PanelSheet>
	);
}

// ── Library ──────────────────────────────────────────────────────────────────

export type LibraryFilter = 'all' | 'theme' | 'component' | 'finish' | 'motion' | 'refdoc';
export const LIBRARY_FILTERS: Array<{ value: LibraryFilter; label: string }> = [
	{ value: 'all', label: 'All' },
	{ value: 'theme', label: 'Themes' },
	{ value: 'component', label: 'Components' },
	{ value: 'finish', label: 'Finishes' },
	{ value: 'motion', label: 'Motions' },
	{ value: 'refdoc', label: 'Files' },
];
export const LIBRARY_HEADER = {
	icon: <FileBox />,
	title: 'Library',
	srDescription: 'Saved themes, components, finishes, and files — search, filter, apply, or drop a file in.',
	searchPlaceholder: 'Search themes, components, finishes & files…',
} as const;

export function LibraryShell({ docked, open, onOpenChange, children }: { docked?: boolean; open: boolean; onOpenChange: (v: boolean) => void; children?: React.ReactNode }) {
	// Same predicate as the Library: a phone docks the search field at the bottom.
	const bp = useBreakpoint();
	const landscape = useLandscapePhone();
	const phone = !docked && (bp === 'mobile' || landscape);
	const search = (
		<PanelSearch value="" onChange={() => {}} onClear={() => {}} placeholder={LIBRARY_HEADER.searchPlaceholder} label="Search library" className={phone ? undefined : 'ml-1 flex-1'} />
	);
	const inner = (
		<>
			<PanelHeader
				icon={LIBRARY_HEADER.icon}
				title={LIBRARY_HEADER.title}
				srDescription={LIBRARY_HEADER.srDescription}
				actions={
					<Inert>
						{phone ? null : search}
						<Button variant="outline" size="sm" className="shrink-0 gap-1.5" aria-label="Import .zip">
							<Upload className="size-3.5" />
							<span className={cn('hidden', docked ? '@[20rem]:inline' : 'sm:inline')}>Import</span>
						</Button>
					</Inert>
				}
				onClose={docked ? () => onOpenChange(false) : undefined}
				showClose={!docked}
			/>
			<div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2.5">
				<Inert className="min-w-0 flex-1">
					<PillTabs ariaLabel="Library sections" value="all" onValueChange={() => {}} tabs={LIBRARY_FILTERS} />
				</Inert>
			</div>
			<div className="min-h-0 min-w-0 flex-1 overflow-hidden p-4">
				{/* Blank on purpose: the Library reads its shelf from storage after it mounts, so
				    nothing here can know whether it opens on cards or on "No saved assets yet". */}
				{children ?? <Loading what="the Library" />}
			</div>
			<div className="flex items-center gap-2 border-t border-border bg-card px-4 py-1.5 font-mono text-[11px]">
				<Block w="4.5rem" h={12} className="my-[2.5px]" />
			</div>
			{phone && (
				<PanelDock>
					<Inert>{search}</Inert>
				</PanelDock>
			)}
		</>
	);
	if (docked) return <div className="relative flex h-full min-h-0 flex-col [container-type:inline-size]">{inner}</div>;
	return (
		<PanelSheet open={open} onOpenChange={onOpenChange} side="right" width="lg">
			<div className="relative flex h-full min-h-0 flex-col">{inner}</div>
		</PanelSheet>
	);
}

// ── Chat ─────────────────────────────────────────────────────────────────────

/** The Chat composer's row, shared with `ArchitectChat.tsx`. It WRAPS: the field asks for at
 *  least 8rem (`basis-32`), and when the column cannot fit that beside the buttons, the button
 *  group drops to a second line, right-aligned. The docked desktop column is ~200px wide, and
 *  without the wrap four 28px buttons squeezed the field to ~20px — the placeholder broke one
 *  word per line and a typed message was unreadable. A wide sheet still gets one row. */
export const CHAT_COMPOSER_ROW = 'flex flex-wrap items-end justify-end gap-2 rounded-xl border border-border bg-background p-2';
/** The composer's buttons, kept together so they wrap as ONE group, never one at a time. */
export const CHAT_COMPOSER_TOOLS = 'flex shrink-0 items-center gap-2';
/** The Chat composer's text field, shared with `ArchitectChat.tsx`. */
export const CHAT_COMPOSER_FIELD =
	'block min-h-7 min-w-0 grow basis-32 resize-none border-0 bg-transparent px-0 py-[5px] text-[12.5px] leading-[1.45] text-foreground shadow-none outline-none focus-visible:ring-0 placeholder:text-muted-foreground md:text-[12.5px]';

/** The Chat's first-run card, shared with `ArchitectChat.tsx`: a deck with no chat yet opens on exactly this. */
export function ChatEmptyCard({ aiReady }: { aiReady: boolean }) {
	return (
		<div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] leading-relaxed text-muted-foreground">
			<Sparkles className="mx-auto mb-1.5 size-4 text-[var(--accent)]" />
			Ask the Architect to tighten a slide, reshape the deck, or answer a question. Proposed edits arrive as a diff you Apply or Discard.
			{!aiReady && <span className="mt-1.5 block text-[var(--text-muted)]">Connect a model in Workspace to start.</span>}
		</div>
	);
}

export function ChatShell({ title, aiReady, deckId, children }: { title?: string; aiReady: boolean; deckId: string; children?: React.ReactNode }) {
	// The saved thread decides what the panel opens on: the first-run card, or the conversation.
	const hasThread = React.useMemo(() => loadChat(deckId).length > 0, [deckId]);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{title && <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</div>}
			<div className="min-h-0 flex-1 space-y-3 overflow-hidden px-3 py-3">
				{children ??
					(hasThread ? (
						<>
							<div className="flex justify-end">
								<Block className="rounded-2xl" w="70%" h={38} />
							</div>
							<Block w="92%" />
							<Block w="85%" />
							<Block w="60%" />
							<Loading what="Chat" />
						</>
					) : (
						<>
							<Inert>
								<ChatEmptyCard aiReady={aiReady} />
							</Inert>
							<Loading what="Chat" />
						</>
					))}
			</div>
			<div className="flex flex-col gap-1.5 border-t border-border p-2.5">
				{/* The composer, built like the real one so its placeholder wraps to the same height. */}
				<Inert className={CHAT_COMPOSER_ROW}>
					{/* The same field, not a look-alike: a touch screen forces fields to 16px, and the
					    placeholder wraps with the field's width, so only the real element sizes the same. */}
					<Textarea autosize maxRows={4} rows={1} readOnly tabIndex={-1} value="" data-focus-ring="container" placeholder={aiReady ? 'Ask or instruct…' : 'Connect a model to chat…'} className={CHAT_COMPOSER_FIELD} />
					<span className={CHAT_COMPOSER_TOOLS}>
						<span className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground">
							<Paperclip className="size-4" />
						</span>
						<span className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground">
							<Unlock className="size-3.5" />
						</span>
						<span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground opacity-40">
							<ArrowUp className="size-4" />
						</span>
					</span>
				</Inert>
			</div>
		</div>
	);
}

// ── Reader views (Lenses) ────────────────────────────────────────────────────

/** Only the card list: the lede and the scroll box around it belong to the Studio's own host. */
export function LensesShell({ children }: { children?: React.ReactNode }) {
	if (children) return <>{children}</>;
	return (
		<div className="space-y-2">
			<Block className="rounded-lg" h={118} />
			<Block className="rounded-lg" h={76} />
			<Block className="rounded-lg" h={76} />
			<Block className="rounded-full" w="7.5rem" h={24} />
			<Loading what="reader views" />
		</div>
	);
}

// ── Slide settings ───────────────────────────────────────────────────────────

/** Slide settings' Reset button, shared with `SlideContext.tsx`. Disabled until the slide is edited. */
export const RESET_SLIDE_BUTTON =
	'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:cursor-default disabled:border-transparent disabled:text-muted-foreground disabled:opacity-50 disabled:hover:bg-transparent';

/** A settings row: its label on the left, its control on the right. */
function SettingRowBlock() {
	return (
		<div className="py-2.5">
			<Block className="mb-2" w="28%" h={12} />
			<Block className="rounded-lg" h={32} />
		</div>
	);
}

/**
 * The slide as it was when Slide settings opened: the baseline "Reset slide" reverts to. On a
 * cold open the panel mounts only when its code arrives, so the shell records the baseline at the
 * moment of opening, and the loaded panel takes it over once (`SlideContext.tsx`). Without this,
 * an edit made while the shell was up would become part of the baseline and survive a Reset.
 */
export type SlideBaseline = { slide: number; chunk: string };

/** The slide scope's body, under the scope bar the Studio draws. Opens on a clean slide, so the first row is real text. */
export function SlideSettingsShell({
	tier,
	baseline,
	slideNumber,
	chunk,
	children,
}: {
	tier: 'basic' | 'advanced';
	baseline: React.MutableRefObject<SlideBaseline | null>;
	slideNumber: number;
	chunk: string;
	children?: React.ReactNode;
}) {
	// On mount and on a slide change, not on an edit: the same rule the panel's own baseline follows.
	// Cleared when the shell goes, so a shell closed before the code arrived leaves no stale baseline.
	// Safe on the swap: the loaded panel reads it during render, before this cleanup runs.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the baseline moves with the slide, never with an edit.
	React.useEffect(() => {
		baseline.current = { slide: slideNumber, chunk };
		return () => {
			baseline.current = null;
		};
	}, [slideNumber]);
	return (
		<div className={cn('min-w-0 flex-1 overflow-hidden px-4', SETTING_SCOPE)}>
			{children ?? (
				<>
					<Inert>
						<div className="flex items-center justify-between border-b border-border py-2">
							<span className="text-[11px] text-muted-foreground">No changes yet</span>
							<button type="button" disabled className={RESET_SLIDE_BUTTON}>
								<RotateCcw className="size-3" />
								Reset slide
							</button>
						</div>
						<SettingsTierSwitch tier={tier} onTierChange={() => {}} scope="Slide" />
					</Inert>
					<div className="pt-1">
						<SettingRowBlock />
						<SettingRowBlock />
						<SettingRowBlock />
						<Block className="mt-3 rounded-lg" h={140} />
					</div>
					<Loading what="slide settings" />
				</>
			)}
		</div>
	);
}
