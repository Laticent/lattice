---
status: proposed
summary: The Studio succeeds the Drawing Board and the Workbench. Three decisions in one plan. (1) COACHING PARITY — the brief said the Studio "is missing the coaching and conversation features that apply changes and fixes"; the audit corrects that: apply-a-fix conversation ALREADY ships in the Studio (ArchitectChat diff cards, per-finding AI fix, selection Refine). The real gaps are depth, not existence — the Studio scores decks with a 3-check local heuristic (`lint.ts scoreDeck`) while the Drawing Board runs the engine's real deterministic review (`reviewCore` scorecard, the thing that named 3 specific fixable problems on a real deck); the Studio chat prompt carries none of the Drawing Board's grounding (Lattice primer, live assessment, presentation-canon pack, cacheable prefix, streaming); and the deterministic Coach action chips (top fixes / weakest slide / structure / the ask / pacing) have no Studio equivalent. The migration is KERNEL ADOPTION, not UI ports: adopt reviewCore as the one deck assessment (delete scoreDeck), port the pure coach-actions kernel behind React result cards, close the chat-grounding gap, and keep the Studio's honesty contract (no fake deterministic chat floor — Coach-vs-Converse holds). (2) CODE OWNERSHIP — a three-tier boundary: engine cores (generated bundles) stay shared per HARD RULE #1; site infra shared with SURVIVING surfaces (Playground, landing, chrome) stays shared; the AI/coaching/present/export cluster that only the Studio needs going forward (~18 modules, architect-*.js + drawing-board-{settings,refine,rehearsal,export}.js + presenter-window.js + voice-model.js + asset-store.js + or-catalog.js + coach kernels + their two Web-Worker companions…) MOVES into the Studio's tree now, renamed off the drawing-board- prefix, with the frozen surfaces importing FROM the Studio until deletion — the dependency arrow flips, so removal day is `git rm`, zero Studio churn. Storage names are user data and never change (`lattice-workbench` IndexedDB, `lattice-studio-*`, the shared OpenRouter token). (3) FREEZE + REMOVAL — the Drawing Board and Workbench are development-frozen as of this doc (features never; security + data-integrity fixes and mechanical retirement refactors still land), and removal follows a phased plan whose hard gate is USER DATA: a Studio importer for `lattice-drawing-board` IndexedDB decks ships BEFORE the deprecation banners point people at the Studio, and both ship before any route is deleted. Inversion-derived invariants and an independent-checker pass are folded in below.
---

# Studio succession — coaching parity, code ownership, and retiring the Drawing Board + Workbench (2026-07-03)

> Status: **design model, no code yet** (CLAUDE.md design-before-code). Hardened
> by an independent checker pass and an inversion red-team pass, run
> independently against the codebase; their verified corrections are folded in
> and marked ⚠. The red-team's three most-plausible killers — an inventory that
> under-counted what P5 would delete, a "mechanical" move that silently sheds
> node-test coverage, and a chat-grounding port that eats either the user's
> money (cache-write premium) or the user's instructions (voice-merge bug) —
> each now has an invariant (§7). The **freeze is effective immediately** (§4);
> everything else lands in the phased plan (§6).
>
> Supersedes, as *direction*: `2026-06-07-drawing-board-architect.md`,
> `2026-06-07-drawing-board-phase-1-plan.md`, the Drawing Board Phase-2/3 plans,
> and the Workbench as a surface. It does **not** supersede their *decisions
> that the Studio inherits* — Coach-vs-Converse
> (`2026-06-08-drawing-board-coach-vs-converse.md`), the canon knowledge pack
> (`2026-06-13-coach-canon-knowledge-pack.md`), and the tooling-first "model
> never owns correctness" architecture all remain canonical and now bind the
> Studio.

## The ask, and what the audit corrected

The Studio (`/studio/`, `docs/src/components/studio/`) is mature — it matches
most of the Drawing Board and Workbench and exceeds them in places (Fabricate
faculties, Library, backup/restore, reference-doc grounding, output language,
resizable panes, the full e2e suite). The intent is for the Studio to **replace
both**: bring over what's genuinely missing, stop sharing code so the Studio
owns its surface, freeze the old surfaces now, and make eventual removal
painless.

The brief named the gap as "the coaching and conversation features that allow
one to apply changes and fixes." The audit says that's **half right, and the
half matters**:

- **Already in the Studio** (don't rebuild): a real Architect chat with
  review-then-apply **diff cards** (`ArchitectChat.tsx` + `architect.ts
  chatComplete` — parses the same four-backtick edit-block protocol, splices via
  `applyEdit`, auto-checkpoints); **per-finding AI fix** in the Coach panel
  (`requestFindingFix` → `architect-fix.js`, canon-grounded); **selection
  Refine** (Polish/Formalize/Elaborate/Shorten); the deterministic **lint
  findings** list (`studio-lint.ts` over the shared `lint-core`); a rehearsal
  planner in Present (`drawing-board-rehearsal.js` floor plan + beats).
- **Actually missing** — the gaps are *depth*, itemized in §2.

So the program is not "port the chat" — it is **finish the coaching depth,
flip code ownership, freeze, then retire.**

## 1. Where the three surfaces stand (facts, from the code)

| | Drawing Board | Workbench | Studio |
|---|---|---|---|
| Route | `/drawing-board/` | `/workbench/` | `/studio/` (nav badge still says "Preview") |
| Tech | vanilla JS controllers on `window.__db*`, ~9,300 lines under `docs/src/playground/` | React island wrapping two vanilla studio kernels | React/TS island, `docs/src/components/studio/`, unit + e2e tested |
| Deck store | IndexedDB `lattice-drawing-board` (decks, revisions, chats, messages) | — | localStorage `lattice-studio-*` (decks, checkpoints, chat, settings) |
| Asset library | IndexedDB `lattice-workbench` (shared) | same store | same store — **zero migration needed for saved themes/components/finishes** |
| e2e coverage | none | none | ~30 Playwright specs (desktop/tablet/mobile) |
| Deck review | engine `reviewCore` scorecard + findings | — | `lint.ts scoreDeck` — a 3-check heuristic (⚠ drift, §2.1) |

The Workbench's two faculties (Theme Studio, Layout/Component Studio) are
already re-implemented more deeply in the Studio's Fabricate tab over the same
generated cores (`theme-core.generated.js`, `layout-core.generated.js`), saving
to the same library. The Workbench brings nothing the Studio lacks; it is pure
surface to retire. (`component-studio.js` / `theme-studio.js` /
`studio-preview-config.js` are Workbench-only despite the "studio" name.)

## 2. Decision 1 — coaching parity by kernel adoption, not UI ports

The Drawing Board's coaching architecture was decided twice and both decisions
hold for the Studio: **the model never owns knowledge or correctness**
(tooling-first, `2026-06-07-drawing-board-architect.md` §4), and **deterministic
help is not a chat** (Coach-vs-Converse). The migration therefore adopts pure
kernels and rebuilds only thin React views.

### 2.1 Adopt the real deck review — delete the Studio's toy scorecard

The single biggest gap. The Studio's "board-readiness scorecard" is
`lint.ts scoreDeck`: three checks (components valid, opens with a title,
variety) and a subtraction heuristic. The Drawing Board's Architect runs the
engine's **`reviewCore` scorecard** (`authoring-core.generated.js` — the same
core the CLI runs), the deterministic review that proved itself by scoring a
real deck A− 87 and naming three specific, fixable, line-anchored problems.
Two scorecards over one deck is exactly the drift HARD RULE #1 exists to
prevent — and the shallow one is the one users see in the successor surface.

**Decision: the engine review becomes the one deck assessment in the Studio.**
⚠ Precision (checker): the grade comes from the core's **`scorecard.scoreDeck({
source, lintFindings, reviewFindings })`** — a separate export that combines
`lintCore` + `reviewCore` findings (see `drawing-board-architect.js:397-399`),
not a member of `reviewCore` itself. And the engine function is *also* named
`scoreDeck` — the same name as the Studio heuristic being deleted — so P2a must
delete `lint.ts scoreDeck` and re-point its tests explicitly, not by name-match.
The Coach panel renders the real scorecard (grade, per-dimension notes,
findings already flow from the same core); the existing per-finding Fix-with-AI
buttons attach unchanged.

⚠ **Adopting the kernel is also a build-time data change (red-team catch).**
`reviewCore.reviewText(source, { bucketOf, densityOf })` needs each
component's **density**, and `buildLatticePrimer` wants density + tags — the
Drawing Board's build-time catalog carries them (`drawing-board.astro:48-56`)
but `studio.astro:46` maps components to `{ name, bucket, description,
skeleton }` only. A "mechanical" adoption would wire `densityOf: () => null`
and the density findings (the prose-density budget) would silently vanish —
recreating the very two-truths drift this section kills. P2a therefore plumbs
density (+ tags) through the Studio's component payload, and asserts parity by
running the CLI review (`npm run lint:deck`) and the Studio wiring against the
same fixture deck.

### 2.2 Port the Coach action chips (pure kernel + new React cards)

`coach-actions.js` (95 lines, pure, tested) computes **Top fixes · Weakest
slide · Structure check · The ask · Pacing** as structured result cards from
the deck + assessment — no model, instant, free. The vanilla console
(`coach-console.js`) is not worth porting; the kernel is. It moves into the
Studio's tree (§3) and the Coach tab renders chips → result cards in React.
Result cards are text/data — **not** preview frames, so no new HARD RULE #22
surface.

### 2.3 Close the chat-grounding gap (Converse depth)

The Studio's `chatComplete` sends persona + bare deck. The Drawing Board's
`buildChatMessages` sends: the **Lattice primer** (`architect-knowledge.js`),
the **live assessment** (so the model argues from the same facts the Coach
shows), the **presentation-canon pack** (`presentation-canon.js`, cloud-tier),
a **cache-split prompt** (static prefix vs dynamic tail — real money on
OpenRouter), and **streamed tokens** (`onToken`). The Studio chat gets all
five. Reuse `chat-markdown.js` for message rendering if the React thread needs
it; otherwise drop it with the Drawing Board.

⚠ **This port is a reconciliation, not a transplant (red-team catch — two
mechanisms fight).** The Studio already caches at the *model layer*
(`architect-model.js:385` auto-wraps every string system turn via
`withCachedSystem`), while the Drawing Board splits at the *message layer* (a
pre-split array system turn that bypasses the string-only auto-wrap). Port
naively and one of two silent failures lands:

- **The user's instructions vanish.** `withStudioVoice` merges output language
  + standing instructions only when the system turn's content is a **string**
  (`architect.ts:70`); an array-content system turn falls through both
  branches. Grounding via the DB's array split, then applying the voice merge,
  silently drops the Studio voice. The merge happens **before** the split (or
  learns array content) — tested.
- **The user pays a cache-write premium every turn.** Appending the live
  assessment (changes every edit) to a string system turn means the whole
  ~10K-token prefix re-writes to cache each turn at the 1.25× write premium
  with zero hits. The split is chosen deliberately: static prefix (persona +
  primer + canon + protocol) cacheable, dynamic tail (deck + assessment +
  reference docs) uncached — one seam, owned by `chatComplete`.

Two adjacent reconciliations ride along: the Studio's model layer must honor
the **caching opt-out** (`readCachingEnabled` — the DB consults it per turn,
`architect-model.js` never does), and there are **two standing-instruction
stores** (`lattice-db-architect-instructions` in the moving spend kernel vs
`lattice-studio-instructions` in `studio-store.ts`) — the Studio's wins; the
kernel's reader is not adopted, so stale DB-era instructions can't resurrect.

**Kept deliberately, not a gap:** the Studio's honesty contract. With no model,
the Drawing Board's Converse falls back to `floorReply` templated answers; the
Studio instead reports `offline` and points at Workspace. Coach-vs-Converse
says the composer must never fake a conversation — in the Studio the
deterministic value lives in the Coach tab (scorecard + chips + findings), and
the chat composer stays model-gated. `floorReply` is **dropped**.

### 2.4 The rest of the coaching surface — explicit keep/adopt/drop

| Drawing Board / Workbench feature | Disposition |
|---|---|
| Rehearsal planner floor (`buildPlanFromMetas` + beats) | already in Studio Present |
| **AI plan refinement** (`createRehearsalPlanner.refine`) | **adopt** — small delta on the existing Rehearse (P2b) |
| Practice full-screen stage + practice tour | drop — Studio Present overlay + Rehearse covers the job; tours die with the surface |
| Onboarding 3-question scaffolder (`createOnboarding`) | **adapt later** — the Studio's starter-deck onboarding (`2026-06-30-studio-newcomer-onboarding.md`) covers the cold-open; port the "Draft with the Architect" door as a New-deck flow only if asked for. Open question §7. |
| Deterministic chat floor (`floorReply`) | drop (§2.3) |
| Focus fenced-block sub-editor (`drawing-board-focus.js`) | drop, recorded — CodeMirror + inline lint + live preview covers it; revisit on demand |
| Guided tours (`drawing-board-tour`, `workbench-tour`, `drawing-board-practice-tour`) | drop with the surfaces (Studio uses the welcome cue). ⚠ `guided-tour.js` + `driver.js` themselves SURVIVE — the Playground tour runs on them (red-team catch) |
| Deck revisions rail | covered — Studio version history/checkpoints |
| Per-deck chat persistence (IndexedDB) | covered — Studio localStorage chat (cap 60); Drawing Board chat threads are **not migrated** (§5, stated in the banner) |
| Settings panel (`createModelSettings` UI) | covered — WorkspaceSheet; the *pure* budget/spend kernel moves (§3) |
| Export (`drawing-board-export.js`) | already the Studio's engine via `share-export.ts` — moves + renames (§3) |
| Chart hover/interactivity in preview (`drawing-board-chart-interact.js`) | out of scope for coaching; Playground keeps it. The Studio preview lacking chart-interact is a **pre-existing, off-path gap — logged here** (HARD RULE #18) as a tracked parity item, not pulled into this plan. |

## 3. Decision 2 — code ownership: a three-tier boundary, and the arrow flips

"Stop sharing codebase" must not over-rotate into forking the engine. The
boundary has three tiers:

1. **Engine cores — stay shared, forever.** The generated bundles
   (`authoring-core`, `layout-core`, `theme-core`, `exemplar-core`
   `.generated.js`) are the engine (HARD RULE #1/#7/#15). The Studio *consuming*
   them is not "sharing code with the Drawing Board" — it's using the engine.
   Never forked, never moved into a surface's tree.
2. **Site infra shared with surfaces that SURVIVE — stays shared.** The
   Playground, landing pages, and site chrome live on. Their shared modules
   keep their homes: `deck-preview.js`, `single-slide-render.ts`,
   `sanitize-slide-html.js`, `frame-css.js`, `debug-overlay.js`,
   `debug-prefs.js`, `video-overlay.js`, `editor.js`, `editor-diagnostics.js`,
   `deck-config.js`, `guided-tour.js` (+ its `driver.js` dependency — the
   Playground tour runs on it), `theme-fetch.ts`, `load-engine.ts`,
   `base-url.mjs`, `asset-version.mjs`, `utils.ts`, `nav.mjs`, ⚠
   `font-embed.js` (imported by the Studio's `share-export.ts`, DeckPreview,
   AND the mover `drawing-board-export.js` — genuinely tier-2, red-team catch),
   ⚠ `drawing-board-pane.js` and `drawing-board-chart-interact.js` (both
   imported by the *surviving* Playground — `PlaygroundApp.tsx`, the pane
   import landed in #717; they stay, misleading names and all, and rename to
   `pane.js` / `chart-interact.js` at P5 so the deletion sweep can't mistake
   them for retiring code).
3. **Studio app code — moves into the Studio's tree now.** Every module that
   only the Studio needs *going forward* but that today lives under
   `docs/src/playground/` with (or without) a `drawing-board-` name:

   | Today (`docs/src/playground/`) | Becomes (`docs/src/components/studio/…`) |
   |---|---|
   | `architect-model.js` | `ai/architect-model.js` |
   | `architect-edits.js` | `ai/architect-edits.js` |
   | `architect-fix.js` | `ai/architect-fix.js` |
   | `architect-retrieval.js` | `ai/architect-retrieval.js` |
   | `architect-knowledge.js` | `ai/architect-knowledge.js` |
   | `presentation-canon.js` | `ai/presentation-canon.js` |
   | `or-catalog.js` | `ai/or-catalog.js` |
   | `drawing-board-refine.js` | `ai/refine.js` |
   | `drawing-board-settings.js` — **split**: the pure budget/spend/prefs kernel | `ai/spend.js` (the `createModelSettings` DOM panel stays behind, Drawing-Board-only, and dies with it) |
   | `coach-actions.js` | `coach/coach-actions.js` |
   | `chat-markdown.js` | `ai/chat-markdown.js` (or dropped, §2.3) |
   | `drawing-board-rehearsal.js` | `present/rehearsal.js` |
   | `presenter-window.js` | `present/presenter-window.js` |
   | `drawing-board-export.js` | `export/deck-export.js` |
   | `pdf-export-worker.js` ⚠ | `export/pdf-export-worker.js` |
   | `voice-model.js` | `present/voice-model.js` |
   | `kokoro-worker.js` ⚠ | `present/kokoro-worker.js` |
   | `asset-store.js` | `library/asset-store.js` |

   ⚠ The two Web-Worker companions (checker catch): `voice-model.js:226` and
   `drawing-board-export.js:565` load their workers via sibling-relative
   `new Worker(new URL('./…', import.meta.url))` — the workers move with their
   parents or the URLs break at runtime with no build error.

   Mechanical `git mv` + import-path sweep; **no rewrites, no TS conversion in
   the move** (opportunistic conversion later, module by module).

   ⚠ **The tests do not "just move with them" (red-team catch).** The movers'
   unit tests live in `test/unit/playground/*.test.js` — CommonJS `node:test`
   files run by `npm run test:playground`'s glob, dynamically importing
   `docs/src/playground/…` by relative path. Two constraints follow: (a) those
   tests stay where they are with **re-pointed import paths** (or convert to
   docs-vitest `.test.ts` in the same PR — one or the other, named in the P1
   PR); and (b) the moved modules' *internal* imports stay **relative**
   (Node-resolvable) — never rewritten to the `@/` alias, which only Vite and
   vitest resolve. **P1's acceptance check: the executed-test count across
   both runners is unchanged.**

   ⚠ **The inventory is exhaustive or it is wrong (red-team BLOCKER).** This
   table plus tier 1/2 must assign a tier to *every* file under
   `docs/src/playground/` — including Web Workers spawned via
   `new URL('./…', import.meta.url)`, dynamic `import()`s, and CSS — and P5's
   deletion list is **enumerated by name from that assignment**, never "the
   remainder." (The draft missed both workers, `font-embed.js`, and the
   Playground's `drawing-board-pane.js` import; each would have broken a
   surviving surface at P1 or P5.)

**The dependency arrow flips.** After the move, the frozen Drawing Board and
Workbench import *from the Studio's tree* (a frozen surface depending on the
successor is fine — it's scheduled for deletion); the Studio imports nothing
named or homed after a surface being retired (the Playground still does, until
the P5 renames above). **Removal day is `git rm`** of the two pages, their
page-only modules, CSS, tours, and their engine-side tests — zero Studio
churn.

Rejected alternatives: **copy/fork into the Studio** (a divergence window with
two `#22`-sanctioned copies of the same builder — worse on every axis given the
freeze makes moving safe) and **move at removal time** (the big-bang this plan
exists to avoid).

**Storage names are user data, not code** — they never change, whatever the
file moves say: IndexedDB `lattice-workbench` (the Studio's library keeps the
name after the Workbench dies), `lattice-studio-*`, the OpenRouter OAuth
token + spend keys `architect-model.js`/`drawing-board-settings.js` persist.
Renaming any of them orphans real users' libraries, decks, or logins.

**Gate updates ride the same commit** (`tools/check-ownership.js`
`SANCTIONED_PREVIEW_BUILDERS`): `presenter-window.js`'s entry gets its new
path. The gate fails on stale sanctions, so this is self-policing — a move that
forgets the allowlist cannot pass `build:check`.

## 4. Decision 3 — the freeze (effective now)

**No further development happens on the Drawing Board or the Workbench.** The
exceptions are exactly three, and nothing else:

1. **Security fixes** — their preview builders (`drawing-board-practice.js`,
   `drawing-board-focus.js`) stay live, sanctioned `#22` sinks until removal.
2. **Data-integrity fixes** — anything that corrupts or loses a user's
   IndexedDB decks gets fixed; that store must survive intact for the importer.
3. **Mechanical retirement refactors** — the §3 import-path sweep and the §6
   deprecation banner are edits to frozen files *in service of* retirement.
   > **Landed ahead of P5 (2026-07-13):** the Suono audio migration reached its
   > endgame, so the Drawing Board's **read-aloud narration** (`drawing-board-practice.js`)
   > and **voice-sample audition** (`drawing-board-settings.js`) were stripped as
   > retirement refactors — `voice-model.js` is now a byte source with no playback of
   > its own (all audio goes through Suono; `checkAudioPlaybackBoundary` guards a zero
   > allowlist). This is the one user-facing capability the frozen surfaces lose before
   > their route deletion; see `2026-07-12-suono-audio-library.md` §8 slice 2c-final.

⚠ **Ordinary functional bugs on the frozen surfaces are deliberately NOT
fixed** (red-team asked; answering explicitly): a broken-but-safe behavior gets
the banner's answer — use the Studio — not an engineering hour on a surface
being deleted. If a functional bug blocks a user from *getting their data out*,
it is a data-integrity fix (exception 2).

⚠ **The freeze strands tracked work unless P0 re-scopes it (red-team catch).**
Open issues that name the frozen surfaces as their implementation or
acceptance surface get re-pointed when this doc lands: **#515** (Drive
bring-your-own-storage — re-scope from `drawing-board-store.js`/
`drawing-board-export.js` to the Studio's `decks.ts`/`share-export.ts`),
**#580** (the Studio-depth tracker this doc largely supersedes — close or
rewrite against it), **#414** (palette-dropdown consolidation — two of its
three surfaces are now frozen), **#476/#477/#506** (name "the Drawing Board
preview" as their acceptance surface for chart-interact/auto-split work —
re-point at the Playground/Studio).

Where the freeze is recorded (all in the P0 PR): this doc; a header note in
`drawing-board.astro` + `workbench.astro`; a pointer row in CLAUDE.md's
read-first table (so no agent builds features there); banner lines on the two
load-bearing Drawing Board decision docs; `CHANGELOG.md ## Unreleased`
(user-visible policy). P0 also deletes the stale
`engineering/studio-depth-handoff.md` (self-marked "delete before PR #567
merges" and still present — a broken window this doc supersedes). There is no
automated freeze gate — the window is short and review + the CLAUDE.md pointer
carry it; if the freeze must hold past a quarter, revisit.

## 5. User data — the removal gate that actually matters

- **Decks:** Drawing Board decks live in IndexedDB `lattice-drawing-board`
  (the `decks` records carry `source` directly, so "latest source per deck"
  reads straight from that store). The Studio ships an **importer** (Workspace
  sheet: "Import from the Drawing Board") that reads it, creates Studio decks
  from each deck's latest source, and drops one checkpoint ("imported from the
  Drawing Board") per deck. ⚠ **Fresh-context IndexedDB discipline (red-team
  catch):** on a browser that never ran the Drawing Board, a naive
  `indexedDB.open('lattice-drawing-board')` *creates* an empty, store-less DB
  — and a `transaction('decks')` then throws, or an upgrade handler fakes
  empty stores and reports "0 decks" indistinguishably from a real empty
  corpus. The importer probes `indexedDB.databases()` where available,
  otherwise opens **without a version and with no upgrade handler**, and
  treats a missing `decks` store as "no Drawing Board data on this browser." The store — all five object
  stores, including `settings`/`chats`/`messages` the importer doesn't read —
  is read, never deleted or upgraded: the importer keeps working *after* the
  route is gone, because the origin's IndexedDB outlives the page that wrote
  it. ⚠ localStorage quota is the risk (Studio decks are localStorage; a heavy
  IndexedDB corpus could overflow 5MB): import is explicit,
  per-deck-selectable, and reports failures per deck rather than dying
  wholesale. If quota pressure proves real, moving Studio deck storage to
  IndexedDB is its own later decision — noted, not scoped here.
- **Chat threads:** not migrated (different store shape, low value). Stated
  plainly in the deprecation banner.
- **Library assets (themes/components/finishes):** already shared
  (`lattice-workbench`) — zero work, zero risk.
- **Revisions:** only the latest source imports; the revision history stays in
  IndexedDB untouched (recoverable by hand if ever asked).

## 6. Sequencing — each slice banks (one branch → one PR each, HARD RULE #17)

- **P0 — this PR: the plan + the freeze.** This doc; freeze notes (§4);
  CHANGELOG note; re-scope the stranded issues (§4). Docs-only.
- **P1 — ownership flip.** The §3 moves/renames + settings-kernel split +
  import sweep + gate allowlist paths. No behavior change; `npm test`, the docs
  vitest suite, and the Studio e2e smoke prove the surviving surfaces. ⚠ The
  frozen surfaces have **zero e2e coverage** (§1), so the sweep's effect on
  them is verified by hand — load `/drawing-board/` and `/workbench/` in the
  built site and drive one edit→preview→export and one theme-derive loop; that
  manual pass is the named verification surface (HARD RULE #23). Multi-file
  refactor → **maker-checker** (one checker) per CLAUDE.md.
- **P2a — deterministic coaching depth.** reviewCore scorecard replaces
  `scoreDeck` (delete it); Coach chips (kernel + React cards). Unit tests +
  `architect.spec.ts` e2e extension.
- **P2b — conversational depth.** Chat grounding (primer + assessment + canon
  + cache split + streaming); rehearsal AI refinement. Spend behavior verified
  against the budget gauge (BYOK — HARD RULE #24 untouched).
- **P3 — the importer** (§5). Ships **before** any banner points at the Studio.
- **P4 — deprecation UX.** Banners on both old surfaces ("frozen — the Studio
  is the successor; import your decks; chat history does not carry over"), nav
  demotion (Studio loses the "Preview" badge; Drawing Board/Workbench gain
  "Retiring"), landing/features/comparison footer updates. Website change →
  screenshots at 1440/820/390.
- **P5 — removal.** Delete both routes, the §3-remainder page-only modules,
  CSS, tours; Astro redirects `/drawing-board/ → /studio/`,
  `/workbench/ → /studio/`; drop the two dead `#22` sanctions; rename
  `drawing-board-chart-interact.js` → `chart-interact.js` (kept, §3); docs
  sweep — `architecture.md` five-surfaces §, `development.md` surfaces table +
  editor list, `gotchas.md` path references, `visual-review.md` third-renderer
  naming, `guides/authoring.md`, `404.md`, `spec/diagnostics.md`, nav comments,
  ⚠ plus (checker sweep): `README.md:103`, `AGENTS.md:61`,
  `engineering/marp-independence.md`, `design/design-system.md`,
  `design/forms.md` (Workbench future-work notes), and the PWA manifest's
  app shortcuts (#723 added a long-press "Drawing Board" shortcut to the
  installed app — it retires with the route); ⚠ delete the engine-side
  tests of the deleted modules (`test/unit/playground/` — store-history,
  architect-chat, chat-edits-dom, focus-block, coach-console… — and
  `drawing-board-pane.test.ts`'s home if renamed), enumerated like the modules
  (red-team catch: "pure subtraction" must subtract its tests or CI goes red);
  CHANGELOG **Breaking:**. ⚠ **PWA:** the service worker is runtime-caching
  with a manual `VERSION` — a deploy does NOT purge cached pages (red-team
  corrected the draft's "verify it drops on deploy"). P5 **bumps the SW
  `VERSION`** (accepting the full offline-cache flush) so offline users can't
  be served a half-evicted dead Drawing Board page; the alternative —
  documented stale-offline pages — is rejected. **Timing is a user gate** —
  §8.

P1 before P2 because the coaching work should land in Studio-owned files, and
the flip is the cheapest de-risking of everything after it.

## 7. Invariants (derived by inversion — "it failed; what killed it?")

| The failure that would kill it | The invariant it forces |
|---|---|
| A user's decks vanished with the route | The importer (P3) ships before the banners (P4), both before removal (P5); the importer reads IndexedDB with the §5 fresh-context discipline (no version, no upgrade handler) and survives the route's deletion; the removal PR deletes no stores. |
| ⚠ P5 deleted a file a surviving surface still imported (the red-team's top killer: the workers, `font-embed.js`, `drawing-board-pane.js`) | Every file under `docs/src/playground/` carries an explicit tier assignment derived from the real import graph — workers via `new URL`, dynamic `import()`s, CSS included — and P5 deletes an enumerated list of names, never "the remainder" (§3). |
| ⚠ The "mechanical" move silently shed the kernels' test coverage | The movers' tests live in `test/unit/playground/` (node:test) — they re-point, or convert to vitest, explicitly; moved modules keep relative internal imports (Node can't resolve `@/`); P1's acceptance check is an unchanged executed-test count across both runners (§3). |
| "Stop sharing" forked the engine — two lint/review/gate truths | The tier-1/tier-2 boundary (§3): generated cores and surviving-surface infra are never forked or moved into a surface tree. The Studio's `scoreDeck` is the live cautionary example of exactly this drift — and this plan deletes it (§2.1). |
| ⚠ The adopted review silently lost its density dimension — a shallower "real" scorecard shipped under the real one's name | P2a plumbs density (+ tags) through `studio.astro`'s component payload and asserts CLI-vs-Studio parity on a fixture deck (§2.1). |
| The freeze rotted — "one more feature" kept landing | Freeze exceptions are enumerated (§4), functional bugs are answered by the banner, and everything else is a defect; CLAUDE.md's read-first table points here; the stranded issues (#515, #580, #414, #476/#477/#506) are re-scoped at P0 so no one builds from a stale instruction (§4). |
| A rename orphaned user data | Storage names never change: `lattice-workbench`, `lattice-studio-*`, `lattice-drawing-board` (read-only after removal), the OAuth/spend keys. Code moves; keys don't. |
| The module move silently broke the XSS gate | `SANCTIONED_PREVIEW_BUILDERS` paths update in the move commit; the gate fails on stale entries AND unlisted builders that use the split-script marker idiom, so `build:check` blocks a forgotten move (HARD RULE #22). ⚠ Honest limit (red-team): the gate keys on that idiom — a *new* preview frame composed differently is invisible to it, and `.astro` files aren't scanned; a new builder still needs the #22 review, not just the gate. |
| Coaching parity re-introduced fake AI | The honesty contract survives the port: `offline`/`blocked`, never `floorReply`; deterministic value lives in Coach, the composer stays model-gated (Coach-vs-Converse). |
| ⚠ Chat depth ate the user's money or their instructions | One cache seam, owned by `chatComplete`: message-layer split (static prefix cached, per-turn assessment in the uncached tail), never the string auto-wrap + growing system turn; `withStudioVoice` merges before the split (its string-only content guard is the trap); `readCachingEnabled` honored; the Studio's instruction store wins over the kernel's (§2.3). |
| Old links / offline PWA users hit a hole | P5 ships redirects for both routes, **bumps the SW `VERSION`** (a deploy alone never purges the runtime cache — ⚠ red-team corrected the draft here), and runs the docs sweep; the 404 page stops advertising dead surfaces. |
| The desktop wrapper pointed at a deleted route | ⚠ Outside this repo: verify the SlideWright Tauri wrapper embeds the engine, not `/drawing-board/`, before P5 (§8). |
| One big-bang PR — unreviewable, unrevertable | Six slices, each green and standalone (§6); the flip (P1) is pure motion, the depth (P2) is pure addition, the deletion (P5) is pure subtraction — including its tests. |

## 8. Open questions (for the user; recommendations attached)

1. **Removal timing.** Recommendation: P5 lands no sooner than one release
   after P4 (banners + importer live for a full cycle). The gate is yours.
2. **The Tauri wrapper.** Confirm the SlideWright desktop app embeds the
   engine/Studio and not the Drawing Board route. If it does embed it, its
   migration joins the plan before P5.
3. **Onboarding door.** Port the Architect's 3-question "draft with me" flow
   into the Studio's New-deck path, or is the starter deck enough?
   Recommendation: defer; revisit on real demand.
4. **The Playground.** Untouched by this plan (it survives as the quick-try
   surface). If it is ever folded into the Studio too, that is a new decision
   doc — nothing here assumes it.
