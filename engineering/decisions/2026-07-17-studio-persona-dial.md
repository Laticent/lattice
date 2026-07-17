---
status: proposed
summary: >
  The Studio sorts people into a reduced newcomer surface vs. the full surface
  with a hidden one-way boolean (`onboarded`) plus a welcome banner whose only
  job is to nag you to graduate OUT of the calm surface — "banner jail." A
  5-track design competition (2026-07-17) converged unanimously on the fix:
  replace the ratchet + banner + transient Focus with ONE persisted, always-
  visible, reversible three-stop dial. Winner: Track 3 "Read · Write · Build" —
  stops named for what you DO, not who you are, so no stop reads as a rank.
  Entry is adaptive-not-asked (first visit → Read on the sample deck, returning
  → last explicit stop); there is no up-front picker. The load-bearing rule:
  the persisted stop is written ONLY by an explicit dial interaction — no
  gesture, timer, or ⌘K command ever moves it — which kills the graduate()-as-
  side-effect bug at the root. ⌘K stays live at every stop (nothing removed,
  only un-docked). This doc is the consolidated spec (winner + grafts from T2's
  risk register / responsive clamp, T5's spine-vs-periphery, T4's migration-
  flash fix); it deliberately does NOT adopt T5's "coach speaks first" — the
  newcomer lands calm. Real blast radius: single-writer posture, a spine hoist
  so switching never remounts the preview iframe, ~10 graduate() call sites
  removed, fixture/tour selector migration. Continuity + fit claims are marked
  UNVERIFIED pending real-surface capture (HARD RULE #23).
---

# Studio persona experiences — one reversible dial (Read · Write · Build)

*2026-07-17*

## The problem this closes

The Studio already sorts people — badly. A newcomer gets a reduced surface
gated behind a hidden boolean `onboarded` (default `false`), plus a first-run
**welcome banner** whose entire job is to push them to *graduate out* of the
calm surface. `graduate()` flips `onboarded` permanently `true`; **there is no
code path back.** The calm surface is a locked room and the banner is the
jailer. On top of that, engagement side-effects (first keystroke, opening a
panel) silently fire `graduate()`, so the surface changes *at* you without your
choosing it.

The counter-example already in the tree is **Focus mode**: everyone likes it
because (1) *you* chose it, (2) it's reversible in one visible click / `Esc` /
`⌘.`, and (3) ⌘K keeps every feature one keystroke away. The whole design below
is: **make the persona surface behave the way Focus behaves** — a reversible
position you hold, never a ratchet you escape.

This supersedes the "need #2 (newcomer defaults), a later pass" left open by
`2026-06-30-studio-focus-mode.md`, and reframes — but keeps the spirit of —
`2026-06-30-studio-newcomer-onboarding.md` ("one Studio you grow into," no
separate "Lite" app). It does not fork the app; it replaces the *mechanism*.

## How we got here — the competition, in one line

A 5-track `design-competition` (simplest / risk-first / user-first /
leverage-existing / clean-slate; 3 internal rounds each + fresh critic +
shared fact-check + comparative judge, 17 agents) **converged**: every
independent track replaced the ratchet + banner with a single always-visible
reversible dial, and **none** defended an up-front "which are you?" picker.
Fact-check was clean (107 claims confirmed against the real code, 0 refuted).
Judge ranking: **T3 Read·Write·Build 9.0** · T2 No Doors 8.7 · T5 Range Ring
8.3 · T4 Rooms 7.8 · T1 Density Dial 7.5. This doc ships T3 as the base with
grafts from the rest.

## Decision

Replace **three** ad-hoc mechanisms — the hidden one-way `onboarded` ratchet,
the transient `focus` toggle, and the `welcomeOpen` banner — with **one**
persisted setting surfaced as **one** always-visible, reversible control.

### The dial

`posture: 'read' | 'write' | 'build'` — one field on `StudioSettings`
(persisted under `lattice-studio-settings` like every other setting), surfaced
as a segmented control in the top bar, present and identical at every stop.

| Stop | Shows | The situation it fits |
|---|---|---|
| **Read** | Full-bleed live preview + one persistent **"Edit this slide"** button. No activity bar, no panels. | A newcomer who doesn't yet know Markdown — a beautiful deck they already understand how to look at. |
| **Write** | `editor \| preview` split + slim header. (This *is* today's loved Focus body, promoted from a transient toggle to a first-class, persisted home.) | The familiar user: "type Markdown, watch slides." |
| **Build** | Today's full desktop — activity bar + docked Coach + Inspector + editor + preview, Fabricate / Library / everything. | The power user. |

**Stops are named for what you DO, not who you are.** This is the anti-jail
property expressed in the naming itself: a verb carries no rank, so no stop can
read as "beginner" or "the lesser one." It also spares us the identity-defense
work every other track needed ("Max not Pro," "Focus isn't simple," "Guided
isn't beginner"). Tooltips describe **the view, not the viewer** — "Read — just
the slides," "Write — editor + preview," "Build — every panel." The words
*graduate, unlock, get started, beginner, ready for more?* are **banned** from
the surface. There is no "Exit" control anywhere, because you are never *in* a
mode — you are *at* a stop.

**Deliverable verbs vs. density panels — the line the dial draws.** **Present**
and **Share/Export** are top-level controls on *every* stop's header (Write's
slim header included) — they are why the app exists and never hide behind a
posture (T5's "deliverable verbs always present"). They are *also* ⌘K-reachable;
being both is fine for a primary verb. Authoring **panels** (the coach, the
inspector) are the opposite: dial-gated chrome, opened on demand, never forced
open by a posture change. So the rule is: **output actions are always present;
authoring panels are arranged by the dial** — and moving the dial changes only
the chrome *ceiling* (Build shows the activity-bar launcher), never the
open/closed state of a panel (T2 §4.5 orthogonality).

### The load-bearing rule — two values, strictly separate

This is the discipline that makes the dial safe and kills the founding bug:

1. **`posture` — the persisted boot stop.** Written to storage **only** by an
   explicit dial interaction: a click on a segment or `⌘1/⌘2/⌘3`. **Nothing else
   ever writes it** — no action, no gesture, no timer, no ⌘K command, and *not*
   `⌘.` (see item 2). Because engagement never ratchets it, a Write-parked user
   who edits all session still boots into Write tomorrow. The dial does not
   drift. **(Hardening fix R1 — the first-visit case:** the adaptive first paint
   **must persist `posture='read'` once** on first boot, or the stop is silently
   re-derived from engagement every session and the ratchet returns — a Read
   user who creates a deck flips `hasPriorStudioUse()` and boots into Write
   unasked. First-paint persistence is the one non-dial write, and it happens
   exactly once; "returning → last stop" then means last *persisted* stop, which
   is honest.)
2. **A transient, session-only *reveal* (`quietened`, heir to today's `focus`)
   — never persisted, steps down as readily as up.** A direct in-canvas gesture
   may momentarily show more/less chrome than your saved stop (you press "Edit
   this slide" in Read → the editor slides in for this session); it saves
   nothing and recedes when you leave the surface that summoned it. `⌘.` toggles
   it; `Esc` clears it (its exact job today). Moving the dial writes `posture`
   and clears any `quietened` overlay.

**The bright line for ⌘K (narrowed per hardening R3):** a ⌘K command **never
moves the persisted `posture`.** An expert parked at Write who ⌘K-opens a
component gets the component, at Write, with Write's chrome — never yanked into
Build *as their saved home* unasked. A command **may** change the *transient*
surface (open a panel, `⌘.`-quieten, Enter Focus, Reshape, collapse/expand a
pane) — that is `quietened`/split state, not `posture`, and it recedes. The
original spec overstated this as "never moves the dial, not even a transient
reveal," which is false: `onFocus`, `onReshape`, `onCollapseEditor/Preview`,
`onExpandPane`, `onResetSplit` are already wired into the palette
(`StudioShell.tsx:2484-2495`) and legitimately reshape the surface. The holdable
invariant is the persisted-posture one. (Grafted from T2 §4.8 / T3.)

### Reachability ≠ arrangement (grafted from T5 §2)

The dial changes **what is docked**, never **what is reachable.** ⌘K reaches
*every* capability from *every* stop — including Build-only faculties (Library,
Workspace, Fabricate, Inspector). Invoking one from Read or Write does **not**
switch posture; it either **transiently docks that one panel** (Inspector,
Architect) and recedes on dismissal, or — for the **full-screen faculties
(Fabricate, Present)** — **suspends and restores the caller's posture** on exit.
Both are session-transient, never a posture write.

**Two hardening corrections here (C7, R5), because the original overstated
reality:**
- There is **no `onboarded` gate on the command surface today** — `CommandPalette`
  exposes Fabricate unconditionally, and Library/Workspace **are not in ⌘K at
  all**. So "reachable from every stop" is not achieved by *removing* a gate; it
  requires **adding** `onLibrary` / `onWorkspace` (and Inspector) commands to the
  palette. That is new work, not un-gating — the honesty caveat below stands, and
  the build cost is real.
- "Transiently docks that one panel" is **factually wrong for Fabricate and
  Present** — they are full-screen views / overlays, not dockable columns, and
  today entering Fabricate force-clears `focus` (`StudioShell.tsx:1437`). The
  spec therefore needs an explicit **suspend-and-restore** rule: a full-screen
  faculty records the caller's `posture`/`quietened` on entry and restores it on
  exit, rather than dumping the user at Build.

Honest caveat carried from T3: "nothing removed, only un-docked" is true, but a
non-technical newcomer in Read won't *know* the keybinding and won't see a
palette they can't yet read. For that persona the reachable set in Read is the
visible affordances (the "Edit this slide" button + the "Search or ask…" pill),
not "everything." The honesty is *no capability is removed*, not *everything is
one glance away*.

## The entry model — adaptive, never asked; no picker, ever

**Stance: adaptive-by-default, steered by the always-visible dial. No up-front
picker, no first-run interstitial, no one-way flag.** Every competing track
reached this independently; the picker was unanimously rejected as a
self-classification tax at the moment of least information (the same reason
`2026-06-30-studio-newcomer-onboarding.md` rejected a template gallery).

- **First true visit** (`hasPriorStudioUse() === false`) → **Read**, on the
  welcome deck (`DECKS[0]`), no banner, no modal. The single gentlest
  inference: "show the beautiful sample and let them look."
- **Returning** → their last explicitly chosen stop (pure persistence).

The only teaching a newcomer needs moves from **chrome** (a banner) to
**content + one element-attached hint**: a single, non-recurring, self-
dismissing inline hint on the "Edit this slide" button — *"This sample deck is
yours — tap Edit this slide to change it."* Gone forever the moment it's
dismissed or the first edit lands. It preserves the one true job the banner did
(tell a newcomer the deck is theirs) while killing everything that made it a
jail: it never recurs, points *into* the app not *out*, and is bound to an
element, not a global strip. The "Show me around" Vetrina tour and the Coach
are *offered* (in the ⌘K empty state and a one-time element-attached cue), never
auto-opened.

### Fork decisions (the three real choices, resolved)

- **Fork A — Naming: verbs (Read · Write · Build).** Best fit to the brief's
  center of gravity; zero rank connotation. *(Overridable — this is the most
  taste-driven call; alternatives were density Calm/Std/Full and posture
  Guided/Focused/Full.)*
- **Fork B — First landing: calmest stop + sample deck, one element-attached
  hint.** No modal. Existing engaged cohort migrates to the **middle** stop, not
  the firehose (see Migration).
- **Fork C — Coach greets the newcomer? No — stays calm.** We **do not** adopt
  T5's "coach speaks first." The coach is reachable and offered, never auto-
  opened. This preserves the user-validated "start calm" decision
  (`2026-06-30-studio-newcomer-onboarding.md`, `activeAssistant` null for
  newcomers). No fake AI either — any greeting is deterministic until a key is
  connected (Coach-vs-Converse, `2026-07-03-studio-succession.md` §2.3).

## The three personas, one Studio

- **A — Newcomer (non-technical).** Boots into **Read** on the welcome deck. No
  banner, no modal, no quiz — a beautiful deck they can arrow through, plus one
  obvious "Edit this slide" button carrying the one-time "this deck is yours"
  hint. Pressing it slides the editor in (transient reveal) and steps the dial
  to Write — *because they took the one visible action that means "I want to
  write."* Never told they're a beginner; never had to say who they are.
- **B — Familiar ("stuck in the old days").** Their whole ask — "let me write
  Markdown and see slides" — is **Write**. Because `posture` persists their
  explicit choice, they **land in Write every session** (today's Focus resets
  each session). Coach or a component is one ⌘K away, and ⌘K leaves them at
  Write.
- **C — Expert.** Parks at **Build**, persisted, boots straight into it.
  Fabricate and Library are no longer trapped behind the invisible `onboarded`
  ratchet — density is a visible dial they own from first boot. `⌘.` dips to a
  bare surface and back (the Focus reflex, now a peer stop); poking one
  component through ⌘K never moves them off Build.

## How switching feels — the anti-jail invariants

1. **The exits are always visible.** The dial shows all three stops at all
   times with the current one lit. A jail hides its exits; a dial *is* the exit
   map.
2. **Nothing is unreachable, and ⌘K never moves the room.** (Rule above.)
3. **Continuity = safety.** Editor + preview mount once and stay mounted across
   every **in-breakpoint** transition — the dial (Write↔Build), the `⌘.` quiet
   dip, and a tablet↔desktop resize all keep the same nodes, so the iframe never
   reloads and the editor's scroll/cursor never jump. You rearrange one desk, you
   don't move buildings. **(VERIFIED — M2 spine hoist: a real-surface puppeteer
   run confirms the editor node + editor scroll + preview iframe node + its
   `contentWindow` all survive a Write↔Build↔Write cycle.)** The one deliberate
   remount seam is the **mobile↔tablet** boundary (~768px), where the whole
   layout model changes to the single-pane mobile structure — mobile has its own
   both-panes-mounted swap, and a remount when the DOM model itself changes is
   acceptable. Read stays *inside* the spine (see below), so even the newcomer's
   first "Edit this slide" (Read→Write) is a track change, not a remount.
4. **Persist choices, never judge people, never ratchet.** `posture` moves only
   on an explicit dial interaction.
5. **No ranking, in pixels or words.** No stop is "the real one." Banned-words
   list enforced.

## Responsive (grafted from T2 §5.5 — the clamp matrix)

`posture` is a single persisted value, **clamped by the viewport ceiling**,
never overwritten; a narrowed window *displays* a clamped stop and *restores*
the true one when width returns.

| Persisted `posture` | Desktop ~1440 | Tablet ~820 | Mobile ~390 |
|---|---|---|---|
| **Read** | Read | Read | single pane (preview) + sheets |
| **Write** | Write | Write | single pane (editor) + sheets |
| **Build** | Build | Build clamped: activity bar + topbar, panels as sheets/overlays (820 can't dock bar + split + panel) | single pane + sheets |

Dial form **follows the surface** (grafted from T4): three labeled segments in
the top bar at desktop/tablet; on mobile it collapses onto the existing
Edit/Preview pane swap (Read = preview pane, Write = editor pane) plus a
"panels" button (Build). A 52px vertical rail cannot host a horizontal labeled
pill — physical form is chosen per surface, never asserted into a row. The dial
must be **shown to fit** the documented top-bar budget
(`2026-07-04-studio-toolbar-budget`) at tablet, degrading to icon-only before
Present / Share yield — not assumed. **No width is "done" without
`tools/screenshot.js` evidence at 1440 / 820 / 390 (HARD RULE #23).**

## Implementation shape (state + blast radius)

This is a **cross-cutting refactor, not "one more field."** It warrants the
MAKER-CHECKER rung (HARD RULE #25 — real blast radius across e2e fixtures and
tours) and is where this doc's honesty budget is spent.

**State + migration** (`studio-store.ts`):
- Add `posture: 'read' | 'write' | 'build'` to `StudioSettings`.
- Migration on load — **three populations, evaluated prior-use-first (hardening
  R4/R6 reorders this; the original two-clause version overlapped and demoted an
  actively-editing user into Read):**
  1. `onboarded === true` (explicitly reached the full surface) → **`'build'`** —
     *keep the surface they already had.* The original mapped this cohort to
     Write, which **hides their docked Inspector/Architect on first boot** — it
     reads as "my workspace was wiped," with the banner (their only explainer)
     now deleted. An explicit `onboarded:true` is a real signal of the full
     surface; honor it.
  2. `hasPriorStudioUse() && onboarded !== true` (edited a deck but never
     explicitly graduated) → **`'write'`** — the friendly middle. `hasPriorStudioUse()`
     truthiness *is* over-eager (it trips on a single edit), so this cohort
     should not be dumped at Build; Write is one dial-click away.
  3. neither signal → **`'read'`**.
  **This still cannot recover each user's ideal stop** — nothing in storage
  distinguishes a Focus-lover from an expert (`focus` is transient/unpersisted).
  It picks the *safest* default per population. Stated limitation, not a
  guarantee. The `studio.astro` pre-paint derive **must apply this exact
  precedence** or first-paint and hydrated stop disagree (flash).
- **Migration-flash fix (grafted from T4):** the `studio.astro` pre-paint script
  reads raw localStorage and cannot read a `posture` field never written, so on
  the first post-deploy load it must **derive** the stop from the legacy signals
  it already reads (`onboarded` / `lattice-studio-deck-index` /
  `lattice-studio-src-*`) — else every returning user gets a one-time Read flash.
  Drop the `.ssr-welcome` banner strip from the instant shell.

**The spine hoist (the non-free part, named not hidden — T3/T5).** The
continuity promise (switching never remounts the `srcdoc` preview iframe, the
visible slide never jumps) is **not inherited** from the mobile pane-swap trick.
Today's `focus` (~L2322) and desktop (~L2338) layouts are *separate ternary
branches* placing the split grid at different tree depths; a naive branch swap
remounts CodeMirror + the iframe. The real work: **hoist editor + preview + the
split grid into one stable parent above the posture branch**, so posture toggles
only surrounding periphery and re-weights `splitTracks()` (kept as the single
source of truth for `gridTemplateColumns`, extended per-`posture`). The panes
never mount/unmount; chrome does.

**Done in M2** (commit `spine hoist`): the Write and Build bodies are merged into
one structure with `editorPane`/`previewPane` at fixed child indices; each
conditional grid track shares its exact boolean gate with its child, so
track-count === child-count by construction (the #721 invariant is
unrepresentable-to-break, enumerated across all 48 states). **Read must stay in
this same spine (M3), NOT a new branch** — otherwise the newcomer's first "Edit
this slide" (Read→Write) would cross a branch boundary and remount the iframe at
persona A's most fragile moment. It fits cleanly: `splitTracks` already collapses
the editor to `0px` *while keeping it mounted* (that is how today's
preview-collapse works), so Read = the spine with the editor track at `0px` +
full-bleed preview + the "Edit this slide" affordance; Edit just re-weights the
editor track back open — a track change, no remount.

**Deletions & re-keys:**
- Delete the welcome banner JSX + `welcomeOpen`, the `inspectorPulse`, and the
  first-edit auto-`graduate()` (keep the editor callback; drop the graduate /
  reveal / toast body).
- Delete the standalone Focus toggle button — it *becomes* the Write stop.
- **Remove every `graduate()` call at feature-engagement sites (~10)** — not
  rewired to `setPosture`, *deleted*; those sites keep their panel-open
  behavior and no longer touch posture. Replace `graduate()` with a plain
  `setPosture(next)` called **only by the dial**.
- Re-key `onboarded`-gated **docked** chrome (Library/Workspace icons, Fabricate
  launcher, Focus button) on `posture`; keep all of them in ⌘K unconditionally.

**Selector / test migration (hardening C14 corrects the target map — the
original pointed at the wrong files):** the strings that break are the removed
chrome's labels/text — "Enter/Exit focus mode," "Watch demo," "Dismiss welcome,"
"Got it." Their **actual consumers** are: `StudioShell.test.tsx` (unit assertions
on "Enter focus mode"), the `studio-fixture.ts` *body* (`getByRole('Got it')`,
~L111 — **not** the CHROME map, which references none of them), and
`CommandPalette.tsx` (the "Watch demo" item). The tour-kit `SEL` set and the
Studio `TOURS` registry (`tours/index.ts`, built on Vetrina) do **not** reference
the focus/welcome selectors, so the tour breakage is smaller than first stated —
but re-confirm the "Show me around" tours resolve on the built docs site anyway.
Migrate these in the same change; not done until the unit suite is green.

**`onboarded` *reads*, not just `graduate()` writes, must re-point (hardening
R7).** The "delete ~10 `graduate()` sites, don't rewire" plan omits non-write
`onboarded` reads that dangle when the field is removed — notably the
breakpoint-flip auto-dock `setActiveAssistant(onboardedRef.current ? …)`
(`StudioShell.tsx:655`) and the docked-chrome gates (`:2053-2054`, `:2093`,
`:2250-2251`). Every `onboarded` *read* re-points to `posture`; leaving
`onboarded` in place beside `posture` would re-create the two-sources-of-truth
bug the single-writer rule exists to kill.

**Accessibility (hardening R8).** The transient reveal must fire an `aria-live`
announcement (a silent context change strands a screen-reader user; contrast the
deliberate focus re-homing at `:1218-1225`). And the dial **never degrades to
icon-only** — at tight widths, yield *other* chrome (Present/Share overflow)
before the dial's labels, since the newcomer who most needs the labels is
disproportionately on tablet/mobile.

**Untouched (safety):** the preview `srcdoc` iframe content and the
`sanitizeSlideHtml` chokepoint — the dial changes *chrome*, never preview
content, so **no new HARD RULE #22 preview-frame builder is introduced**
(`SANCTIONED_PREVIEW_BUILDERS` unchanged). Per-panel open/remembered state stays
orthogonal to `posture` (grafted from T2 §4.5 — Build raises the ceiling, it
does not force docked panels). Plain React hooks + localStorage; no new store.
Colors via `var(--token)` only (HARD RULE #3); spacing via `padding`/`gap`
(HARD RULE #20).

## Risks & what stays UNVERIFIED (HARD RULE #23)

- **No-remount / fixed-slide continuity** — **VERIFIED (M2).** A real-surface
  puppeteer run on the built dev Studio confirms the `iframe.live` node + its
  `contentWindow`, and the CodeMirror editor node + its scroll offset, all
  survive a Write↔Build↔Write cycle (no remount, no reload). Holds for every
  in-breakpoint transition; the mobile↔tablet seam is the one intended remount
  (different layout model). Byte-identical Write/Build screenshots vs. M1
  separately confirm zero static regression.
- **Dial fits the top-bar budget at tablet** — **UNVERIFIED** until captured at
  1440 / 820 / 390 with `tools/screenshot.js`.
- **A newcomer reads the dial and finds it when curious** is a usability claim,
  not provable from a spec — validate on the real surface.
- Carry T2's **F1–F8 risk register** as the pre-ship red-team checklist (F1
  silent-misclassification is the sharpest argument for "nothing auto-steers").

## Alternatives considered (and why not)

- **Explicit picker / one-time gentle choice** — rejected by every track: a
  self-classification tax before any value, and a sticky wrong guess.
- **Pure adaptive (UI morphs on its own)** — T2's F1, the least-reversible
  failure: UI that moves under you with no visible cause. We adopt adaptation
  only as *one-time boot inference + persistence*, never continuous morph.
- **A separate "Lite" app** — still rejected (`2026-06-30-studio-newcomer-
  onboarding.md`). One Studio, one URL, one settings object; the dial replaces
  the grow-out-of-it ratchet with a move-freely control. Same philosophy, no
  cage.
- **Two stops instead of three** — loses the distinct middle the brief's
  "familiar / stuck in the old days" persona needs a *home* for, not a gesture.

## Adversarial hardening (2026-07-17) — outcome

The spec ran the HARD RULE #25 tier-2 trio (red team + Munger inversion +
independent checker), each in a fresh context against this doc + the real code.
**Outcome: architecture validated, spec tightened, sequencing revised.**

- **Validated:** no fabrications (107 claims confirmed, 0 refuted); the
  spine-hoist premise is real (the `focus` and desktop branches place the split
  grid at different React tree depths, so a naive swap remounts the iframe); the
  no-picker / ⌘K-everywhere / banned-rank-words decisions survive.
- **Fixed in-place (above):** R1 first-visit persistence, R2 `⌘.` is
  `quietened`-only, R3 the ⌘K invariant narrowed to persisted-posture, R4/R6 the
  three-population migration (engaged→Build, not wiped-to-Write), R5
  suspend-and-restore for full-screen faculties, R7 `onboarded`-reads re-point,
  R8 a11y + never-icon-only dial, C7 Library/Workspace must be *added* to ⌘K, C14
  the corrected test-migration map.
- **Still owed before build (cross-cutting red-team ask):** an explicit
  **state-transition matrix** — rows = every input (segment click, `⌘1-3`, `⌘.`,
  `Esc`, each ⌘K command, Fabricate/Present enter+exit, breakpoint clamp,
  first-boot derive); columns = effect on `posture` / `quietened` / rendered
  layout. Most contradictions above fall out of this table being unwritten.
- **The strategic finding (Munger, reinforced by the red-team scope work):**
  the "banner jail" the user actually reported is a **small, certain** fix; the
  full persisted three-stop dial is a **larger, partly-unverified** bet (spine
  hoist, migration regression, the Read newcomer home, adding palette commands,
  the 9-cell responsive surface). DEFAULT OP MODE #3 and HARD RULE #17 favor
  **un-bundling**.

## Status & recommended sequencing

**Proposed — awaiting a scope decision (see below), then a build plan. No Studio
code yet.** Recommended path, un-bundled into two independently-shippable slices
(HARD RULE #17):

- **Slice 1 — kill the jail (certain, low-risk, ships first).** Persist the
  Focus/quiet choice (sticky + reversible), surface an always-visible reversible
  control so there's a seen way in and out, make the welcome banner
  dismiss-forever, and **delete the one-way ratchet + the auto-`graduate()`
  engagement side-effects**. This delivers exactly what was reported as annoying,
  adds no spine-hoist or Read-home risk, and demotes no existing user.
- **Slice 2 — the newcomer Read home + verb naming + spine hoist
  (evidence-gated).** The full Read/Write/Build experience, gated on the three
  UNVERIFIED questions the trio sharpened: (a) does a non-technical user find and
  read the dial; (b) does Read-first activate better or worse than Write-first;
  (c) does the spine hoist actually prevent iframe remount on the real surface
  (HARD RULE #23). Each is cheap to test on the built docs site.

The alternative — build the whole dial in one branch — remains on the table if
the destination is wanted in one move; it carries the migration + continuity risk
above and a larger single review. **This scope choice is the open decision.**

## Build log (this PR — one branch, milestone commits)

Chosen path (2026-07-17): build the full dial incrementally in **one PR**, a
commit per milestone, the adversarial trio after each. Status:

- **M1–M3 shipped + trio-hardened + real-surface-verified.** The dial (Read ·
  Write · Build), the spine hoist (continuity VERIFIED — editor + iframe nodes
  survive every in-breakpoint stop change), and the full-bleed Read newcomer home
  (chromeless preview, "Edit this slide" → Write with no remount, the 0px editor
  made `inert` for a11y). Verified at desktop + tablet.
- **Tracked deferrals (owned by later milestones — NOT silent):**
  - **Mobile Read → M5.** The Read full-bleed + "Edit this slide" render only in
    the desktop/tablet spine branch; on mobile the separate pane layout still
    shows Preview/Edit with no Read overlay, and the dial isn't surfaced. M5
    (responsive) MUST deliver a first-class mobile Read + orientation and wire
    `mobilePane` to `posture` — the persona-A-on-a-phone case the brief centers.
    Until then a mobile newcomer sees the preview pane but no "this deck is yours"
    teaching (a within-PR intermediate state, not shipped).
  - **Read-first activation is UNVERIFIED (Slice 2b).** Read is the shipped
    default for every fresh visitor, but "does Read-first activate better than
    Write-first" needs a real-user A/B not runnable in this sandbox — flagged, not
    proven. Calm-first is backed by the competition + the 2026-06-30 onboarding
    decision; the *specific* Read-vs-Write choice awaits real users.
- **M4 shipped (reachability + a11y + suspend-restore).** Library + Workspace
  added to ⌘K so every faculty is one keystroke away even from Read/Write where
  the activity bar isn't shown (C7 closed — verified on the real surface from the
  Read stop); an `aria-live` status region announces stop changes to assistive
  tech (the ⌘. dip and the "Edit this slide" reveal are no longer silent);
  Fabricate now suspend-and-restores the transient `quietened` so exiting it
  returns you to the exact surface you left (R5). **Deferred from M4:** the
  general *transient dock* (invoke a Build-only panel — Inspector, or `onReshape`'s
  Architect — from Read/Write without persisting Build) needs a small third
  transient state (`revealBuild`, symmetric to `quietened`) and its own trio;
  until then `onReshape` lands you in Build (a sanctioned exception — Reshape is
  an authoring action that needs the coach). The **dial-never-icon-only** rule
  and dial-fit-at-tablet fold into M5 (responsive), where they belong.
- Responsive clamp matrix + dial fit at tablet + first-class mobile Read → M5.
  e2e CHROME/selector sweep + CHANGELOG → M6.
