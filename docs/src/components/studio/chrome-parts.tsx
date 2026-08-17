// Shared Studio chrome primitives — the two presentational pieces the app's chrome and
// the PRE-PAINT INSTANT SHELL both render (#1438).
//
// They used to be private functions inside StudioShell. The shell (docs/src/pages/studio.astro)
// needed the same eight-cell bar and the same posture dial at HTML-parse time, and the first
// pass hand-drew skeleton approximations of both — a second set of sizes and glyphs that could
// drift from these without anything failing. Moving them here makes the shell render the REAL
// component at build time (Astro renders React to static HTML with no client directive, so this
// ships no JS), which is why the shell no longer carries any copied geometry or icon data.
//
// Keep these PURE and browser-API-free: they are rendered at build time, where there is no
// `window`. Props only, no hooks that read the DOM.

import { BookOpen, Layers, PencilLine } from 'lucide-react';
import type * as React from 'react';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Posture } from './studio-store';

// The top bar's band rule. ONE constant because the app header and the pre-paint
// skeleton both draw it and `studio-shell-parity.spec.ts` compares their boxes — two
// copies would drift silently.
//
// It is `--text-muted`, not the `bg-border` a shadcn `Separator` defaults to. Measured
// on the rendered bar in cuoio light, `--border` against the header ground is **1.32:1**
// (1.42:1 dark) — a rule that faint cannot carry the banding it is there for, which is
// why a visual review recommended deleting all three separators outright and letting
// proximity do the work. The owner's call was the other way: keep the device, make it
// readable. `--text-muted` is **2.64:1** — visible at a glance, and still well short of
// `--text-body` (5.95:1), which at 1px reads as a border around a region rather than a
// seam between bands. `h-6` over `h-5` for the same reason: a 24px rule in a 54px bar
// reads as deliberate where 20px read as incidental.
//
// This is the ONLY place the weight is set. Do not restyle the shared `Separator`
// primitive to match — other surfaces depend on its `bg-border` default.
export const BAR_RULE = 'h-6 bg-[var(--text-muted)]';

// ONE HEIGHT for every control in the top bar, and one for a member inside a bordered
// group. Before this the row ran SIX heights — launcher 38, appearance box 38, dial 35,
// ⌘K pill 35 (30 when it collapsed to an icon), deck pill 34, buttons 32 — so the twelve
// controls sat on top insets scattered across 8-17px in a 54px band. Nothing was aligned
// to anything; the ⌘K pill was simply the most visible offender because it sat 3px taller
// than the buttons beside it and shrank 5px at 1100.
//
// 32px is not a new number: it is what shadcn's `sm` and `icon-sm` already compute to, so
// Present, Share and every ghost icon were ALREADY correct and it is the odd ones that
// move. The controls sized by padding (`py-1.5` + content) are the ones that drifted.
// 26px is 32 minus the 3px padding a bordered group puts on each side, so a segment inside
// the dial or the appearance box lands flush inside a 32px container.
export const BAR_CONTROL = 'h-8';
export const BAR_SEGMENT = 'h-[26px]';

// The posture dial — the one always-visible, reversible control that replaced the
// one-way graduation ratchet (2026-07-17-studio-persona-dial.md). Stops are named for
// what you DO, never who you are, so no stop reads as a rank; the lit segment is the
// surface you're on (the transient `quietened` overlay lights Write without moving the
// saved posture). Matches the segmented-control idiom (bordered group, card-lift active).
export const POSTURE_STOPS: { id: Posture; label: string; hint: string; icon: React.ReactNode }[] = [
	{ id: 'read', label: 'Read', hint: 'Read — just the slides', icon: <BookOpen className="size-4" /> },
	{ id: 'write', label: 'Write', hint: 'Write — editor + preview', icon: <PencilLine className="size-4" /> },
	{ id: 'craft', label: 'Craft', hint: 'Craft — every panel', icon: <Layers className="size-4" /> },
];
export function PostureDial({ posture, quietened, revealCraft, onChange }: { posture: Posture; quietened: boolean; revealCraft: boolean; onChange: (p: Posture) => void }) {
	// Light the EFFECTIVE stop — a transient reveal shows Craft, a quiet shows Write —
	// so the dial always matches the surface you're looking at, then re-lights your
	// saved stop when the transient recedes.
	const shown: Posture = revealCraft ? 'craft' : quietened ? 'write' : posture;
	// When the lit stop is TRANSIENT (not your saved home), mark it with a dashed
	// outline instead of the solid selected shadow — so it reads as "showing now,"
	// and clicking it to make it your saved home is a deliberate act, never a silent
	// persist of a segment that merely looked already-selected (red-team finding).
	const transient = shown !== posture;
	return (
		<fieldset className={cn('m-0 inline-flex shrink-0 items-center rounded-lg border border-border bg-background p-[3px]', BAR_CONTROL)}>
			<legend className="sr-only">Workspace stop</legend>
			{POSTURE_STOPS.map((s) => {
				const lit = shown === s.id;
				return (
					<Tip key={s.id} label={lit && transient ? `${s.hint} · showing now — click to make it your saved home` : s.hint}>
						{/* COLOR, both arms, deliberately (2026-08-16 toolbar placement review):
						    · UNSELECTED was `text-muted-foreground` → `--text-muted`, which every theme
						      documents as "decorative / de-emphasized … WCAG-exempt" (themes/cuoio.css:108).
						      On 12px semibold that is a 1.4.3 AA FAILURE — measured 2.64:1 in cuoio light,
						      and below 4.5:1 in 21 of 36 palette×mode combos. These are load-bearing labels:
						      the two stops you are NOT on are exactly the ones you must read to decide where
						      to go, and #1401 spent 87px of header width precisely so they would be legible
						      on touch. `--text-body` is the AA-rated body channel (5.95:1 cuoio light).
						    · SELECTED was `bg-card text-[var(--accent)]` — a 1.09:1 fill carrying the state,
						      with the accent hue doing the real work. That fails twice: the fill is at the
						      edge of perceptibility, and in the 13 monochrome/a11y combos where `--accent`
						      resolves to `--text-heading` the lit label is the same ink as an unlit one.
						      The fill is now MIXED FROM `--text-heading` INTO `--bg`, which is the only way
						      to be sure it is visible: `--text-heading`/`--bg` is the theme's primary text
						      pair, so it is high-contrast in every palette BY CONSTRUCTION, and any mix of
						      the two therefore differs from the container. A first cut used `--accent-soft`
						      and that was WRONG in a way worth recording — it is distinct from `--accent` in
						      all 36 combos, which is the comparison that was checked, but a chip has to be
						      distinct from THE SURFACE IT SITS ON, and `--accent-soft` is byte-identical to
						      `--bg` in 8 dark palettes (ardesia, atelier, brina, burgundy, crepuscolo,
						      laguna, magnolia, mustard), so the chip had no fill at all there.
						      Measured across all 36: fill vs container ≥ 1.25 (was 1.00 in those 8),
						      label vs fill ≥ 7.67, ring vs fill ≥ 1.65.
						    · The state is deliberately OVER-DETERMINED now — fill, a heading-colored label
						      against body-colored neighbors, an accent hairline, and the shadow — so no
						      single channel collapsing can make the lit stop unreadable in some palette
						      nobody looked at. The hairline is solid where the transient arm's is dashed,
						      which is what keeps "your saved home" and "showing now" apart.
						    This also buys back an accent draw: the bar spends accent on ONE filled object
						    (Present), and here only on a hairline — a state marker, not a filled control. */}
						<button type="button" aria-label={lit && transient ? `${s.hint}, showing temporarily` : s.hint} aria-pressed={lit} onClick={() => onChange(s.id)} className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition-colors', BAR_SEGMENT, lit ? (transient ? 'bg-[color-mix(in_srgb,var(--text-heading)_12%,var(--bg))] text-[var(--text-heading)] outline-dashed outline-1 outline-offset-[-2px] outline-[color-mix(in_srgb,var(--accent)_55%,transparent)]' : 'bg-[color-mix(in_srgb,var(--text-heading)_12%,var(--bg))] text-[var(--text-heading)] shadow-sm ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]') : 'text-[var(--text-body)] hover:text-[var(--text-heading)]')}>
							{/* The words are not optional. They shipped as desktop-only for one release
							    (#1381) and the reclaim was real — 219px labeled vs 116px — but it landed on
							    the one control in this row that cannot survive it: a touch user between 700
							    and 1099px had NO route to these words, since the tooltip carrying them is
							    hover-only and the tablet ⋯ menu has no Read/Write/Craft rows. The 87px now
							    comes out of the row's own slack instead (#1401): the guided tours moved into
							    ⋯ below desktop, and the whole row runs at the phone's density there. */}
						{s.icon}<span>{s.label}</span>
						</button>
					</Tip>
				);
			})}
		</fieldset>
	);
}

// One icon on the desktop left activity bar. `caption` is a PERSISTENT label
// under the glyph (not a hover-only tooltip — those never fire on touch and
// leave a newcomer facing mystery glyphs; 2026-07-06-studio-activity-bar.md).
// `active` is passed only for the panel toggles (Coach/Slide/Deck) → aria-pressed;
// the globals (Library/Workspace) open dialogs, so they get no pressed state.
//
// `variant="bar"` is the mobile Eight-Cell Bar's horizontal cell (2026-07-26-studio-
// mobile-eight-cell-bar.md): flex-1 instead of a fixed w-11 rail width, a bottom active
// rule instead of the rail's left-edge marker, `demo` for a tour data-demo passthrough,
// and `badge`/`describedBy` so a status count can ride the cell without changing its
// accessible name. Both variants now floor at `min-h-11` (44px) — the rail's own
// `py-1.5` box computed to ~41px, itself under the touch floor.
export function BarIcon({ label, hint, caption, active, onClick, children, variant = 'rail', demo, badge, describedBy, tone = 'ghost' }: { label: string; hint: string; caption: string; active?: boolean; onClick: () => void; children: React.ReactNode; variant?: 'rail' | 'bar'; demo?: string; badge?: number; describedBy?: string; tone?: 'ghost' | 'outline' | 'solid' }) {
	const bar = variant === 'bar';
	return (
		<Tip label={hint}><button
			type="button"
			aria-label={label}
			aria-pressed={active}
			aria-describedby={describedBy}
			data-demo={demo}
			onClick={onClick}
			className={cn(
				'group/bar relative flex min-h-11 flex-col items-center justify-center gap-0.5 font-semibold leading-none transition-colors',
				bar ? 'min-w-0 flex-1 gap-[3px] rounded-none px-1 py-1.5 text-[9px]' : 'w-11 gap-0.5 rounded-xl py-2 text-[8.5px]',
				tone === 'solid' ? 'bg-[var(--accent)] text-[var(--on-accent)]'
					: tone === 'outline' ? 'border border-border text-[var(--text-heading)]'
					: active
						// The mobile BAR's selected state swaps --text-heading/--bg rather than tinting with
						// --accent-soft: in light mode that paints a dark chip (light mode's near-black text
						// color as the fill), in dark mode a light chip — the palette's OWN opposite-mode look,
						// with zero new tokens (every palette already carries both, high-contrast by
						// construction since they're the theme's primary text/background pair). Reported as
						// too subtle to read at a glance; the rail's accent-soft tint is unchanged (scoped fix).
						? (bar ? 'bg-[var(--text-heading)] text-[var(--bg)]' : 'bg-[var(--accent-soft)] text-[var(--accent)]')
						: 'text-muted-foreground hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]',
			)}
		>
			{/* Active marker: the rail variant gets a left-edge rule (VSCode-style, on a
			    vertical bar's inner edge, in --accent). The bar variant gets a bottom rule
			    too, but in --bg, not --accent: in every monochrome/accessibility-safe
			    palette (onyx, the four a11y-* palettes, atelier, concrete, ardesia)
			    --accent resolves to the SAME value as --text-heading, which is this cell's
			    OWN fill — an --accent rule would be invisible on it, AND (found by the
			    adversarial trio, 2026-07-26-studio-mobile-eight-cell-bar.md) the SOLID tone
			    (`bg-[var(--accent)] text-[var(--on-accent)]`) then renders as a
			    byte-identical block to this cell, so nothing distinguished "selected" from
			    the filled CTA in 13 of 36 palette×mode combinations. --bg is guaranteed high
			    contrast against --text-heading in every palette (checked: 9.65–21:1), so
			    the rule is always visible on the fill it sits on — and only a `tone==='ghost'`
			    cell ever gets it, so neither verb ever does, regardless of what its own fill
			    happens to resolve to.
			    NOTE (2026-08-16): this rule keys on `tone`, never on WHICH verb is solid, so
			    it survived the Present/Share emphasis swap untouched — Present now carries
			    the fill and Share the outline. That is exactly why it keys on tone; if you
			    ever rewrite it to name a verb, you re-create the coupling this note exists
			    to prevent. */}
			{active && tone === 'ghost' && (
				<span aria-hidden="true" className={bar ? 'absolute inset-x-2 -bottom-[1px] h-[2px] rounded-full bg-[var(--bg)]' : 'absolute -left-[7px] inset-y-2 w-[3px] rounded-full bg-[var(--accent)]'} />
			)}
			{children}
			<span className="tracking-tight">{caption}</span>
			{typeof badge === 'number' && badge > 0 && (
				<span aria-hidden="true" className="absolute -top-1 -right-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full border-[1.5px] border-[var(--bg-alt)] bg-[color-mix(in_srgb,var(--chart-2,#9c3f00)_92%,transparent)] px-[3px] font-mono text-[9px] font-bold leading-none text-white">{badge > 99 ? '99+' : badge}</span>
			)}
		</button></Tip>
	);
}

// Editor-shaped placeholder shown while the lazy CodeMirror chunk streams in. The SSG
// instant-shell dismisses on the PREVIEW's first render (decoupled from the editor), so
// on cold load the shell can lift while this pane is still resolving — a bare "Loading…"
// box would reveal a half-built app. A gutter + faint code lines read as "an editor,
// arriving" instead, so the handoff stays seamless. Fixed widths (no Math.random) keep it
// deterministic; the real text is sr-only for assistive tech.
const EDITOR_SKELETON_LINES = [82, 63, 71, 44, 78, 57, 88, 38, 67, 74, 51, 80, 60, 46];
export function EditorSkeleton() {
	return (
		<div className="flex flex-1 gap-3 overflow-hidden p-3 font-mono text-[13px] leading-[1.5]" aria-hidden="true">
			<div className="flex select-none flex-col items-end gap-[7px] pr-3 text-muted-foreground/25">
				{EDITOR_SKELETON_LINES.map((w, i) => (
					<span key={w}>{i + 1}</span>
				))}
			</div>
			<div className="flex flex-1 flex-col gap-[7px] pt-[3px]">
				{EDITOR_SKELETON_LINES.map((w) => (
					<div key={w} className="h-[9px] rounded-sm bg-muted-foreground/10" style={{ width: `${w}%` }} />
				))}
			</div>
			<span className="sr-only">Loading the editor…</span>
		</div>
	);
}
