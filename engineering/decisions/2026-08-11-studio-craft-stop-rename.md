---
status: shipped
summary: >
  The Studio's posture dial reads Read · Write · Craft. The full stop was called
  "Build" from 2026-07-17-studio-persona-dial.md until now; "build" is the most
  overloaded word in this repo (npm run build, astro build, build time, the anima
  `motion-style: build`, tour builders), so the one place it named a PLACE A PERSON
  STANDS was the one place it was pulling double duty. The rename goes all the way
  down — the persisted value, the `data-ssr-stop` attribute, the shell's CSS hooks,
  the React state — rather than stopping at the label, because a stop whose id and
  label disagree is a second vocabulary to keep in sync forever. The load-bearing
  piece is POSTURE_ALIASES, a read-side map from the old stored value to the new
  stop: without it the rename is a silent DEMOTION (every returning power user's
  `posture: 'build'` reads as corruption, falls to derivePosture, and boots into
  Write with their saved home gone). Nothing about the surface itself changes —
  same three stops, same chrome ceilings, same transient-reveal rule.
---

# The Studio's full stop is Craft, not Build

**Date:** 2026-08-11
**Status:** shipped
**Follows:** `2026-07-17-studio-persona-dial.md` (the dial itself — three stops, reversible, single-writer)

---

## Why rename a stop that works

The dial's naming rule from the persona-dial competition still holds: **stops are
named for what you DO, never who you are**, so no stop reads as a rank. Craft
satisfies that rule exactly as Build did. The change is not about the rule; it is
about the word.

`build` is the most overloaded token in this repository. It is:

- `npm run build` and the ~40 `*:build` / `*:check` script pairs;
- `astro build`, and "rendered at build time" — the thing
  `StudioChromeSkeleton.tsx` exists to do;
- the anima **motion style** `motion-style: build` ("Build reveals in reading
  order"), which is a real user-facing vocabulary word in the SAME app;
- `buildVocab`, `TourBuild`, `tour.build`, "build a ComponentCatalog".

**Only the third of those five actually justifies a rename, and it is worth being
precise about that.** `npm run build`, `astro build`, "at build time" and
`buildVocab`/`TourBuild` are build-system nouns in a different namespace and a
different type position; nobody has ever mistaken `posture === 'build'` for an npm
script, and an honest reading is that they are noise, not ambiguity. The one real
collision is `motion-catalog.ts:18` — `label: 'Build'`, a **visible option in the
Studio's own Style dropdown**. A person can see "Build" on the motion picker and
"Build" on the posture dial in one session, on one screen. That is same-app,
same-user vocabulary ambiguity, it is the only one on the list a person could trip
over, and it alone carries the decision. (This paragraph replaces an earlier draft
that leaned on all five; the Munger-inversion lens was right that four of them are
padding, and a record that argues from padding is a record that gets over-applied
later.)

**Craft names nothing else in the code** — before this change no identifier, class,
stored value, directive or CSS hook was called `craft`; the word appears only as
ordinary English in prose ("taste/craft moves", "a crafted recipe can't inject"),
which is not a namespace collision. And it says the same thing about the surface:
this is where you have every tool out.

### The five names considered, and why Craft

Scored against six axes. Collision carries the most weight because it is the whole
reason to rename, split into *code* and *user-facing* because a collision a USER
sees is far worse than one only a maintainer sees. Accuracy weighs the same: a stop
name that misdescribes the stop is a permanent tax. Then series fit (the three stops
are a set, not three independent labels), the dial's own rule from
`2026-07-17-studio-persona-dial.md` (*a verb for what you DO; no stop reads as a
rank*), and whether it fights the product's pitch.

| axis (weight) | **Craft** | Build | Create | Design | Style |
|---|---|---|---|---|---|
| code collision (2) | **5** | 0 | 1 | 1 | 0 |
| user-facing collision (3) | **5** | 2 | 5 | 3 | 0 |
| accuracy to the stop (3) | 4 | 4 | 1 | 2 | 1 |
| series fit (2) | **5** | 5 | 2 | 2 | 2 |
| the dial's rule (2) | 4 | 4 | 4 | 2 | 1 |
| doesn't fight the pitch (1) | 4 | 4 | 4 | **0** | 3 |
| **weighted /5** | **4.5** | 3.1 | 2.8 | 1.9 | 0.9 |

Distinct identifier forms across `docs/src` + `lib` + `tools`: craft **10** (all
prose, zero identifiers), design 22, create 93, style 132, build 160.

- **Style — disqualified, worst of the five.** `<Field label="Style">` already
  renders **4× as a visible control label in the Studio's own panels**; the dial
  would put a second "Style" on the same screen. It is also a noun beside two
  verbs, and wrong on substance — theming is reachable at *every* stop.
- **Design — disqualified, and the most instructive rejection.** Smallest code
  footprint of the four losers, but it **contradicts the product's core sentence**:
  the built-in sample deck reads *"boxes to drag — you write Markdown, the engine
  designs the slide"* (`decks.ts:30`). A stop named Design tells the user they do
  the one thing the pitch promises they don't have to. It also collides with
  `design/`, the top-level directory that IS this project's vocabulary home.
- **Create — the runner-up, and it fails on substance, not taste.** Zero
  user-facing collisions, genuinely its strength. But **you create a deck at every
  stop** — Write is *for* creating, and Read keeps "Edit this slide" one button
  away. "Create" names the APP, not the STOP, and implies the other two are not for
  creating. Secondarily it breaks the meter (two syllables, Latinate).
- **Build vs Craft** is the only real contest, and they tie where Build is
  strongest: both are monosyllabic Germanic verbs, so `Read · Write · Build` and
  `Read · Write · Craft` scan identically (*craft* is Old English *cræft*); both
  describe "every tool out"; both are rank-neutral. Craft wins on collision alone.
- **The honest objection to Craft**, recorded rather than argued away: it is
  slightly more precious than Build and can read as *for the skilled*, which the
  dial's own rule forbids. The judgment is that it survives — the rank lives in the
  surface (the persona-dial doc itself calls this "the power user" stop), not in the
  word, and *craft* as a plain verb is neutral enough. If it ever does read as a
  rank in use, that is the finding that reopens this.

## What "all the way down" means, and why not just the label

The cheap version of this change relabels the dial and leaves `'build'` in
storage, in the type, in the CSS. That was rejected. `read` and `write` are
already id-equals-label; a third stop whose id and label disagree creates a
permanent translation step — every grep for the stop finds one spelling in the
markup and another in the tests, and the next person to touch the shell has to
learn that Craft is spelled build. The rename is worth doing once, properly, or
not at all.

Renamed, in one pass:

| Surface | Before | After |
|---|---|---|
| The `Posture` union + stored value | `'build'` | `'craft'` |
| Dial label / hint / announce | `Build — every panel` | `Craft — every panel` |
| Workspace "Starting mode" card | `Build` | `Craft` |
| Shell pre-paint attribute | `data-ssr-stop="build"` | `data-ssr-stop="craft"` |
| Shell CSS hooks | `.ssr-dial-build`, `.ssr-build-lead`, `.ssr-build-tail` | `.ssr-dial-craft`, `.ssr-craft-lead`, `.ssr-craft-tail` |
| Transient step-up state | `revealBuild` / `setRevealBuild` / `revealBuildDock` | `revealCraft` / `setRevealCraft` / `revealCraftDock` |
| Preview-geometry constant | `PREVIEW_CHROME.railBuildDesktop` | `PREVIEW_CHROME.railCraftDesktop` |

**Deliberately NOT renamed** — these are different words that happen to be
spelled the same, and folding them in would be the actual bug:

- `motion-style: build` and the "Build reveals in reading order" copy
  (`slide-provenance.ts`, `motion-catalog.ts`, `chart-anima.ts`,
  `SlideContext.tsx`) — an anima style, authored in deck front matter. Renaming
  it would break every deck that sets it.
- `<!-- _build -->` in `slide-directives.ts` — a slide directive.
- `TourBuild` / `tour.build` — a tour's builder function.
- `buildVocab`, `npm run build`, "at build time" — the ordinary meanings.

## The migration is one map, read-side

`POSTURE_ALIASES` in `studio-store.ts`:

```ts
export const POSTURE_ALIASES: Readonly<Record<string, Posture>> = { build: 'craft' };
```

Every returning user who ever touched the dial's third stop has the literal
string `"build"` sitting in `lattice-studio-settings`. The validation the store
already does is *deliberately strict* — "validate rather than trust", so an
unknown stored value falls back to the derived stop rather than leaving the dial
lighting no segment. That strictness is exactly what turns this rename into a
regression if the alias is missing: `'build'` reads as corruption →
`derivePosture` → **Write**. The power users, and only the power users, silently
lose their saved home. `hasStoredPosture()` would also go false for them, so the
mount effect would then *persist* the demotion.

So the alias is consulted in both places (`asPosture`), and:

- **no migration pass writes storage; a normal save does.** There is no rewrite
  loop over localStorage. The alias answers on read, and the next ordinary
  `saveSettings` persists the normalized `'craft'`, because `saveSettings` spreads
  `loadSettings()`. In practice that is the *first mount* — `StudioShell`'s
  editor-preference effect (`saveSettings({ validation })`,
  `StudioShell.tsx:973`) runs unconditionally on mount, so a legacy workspace is
  normalized within a second of opening the Studio. Confirmed on the real
  surface, not assumed.
- **`POSTURE_ALIASES` is PERMANENT, not a one-load shim.** An earlier draft of
  this note claimed it "exists for the one load between the rename shipping and
  the user's next session." That is true of *localStorage* and false overall, and
  the counter-example is fix #3 below: `importStudioState` restores a workspace
  backup `.json` verbatim, and a backup file has unbounded lifetime — a backup
  taken today, restored in two years, still carries `posture: 'build'`. Do not
  delete this map on the theory that it has expired. The guard against deleting
  it anyway is a test, not a comment: `studio-store.test.ts`'s *"normalizes the
  stop on WRITE too, so an old backup cannot re-seed the legacy name"* fails if
  the map goes. (Named here because the canonical record is where someone looks
  before removing load-bearing code, and this one previously told them the
  opposite. Caught by the Munger-inversion lens.)
- **the pre-paint seed gets the same map.** `studio.astro` reads the same
  localStorage key before hydration to size the instant shell, and it now
  receives `POSTURES`, `POSTURE_ALIASES` and `LEGACY_ONBOARDED_POSTURE` through
  `define:vars` instead of hand-writing the stop list inline. A seed that
  resolved a *different* stop than the store is the #1286 failure shape: the
  skeleton paints a Write header and rail against the Craft app, and the hand-off
  shows as a jump. That drift shipped twice, once per constant that was written
  down more than once — so the rename removes a hand-written copy rather than
  updating it.
- **the alias widens what is ACCEPTED, not to anything.** A genuinely unknown
  stop (`'sculpt'`) still falls back to the derived default. Both cases are
  covered in `studio-store.test.ts`.

`derivePosture`'s legacy branch — an `onboarded: true` visitor from before the
dial existed, who had reached the full surface and must not be demoted — now
returns the named `LEGACY_ONBOARDED_POSTURE` constant rather than a bare literal,
for the same single-declaration reason `BOOT_POSTURE` exists.

### The migration is one-directional, and that is an accepted cost

**Forward** — old storage, new bundle — is what the alias covers, and it is the
direction that matters. **Backward is not covered, and it is destructive.** A
*pre-rename* bundle reads `posture: 'craft'`, fails its `isPosture` check, derives
`'write'` — and `saveSettings` spreads the already-coerced `loadSettings()`, so
the mount effect *writes the demotion back*. Rolling forward again does not
restore it; there is nothing left for the alias to alias.

Two ways a person meets that, and only two — the service worker does *not* open a
third. `sw.js` serves navigations network-first, so online you always get the fresh
page; offline you get the cached page, but if your last online visit was
post-deploy that cached page is the *new* one, and if it was pre-deploy your
storage still says `'build'` and there is nothing to lose. The two paths are a
**revert deploy** (`docs.yml` publishes on every push to `main`, so a revert is one
merge from serving the old bundle) and **a Studio tab left open across a deploy**,
still running the old JS.

**No user action is required on either path.** An earlier draft of this section said
the stale tab clobbers storage "on its next settings write", which reads as *if they
toggle something*. A bare page load is enough: `StudioShell`'s mount effects
(`:257` and `:975`) both call `saveSettings` unconditionally. And the demotion is
visible **before hydration** as well as after — the pre-paint seed reads the same
value, so the old bundle paints the Write skeleton (wrong header run, wrong dial, no
52px rail) from first paint.

This is named rather than fixed, deliberately. The textbook answer is
**expand/contract**: release N accepts both spellings but still *writes*
`'build'`; release N+1 flips the writer. That closes the window at the cost of a
release where the stored value disagrees with the id, the label, the CSS and the
type — a *third* vocabulary, which is the thing this change exists to remove —
plus a follow-up PR that has to actually happen. Priced against the harm, that is
not worth it: **the loss is one workspace preference on a public docs site, and
the recovery is one click on an always-visible dial.** No deck, no source, no
export is touched. If the same rename is ever done to something whose loss is not
one click — a deck id, a source key, anything under `SRC_PREFIX` — expand/contract
is the right shape and this paragraph is the reason.

**This direction IS measured.** An earlier draft of this section claimed the
opposite — "no evidence reaches that direction, and none can, because testing it
requires running the *old* code against the *new* storage, which is not reachable
from this tree." That was false, and the way it was false is worth recording,
because it is the shape HARD RULE #23 is aimed at: *"can't be tested from here"* is
itself a claim about a surface, and this one was one `curl` from being wrong. The
old code is not in the tree — it is **deployed**, at `lattice.style/studio/`, which
still serves the pre-rename bundle. The red-team pass mirrored it to disk, healed
its dynamic-import chunks until the island hydrated, served it locally, seeded
`posture: 'craft'`, and drove it with real Chromium at 1440×900:

```
OLD bundle, storage = what the NEW bundle writes
  seedStop: 'write'   appStop: 'write'   dial: "Write — editor + preview"
  stored:   'write'   ← rewritten, no interaction

OLD bundle, control, storage = posture:'build'
  seedStop: 'build'   appStop: 'build'   dial: "Build — every panel"
  stored:   'build'
```

So the destructive round trip is confirmed end to end on two real surfaces, not
reasoned. The *pricing* above is unchanged — one preference, one click — but it is
now priced against a measurement.

**The general lesson, which outlives this rename:** when a change alters a value
that a *previously deployed* build reads, the old build is testable, because it is
still being served. Mirror it and drive it. "Not reachable from this tree" is a
statement about the repository, not about the world.

## What did not change

The surface. Same three stops, same chrome ceiling per stop, same
adaptive-not-asked entry, same single-writer rule (the persisted stop is written
only by an explicit dial interaction), same transient-reveal semantics
(`revealCraft` raises the *rendered* stop without persisting it, and recedes when
the faculties it was summoned for close). No layout, no geometry, no export
bytes.

## Verification

- `docs` typecheck clean; the full docs vitest suite green (228 files / 2952
  tests). `npm run lint`, `npm run build:check` clean.
- `studio-store.test.ts` gains four cases: the legacy `'build'` alias resolves to
  Craft *and* counts as explicitly stored (no re-derive) *and* normalizes to
  `'craft'` on the next save; an unknown stop still falls back; a
  `Object.prototype` key (`'constructor'`) is not a stop; and a legacy value
  arriving through `saveSettings` (the workspace-import path) is normalized on
  write.
- **Real surface** — the BUILT docs site (`astro build` + `astro preview`), driven
  with real Chromium at 1440 / 820 / 390. Not jsdom, not a synthetic harness.
  **23 of 24 assertions pass; the one miss is a harness expectation, not a
  defect** (below).
  - *Hand-off continuity*, the #1286 failure shape: `data-ssr-stop` read at
    `DOMContentLoaded` — before hydration — must equal the stop the mounted app
    renders. Checked for eight storage populations at 1440: `'build'`, `'craft'`,
    `'read'`, `'write'`, legacy `onboarded:true`, `'sculpt'`, `'constructor'`, and
    empty. All eight agree; the shell never paints one stop under another.
  - *The migration*, at all three widths: a seeded legacy `posture: 'build'`
    stamps `data-ssr-stop="craft"` pre-paint, with `.ssr-dial-craft` at
    `display:contents` and `.ssr-dial-write` at `none`, and `data-ssr-rail` set at
    1440 only (desktop-only, correct); the hydrated app then renders `craft`, the
    dial lights Craft, and storage has normalized to `'craft'` within the session.
  - *The surface itself*: the desktop Craft activity rail measures **52px**
    (`railCraftDesktop`); the header dial reads **Read · Write · Craft** at 1440
    and 820; **no control at any width has an accessible name containing
    "Build"**; clicking Craft persists it and it survives a reload.
  - *The F2 regression specifically*: `posture: 'constructor'` now lights exactly
    one dial segment (Write), where before the fix it lit none.
  - The one failing assertion — "the phone's Menu drawer reaches the dial" — is
    **the harness being wrong about the product**: the dial is gated
    `{!mobile && <PostureDial …>}` and was before this change too, so there is no
    posture control on a phone. Pre-existing and off-path; noted, not pulled into
    this diff.
- **UNVERIFIED:** the Playwright e2e tier was not run here, and iOS Safari is not
  reachable from this sandbox. Neither is judged at risk — the rename touches no
  input handling — but neither was executed, so neither is claimed.

## Fixed during review

The independent checker (maker–checker, HARD RULE #25) caught three defects in the
first pass of this change, all now fixed in the same PR:

1. **`tools/perf-torture/scenarios/studio.mjs` still clicked `Build — every
   panel`** — and the click was wrapped in `.catch(() => {})`, so the Studio
   torture scenario would have quietly benchmarked the *Write* surface against
   floors calibrated for Craft. Selector fixed and the swallow removed.
   **That fix was inert, and the red-team pass caught it:** the caller
   (`perf-torture/engine.mjs`, both the measure and confirm paths) wrapped
   `surf.setup` in its own `try/catch` that printed one `console.error` and
   *continued* — so removing the inner `.catch` turned a silent no-op into a
   quiet-but-continuing one, which is a footnote in a long benchmark log, not a
   failure. `surf.setup` is now uncaught on both paths: it establishes the
   *surface* the run is about, so a failed setup invalidates the comparison
   rather than degrading one cycle (`prep`, which arranges state *within* a
   surface, stays caught). `studio` is the only surface with a `setup`, so this
   changes no other scenario. *Two lessons: a fix to an error-swallow has to
   follow the throw all the way up, and "must be loud" is a claim to verify, not
   assert.*
2. **`asPosture` accepted `Object.prototype` keys.** `POSTURE_ALIASES[v]` on an
   object literal makes `'constructor'` a truthy hit, so a hand-edited or imported
   `posture: 'constructor'` resolved to a non-Posture and the dial lit *no*
   segment — the exact failure the store's "validate rather than trust" comment
   exists to prevent, and a regression against the `isPosture` it replaced. Now
   `Object.hasOwn`.
3. **The workspace-import path could put `'build'` back into storage.**
   `importStudioState` ends in `saveSettings(data.settings)`, and that spread
   landed *after* `loadSettings()`'s normalization — so restoring a pre-rename
   backup re-introduced the old spelling, and the alias would have had to live
   forever. `saveSettings` now normalizes the stop at the write boundary too.
