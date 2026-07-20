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
   twice on the real surface). So **persistence is hand-rolled** in the hook:
   localStorage for the editor ratio (survives reload), sessionStorage for the
   collapsed side (survives reload, not a new tab) — exactly what the old useSplit
   persisted — restored post-mount via `editorRef.resize("n%")` / `panelRef.collapse()`.
   Note `resize()` takes a bare number as **pixels**; the share is a percent, so it
   must be a `"n%"` string.

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

## Removed

`ui/split.tsx` (+ `split.test.tsx`) and `studio/use-panel-width.ts` — both custom
resize systems are retired. The 2026-07-02 competition doc stands as the record
of *why the hand-rolled path was right at the time* (percentage-only v2, fixed
side columns); this doc records why the inputs changed.
