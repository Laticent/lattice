---
status: shipped
summary: The Playground + Studio shipped two hand-rolled resize systems — the ~760-line ui/split.tsx (editor|preview divider, from the 2026-07-02 competition) and studio/use-panel-width.ts (the docked Settings/Assistant column widths). The request: switch to the shadcn splitter (react-resizable-panels) AND make the Studio's Coach/Chat/Library panels resizable. That second requirement dissolves the exact premise the 2026-07-02 doc rejected react-resizable-panels on (its side panels were FIXED tracks that couldn't be Panels) — so this migrates both surfaces onto react-resizable-panels v4. v4's native PIXEL min/max/collapsedSize retire the fr-pair "void" math (#721), the CSS-var pre-paint seeds, and the panelBudget/archEff/setEff clamp arithmetic. One shared hook (useResizableSplit) preserves the old useSplit surface so the ~20 Studio call sites are untouched; the consumer keeps the two things no splitter solves — the srcdoc iframe pointer shield and the __latticeFit re-fit. Verified on the real docs site across Read/Write/Build/tablet + keyboard resize + collapse-to-rail; unit tests alias the library to a plain-div stub (its jsdom pointer hijack breaks Radix menus); resize itself is Playwright-verified.
---

# Migrate the Playground + Studio splitters to the shadcn resizable panel

*2026-07-19* · Status: **shipped**.

## Why this reopens the 2026-07-02 rejection

The [resizable-panes competition](2026-07-02-resizable-editor-preview-panes.md)
chose a hand-rolled primitive (`ui/split.tsx`) and **rejected**
`react-resizable-panels` for one concrete reason (§8): it "requires every grid
sibling to be a Panel — it cannot host Studio's conditional Architect track or
the Inspector rail." Those side panels were fixed-width CSS-grid tracks resized
by a *second* hand-rolled system (`use-panel-width.ts` + `PanelGrip`).

The new requirement — **make Coach / Chat / Library / Settings resizable too** —
means every one of those columns *becomes a Panel*. The objection was "the side
columns can't be Panels"; the ask is "make the side columns resizable Panels."
The premise is gone, so the library is now the right fit, not a mismatch. This
is not overriding the old decision on a whim — the input that decided it changed.

## What v4 changes vs the 2026 assessment

The 2026 doc assessed `react-resizable-panels` at its then-current API
(percentage-based sizing). **v4 (4.12) takes pixels natively**: `minSize={240}`
is 240px, `minSize="20"` is 20%. That single fact retires the most fragile part
of the hand-rolled design:

- **The #721 fr-pair "void" math is gone.** The custom primitive emitted a
  *doubled* flex pair (`2r / 2(1−r)`) so a pane clamped at its px minimum
  wouldn't leave a dead grid void (CSS Grid §12.7.1). v4 expresses the px minimum
  directly and the library owns constraint satisfaction — no `splitTracks`,
  `panelBudget`, `archEff`/`setEff`, `PAIR_MIN`/`FOLD_SAFETY`, and no
  `--split-*` CSS-var pre-paint seed in `playground.astro`/`studio.astro`.
- **`collapsible` + `collapsedSize` + `panelRef.collapse()/expand()`** give the
  collapse-to-rail affordance the primitive hand-rolled.
- **`useDefaultLayout`** owns persistence (localStorage), including the SSR seed.

## Architecture

**One shared hook** — `ui/use-resizable-split.ts` — presents the *same surface*
the old `useSplit` did: `{ collapsed, dragging, expand, collapse, reset }`, plus
`editorRef`/`previewRef`/`groupProps`/`onEditorResize`/`onPreviewResize`. Both
surfaces consume it, so the ~20 Studio call sites (⌘K split commands,
programmatic preview reveal, the collapse/inert conditions, DeckPreview's
`active`/`suspended` props) are unchanged. Only the *render* changed: a
`<ResizablePanelGroup>` (`ui/resizable.tsx`, the shadcn wrapper) instead of a CSS
grid.

**Studio is now one workspace-wide group**: `[ Settings? ][ Assistant? ][ editor ][ preview ][ tablet-Inspector? ]`
— the activity bar stays a fixed flex rail *outside* the group. Settings and the
Assistant slot (Coach / Chat / Lenses / Library) are resizable Panels that
render conditionally; editor + preview are the collapsible pair.

**The consumer still owns what no splitter solves:** the `srcdoc` preview-iframe
pointer shield and the `__latticeFit` re-fit choreography, wired through the
hook's `onDragStart`/`onDragEnd` (Playground: suspend/resume the in-iframe FIT
agent; Studio: suspend/resume the per-host `scaleFrame` observers).

## Traps discovered on the real surface

Three v4-specific traps, each fixed and worth recording:

1. **Hydration auto-collapse.** A `collapsible` panel snaps collapsed when the
   group measures 0 width during hydration. Fix: gate `collapsible` on a
   post-mount `ready` flag (off on the server + first client render for hydration
   parity, on after mount when width is real).
2. **The outer/inner Panel pair.** v4 renders each Panel as an OUTER sizing div
   (carries the `id` + inline `flex`) wrapping an INNER div that receives our
   `className`. So a Tailwind class on a Panel lands on the *inner* div and can't
   shrink the *outer*. The Read-stop full-bleed therefore hides the editor's
   OUTER div by `#studio-editor` in `studio.astro`'s `is:global` block; the
   divider hides via its own Separator class (a Separator is a single div).
3. **`useDefaultLayout` doesn't round-trip.** In v4.12 the hook's save and restore
   paths key storage differently and never restore a two-panel layout (verified
   twice on the real surface). So **persistence is hand-rolled** in the hook and
   covers the **whole structure**, not just the editor ratio: localStorage stores
   the FULL group layout — every panel's size, so the Studio's Settings/Assistant
   column widths persist alongside the editor|preview split — keyed by a `configKey`
   (which panels are present), so each Studio configuration (Coach open, Library
   open wider, bare Write, tablet Inspector) keeps its own remembered widths. The
   collapsed side is sessionStorage (survives reload, not a new tab). Restored
   post-mount AND whenever the config changes, via `groupRef.setLayout()` /
   `panelRef.collapse()`. Note `resize()` takes a bare number as **pixels**; sizes
   are percentages, so a `"n%"` string.

## Post-ship fixes — drag bleed + header-clip minimums

Two defects surfaced on a real iPad after ship (both Studio-only; the Playground's
in-flow iframe never had either). Fixed together, verified on the real docs surface.

1. **The preview "bled" over the editor during a drag.** The Studio preview is the
   ONE shared `position:fixed` host (§Architecture) overlaying a slot in the preview
   pane. During a divider drag the host repositioning was *frozen* (the
   `useSharedPreviewSlot` `suspended` gate) AND the outer CSS-transform scale
   (`scaleFrame`) was frozen (`suspendScaleObservers(true)` on `onDragStart`) — a
   deliberate "hold, then snap once on release" borrowed from the Playground's
   `__latticeFitSuspend`. But the Playground preview is an *in-flow* iframe that
   resizes with its pane; the Studio's `position:fixed` host does not. So mid-drag the
   frozen host stayed at its pre-drag geometry while the slot shrank underneath it, and
   the slide overhung the neighbor pane for the whole gesture (measured: the host
   left/width lagged the slot by 216px mid-drag). A brief flash under a fast mouse; a
   glaring, sustained overlap under a slow iPad touch-drag. **Fix:** track live. The
   single-slide preview has *no in-iframe FIT agent* to protect — `scaleFrame` is one
   cheap transform write on one host — so freezing it during the drag bought nothing and
   caused the bleed. Removed the freeze in `useSharedPreviewSlot` (the slot's
   ResizeObserver now repositions the host every frame of the drag) and dropped
   `onDragStart: suspendScaleObservers(true)` (scaleFrame's own ResizeObserver now
   rescales live as the host resizes). `onDragEnd` keeps one authoritative refit as a
   belt-and-suspenders snap. *Verified: mid-drag host rect === slot rect (0px gap).*

2. **A pane dragged to its minimum clipped its header icons.** The editor/preview
   `minSize` (240 / 280) were below the pane HEADER toolbar's intrinsic floor. Measured
   on the real surface (a width sweep reading `header.scrollWidth` vs `clientWidth`):
   editor floors at ~284px, preview ~260px. So "drag to the minimum" cut icons off
   instead of collapsing cleanly to the rail. **Fix:** raise both to 300px (`EDITOR_MIN`
   / `PREVIEW_MIN`), the measured floor with margin for the editor's conditional
   Refine/issue controls. Chosen ≤ the both-panels budget: the 1100px desktop config
   (bar + Settings 260 + Assistant 200 + editor 300 + preview 300, with the
   narrow-desktop bar-fold) still shows 0 doc/group overflow — verified at 1100 AND
   1180. *Verified: editor at its 300px min → header `overflow` 0.*

This resolves the desktop "collapse to rail vs clip" edge; the %-vs-px persistence
drift and the Library 298-vs-380 default remain open. **One new logged follow-up —
the tablet header floor.** The tablet editor header is taller-content than desktop's:
it carries a compact-only Slide-settings launcher (there's no activity bar below
desktop), so its measured floor is **~324px**, not desktop's 284. So on tablet the
editor header can still clip when narrow — in the 2-panel case only if dragged near
the min, and more readily in Build with the docked Inspector ALSO open (editor 300 +
preview 300 + inspector 260 = 860 > an iPad-portrait 768–834, so react-resizable-
panels clamps the panes below their mins to avoid a document scroll — verified 0
doc/group overflow at 768/834/1024). This is **milder than before**, not a regression:
the old 240 min sat ~84px under the 324 floor and clipped there whenever narrow; 300
is 24px under, so it clips less. Fully clearing tablet via `minSize` alone fights the
3-panel width budget; the real fix is to trim the tablet header (fold the extra
launcher into the ⋯ overflow) or make the tablet Inspector a sheet below some width —
out of scope for this desktop-reported bug.

**Accepted tradeoff — first-paint ratio jump.** The old hand-rolled split seeded a
returning resizer's saved ratio into a CSS var *before* hydration (no first-paint
jump). react-resizable-panels owns the panel's inline flex, so a CSS-var seed
can't reach it; the hook restores the ratio post-mount instead. A returning
Playground resizer (client:load → SSR paints at the default) therefore sees one
brief frame at the default ratio before the restore. Studio is client:only (no SSR
split paint), so it is unaffected. This is the one behavior the migration doesn't
match 1:1 — judged an acceptable cost for retiring ~760 lines of custom splitter.

## Verification

Per HARD RULE #23, on the **real docs site** (headed Chromium via `CHROME_PATH`):

- **Playground** (1440/820/390): split renders; collapse→rail→restore;
  type-after-restore (CodeMirror survives the 0-width interlude); keyboard resize
  (672→456px); a DOM PointerEvent drag (672→328px); mobile flattens to tabs.
- **Studio** (1440/1000): Read (full-bleed preview, no editor sliver), Write
  (bare editor|preview), Build (activity bar + resizable Coach panel + editor +
  preview), keyboard resize (662→446px), collapse editor→46px rail→restore —
  zero page errors across all modes.
- **Harness limit (honest):** synthesized *bare-mouse* drag from Playwright AND
  puppeteer can't drive the library — both deliver `buttons:0` on held moves,
  which react-resizable-panels treats as pointer-release. Real mice send
  `buttons:1`, so this is a headless-input limitation, not a product defect. E2E
  drives drag via keyboard (a real path) + dispatched PointerEvents.
- **Unit tests** alias `react-resizable-panels` to a plain-div stub
  (`src/test/react-resizable-panels.stub.tsx`): the library hit-tests document
  `pointerdown` against divider rects, and in jsdom every rect is 0×0 at (0,0),
  so it swallows every click and breaks Radix menus. Resize is verified in the
  e2e (real geometry); the full docs unit suite is green.

## Adversarial trio review (HARD RULE #25)

Before merge, the shipping diff went through the full trio — red team, Munger
inversion, and an independent checker (a maker-checker pass ran earlier, on a
pre-persistence-rewrite state). Findings fixed + verified on the real surface:

- **`setLayout({})` throws at 0-width restore** — `getLayout()` returns `{}` while
  the group is measured at 0 width; the restore now guards on a non-empty layout.
- **Collapse re-expanded when a side panel opened** — a panel toggle makes the
  library re-lay-out and expand a collapsed pane. The collapse now re-applies on
  every config change, with a `configChangingRef` window that suppresses the
  transient (no spurious persist / status / re-fit). *Verified.*
- **`reset()` was group-relative** — ⌘K "Reset split" now restores the default
  editor share of the editor|preview PAIR (docked side panels keep their width).
  *Verified (0.46 of the pair with Coach open).*
- **configKey could bleed** — the persistence bucket is now derived from the
  ACTUAL present panel ids (`bucketOf`), so a forgotten configKey extension
  fails safe (no restore) instead of applying one config's widths to another; the
  restore effect also cancels its inner rAF so a stale config can't apply.

**Logged follow-ups (bounded / recoverable — #18):**

- **Library opens ~298px, not its 380px ideal, on an in-place Coach→Library
  switch.** Giving Library its own panel id widened it (was ~232px), but the
  library's mixed-unit default normalization (editor/preview `%` defaults dilute a
  px side-panel default) keeps it short. Correct from-closed; fully draggable +
  persisted. Fix later by honoring px side-panel defaults or an imperative resize.
- **Docked widths persist as `%`, not px** — a returning user at a *different*
  window width sees a proportionally-shifted split (the library re-clamps to px
  min/max, so it degrades gracefully). The old system stored a width-independent
  ratio. Studio-multi-panel only.
- **Collapse key is per-surface, not per-config**; **touch: the library's ~20px
  coarse hit-zone near a divider** (device test outstanding, #23); the first-paint
  restore is a few frames, not one.

The trio also **cleared** several suspected issues: the library preserves
`aria-valuenow` + deterministic Enter-collapse and re-clamps `setLayout`; the
no-remount invariant holds across stops/toggles; the document pointer listener
doesn't interfere with Radix/CodeMirror; storage is try/catch + bounded; the
outer-div id-hide is correct (not luck).

## Removed

`ui/split.tsx` (+ `split.test.tsx`) and `studio/use-panel-width.ts` — both custom
resize systems are retired. The 2026-07-02 competition doc stands as the record
of *why the hand-rolled path was right at the time* (percentage-only v2, fixed
side columns); this doc records why the inputs changed.
