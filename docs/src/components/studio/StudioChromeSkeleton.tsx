import {
	ArrowLeftToLine, ArrowRightToLine, ChevronDown, Copy, FileSliders, FileText, Gauge, History, ListChecks, Menu as MenuIcon, MonitorPlay, Moon, Palette, PanelLeftClose, PanelRightClose, Play, Plus, Search, Settings as SettingsCog, Shapes, Share2, SlidersHorizontal, Sparkles, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ACTIVITY_RAIL_CLOSED, ActivityRail, BAR_RULE, BarIcon, DECK_META_SLOT, EditorSkeleton, HOME_HREF, PostureDial, SLIDE_COUNTER_SLOT } from './chrome-parts';
import { ChatIcon, FeedbackIcon, PreviewIcon } from './icons';
import { LatticeMark } from './LatticeMark';
import { LENSES } from './lens-picker';

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
			<BarIcon variant="bar" tone="solid" label="Present" hint="Present" caption="Present" onClick={NOOP}><Play className="size-[17px]" /></BarIcon>
			<BarIcon variant="bar" tone="outline" label="Share" hint="Share" caption="Share" onClick={NOOP}><Share2 className="size-[17px]" /></BarIcon>
		</div>
	);
}

/**
 * The deck pill — content-sized exactly as the app's is (min-w-0 + truncating title).
 *
 * ONE of these now, at every width and every stop, because the app draws one. Desktop Read
 * used to carry no switcher at all — deck navigation was a Write-and-up concern there — so
 * this file also carried a `ReadTitle` twin and `studio.astro` a media query to pick between
 * them. Both are gone with the slim header (2026-09-05).
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
			className="ssr-deck-pill flex h-8 min-w-[42px] items-center gap-2 rounded-md border border-border bg-background px-2 text-left min-[1100px]:min-w-[62px] min-[1100px]:px-2.5"
		>
			<span className="hidden size-2 shrink-0 rounded-full bg-[var(--text-body)] min-[1100px]:block" />
			<span className="ssr-deck-title min-w-0 truncate text-sm font-semibold text-[var(--text-heading)]">{title}</span>
			{/* The app shows a slide-count meta here from `xl` up ("7 slides"). The count is deck
			    content the shell cannot know, so it is NOT drawn — the SLOT is reserved instead,
			    and its width comes from `DECK_META_SLOT`, the same constant the app's meta uses.
			    This was `w-[53px]`, a width fitted to the welcome deck's own "7 slides" and
			    measured once; the app's real text is 56px, so the pill and everything after it —
			    the rule, and all three dial buttons — landed 3px left of the app at every width
			    from 1280 up. A fitted width is right for exactly one deck; a shared reservation
			    is right for all of them. The bar inside is narrower than the slot on purpose: it
			    still reads as a skeleton without the slot's width depending on it. */}
			<span data-shell-unknowable="deck-meta" className={cn('hidden xl:inline-flex xl:items-center xl:justify-end', DECK_META_SLOT)} aria-hidden="true">
				<span className="h-2.5 w-10 rounded-full bg-current opacity-25" />
			</span>
			<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
		</button>
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
			<span className="ssr-dial ssr-dial-read contents"><PostureDial posture="read" quietened={false} revealCraft={false} onChange={NOOP} /></span>
			<span className="ssr-dial ssr-dial-write contents"><PostureDial posture="write" quietened={false} revealCraft={false} onChange={NOOP} /></span>
			<span className="ssr-dial ssr-dial-craft contents"><PostureDial posture="craft" quietened={false} revealCraft={false} onChange={NOOP} /></span>
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
			    ONE row, every width and every stop — the app renders one `<header>` now, so the
			    shell has one too. It used to draw a FULL row and a SLIM one and let CSS pick by
			    `data-ssr-stop`; the app's own slim/full split is gone (2026-09-05), and with it
			    `.ssr-launcher-wrap`, `.ssr-craft-lead`, `.ssr-read-title` and `.ssr-desktop-tail`.
			    What remains CSS-gated here is WIDTH — the breakpoint hook cannot run at build
			    time — at the app's own 700 / 1100 boundaries, never Tailwind's. */}
			<div className="ssr-topbar flex h-[54px] shrink-0 items-center gap-1.5 overflow-hidden border-b border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-2.5 min-[1100px]:gap-3 min-[1100px]:px-3.5">
				{/* THE BRAND BLOCK — two controls in one 2px group: the mark links home, the
				    chevron (plus the wordmark from 1100 up) opens the workspace menu. Two boxes,
				    not one, because the app draws two and the parity matrix compares SETS. */}
				<div className="flex shrink-0 items-center gap-0.5">
					{/* The app's `BRAND_BOX` minus its hover/focus states, which a pre-paint shell can
					    never be in — the BOX is what the parity matrix compares. */}
					<a href={HOME_HREF} aria-label="Lattice — home" className="flex h-8 shrink-0 items-center rounded-md px-1 sm:px-1.5">
						<LatticeMark mode="light" className="size-7 ssr-mark-light" /><LatticeMark mode="dark" className="size-7 ssr-mark-dark" />
					</a>
					<button type="button" aria-label="Workspace launcher" className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1 sm:gap-2 sm:px-1.5">
						{/* The wordmark rides the launcher only at !compact. */}
						<span className="hidden font-display text-[19px] font-extrabold tracking-tight text-[var(--text-heading)] min-[1100px]:inline" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Lattice</span>
						<ChevronDown className="size-4 text-muted-foreground" />
					</button>
				</div>
				{/* RULE 1 — brand | deck. `!compact` in the app, at every stop. */}
				<span className="hidden min-[1100px]:contents">
					<Separator orientation="vertical" className={BAR_RULE} />
				</span>

				<DeckPill title={deckTitle} />
				{/* RULE 2 — deck | dial, closing the identity band. `!compact` in the app, at every
				    stop; it was `hidden xl:block` there until 2026-09-05, which is why this span's
				    1100 gate used to disagree with the app across 1100–1279 at Craft. */}
				<span className="hidden min-[1100px]:contents">
					<Separator orientation="vertical" className={BAR_RULE} />
				</span>
				<span className="hidden min-[700px]:contents">
					<StopDial />
				</span>
				<div className="flex-1" />

				{/* PHONE tail: mode · workspace settings · menu. Below 700 the app still uses the
				    Eight-Cell Bar and the StudioDrawer, so this tier is untouched by the width
				    ladder above it. */}
				<span className="contents min-[700px]:hidden">
					<Button variant="ghost" size="icon-sm" aria-label="Switch to dark mode" className="ssr-mode-to-dark"><Moon className="size-[18px]" /></Button>
					<Button variant="ghost" size="icon-sm" aria-label="Workspace settings"><SettingsCog className="size-[18px]" /></Button>
					<Button variant="ghost" size="icon-sm" aria-label="Menu"><MenuIcon className="size-[18px]" /></Button>
				</span>

				{/* ≥700: ONE TAIL, ONE LADDER. This was three tails, then two — phone, tablet and
				    desktop, then a desktop pair split by STOP — each mirroring an app that drew a
				    different control set per tier or stop. The app draws one row now: search is
				    present at EVERY width, the appearance box and tours at every STOP, and what
				    overflows into the "More controls" menu is decided by WIDTH ALONE. So a resized
				    desktop window, a tablet at the same width, and a dial step all draw the same
				    row — and the skeleton has to say the same thing or parity fails on every
				    control right of the deck pill.
				    The ladder, first to leave the row: theme + tours (xl) → feedback (lg) →
				    Present/Share (md). Search and the menu never leave.
				    ONE rule in this run, not two: it closes the utilities band before the verbs.
				    It is `min-[1100px]` and not `xl`, matching the app's `!compact` gate — at
				    1100–1279 the appearance box and tours are gone but the band still closes. */}
				<span className="hidden min-[700px]:contents">
					<button type="button" aria-label="Search or run a command" className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-border bg-card px-2 text-[13px] text-[var(--text-body)] xl:px-3">
						<Search className="size-4 shrink-0" /><span className="hidden xl:inline">Search or run…</span>
						<Kbd className="ml-2 hidden xl:inline-block">⌘K</Kbd>
					</button>
					<span className="hidden h-8 items-center rounded-md border border-border bg-background p-[3px] xl:flex">
						<Button variant="ghost" size="icon-sm" className="size-[26px]" aria-label="Theme"><Palette className="size-[18px]" /></Button>
						<Button variant="ghost" size="icon-sm" aria-label="Switch to dark mode" className="ssr-mode-to-dark size-[26px]"><Moon className="size-[18px]" /></Button>
					</span>
					<Button variant="ghost" size="icon-sm" aria-label="Show me — guided tours" className="ssr-tours hidden text-[var(--text-body)] xl:inline-flex"><MonitorPlay className="size-[18px]" /></Button>
					<Separator orientation="vertical" className={cn(BAR_RULE, 'hidden min-[1100px]:block')} />
					<Button size="sm" className="hidden gap-1.5 px-2 md:inline-flex lg:px-3" aria-label="Present"><Play className="size-4" /><span className="hidden lg:inline">Present</span></Button>
					<Button variant="outline" size="sm" className="hidden gap-1.5 px-2 md:inline-flex lg:px-3" aria-label="Share"><Share2 className="size-4" /><span className="hidden lg:inline">Share</span></Button>
					<Button variant="ghost" size="icon-sm" aria-label="Send feedback" className="hidden lg:inline-flex"><FeedbackIcon className="size-[18px]" /></Button>
					<Button variant="ghost" size="icon-sm" aria-label="More controls"><MenuIcon className="size-[18px]" /></Button>
				</span>
			</div>

			{/* The phone's action bar — below 700 only. */}
			<span className="contents min-[700px]:hidden"><ActionBar /></span>
		</TooltipProvider>
	);
}

/**
 * The desktop Craft ACTIVITY RAIL — the 52px column of panel launchers left of the split.
 *
 * It is the app's own `ActivityRail`, rendered at build time with every panel closed, which
 * is exactly the state StudioShell mounts with (`activeAssistant` / `activeSettings` both
 * start `null` at every stop — a posture never force-opens a panel). So the shell can draw
 * the real icons here without asserting anything it cannot know: unlike the deck's slides or
 * its palette, "which panels are open on a cold load" has one answer, and it is none.
 *
 * Before this, the band shipped as an EMPTY `<div>` — a bare 52px strip beside a top bar
 * drawn control-for-control, so a Craft reload showed a blank column until hydration filled
 * it in. The band's geometry was already right (`--sh-rail`, seeded desktop-Craft-only);
 * only its CONTENT was missing, which is why neither band oracle nor the parity matrix saw
 * it — the former measures the bands the pane owns, the latter scoped itself to the two
 * chrome ROWS. It now covers the rail too.
 *
 * `min-h-0 flex-1` fills the band, and BOTH halves are load-bearing. `flex-1` because the
 * rail's foot group (Setup + the account chip) is pushed down by a `flex-1` spacer, so a
 * content-height nav would stack them under "Deck" instead of at the bottom of the column the
 * app puts them in. `min-h-0` because the band is a flex COLUMN, so the nav's main axis is
 * vertical and its automatic minimum size is its CONTENT height — which floors it there and
 * refuses to shrink. The app's rail is a flex item of a ROW, so its height is a stretched
 * 666px box and its cells shrink to fit inside it. Without `min-h-0` the shell's nav stood at
 * its 690px content height and the band clipped the difference: identical markup, 3px taller
 * cells, drifting to 20px by the account chip — but ONLY for a reader who raised the browser's
 * minimum font size, which is the same blind spot as #1496 and measured the same way.
 *
 * The band paints the right-hand hairline and clips the nav's own — same 52px border-box on
 * both surfaces, so the icons land on the app's center line either way.
 */
export function StudioActivityRailSkeleton() {
	return (
		// Same reason as StudioChromeSkeleton's provider: BarIcon wraps its control in `Tip`,
		// and Radix reads tooltip context at render, so a build-time render without it throws.
		<TooltipProvider>
			<ActivityRail className="min-h-0 flex-1" state={ACTIVITY_RAIL_CLOSED} onAssistant={NOOP} onSettings={NOOP} onWorkspace={NOOP} />
		</TooltipProvider>
	);
}

/**
 * The editor column left of the split (tablet + desktop). Its body is the app's OWN
 * `EditorSkeleton` — the placeholder the app itself shows while the lazy CodeMirror chunk
 * streams in — so the shell hands straight over to an identical surface instead of swapping
 * one placeholder for another.
 */
/**
 * The EDIT band — the eyebrow AND its toolbar.
 *
 * This drew the word "Edit" and nothing else, while the app's band carries eight controls, so
 * the whole toolbar POPPED IN at hand-off. It was invisible to every guard: the band's BOX is
 * right (45px in both, measured), `studio-instant-shell` compares bands rather than their
 * contents, and `studio-shell-parity` — the spec that does enumerate controls — only reads
 * three subtrees, none of which is this one. Reported on an iPad Air 4, both orientations.
 *
 * Every control here is gated on width or stop, per this file's own rule, and two of them only
 * became drawable because the app stopped gating them on DECK DATA:
 *   · `Add slide` — `insertComponents.length > 0`, and `components` is the build-time catalog
 *     inlined into the page, so it is never empty.
 *   · `Reshape slide` — was `reshapeVariants.length > 0`, i.e. a function of the ACTIVE SLIDE's
 *     component. It is now always rendered and `disabled` when the slide offers no looks (the
 *     idiom `Fix all issues` beside it already used), which makes the row's shape constant for
 *     the app too — the toolbar no longer reshuffles as you arrow through the deck.
 *   · `Markdown`/`Compose` — `editMode` always boots `'markdown'`, so the lit segment is known.
 *   · `Collapse editor` — `splitUsable` is `!mobile && view === 'compose'`, and this band does
 *     not render on mobile or at Read at all (see studio.astro's `.ssr-editpane` gates).
 *
 * NOT drawn, because they are genuinely unknowable and start ABSENT in the app too: the issue
 * count pill (`issues > 0`, nothing is linted yet) and `Refine selection` (`hasSelection`).
 * Both appear later on their own; neither is present at hand-off.
 */
export function StudioEditorPaneSkeleton() {
	return (
		<>
			<div data-slot="edit-bar" className="flex shrink-0 items-center gap-2 border-b border-border px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
				Edit
				<span className="flex-1" />
				{/* The label spans ride the app's own container queries (`@[36rem]` / `@[34rem]`),
				    which resolve against the EDITOR PANE — so `.ssr-editpane` carries
				    `container-type: inline-size` in studio.astro, or every label here would
				    resolve against the wrong box and the row would measure short. */}
				<button type="button" aria-label="Add slide" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)]"><Plus className="size-3" /><span className="hidden @[36rem]:inline">Add</span></button>
				<button type="button" aria-label="Reshape slide" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)]"><Shapes className="size-3" /><span className="hidden @[36rem]:inline">Reshape</span></button>
				{/* Inert in the app until the deck is linted, and the shell has linted nothing —
				    so `disabled` here is the honest state, not a copy of a style. */}
				<button type="button" aria-label="Fix all issues" disabled className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)] opacity-40"><ListChecks className="size-3" /><span className="hidden @[36rem]:inline">Fix all</span></button>
				<Button variant="ghost" size="icon-sm" aria-label="Version history"><History className="size-[18px]" /></Button>
				{/* Slide settings is `compact &&` in the app — on desktop the activity bar owns it. */}
				<span className="ssr-slide-settings contents"><Button variant="ghost" size="icon-sm" aria-label="Slide settings"><FileSliders className="size-[18px]" /></Button></span>
				<div className="ml-0.5 inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
					<button type="button" aria-label="Markdown source" className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-soft)] px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)]"><FileText className="size-3" /><span className="hidden @[34rem]:inline">Markdown</span></button>
					<button type="button" aria-label="Compose — rich editor" className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-muted-foreground"><Sparkles className="size-3" /><span className="hidden @[34rem]:inline">Compose</span></button>
				</div>
				<Button variant="ghost" size="icon-sm" aria-label="Collapse editor"><PanelLeftClose className="size-4" /></Button>
			</div>
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
		<div data-slot="preview-bar" className="flex items-center gap-2 border-b border-border px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
			{/* Gated exactly as the app gates it: the label is for the two-pane tiers, where the
			    editor's header sits beside this one. On a phone the pane switcher above already
			    says Preview, so both surfaces drop it — and they must drop it TOGETHER, or every
			    control after it in this row lands ~72px off in the shell↔app comparison. */}
			<span className="hidden shrink-0 @[24rem]:min-[700px]:inline">Preview</span>
			{/* The app's LensPicker trigger in `dense` mode — `px-2 py-0.5 font-sans text-[12px]`,
			    i.e. the slide counter's own metrics (lens-picker.tsx `DENSE_PILL`). It used to be
			    `px-3 py-1.5 text-[12.5px]` and the tallest thing in this row; it is now the same
			    height as the counter, and on the two-pane tiers the 32px "Collapse preview" button
			    is what sets the band's height instead. Under-sizing it here (this was `px-2.5 py-1`)
			    once left the whole band ~8px short of the app's at every font size. */}
			{/* A real <button aria-label="Reader view">, because the app's LensPicker trigger is
			    one — the same reason `DeckPill` is a button. As a <span> it was invisible to
			    `studio-shell-parity`, which enumerates `button, a[href], input, select, [role]`:
			    the app's control was in the set and the shell's was not, so widening that spec's
			    roots to this band would have reported a missing control that is in fact drawn. */}
			<button type="button" aria-label="Reader view" className="inline-flex min-h-[calc(1lh_+_0.25rem_+_2px)] min-w-0 shrink items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 font-sans text-[12px] font-semibold normal-case tracking-normal text-foreground"><FileText className="size-3.5 shrink-0" />{/* The label is the FULL-DECK lens's own name, and at boot it always is
			    that one: the active lens is not persisted, so every load starts on `full`. So the
			    shell draws the real string from `LENSES[0].label` — the same constant the app's
			    picker renders — rather than reserving a guessed width for it. It was
			    `ContentBar w-12`, 48px fitted against "the app's 101.3"; the app's real button is
			    100px, so the shell's was 2px wide and the `‹` after it sat 1px off at every width.
			    A deck that RENAMES its full lens is the one residual, and `truncate` bounds it. */}
			<span className="hidden truncate @[21rem]:inline">{LENSES[0].label}</span>
			{/* The app's trigger carries this at EVERY width (`lens-picker.tsx`, outside the
			    container queries that hide the label and the count), and it is the whole 18px. */}
			<ChevronDown className="size-3.5 shrink-0" /></button>
			<span className="flex-1" />
			{/* The app's slide counter: `px-2 py-0.5 font-sans text-[12px] font-semibold`. It was
			    `px-2.5 py-1.5` here, which made the skeleton's natural height 52.6px against the
			    app's 47 — invisible only because the band was pinned to a constant and clipped. */}
			{/* The app brackets its counter with `‹` and `›` (unconditional), and they were missing
			    here — 20px each plus two 8px gaps, which pushed the counter and the collapse
			    button left of where the app puts them. */}
			<button type="button" aria-label="Previous slide" className="shrink-0 rounded px-1.5 text-muted-foreground">‹</button>
			{/* The count is per-deck content the shell must not draw, so the SLOT is reserved from
			    `SLIDE_COUNTER_SLOT` — the constant the app's counter uses too. It was `w-12`, a
			    width fitted to "Slide 1 / 7" on the welcome deck; the app's real pill measures
			    65px against the 66px that produced, and any other deck moves it further ("Slide
			    10 / 12" is 13px wider than "Slide 1 / 7"). Reserving on both sides also stops the
			    app's own counter jittering as you page from slide 9 to 10, which no shell↔app
			    comparison could see — both sides were wrong the same way.
			    `text-[var(--text-heading)]` because the app's counter carries it: the pill matched
			    on geometry and not on ink. */}
			<span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--text-heading)]"><span data-shell-unknowable="slide-counter" className={SLIDE_COUNTER_SLOT}><ContentBar className="w-12" /></span></span>
			<button type="button" aria-label="Next slide" className="shrink-0 rounded px-1.5 text-muted-foreground">›</button>
			{/* "Collapse preview" — the app renders it wherever the split exists (`!mobile`), so
			    the CSS gate is the app's own 700 boundary, not Tailwind's. It is here for a
			    HEIGHT reason as much as a fidelity one: at 32px (`icon-sm`) it is the tallest
			    thing in a two-pane row now that the lens pill is counter-sized, i.e. it is what
			    sets `PREVIEW_CHROME.headerWriteSplit`. Without it the skeleton's natural height
			    would be the phone's 38.2px in a band floored at 45, so the pills would sit ~7px
			    high of the app's — and, worse, a wrong constant would look right. */}
			<Button variant="ghost" size="icon-sm" aria-label="Collapse preview" className="hidden min-[700px]:inline-flex"><PanelRightClose className="size-4" /></Button>
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
