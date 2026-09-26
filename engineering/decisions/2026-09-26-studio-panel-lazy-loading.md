---
status: proposed
summary: Load six Studio panels on first open instead of at startup — Share, Workspace, Chat, Library, slide settings and Lenses — for a measured −139KB gz (−18.8%) of the Studio's startup JavaScript. Most of the win (−117KB) comes from splitting Share and Workspace TOGETHER, because they are now the last two holders of the narration/TTS stack; either alone recovers only ~25KB. Coach, the deck-settings body and the views stay as they are. Revises the "leave the rest alone" call in 2026-08-23-studio-shell-decomposition.md §7.
---

# Studio panels: load on first open, not at startup

**Owner decisions (2026-09-26):** scope is all six panels; load timing is option B (on
first open, plus an idle warm-up). Both were the recommended options below.

## The short version

The Studio downloads and parses **741.7KB gz** of JavaScript before it becomes usable
(`eagerJsGz` for `studio/index.html`, the number `docs/route-budget.json` gates). Every
panel in the activity bar starts closed (`StudioShell.tsx:544`), yet their code is all in
that startup set, because `StudioShell.tsx` imports them directly.

I prototyped each split in a real build and measured it with the route-budget gate's own
method. **Six panels recover 139.4KB gz, 18.8% of the startup JavaScript:**

Each row adds one split on top of the rows above it:

| Split added | Startup JS after (gz bytes) | Saves |
|---|---:|---:|
| baseline (`a325105`) | 741,713 | — |
| Chat (`ArchitectChat`) | 735,242 | −6.5KB |
| Library | 729,855 | −5.4KB |
| Slide settings (`SlideContext`) | 722,161 | −7.7KB |
| Lenses (`LensesPanel`) | 718,965 | −3.2KB |
| **Share + Workspace, together** | **602,330** | **−116.6KB** |
| **all six** | | **−139.4KB** |

On top of the Lenses row, Share alone measured 693,788 (−25.2KB) and Workspace alone
694,499 (−24.5KB). The prototype patch that produced these numbers is not committed; the
implementation redoes each split properly.

**Why Share and Workspace must go together.** About 67KB of the startup set is the
narration/text-to-speech stack. `2026-08-23-studio-shell-decomposition.md` §3 found it was
held by three panels at once — Present, Share and Workspace — and so recovered nothing
until all three were split. Present went lazy in that same PR. Share and Workspace are now
the last two holders, so splitting both releases the whole stack. That is why the Aug 23
recommendation ("leave the other 16 imports alone, single-digit-KB wins") no longer holds:
its biggest joint block has only two holders left.

**This corrects my first estimate in chat.** I first attributed ~39KB to Chat, ~35KB to
Library and ~52KB to the two settings panels by adding up each feature's files. Those files
are mostly shared with code that stays in the startup set, so splitting the panel does not
remove them. The measured numbers above replace those estimates.

## What stays as it is

- **Coach.** About 3KB, and `StudioShell` runs `coach-core` at startup to score the deck
  (`StudioShell.tsx:53`). A loading state would cost more than it saves.
- **The deck-settings panel body.** Its markup lives inside `StudioShell.tsx` itself, and
  the shell's own logic reads the catalogs it uses. Splitting it means extracting the panel
  from the shell first — a refactor, not a lazy boundary. Lenses (step 5) is the part of
  deck settings that splits cleanly.
- **The views.** Fabricate, Editor, Compose, Present and the reading view already load on
  demand (`StudioShell.tsx:128–169`).
- **`architect.ts`** (~37KB minified) stays in the startup set after step 2, because
  `StudioShell`, `SlideContext` and `governance.ts` all import it. Moving it out means
  separating `useArchitectStatus` and the other startup-path helpers from the chat engine.
  Not measured; out of scope here.
- **`authoring-core.generated.js`** (the lint engine, ~108KB gz) stays eager on purpose,
  under the exception in `2026-08-17-studio-dynamic-loading-audit.md` §2.

## Two shared pieces have to move first

A lazy panel saves nothing while another startup module still imports it. Two do:

- `coach/FindingCard.tsx:4` imports `DiffCard` from `ArchitectChat.tsx`. Move `DiffCard`
  and its `collapseContext` helper to their own file (`diff-card.tsx`).
- `WorkspaceSheet.tsx:29` imports `DeleteBtn` from `Library.tsx`. Move `DeleteBtn` to its
  own file (`delete-btn.tsx`). HARD RULE #15 still holds: it stays one shared button.

Both are pure moves of one exported component; no behavior changes.

## When each panel's code loads

A panel's code can load at one of three moments. The choice decides whether the first click
lags and whether the panel works offline.

| Option | First click | Works offline if never opened? | Startup cost |
|---|---|---|---|
| **A. On first open** | short lag while the chunk downloads | **No** | lowest |
| **B. On first open, plus a warm-up once the Studio is idle** | usually instant | Yes, once the warm-up ran online | low: the download and parse happen after the Studio is usable |
| **C. On mount, like `Editor`** | instant | Yes | parse still runs right after startup, which is what we are trying to move |

**Recommendation: B.** The service worker caches `/_astro/` chunks only after they are
first fetched (`docs/public/sw.js` has no precache list). Offline is a supported state
(`2026-07-02-docs-pwa.md`), and Share (export) and Workspace (backup) are exactly the
panels someone might open offline. A warm-up with `requestIdleCallback` after first paint
puts the chunks in the cache without touching the startup path. `StudioShell.tsx:1254`
already warms `Editor` this way; B reuses that idiom.

Present, Fabricate and the reading view today behave like option A. Offline, a user who
never opened them can't load them. That is a pre-existing gap, off the path of this change;
I will log it in `followups.d/` instead of widening this PR.

## How each panel mounts

Follow the Present split (`StudioShell.tsx:166`): render the lazy panel only once it has
been opened (`xOpen || xEverOpened`), so a closed panel costs nothing and a re-opened one
keeps its state. The compact Library sheet (`StudioShell.tsx:6087`) is always mounted
today and needs that gate added. Wrap each lazy panel in `React.Suspense`, using the panel's
existing empty-state chrome as the fallback, not a blank. Wrap it in the existing
`ErrorBoundary` + `messageForFailure` (`src/lib/chunk-load.ts`) so a failed load says so.

None of the six panels exposes an imperative handle, and every command-palette and tour
action that opens one is a plain state setter (Aug 23 §6). The effects inside
`WorkspaceSheet` and `ShareSheet` only mirror state into the sheet's own controls, so
deferring them changes nothing outside the panel. The Aug 23 spike's one real regression
was an **import-time** side effect in a module that left the startup set. §"Checked before
building" audits every module that leaves the startup set for exactly that, and finds none.

## Checked before building (2026-09-26)

These checks ran against the uncommitted prototype of all six splits, built as the production site.

- **What leaves the startup set.** I compared the startup module lists from the build before
  and after (the static-import closure from `StudioIsland`, read from each chunk's module list).
  617 → 522 modules: 97 leave (60 first-party, 37 single lucide icons). The largest are
  `read-along-core.generated.js` (204KB minified), `WorkspaceSheet.tsx` (101KB),
  `SlideContext.tsx`, `Library.tsx`, `lib/cadenza` and `lib/suono`. Two ids appear only in the
  "after" list. One is the new `diff-card.tsx`. The other, `docs/src/lib/resolve-captions.js`,
  is a re-export of `lib/core/resolve-captions.mjs`, which was already in the startup set.
- **Code that runs on import.** I parsed each of the 60 first-party modules with the
  TypeScript compiler API and listed every top-level statement that is not an import, an
  export or a declaration of a constant or function. The only hits are constant `cn(...)`
  class strings, one `Promise.resolve()` seed and the bundler's own `__commonJS` wrappers.
  None of them registers a listener, reads a URL parameter or writes storage. This rules
  out the failure the Aug 23 split shipped.
- **Effects in closed panels.** `ShareSheet` and `WorkspaceSheet` are mounted while closed
  today, so their effects run at startup. Each one either mirrors a preference into the
  sheet's own controls or runs only while the sheet is open. The one that looked risky, the
  install-app listener (`WorkspaceSheet.tsx:323`), is safe: `PwaHead.astro:42` captures
  `beforeinstallprompt` in an inline script before any island loads, and the sheet reads it
  back when it mounts. Under the `xOpen || xEverOpened` gate, a sheet stays mounted after its
  first open, so `ShareSheet`'s "abort the export when closed" effect still fires.
- **Real browser.** I served the prototype build and drove it in Chromium at 1440px, in the
  Craft layout. Chat, Library, Views (Lenses), Slide settings, Share and Workspace each opened
  and rendered completely, with no page errors. The rail panels fetched their own chunk on
  first click. Share and Workspace fetched theirs on mount, because the prototype does not
  gate them yet. The only failed request was Workspace's AI tab fetching the OpenRouter
  model list: this sandbox's proxy certificate isn't trusted by Chromium, and the split
  doesn't touch that request.

Still open, because the checks above could not reach them: the idle warm-up and the
first-open gates (not written yet), 820px and 390px widths, offline behavior, and the tours.

## Delivery

One branch, one PR, one commit per split. Share + Workspace goes first, because it is the
largest win and the only one that needs two panels to land together; then Chat, Library,
slide settings and Lenses. The per-commit savings will differ slightly from the table,
which was measured in a different order. Each commit:

1. makes the split, following the pattern above;
2. ratchets `docs/route-budget.json` `studio.eagerJsGz` down to the new measurement, which
   the gate requires anyway (it fails when a route falls more than 5% under budget);
3. runs `npm run lint`, the docs unit tests and `cd docs && npm run build` (which runs the
   budget gate).

Before the PR opens:

- **Real-surface checks (HARD RULE #23).** In the built site, open each panel at 1440, 820
  and 390px widths and capture `tools/screenshot.js` evidence. Load the Studio online, wait
  for the warm-up, go offline (Playwright `setOffline`), and open Share and Workspace.
  Run the self-driving tours, which open these panels.
- **Maker-checker.** One `checker` agent on the diff: the list of modules that left the
  startup set, their import-time side effects, and the mount gates.
- **Performance evidence (HARD RULE #19).** The PR's `## Performance` section carries the
  before/after table from the gate. `npm run bench` measures the engine, not the site, so the
  `route-budget.json` diff is the durable before→after record.
- **Changelog.** One `changelog.d/` fragment: the Studio starts with ~139KB less JavaScript.

## What this plan does not cover

- The ~67KB narration/TTS stack itself. After this change it loads when someone opens Share,
  Workspace or Present, rather than being slimmed.
- The deferred bytes. The route-budget gate counts only the startup set; nothing watches the
  total a session downloads (`check-route-budget.mjs` header).
