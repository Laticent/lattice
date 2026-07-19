---
status: in-progress
summary: >
  Slice 2 of the cold-load program (after 2026-07-19-preview-bundle-hljs-common.md halved the
  engine bundle). The docs Studio is ONE client:only React island; CodeMirror was statically
  imported into it, so ~196KB gz of editor rode the critical hydration path and blocked
  time-to-interactive on every cold load AND refresh (where bytes are cached but parse+hydrate
  repeat). Fix: lazy-load the Editor via React.lazy + Suspense (mirroring the existing Fabricate
  split), so the island hydrates that much lighter and the preview paints — dismissing the SSG
  instant-shell, which keys on the PREVIEW's first render, not the editor — without waiting on
  CodeMirror parse. Measured on a real docs build: studio eager JS 816KB→615KB gz (−196KB, −25%);
  the CodeMirror chunk now loads ~230ms AFTER the load event (Playwright-confirmed lazy) instead
  of blocking it. Trade: the editor is the default pane, so a brief "Loading the editor…" fallback
  shows on cold load while its chunk fetches. Build/typecheck/43 Studio tests pass; live keystroke
  injection via the Playwright harness was inconclusive (a CM6+synthetic-input quirk, unaffected by
  this change) — editor typing is covered by the jsdom suite.
---

# Defer the CodeMirror editor off the Studio's cold hydration path

**Date:** 2026-07-19 · **Status:** in-progress (implemented; awaiting maker-checker fold + merge)
**Follows:** `2026-07-19-preview-bundle-hljs-common.md` (slice 1 — halved the engine bundle).
This is **slice 2** of the same program, and the lever the slice-1 adversarial trio named as
the biggest UNTOUCHED cold-start cost: the React + CodeMirror editor island.

## Problem

The Studio (`docs/src/pages/studio.astro`) mounts `StudioShell` as ONE `client:only="react"`
island — nothing is interactive until that whole island downloads, parses, and hydrates. The
prior program's SSG instant-shell *masks the paint* (a static slide), but the app underneath is
dead until hydration completes. `Editor.tsx` (CodeMirror 6 + markdown + lint + autocomplete) was
a **static import** in `StudioShell.tsx`, so its ~196KB gz was bundled into the island's critical
chunk and parsed before ANY interactivity.

This bites hardest exactly where the user felt it:
- **Cold load:** ~196KB gz (~560KB raw) of CodeMirror to parse before the island hydrates.
- **Refresh:** assets are content-hash-immutable cached (download ≈ 0), so the repeated cost is
  precisely **parse + hydrate** — which byte-caching doesn't help but *deferring the chunk* does.

## The change

Lazy-load the Editor, mirroring the `Fabricate` split already in the same file:

```js
// was: import { Editor, type EditorHandle } from './Editor';
import type { EditorHandle } from './Editor';
const Editor = React.lazy(() => import('./Editor').then((m) => ({ default: m.Editor })));
// …
{editMode === 'compose' ? <ComposeView … /> : (
  <React.Suspense fallback={<div className="grid flex-1 place-items-center text-[13px] text-muted-foreground">Loading the editor…</div>}>
    <Editor ref={editorRef} … />
  </React.Suspense>
)}
```

- `Editor` is a `forwardRef` (`Editor.tsx:104`); `React.lazy` over a forwardRef still forwards
  `ref` under React 19, so `editorRef` reaches its `useImperativeHandle`. All `editorRef.current`
  sites are optional-chained, so the null gap before the async mount degrades to a no-op.
- The SSG instant-shell dismissal keys on the **preview's** `onFirstRender` (`StudioShell.tsx:~529`),
  not the editor — so deferring CodeMirror does not delay the shell handoff.
- `CodeField` (the other CodeMirror consumer) is only reached via the already-lazy `Fabricate` /
  `LayoutStudio`, so it was never on the eager path; the only other non-type `./Editor` import is a
  test. The split is therefore complete — nothing else keeps CodeMirror eager.

## Measurement (real docs build, `astro build`, clean `dist`)

The studio page's **eager JS** = the sum of every `/_astro/*.js` chunk referenced in
`dist/studio/index.html` (what must load before hydration), computed identically before/after:

| | raw | gz | chunks |
|---|---|---|---|
| before (eager editor) | 2,384,206 B | 816,553 B | 67 |
| after (lazy editor) | 1,794,621 B | 615,373 B | 67 |
| **Δ** | **−575 KB (−25%)** | **−196 KB (−25%)** | — |

CodeMirror now lives in async chunks (`index.*.js` ≈192KB gz + `editor.*.js` ≈79KB gz) that are
NOT referenced in the studio HTML. **Playwright drive of the real built Studio** (Chromium):
`.cm-content` mounts with the real deck source, and the CodeMirror chunk (`index.CT3WuDyq.js`) is
**requested at ~390ms — after the ~159ms load event → confirmed off the critical path.**

## Verification (HARD RULE #23)

- `npm run build` (docs) exit 0; `npm run typecheck` (astro sync && tsc --noEmit) exit 0.
- `StudioShell.test.tsx`: **43/43 pass**, including editor/preview e2e flows in jsdom.
- Real built Studio (Playwright/Chromium): editor **mounts** and renders the deck source; the
  CodeMirror chunk loads **lazily** (~230ms after load).
- **Inconclusive / honest gap:** live keystroke injection into CodeMirror via the Playwright
  harness did not land — a known CM6-vs-synthetic-input quirk that is **independent of this change**
  (it would fail identically on the eager build; this change only alters *when* the chunk loads,
  not the editor's input handling). Editor typing behavior is covered by the jsdom suite. Real
  on-device cold-load wall-clock (esp. the fallback duration on a mid-tier phone) remains
  **UNVERIFIED** from the sandbox.

## The trade-off (stated plainly)

Because 'markdown' source mode is the **default** pane, the editor is needed on nearly every cold
load — so users see a brief **"Loading the editor…"** fallback while its chunk fetches (locally
~230ms; longer on a slow phone). The win is that the island hydrates ~196KB-gz-of-parse lighter and
the **preview + chrome become interactive sooner**, with the editor filling in behind a clean
centered fallback (no layout break). This is a genuine improvement to time-to-interactive and to
refresh, not a paint mask — but it is a trade (a short editor-load state) rather than a pure win,
and it wants a real-device look to confirm the fallback never feels like a regression.

## Relation to the program

- Slice 1 (hljs→common) cut the **engine** preview bundle 51% gz. Slice 2 cuts the **Studio island**
  eager JS 25% gz. They're independent (different bundles) and additive on the cold path.
- Parked/cut (from the slice-1 trio, unchanged): live per-component CSS prune, chart lazy-split,
  lean runtime. Secondary JS levers still open: the `entities` decode-only path (~15–25KB gz) and a
  Cloudflare-Pages move for brotli + `immutable` (compounds both slices on refresh).

## Maker-checker

An independent checker traced every `editorRef.current` site, the imperative handle, the Suspense/split
layout, and the test file. **Verdict: SOUND — no code-correctness defects.** Confirmed: all 13 `editorRef`
uses are optional-chained and none fires from a mount effect (so the null gap during lazy-load is a safe
no-op); the Editor is a controlled `value={source}` component, so the late mount initializes from the
current source with nothing lost; the Suspense wraps only the Editor branch (siblings can't reset); the
split sizes panes by container width (ResizeObserver on stable sections), not editor content, so no CLS on
the fallback→editor swap; `React.lazy` caches the module, so markdown⟷compose toggling never re-suspends;
and the 43 tests target the pane wrapper (rendered synchronously outside Suspense), so none goes flaky.

**One SHOULD-FIX, folded in:** the self-driving demo's `createDemoFirstDeck` calls `editorRef.current?.resetDoc('')`
synchronously to close a duplicate-slide-1 race, and its first `typeTail` also drives the editor — both would
no-op in the cold-load window before the lazy chunk resolves, re-opening that race for a newcomer who clicks
"Watch demo" in the first ~230ms. Fixed by **warming the editor chunk in a mount effect**
(`import('./Editor')` fire-and-forget, `StudioShell.tsx`): it stays off the critical hydration path (the eager
JS is unchanged — CodeMirror is still not in the studio HTML's modulepreload set, re-measured 615,386 gz) but
loads immediately after hydration, so the handle is ready within ~a frame of the default view — closing the
window. This is also the "load the rest in the background" half of the deferral.

**Nits (logged, #18):** a stale test comment at `StudioShell.test.tsx:531` ("editor mounted but inert" — now
the *pane* is mounted, the Editor may still be the fallback); and the Read-first newcomer's inert 0px editor
still fetches CodeMirror (markdown is the default mode) — a further deferral opportunity, not a regression.
