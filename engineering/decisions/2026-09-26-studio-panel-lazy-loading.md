---
status: in-progress
summary: Load six Studio panels on first open instead of at startup — Share, Workspace, Chat, Library, slide settings and Lenses — for a measured −139KB gz (−18.8%) of the Studio's startup JavaScript. Most of the win (−117KB) comes from splitting Share and Workspace TOGETHER, because they are now the last two holders of the narration/TTS stack; either alone recovers only ~25KB. Coach, the deck-settings body and the views stay as they are. Revises the "leave the rest alone" call in 2026-08-23-studio-shell-decomposition.md §7.
---

# Studio panels: load on first open, not at startup

**Owner decisions (2026-09-26):** scope is all six panels; load timing is option B (on
first open, plus an idle warm-up). Both were the recommended options below. **2026-09-27:**
while a panel loads, it shows a shell that looks like the panel (§"While a panel loads").

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

Present, Fabricate and the reading view behaved like option A when this plan was written.
Offline, a user who never opened them could not load them. The follow-up PR warms them too,
with a different rule for each; see § Warming Present, Fabricate and the reading view.

## How each panel mounts

Follow the Present split (`StudioShell.tsx:166`): render the lazy panel only once it has
been opened (`xOpen || xEverOpened`), so a closed panel costs nothing and a re-opened one
keeps its state. The compact Library sheet (`StudioShell.tsx:6087`) is always mounted
today and needs that gate added.

### While a panel loads: a shell that looks like the panel

**Owner decision (2026-09-27): while a panel's code loads, show a shell that looks like the
panel that is about to appear, not a generic spinner or gray box.**

- **The shell reuses the panel's real frame.** Every one of the six is built from the shared
  primitives in `docs/src/components/ui/` — `PanelSheet`, `PanelHeader`, `PillTabs`,
  `PanelSearch`, the settings tier switch. Each shell renders the same primitives with the
  same props: the same title, icon, width, tabs and search box. Only the parts that depend on
  data (cards, messages, settings rows) are gray blocks, laid out like the loaded content.
- **Shared text lives in one place.** Titles, tab lists and section labels that a shell and
  its panel both show move into a small module that loads at startup (`panel-shells.tsx`).
  The panel imports them from there, so the shell cannot drift from the panel. The module
  must not import anything heavy, or the split recovers nothing.
- **Accessibility** follows `ComposeSkeleton`: the gray blocks are `aria-hidden`, and one
  `role="status"` line announces "Loading Share…".

**A warmed panel shows no shell at all.** A small loader (`lazy-panel.tsx`) keeps each
panel's load state in a tiny store and reads it with `useSyncExternalStore`. Once the idle
warm-up has loaded a panel, it renders on its first frame. `React.lazy` would not do: it
suspends on its first render even when the module is already in memory, so a warmed panel
would still flash its fallback. The shell therefore appears only on a click before the
warm-up finishes, on a slow first visit, or after a failed load.

**A cold sheet must slide in once, not twice.** `PanelSheet` animates in over 500 ms when it
mounts (`ui/sheet.tsx`). If the real sheet replaced the shell's sheet, the slide-in would
play a second time, or cut short mid-slide. So the loader for Share, Workspace and the
compact Library keeps the shell up until its slide-in has finished. The real sheet then
mounts in place with its enter animation switched off, through a context flag that
`PanelSheet` reads. The flag clears when the sheet next closes, so later opens animate
normally. The docked panels have no enter animation and swap straight away.

**The shell is a real sheet.** Escape, a click outside and the close button all close it,
the same as the loaded panel. The August split shipped a loading screen with no way out
(`2026-08-23-studio-shell-decomposition.md` §4.1.2).

**A failed load shows the existing chunk-load card inside the shell's frame**, through the
shared `ErrorBoundary` (`src/components/ErrorBoundary.tsx`). That card offers Reload and
not Retry, deliberately: the browser caches a failed `import()` for the life of the page, so
a retry can't succeed (#1242). Because the card sits inside the frame, a sheet stays
closable.

### How the shells are vetted

A shell that claims to look like its panel has to be checked against the panel. For each of
the six panels, at 1440, 820 and 390px:

1. **Side by side.** Screenshot the shell (hold the panel's chunk with a Playwright route
   delay) and the loaded panel at the same viewport. Both go in the PR, paired.
2. **No layout shift.** Measure the header, tabs and search box in both states with
   `getBoundingClientRect()`. They must match exactly. A frame that moves when the content
   arrives is the jank this design exists to avoid.
3. **One slide-in.** For each sheet, record a cold open with the chunk delayed past 500 ms
   and past 100 ms, and confirm the sheet slides in once in both cases.
4. **Escape works** while the shell is showing, and focus lands inside the loaded panel
   afterwards.

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

## What shipped, measured (2026-09-27)

**Bytes.** Measured as a pair on one tree: this branch's changes stashed for the `main` reading,
and the docs build rerun for each reading.

| | origin/main `f38d7c9` | this branch | change |
|---|---:|---:|---:|
| Studio startup JS, gz | 750,218 | 617,033 | **−133,185 (−17.8%)** |
| startup chunks | 93 | 95 | +2 |
| `studio/index.html` | 204,385 | 204,488 | +103 (one `modulepreload` tag per new chunk) |

`main` moved twice while this was in review, and each time the pairing was rerun on the rebased
tree before the budget was set. The readings were:
- against `133ac54`: 747,844 → 613,650 (−134,194);
- against `91cf5e1`: 747,912 → 614,689 (−133,223);
- against `f38d7c9`: the table above.

The saving held within 1KB across all three.

That is about 6KB short of the 139.4KB the prototype measured. The shells, the shared menu module and
the loader now load at startup instead.

**Shells against the loaded panels.** A Playwright harness drove the real built site in Chromium,
at 1440, 820 and 390px, for all six panels: 18 runs. For each run it turned off the warm-up
(Save-Data), held the panel's chunk, and screenshotted and measured the shell. It then released
the chunk and did the same for the loaded panel.

- **Frame position:** identical in all 18. The header, title, tabs, search box and composer
  are within 0.5px in both states. The first run found the Chat composer 36px short at 1440px,
  and 4.9px short at 390px, where a touch screen forces fields to 16px. The shell now renders the
  same `Textarea` with the same props.
- **One slide-in:** 0 second slide-ins across the 8 sheet runs, where the chunk arrived after
  800 ms, and 4 more runs (Share and Workspace at 1440 and 390px) where it arrived during the
  slide-in: released at 150 ms, the swap waited until 483–518 ms.
- **Escape** did the same in the shell as in the loaded sheet in every sheet run. On a phone,
  the Library opens from the Menu drawer, and Escape steps back to the drawer in both.
- **Focus** was inside the loaded sheet after every swap.
- **Warmed:** in all 18 runs, a panel opened after the idle warm-up never showed its shell.
- **Offline:** after the warm-up, with the network cut, all six panels rendered fully.
- **Failed load:** with the chunk blocked, Share shows the chunk-load card inside its sheet,
  still closable with Escape, and Chat shows it inside its column.

Changes the vetting made to the shells: the Chat shell shows the real first-run card (shared as
`ChatEmptyCard`), or message blocks when the deck has a saved thread. Workspace shows its real
headings (shared `WorkspaceGroupLabel`) and the tier switch's labels. The Library shell leaves
its body blank rather than drawing cards: the Library reads its shelf from storage after it
mounts, so nothing can know whether it opens on cards or on "No saved assets yet".

**Tests.** 10 unit tests for the loader (`lazy-panel.test.tsx`). Two rules were checked by
breaking them on purpose: "no shell once warmed" and "hold the shell for the whole slide-in".
The hold test first passed against a broken loader, because fake timers never fire a 0 ms
timeout. It now also fakes `performance` and checks the shell is still up at 499 ms. Five
existing jsdom tests opened a panel and read it immediately; they now `await waitForPanels()`
(`src/test/panels.ts`). Docs unit suite: 5,162 passed. Playwright, on this branch's build:
113 of 114 desktop tests passed across 17 panel and tour specs, and 12 of 12 on the tablet and
mobile projects.

**Independent checker.** It found nothing blocking. It raised two timing gaps in the loader, and
both were real:
- The hold was timed from the shell's FIRST open. A reopen while the load was still pending
  could therefore swap mid-slide.
- A shell closed mid-load could vanish before its close animation finished.

The loader now restarts the hold on every open and close (`motionEnds`), and waits out the 300 ms
close too. Two tests cover these cases, and both fail when the reset is removed.
On the built site, a sheet reopened 600 ms after being closed, with its chunk released mid-slide,
swapped 497 ms (Share) and 520 ms (Workspace) after the reopen, with no second slide-in.

**A tradeoff the warm-up adds, accepted.** If the network drops during the background warm-up,
that panel's `import()` rejects. The browser caches that rejection for the life of the page, so
the panel shows the chunk-load card, with Reload, the first time it is opened, even though the
user never opened it offline. Eager loading could not fail this way: the same drop would have
failed the whole Studio load instead. A retry cannot help, because the module map re-throws
without a request (#1242). The warm-up runs after the Studio is usable and fetches only six
chunks, so the window is small, and Reload recovers.

**Adversarial trio (2026-09-27).** The owner asked for very high confidence, so the red team and
the Munger inversion ran as well as the checker. Neither found anything blocking. Together they
found three regressions against `main`, all fixed:
- **Save-Data.** The warm-up skipped Save-Data users, so Share and Workspace stopped working for
  them offline and after a deploy. On `main` they downloaded every panel at startup, so the skip
  saved them nothing. The warm-up now runs for everyone.
- **The Safari warm-up window.** Without `requestIdleCallback`, the warm-up waited 1.5 s between
  panels. That left a ~9 s window in which a tab restored after a deploy could not open a panel it
  had never opened. It now waits for idle once, then loads each panel as soon as the one before it
  has loaded.
- **Reset slide.** A cold open moved Slide settings' Reset baseline from the moment the panel
  opened to the moment its code arrived. The shell now records the slide as it was when opened,
  and the loaded panel takes that over once.

The review also led to three guards:
- A visible pending cue on the Share shell's rows: the arrow is a spinner, at the same size.
- A build failure when a lazy panel or the narration stack re-enters the Studio's startup closure,
  naming the module (`lazyOnlySuffixes` in `docs/scripts/inject-modulepreload.mjs`). A deliberate
  static import of `ShareSheet` made it fail and name both `ShareSheet.tsx` and `read-along-core`.
- The vetting harness's checks committed as `docs/e2e/panel-shells.spec.ts`. It covers frame
  parity, one slide-in, Escape and the failed load. The sheet tests are tagged `@crosswidth
  @webkit-phone`, so the nightly runs them on mobile and on real WebKit.

**The full end-to-end suite, run locally on desktop, tablet and mobile:** 669 of 692 passed. Of the
12 that failed:
- 3 were the panel-shells spec's own races, since fixed. Two had the chunk hold installed after
  the warm-up had fetched the chunk. One read the Chat composer a frame before it autosized.
  The spec now passes 70/70 across desktop and mobile, 5 repeats.
- 8 fail the same way on `main` `91cf5e1`, in all 16 runs (2 each):
  - `inline-grammar-marp-mirror`
  - `playground-stress` search
  - `split` auto-expand
  - `status-pill` exit window
  - `theme-import-style-sink` ×2
  - `webpage-export` ×2
- 1 is the `studio-instant-shell` flake below, measured separately on `main`.

**WebKit and Gecko.** The nightly Studio workflow was dispatched on the branch with the
panel-touching specs. Its WebKit phone, WebKit tablet and Gecko projects passed all 25 of their
runs, including crash-sentinel, back-gesture, and workspace backup and restore.

**Main-thread cost of the warm-up.** 4× CPU throttle, typing from 2 s after load, first 15 s,
medians of 5 runs each:

| | `main` | this branch |
|---|---:|---:|
| blocking time, all long tasks | 3,961 ms | 3,560 ms |
| blocking time while typing | 1,724 ms | 1,468 ms |
| longest task while typing | 172 ms | 164 ms |

The warm-up moves the panels' evaluation later, but it adds no jank: the branch reads slightly
better, within run-to-run noise.

**Accepted and not changed.** The inversion argued that splitting only Share and Workspace would
have taken 88% of the win without four of the shells. The owner chose all six, and this record
keeps that choice. The narration stack alone was not measured as a split of its own.

**One pre-existing flake, not this PR's.** `studio-instant-shell.spec.ts` › "a rect from another
orientation › is not replayed in portrait" fails intermittently against the FULL production build
(`npm run build`, which adds `inject-modulepreload` and `hoist-stylesheets`). It failed 6 of 8 runs
on `main`'s full build and 4 of 8 on this branch's. It passed on both under `build:e2e`, which is
what CI runs. `followups.d/2336-p3-packages-trio-followups.md` already tracks it, with older rates (1 of 2, 1 of 4). This PR adds a follow-up with the rates above.

**Resolved in the follow-up PR (2026-09-27): a harness artifact, not the shell.** Instrumented on
a failing run: viewport 390x844, `data-ssr-bp` mobile, cinema off, and the stored rect
`{"l":0,"t":0.37,"w":1,"h":0.2599}`, a 16:9 box at portrait fractions. That is not the landscape
rect the test stored. The test resized the live landscape page and reloaded at once, and the
reload's `pagehide` ran `persistRect` (`StudioShell.tsx`) before React had re-rendered out of
the cinema morph. It measured the full-bleed cinema box in the portrait viewport and overwrote
the landscape rect. Being portrait-shaped, that rect passed the aspect gate, and the seed replayed
it exactly as designed. When the app won the race, it stored a correct portrait rect, so even
the passing runs never tested the gate. The full build only shifts the timing. The spec now
loads portrait in a new page of the same context, and asserts the landscape rect is still in
storage. Measured: 20 of 20 on `npm run build` and 20 of 20 on `build:e2e`. With the aspect gate
forced open in the built HTML it fails 3 of 3 (`shell 45 vs app 16`), so it can still catch the
defect it names. The app-side window, a rotation followed within one frame by leaving the page, is
logged in `followups.d/2402-p3-persist-rect-mid-rotation.md`.

## Warming Present, Fabricate and the reading view (2026-09-27)

The follow-up to this PR (`followups.d/2402-p3-warm-present-fabricate-read-for-offline.md`).
All three are `React.lazy` in `StudioShell.tsx`, and nothing fetched them until someone opened
them, so a user who went offline first got the chunk-load card. The idle warm-up now fetches
them after the six panels (`studioWarmQueue` in `StudioShell.tsx`).

**Warming a surface's chunk is not enough.** A first cut warmed the three chunks alone. On the
built site, Present opened offline but the reading view showed "This deck could not be turned
into an article": once open, it `import()`s `player-core` and `player-prune`, and the KaTeX
provider loads for a deck with math. Present's narration does the same. So each surface now
warms its whole on-demand path. `article-projection.ts` and `narration-projection.ts` name
their dynamic imports once, as module-level loaders, and export a `warm…Projection()` that
calls the same loaders. Both also call `loadDeckRenderFonts`, the one `import()` inside the
shared `buildDeckRender` (`share-export.ts`). A new `import()` on either path has to join its
list; the e2e spec below is what notices when one does not.

**What each costs.** A Playwright probe on the full production build loaded the Studio, let the
existing warm-up finish, opened one surface, and summed the gz size of every file it fetched
that had not been fetched already. Starter deck, 1440px Chromium:

| Surface | Fetched on first open, after the six-panel warm-up | Warmed for |
|---|---|---|
| Compose | ComposeView 105KB (ProseMirror); no further imports | everyone, unless Save-Data |
| Present | PresentOverlay 35KB, narration 1KB, `player-core` 99KB, voice model 6KB | everyone, unless Save-Data |
| Reading view | ReadArticle 6KB, `player-prune` 61KB, `deck-export` 13KB (used for a chart or diagram bake), font sheet 1KB (+ `player-core`, shared) | everyone, unless Save-Data |
| KaTeX provider | 77KB, loaded by both projections for a deck with math | the same, and only when the deck on screen has math |
| Fabricate | ~145KB of JS, plus the 877KB Mermaid bundle its Diagram specimen renders | only a browser that has opened Fabricate before |

With everything warmed, the same probe finds 0 bytes left to fetch when the reading view opens,
and only the 6KB voice model when Present opens.

**Why the rules differ.**
- *Save-Data.* The six panels warm under Save-Data because every visitor downloaded them at
  startup before #2402, so skipping the warm-up would save those users nothing. These three
  were never downloaded unless opened. Warming them (Compose, Present, the reading view) is ~320KB of new bytes per deploy (~400KB
  when the deck has math), so Save-Data skips them.
- *Fabricate.* Fabricate's JS alone is as large as Present and the reading view together, and
  most Studio visitors never open it. The first open sets `lattice-studio-fabricate-used`, and
  from then on the warm-up fetches it. That covers the case that matters: a deploy renames
  every chunk, so a returning author who goes offline after a deploy still has Fabricate.
- *Not warmed: the voice model* (`read-aloud.ts`). Neural read-aloud also needs its model
  weights, which are far larger and not warmed, so the module alone buys nothing offline.
- *The trade the six panels already make.* A browser caches a failed module fetch for the life
  of the document (#1242), so a warm-up that fails on a network blip leaves Present or the
  reading view showing the chunk-load card until a reload, where before it would have fetched on
  the click. The warm-up runs once, after startup, on a connection that has just loaded the
  Studio, so the blip window is small, and Reload recovers.
- *Not warmed: Mermaid.* It is a render-engine asset that any deck with a diagram fetches, not
  something these surfaces own. Offline, Fabricate opens and its Diagram specimen shows the
  diagram source. Logged in `followups.d/2402-p3-mermaid-offline-for-unrendered-diagrams.md`.

**Compose, found on a real phone.** The owner ran the PR preview on an iPhone in airplane mode.
The Studio loaded, but the Compose tab stuck on its skeleton and then the chunk-load card replaced
the whole Studio: `ComposeView` is `React.lazy` too, and nothing warmed it. A phone-width
Playwright pass then tapped every tab offline; Compose was the only one that failed. It warms with
Present now, on the same Save-Data rule, since it is an editing surface people use offline.

**Evidence.** `docs/e2e/studio-warm-offline.spec.ts` serves the built site from a server it
then closes, which is a real network cut. It checks that Present and the reading view open
after an offline reload, that the Compose tab opens at phone size, that Fabricate opens for a browser flagged as having used it, and that
Save-Data warms none of them. Against a build without this change, the first two tests fail
at the warm-up step ("the warm-up never cached PresentOverlay, ReadArticle, …").

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
