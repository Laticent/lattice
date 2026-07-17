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

### The load-bearing rule — two values, strictly separate

This is the discipline that makes the dial safe and kills the founding bug:

1. **`posture` — the persisted boot stop.** Written to storage **only** by an
   explicit dial interaction: a click on a segment, or `⌘1/⌘2/⌘3`, or `⌘.`.
   **Nothing else ever writes it** — no action, no gesture, no timer, no ⌘K
   command. Because engagement never ratchets it, a Write-parked user who edits
   all session still boots into Write tomorrow. The dial does not drift.
2. **A transient, session-only *reveal* (`quietened`, heir to today's `focus`)
   — never persisted, steps down as readily as up.** A direct in-canvas gesture
   may momentarily show more/less chrome than your saved stop (you press "Edit
   this slide" in Read → the editor slides in for this session); it saves
   nothing and recedes when you leave the surface that summoned it. `⌘.` toggles
   it; `Esc` clears it (its exact job today). Moving the dial writes `posture`
   and clears any `quietened` overlay.

**The bright line for ⌘K:** a ⌘K command **never moves the dial** — not the
persisted `posture`, not even a transient reveal. Running a command changes
*what you did*, never *what the room looks like*. An expert parked at Write who
⌘K-opens a component gets the component, at Write, with Write's chrome — never
yanked into Build density unasked. (Grafted from T2 §4.8 / T3; this is the
single rule that prevents "using the command bar teleported my panels.")

### Reachability ≠ arrangement (grafted from T5 §2)

The dial changes **what is docked**, never **what is reachable.** ⌘K reaches
*every* capability from *every* stop — including Build-only faculties (Library,
Workspace, Fabricate, Inspector). Invoking a Build-only faculty from Read or
Write does **not** switch posture — it **transiently docks that one panel** and
recedes on dismissal, exactly today's Focus + ⌘K behavior. So the `onboarded`
gate is removed from **all ⌘K / command surfaces**, and a density gate remains
only on **docked** chrome. "One keystroke away in every home" is then literally
true, and reaching Library from Read is not escaping to a different room.

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
3. **Continuity = safety.** Editor + preview mount once and never unmount; the
   slide you're viewing stays fixed through every transition. You rearrange one
   desk, you don't move buildings. **(UNVERIFIED — see Risks.)**
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
- Migration on load: legacy `onboarded === false` → `'read'`; legacy
  `onboarded === true` **or** `hasPriorStudioUse()` → **`'write'`** — the
  friendly middle default for the existing engaged cohort. Rationale (grafted
  from T5): `onboarded` truthiness is over-eager (it trips on a single edit or
  panel open), so mapping it to Build would dump one-character users into the
  firehose. Write is one dial-click from Build for the true experts. **This
  migration cannot recover each user's ideal stop** — nothing in storage today
  distinguishes a Focus-lover from an expert (`focus` is transient/unpersisted);
  it picks one friendly default for the whole cohort. Stated limitation, not an
  implied guarantee.
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

**Selector / fixture / tour migration (the part that bites e2e):** stable
`aria-label` / `data-tour` contracts break — "Enter/Exit focus mode," "Watch
demo," "Dismiss welcome," "Got it" — referenced by `studio-fixture.ts` CHROME,
tour-kit `SEL`, and Vetrina `TOURS`. Every renamed/removed selector is aliased
or migrated **in the same change**, and the "Show me around" tours re-confirmed
to resolve on the built docs site. Not done until they do.

**Untouched (safety):** the preview `srcdoc` iframe content and the
`sanitizeSlideHtml` chokepoint — the dial changes *chrome*, never preview
content, so **no new HARD RULE #22 preview-frame builder is introduced**
(`SANCTIONED_PREVIEW_BUILDERS` unchanged). Per-panel open/remembered state stays
orthogonal to `posture` (grafted from T2 §4.5 — Build raises the ceiling, it
does not force docked panels). Plain React hooks + localStorage; no new store.
Colors via `var(--token)` only (HARD RULE #3); spacing via `padding`/`gap`
(HARD RULE #20).

## Risks & what stays UNVERIFIED (HARD RULE #23)

- **No-remount / fixed-slide continuity** is a claim about the real `srcdoc`
  iframe under real React reconciliation. **UNVERIFIED until driven on the built
  docs Studio** — switch stops on the real surface, confirm the iframe does not
  reload and the visible slide does not jump.
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

## Status

Proposed. Design consolidated from the 2026-07-17 competition (winner T3 +
grafts). Next: adversarial hardening of this spec (red team + Munger inversion +
independent checker, HARD RULE #25 tier 2 — novel core UX + blast radius), fold
findings, then a build plan. No Studio code until the plan is agreed.
