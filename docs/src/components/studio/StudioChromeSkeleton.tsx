import {
	ArrowLeftToLine, ArrowRightToLine, ChevronDown, Copy, FileText, Gauge, Menu as MenuIcon, MonitorPlay, Moon, Palette, Play, Plus, Search, Settings as SettingsCog, Share2, SlidersHorizontal, Sparkles, Sun, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { BarIcon, EditorSkeleton, PostureDial } from './chrome-parts';
import { ChatIcon, FeedbackIcon, PreviewIcon } from './icons';
import { LatticeMark } from './LatticeMark';

/**
 * The Studio's PRE-PAINT chrome (#1438) — the app's own controls, rendered to static HTML
 * at BUILD time.
 *
 * The Studio is `client:only`, so on a reload nothing of the React tree exists until the
 * island mounts. This component is what stands in until then, and it is rendered by
 * `studio.astro` with NO client directive — Astro renders React to HTML at build, so this
 * ships as markup and zero JavaScript.
 *
 * WHY IT IS THE REAL CONTROLS AND NOT A SKELETON. The first pass at this hand-drew muted
 * blocks at hand-measured sizes, on the belief that the app's stylesheet doesn't exist
 * pre-hydration. That belief was WRONG: `/studio/` ships one render-blocking stylesheet that
 * already contains every utility the chrome uses, arbitrary values included (`h-[54px]`,
 * `size-[18px]`, `min-w-[42px]`). So there was never a reason to copy geometry or glyphs by
 * hand — and copied data is data that can silently drift. Everything here comes from the
 * SAME source the app renders from: `Button` and `Separator` (the shadcn primitives),
 * `LatticeMark`, the `icons.ts` semantic registry, and `BarIcon` / `PostureDial` (extracted
 * to `chrome-parts.tsx` for exactly this reason). There is no px constant in this file.
 *
 * TWO RULES THIS MUST KEEP.
 *
 * 1. NO BROWSER APIs, NO HOOKS THAT READ THE DOM. This renders at build time, where there is
 *    no `window`. That is also why the tier gating below is CSS, not JS: the app picks its
 *    header with `useBreakpoint()`, which cannot run here, so this renders EVERY tier and
 *    lets media queries choose — at the app's own 700 / 1100 boundaries, never Tailwind's.
 *
 * 2. IT MUST NOT READ AS LIVE. The shell layer is `pointer-events:none`, so a control here
 *    can be tapped and do nothing. `aria-hidden` on the container keeps it out of the
 *    accessibility tree, `inert`-like opacity keeps it visibly not-yet-ready, and nothing
 *    here carries a handler (the props are no-ops).
 *
 * The stop-dependent variants are chosen by the seed in `studio.astro`, which resolves the
 * stored posture pre-paint and stamps `data-ssr-stop` on `<html>`; the CSS in that page
 * gates on it. Between the two, the shell shows the same chrome the app is about to mount.
 */

// `ssr-topbar` / `ssr-actionbar` are HOOK classes, not styling: docs/e2e/studio-instant-shell.spec.ts
// measures these two rows against the app's own, and studio.astro's cinema rule hides the chrome by
// them. Renaming one without updating both reds that spec — which is the point.
const NOOP = () => {};

/** The phone's eight-cell deck-actions bar — the app's own cells, in the app's own order. */
function ActionBar() {
	return (
		<div role="presentation" className="ssr-actionbar flex shrink-0 items-stretch border-b border-border bg-card">
			<BarIcon variant="bar" label="Markdown source" hint="Markdown source" caption="Source" onClick={NOOP}><FileText className="size-[17px]" /></BarIcon>
			<BarIcon variant="bar" label="Compose — rich editor" hint="Compose — rich editor" caption="Compose" onClick={NOOP}><Sparkles className="size-[17px]" /></BarIcon>
			<BarIcon variant="bar" label="Preview" hint="Preview" caption="Preview" active onClick={NOOP}><PreviewIcon className="size-[17px]" /></BarIcon>
			<span aria-hidden="true" className="my-2 w-px shrink-0 bg-border" />
			<BarIcon variant="bar" label="Toggle Coach" hint="Coach — deterministic deck assessment" caption="Coach" onClick={NOOP}><Gauge className="size-[17px]" /></BarIcon>
			<BarIcon variant="bar" label="Toggle Chat" hint="Chat — AI conversation about your deck" caption="Chat" onClick={NOOP}><ChatIcon className="size-[17px]" /></BarIcon>
			<BarIcon variant="bar" label="Settings" hint="Settings — deck & slide" caption="Settings" onClick={NOOP}><SlidersHorizontal className="size-[17px]" /></BarIcon>
			<span aria-hidden="true" className="my-2 w-px shrink-0 bg-border" />
			<BarIcon variant="bar" tone="outline" label="Present" hint="Present" caption="Present" onClick={NOOP}><Play className="size-[17px]" /></BarIcon>
			<BarIcon variant="bar" tone="solid" label="Share" hint="Share" caption="Share" onClick={NOOP}><Share2 className="size-[17px]" /></BarIcon>
		</div>
	);
}

/** The deck pill — content-sized exactly as the app's is (min-w-0 + truncating title). */
function DeckPill({ title }: { title: string }) {
	return (
		<span className="ssr-deck-pill flex min-w-[42px] items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left min-[1100px]:min-w-[62px] min-[1100px]:px-2.5">
			<span className="hidden size-2 shrink-0 rounded-full bg-primary min-[1100px]:block" />
			<span className="truncate text-sm font-semibold text-[var(--text-heading)]" id="ssr-deck-title">{title}</span>
			{/* The app shows a slide-count meta here from `xl` up ("7 slides"). The count is deck
			    content the shell cannot know, so it is NOT drawn — but its WIDTH still has to be
			    reserved, because the pill is content-sized and omitting the slot made it jump at
			    hand-off. A neutral bar at the meta's own measured width (52.8px at 1440) keeps the
			    structure honest without asserting a number. */}
			<span aria-hidden="true" className="hidden h-2.5 w-[53px] shrink-0 rounded-full bg-current opacity-25 xl:inline-block" />
			<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
		</span>
	);
}

/**
 * The posture dial, lit at the stop the visitor will actually land on.
 *
 * `PostureDial` lights the segment matching its `posture` prop, and the shell used to hardcode
 * `"write"` — so a visitor at Read saw Write lit and the highlight chip jumped at hand-off.
 * The stop IS knowable pre-paint (the seed reads it and stamps `data-ssr-stop`), so render one
 * dial per stop and let CSS pick. The parity spec skips zero-size controls, so the two hidden
 * dials are invisible to it — and the lit segment is a fill, not a box, which is exactly why
 * that spec could not have caught this.
 */
function StopDial() {
	return (
		<>
			<span className="ssr-dial ssr-dial-read contents"><PostureDial posture="read" quietened={false} revealBuild={false} onChange={NOOP} /></span>
			<span className="ssr-dial ssr-dial-write contents"><PostureDial posture="write" quietened={false} revealBuild={false} onChange={NOOP} /></span>
			<span className="ssr-dial ssr-dial-build contents"><PostureDial posture="build" quietened={false} revealBuild={false} onChange={NOOP} /></span>
		</>
	);
}

export function StudioChromeSkeleton({ deckTitle }: { deckTitle: string }) {
	return (
		// The provider is required because BarIcon and PostureDial wrap their controls in
		// `Tip`; Radix reads context at render, so without it a build-time render throws.
		<TooltipProvider>
			{/* ── Top bar ─────────────────────────────────────────────────────────
			    Below 1100 the app renders its FULL header; at 1100+ (Read/Write) a SLIM one.
			    Both are rendered and CSS-gated, since the breakpoint hook can't run here. */}
			<div className="ssr-topbar flex h-[54px] shrink-0 items-center gap-1.5 overflow-hidden border-b border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-2.5 min-[1100px]:gap-3 min-[1100px]:px-3.5">
				{/* FULL-header left: the launcher (mark + chevron). Phone + tablet — and desktop at
				    BUILD, where the app swaps the slim header for this one. That last case is not
				    expressible in a Tailwind width class (it depends on the STOP), so the shell CSS
				    re-gates these three spans under `:root[data-ssr-stop="build"]`; drawing the slim
				    header's bare mark there instead pushed the deck pill 27px right. */}
				<span className="ssr-launcher-wrap contents min-[1100px]:hidden">
					<button type="button" aria-label="Workspace launcher" className="flex shrink-0 items-center gap-1.5 rounded-md px-1 py-1 sm:gap-2 sm:px-1.5">
						<LatticeMark mode="light" className="size-7 ssr-mark-light" /><LatticeMark mode="dark" className="size-7 ssr-mark-dark" />
						{/* The wordmark rides the launcher only at !compact — the desktop FULL header, which
							    is what the app renders at Build. */}
							<span className="hidden font-display text-[19px] font-extrabold tracking-tight text-[var(--text-heading)] min-[1100px]:inline" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Lattice</span>
							<ChevronDown className="size-4 text-muted-foreground" />
					</button>
				</span>
				{/* SLIM-header left: a bare mark. Desktop at Read/Write only. */}
				<span className="ssr-slim-mark hidden min-[1100px]:contents">
					<LatticeMark mode="light" className="size-7 shrink-0 ssr-mark-light" /><LatticeMark mode="dark" className="size-7 shrink-0 ssr-mark-dark" />
				</span>
				{/* The rule between the launcher and the deck pill — `!compact` in the app, so it
				    exists ONLY in the desktop full header, which is the Build stop. */}
				<span className="ssr-build-lead hidden">
					<Separator orientation="vertical" className="h-5" />
				</span>

				<DeckPill title={deckTitle} />
				<div className="flex-1" />

				{/* PHONE tail: mode · workspace settings · menu. */}
				<span className="contents min-[700px]:hidden">
					<Button variant="ghost" size="icon-sm" aria-label="Switch to dark mode" className="ssr-mode-to-dark"><Moon className="size-[18px]" /></Button><Button variant="ghost" size="icon-sm" aria-label="Switch to light mode" className="ssr-mode-to-light"><Sun className="size-[18px]" /></Button>
					<Button variant="ghost" size="icon-sm" aria-label="Workspace settings"><SettingsCog className="size-[18px]" /></Button>
					<Button variant="ghost" size="icon-sm" aria-label="Menu"><MenuIcon className="size-[18px]" /></Button>
				</span>

				{/* TABLET tail: Present · Share · the dial · Coach · Chat · feedback · Settings · mode · Menu. */}
				<span className="hidden min-[700px]:max-[1100px]:contents">
					<Button variant="outline" size="sm" className="gap-1.5 px-2 lg:px-3" aria-label="Present"><Play className="size-4" /><span className="hidden lg:inline">Present</span></Button>
					<Button size="sm" className="gap-1.5 px-2 lg:px-3" aria-label="Share"><Share2 className="size-4" /><span className="hidden lg:inline">Share</span></Button>
					<StopDial />
					<Button variant="ghost" size="icon-sm" aria-label="Toggle Coach"><Gauge className="size-[18px]" /></Button>
					<Button variant="ghost" size="icon-sm" aria-label="Toggle Chat"><ChatIcon className="size-[18px]" /></Button>
					<Button variant="ghost" size="icon-sm" aria-label="Send feedback"><FeedbackIcon className="size-[18px]" /></Button>
					<Button variant="ghost" size="icon-sm" aria-label="Settings"><SlidersHorizontal className="size-[18px]" /></Button>
					<Button variant="ghost" size="icon-sm" aria-label="Switch to dark mode" className="ssr-mode-to-dark"><Moon className="size-[18px]" /></Button><Button variant="ghost" size="icon-sm" aria-label="Switch to light mode" className="ssr-mode-to-light"><Sun className="size-[18px]" /></Button>
					<Button variant="ghost" size="icon-sm" aria-label="Menu"><MenuIcon className="size-[18px]" /></Button>
				</span>

				{/* DESKTOP tail (slim header): ⌘K · Present · Share · rule · dial · feedback.
				    The ⌘K pill grows its label at Tailwind's `xl`, exactly as the app's does. */}
				<span className="ssr-desktop-tail hidden min-[1100px]:contents">
					<button type="button" aria-label="Search or run a command" className="hidden items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-[13px] text-muted-foreground sm:flex xl:px-3">
						<Search className="size-4 shrink-0" /><span className="hidden xl:inline">Search or run…</span>
						<Kbd className="ml-2 hidden xl:inline-block">⌘K</Kbd>
					</button>
					<Button variant="outline" size="sm" className="gap-1.5 px-2 lg:px-3" aria-label="Present"><Play className="size-4" /><span className="hidden lg:inline">Present</span></Button>
					<Button size="sm" className="gap-1.5 px-2 lg:px-3" aria-label="Share"><Share2 className="size-4" /><span className="hidden lg:inline">Share</span></Button>
					<Separator orientation="vertical" className="h-5" />
					<StopDial />
					<Button variant="ghost" size="icon-sm" aria-label="Send feedback"><FeedbackIcon className="size-[18px]" /></Button>
				</span>
					{/* DESKTOP at BUILD: the app swaps its slim header for the FULL one, which regains
					    Theme, the mode toggle and the tours launcher (the panel toggles move into the
					    52px activity rail instead). Mirrored control-for-control — the parity spec
					    compares the two SETS, so an omission here fails rather than ships. */}
					<span className="ssr-build-tail hidden min-[1100px]:contents">
						<button type="button" aria-label="Search or run a command" className="hidden items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-[13px] text-muted-foreground sm:flex xl:px-3">
							<Search className="size-4 shrink-0" /><span className="hidden xl:inline">Search or run…</span>
							<Kbd className="ml-2 hidden xl:inline-block">⌘K</Kbd>
						</button>
						<span className="flex items-center rounded-md border border-border bg-background p-0.5">
							<Button variant="ghost" size="icon-sm" aria-label="Theme"><Palette className="size-[18px]" /></Button>
							<Button variant="ghost" size="icon-sm" aria-label="Switch to dark mode" className="ssr-mode-to-dark"><Moon className="size-[18px]" /></Button><Button variant="ghost" size="icon-sm" aria-label="Switch to light mode" className="ssr-mode-to-light"><Sun className="size-[18px]" /></Button>
						</span>
						<Separator orientation="vertical" className="h-5" />
						<Button variant="ghost" size="icon-sm" aria-label="Show me — guided tours" className="text-[var(--accent)]"><MonitorPlay className="size-[18px]" /></Button>
						<Button variant="outline" size="sm" className="gap-1.5 px-2 lg:px-3" aria-label="Present"><Play className="size-4" /><span className="hidden lg:inline">Present</span></Button>
						<Button size="sm" className="gap-1.5 px-2 lg:px-3" aria-label="Share"><Share2 className="size-4" /><span className="hidden lg:inline">Share</span></Button>
						<Separator orientation="vertical" className="h-5" />
						<StopDial />
						<Button variant="ghost" size="icon-sm" aria-label="Send feedback"><FeedbackIcon className="size-[18px]" /></Button>
					</span>
			</div>

			{/* The phone's action bar — below 700 only. */}
			<span className="contents min-[700px]:hidden"><ActionBar /></span>
		</TooltipProvider>
	);
}

/**
 * The editor column left of the split (tablet + desktop). Its body is the app's OWN
 * `EditorSkeleton` — the placeholder the app itself shows while the lazy CodeMirror chunk
 * streams in — so the shell hands straight over to an identical surface instead of swapping
 * one placeholder for another.
 */
export function StudioEditorPaneSkeleton() {
	return (
		<>
			<div className="flex shrink-0 items-center gap-2 border-b border-border px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Edit</div>
			<EditorSkeleton />
		</>
	);
}

/**
 * WHAT THIS FILE MAY DRAW, AND WHAT IT MAY NOT.
 *
 * Draw the REAL control wherever its identity is fixed — the topbar run, the eight-cell bar,
 * the navigator's slide ops. Those are chrome: they are the same for every visitor and every
 * deck, so drawing them is a promise the app always keeps.
 *
 * Do NOT draw per-deck CONTENT — slide names, the slide count, the active palette. The shell
 * cannot know them (they live in localStorage behind the deck the user last opened), so
 * drawing them means painting something the app immediately corrects. That is the failure
 * `2026-07-21-studio-preview-one-skeleton.md` retired the cached-last-slide replay for: a
 * second content surface that disagrees with the live one. Content gets a neutral bar inside
 * the real control's shape, so the STRUCTURE is honest and nothing asserts a value.
 */
function ContentBar({ className }: { className?: string }) {
	return <span aria-hidden="true" className={cn('inline-block h-2.5 rounded-full bg-current opacity-25', className)} />;
}

/** The preview pane's sub-bar (scope chip + slide stepper) — dropped at the Read stop. */
export function StudioPreviewBarSkeleton() {
	return (
		<div className="flex items-center gap-2 border-b border-border px-3.5 py-1.5">
			<span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Preview</span>
			<span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground"><FileText className="size-3.5" /><ContentBar className="w-12" /></span>
			<span className="flex-1" />
			<span className="rounded-full border border-border bg-card px-2.5 py-1.5"><ContentBar className="w-14" /></span>
		</div>
	);
}

/** The slide navigator + deck status strip below the preview — dropped at the Read stop. */
export function StudioPreviewFooterSkeleton() {
	return (
		<>
			<div className="ssr-rail flex flex-1 items-center gap-1.5 overflow-hidden border-t border-border bg-background px-2.5">
				{/* Slide ops are fixed chrome — the app's own icons, at the app's own button size. */}
				<Button variant="ghost" size="icon-sm" aria-label="Add slide"><Plus className="size-4" /></Button>
				<Button variant="ghost" size="icon-sm" aria-label="Duplicate slide"><Copy className="size-4" /></Button>
				<Button variant="ghost" size="icon-sm" aria-label="Move slide left"><ArrowLeftToLine className="size-4" /></Button>
				<Button variant="ghost" size="icon-sm" aria-label="Move slide right"><ArrowRightToLine className="size-4" /></Button>
				<Button variant="ghost" size="icon-sm" aria-label="Delete slide"><Trash2 className="size-4" /></Button>
				{/* The slides themselves are the user's deck — structure only, never a name. */}
				<span className="ml-1 flex items-center gap-2 rounded-lg border border-[var(--accent)] px-2.5 py-2"><ContentBar className="w-16" /></span>
				<span className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-muted-foreground"><ContentBar className="w-20" /></span>
				<span className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-muted-foreground"><ContentBar className="w-16" /></span>
			</div>
			<div className="ssr-status flex shrink-0 items-center gap-3 border-t border-border px-4 py-1.5 text-muted-foreground">
				<ContentBar className="w-24" />
				<span className="flex-1" />
				<ContentBar className="w-20" />
			</div>
		</>
	);
}
