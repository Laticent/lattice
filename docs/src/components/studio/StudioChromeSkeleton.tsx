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

/**
 * The deck pill — content-sized exactly as the app's is (min-w-0 + truncating title).
 *
 * The app has TWO of these, and which one it renders is a tier AND stop question. The FULL
 * header (phone, tablet, and desktop at Build) carries the bordered switcher below. The
 * DESKTOP SLIM header at Read carries no switcher at all — deck navigation is a Write-and-up
 * concern there — just a plain title and a mono slide count. `ReadTitle` is that second one;
 * the CSS gate picks between them. Flattening the pill's borders and calling it a title, which
 * is what the shell did, left the title 27px right of the app's and drew a live-dot the app
 * does not have at Read.
 */
function DeckPill({ title }: { title: string }) {
	return (
		// A real <button>, because the app's switcher is one. It was a <span>, which meant the
		// parity matrix — which ENUMERATES controls — saw the app's switcher and not the shell's,
		// and reported the shell as missing a control it draws.
		//
		// `data-ssr-demo` deliberately mirrors the VALUE of the app's `data-demo` hook without
		// reusing the attribute: the value is what matches the two by identity, so they are
		// compared by box rather than by a text string that must differ (the app's carries a
		// slide count the shell cannot know) — while the tour/demo toolkit that owns `data-demo`
		// keeps resolving to exactly one element.
		//
		// The whole shell is `inert` + `aria-hidden`, so a button here is not reachable by
		// keyboard or AT — see the note on the shell root in studio.astro.
		<button
			type="button"
			data-ssr-demo="deck-switcher"
			className="ssr-deck-pill flex min-w-[42px] items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left min-[1100px]:min-w-[62px] min-[1100px]:px-2.5"
		>
			<span className="hidden size-2 shrink-0 rounded-full bg-primary min-[1100px]:block" />
			<span className="ssr-deck-title min-w-0 truncate text-sm font-semibold text-[var(--text-heading)]">{title}</span>
			{/* The app shows a slide-count meta here from `xl` up ("7 slides"). The count is deck
			    content the shell cannot know, so it is NOT drawn — but its WIDTH still has to be
			    reserved, because the pill is content-sized and omitting the slot made it jump at
			    hand-off. A neutral bar at the meta's own measured width (52.8px at 1440) keeps the
			    structure honest without asserting a number. */}
			<span aria-hidden="true" className="hidden h-2.5 w-[53px] shrink-0 rounded-full bg-current opacity-25 xl:inline-block" />
			<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
		</button>
	);
}

/** The desktop SLIM header's deck line at Read: a plain title, plus the slide-count meta. */
function ReadTitle({ title }: { title: string }) {
	return (
		<span className="ssr-read-title hidden">
			<span className="ssr-deck-title min-w-0 truncate text-sm font-semibold text-[var(--text-heading)]">{title}</span>
			{/* Same reasoning as the pill's meta slot: "7 slides" is deck content the shell must
			    not draw, but its width is part of the row, so reserve it at the measured width. */}
			<span aria-hidden="true" className="hidden h-2.5 w-[53px] shrink-0 rounded-full bg-current opacity-25 sm:inline-block" />
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

/**
 * THE RULE FOR WHAT THIS FILE MAY DRAW — read before adding a control.
 *
 * The shell is a static mirror with exactly TWO inputs it can express: the viewport WIDTH (a
 * CSS media query) and the boot STOP (`data-ssr-stop`, seeded from localStorage). So:
 *
 *   Draw a control only where its presence is a function of width or `data-ssr-stop`.
 *   Anything else must either be published by the seed as its own `data-ssr-*` flag,
 *   or NOT BE DRAWN AT ALL.
 *
 * The asymmetry is why "not drawn" is the safe default: omitting a control costs a hole in the
 * shell, while drawing one the app deletes shifts every sibling after it. The tours button is
 * the worked example — gated on a persisted preference (`lattice-tour-enabled`), it was drawn
 * unconditionally, and anyone who had turned tours off got a phantom control plus a 44px slide
 * of the three controls after it at hand-off. It is now a seeded flag (`data-ssr-no-tours`).
 *
 * Before adding a control, find the app's gate for it in StudioShell and classify it: width →
 * a media query here; stop → a `data-ssr-stop` rule; anything else (a preference, a flag, an
 * entitlement, a deck property, an experiment) → seed a flag or leave it out. A control gated
 * on something unknowable that you draw anyway will not fail the parity matrix, because the
 * matrix samples width x stop — the two axes this rule already settles.
 */
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
				<ReadTitle title={deckTitle} />
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
						<Button variant="ghost" size="icon-sm" aria-label="Show me — guided tours" className="ssr-tours text-[var(--accent)]"><MonitorPlay className="size-[18px]" /></Button>
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
	return (
		<span aria-hidden="true" className={cn('inline-flex items-center', className)}>
			{/*
			 * A ZERO-WIDTH SPACE, and it is structural rather than decorative.
			 *
			 * This bar stands in for TEXT, so it has to occupy the height that text would. A
			 * bare `h-2.5` block does not: it is 10px at every font size, so a row built out of
			 * these cannot follow the reader's font settings. Nor does putting text classes on
			 * the row help — these rows are `display:flex`, and a flex container has no strut,
			 * so the only thing that can track font size is a child that genuinely contains
			 * text. That is the whole of #1496: at a raised browser minimum font size the app's
			 * status strip grew to 42px and the shell's stayed at its frozen 30.6.
			 *
			 * The space is zero-width, so it contributes a line box and nothing else — the
			 * visible bar keeps its own 10px height and is centered in whatever line box the
			 * inherited font establishes. Nothing here asserts a per-deck value.
			 */}
			<span className="w-0 overflow-hidden">{'​'}</span>
			<span className="h-2.5 flex-1 rounded-full bg-current opacity-25" />
		</span>
	);
}

/**
 * The preview pane's sub-bar (scope chip + slide stepper) — dropped at the Read stop.
 *
 * The container carries the app's OWN text classes, and that is load-bearing rather than
 * cosmetic: a row's height is set by its strut (the line box the parent's font-size and
 * line-height establish), so a skeleton with no text classes has a strut that cannot follow
 * the reader's font settings. That is exactly how this band ended up 18px shorter than the
 * app's at a raised browser minimum font size (#1496) — the app's row grew with its text and
 * the shell's did not. Every height-driving property here is the app's; only the CONTENT is
 * neutral (see the ContentBar rule above).
 */
export function StudioPreviewBarSkeleton() {
	return (
		<div className="flex items-center gap-2 border-b border-border px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
			<span className="shrink-0">Preview</span>
			{/* The app's LensPicker trigger — `px-3 py-1.5 font-sans text-[12.5px] font-semibold`.
			    It is the TALLEST thing in this row, so under-sizing it (this was `px-2.5 py-1`)
			    left the whole band ~8px short of the app's at every font size. */}
			<span className="inline-flex min-w-0 shrink items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-sans text-[12.5px] font-semibold normal-case tracking-normal"><FileText className="size-3.5 shrink-0" /><ContentBar className="hidden w-12 @[21rem]:inline-flex" /></span>
			<span className="flex-1" />
			{/* The app's slide counter: `px-2 py-0.5 font-sans text-[12px] font-semibold`. It was
			    `px-2.5 py-1.5` here, which made the skeleton's natural height 52.6px against the
			    app's 47 — invisible only because the band was pinned to a constant and clipped. */}
			<span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 font-sans text-[12px] font-semibold normal-case tracking-normal"><ContentBar className="w-14" /></span>
		</div>
	);
}

/** The slide navigator + deck status strip below the preview — dropped at the Read stop. */
export function StudioPreviewFooterSkeleton() {
	return (
		<>
			{/* The app's navigator row: `px-3 py-2`, the five ops in a bordered `p-0.5` group of
			    `size-7` buttons, then the slide pills. Both rows below carry the app's own text
			    classes for the reason in StudioPreviewBarSkeleton's note — the strut is what
			    tracks a raised browser minimum font size, and a skeleton without text has none. */}
			{/* No border-t here: the .ssr-paneftr band already draws the footer's top hairline, so
			    carrying one on this row too made the band 1px taller than the app's. Invisible
			    while the band was pinned to a constant; a 1px disagreement the moment it is not. */}
			<div className="ssr-rail flex flex-1 items-center gap-1.5 overflow-hidden bg-background px-3 py-2">
				{/* Slide ops are fixed chrome — the app's own icons, at the app's own button size. */}
				<span className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
					<span className="grid size-7 place-items-center rounded-md text-muted-foreground"><Plus className="size-3.5" /></span>
					<span className="grid size-7 place-items-center rounded-md text-muted-foreground"><Copy className="size-3.5" /></span>
					<span className="grid size-7 place-items-center rounded-md text-muted-foreground"><ArrowLeftToLine className="size-3.5" /></span>
					<span className="grid size-7 place-items-center rounded-md text-muted-foreground"><ArrowRightToLine className="size-3.5" /></span>
					<span className="grid size-7 place-items-center rounded-md text-muted-foreground"><Trash2 className="size-3.5" /></span>
				</span>
				{/* The slides themselves are the user's deck — structure only, never a name. The
				    numbered chip IS fixed chrome (slide N is always slide N), so it is drawn; the
				    label beside it is the deck's content, so it stays a neutral bar. */}
				<span className="ml-1 flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--accent)] px-2.5 py-1.5 text-[11px]"><span className="grid size-[18px] shrink-0 place-items-center rounded-md bg-card font-mono text-[10px] font-bold text-muted-foreground">1</span><ContentBar className="w-16" /></span>
				<span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground"><span className="grid size-[18px] shrink-0 place-items-center rounded-md bg-card font-mono text-[10px] font-bold">2</span><ContentBar className="w-20" /></span>
				<span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground"><span className="grid size-[18px] shrink-0 place-items-center rounded-md bg-card font-mono text-[10px] font-bold">3</span><ContentBar className="w-16" /></span>
			</div>
			<div className="ssr-status flex shrink-0 items-center gap-3 border-t border-border px-4 py-1.5 font-mono text-[11px] text-muted-foreground">
				<ContentBar className="w-24" />
				<span className="flex-1" />
				<ContentBar className="w-20" />
			</div>
		</>
	);
}
