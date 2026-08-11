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

So `posture === 'build'` was one meaning among five, in files that carried three
of the others within twenty lines. Reading `data-ssr-stop="build"` in the shell
CSS, next to a comment about what renders "at build time", is a small tax paid on
every visit. **Craft names nothing else in the code** — before this change no
identifier, class, stored value, directive or CSS hook was called `craft`; the
word appears only as ordinary English in prose ("taste/craft moves", "a crafted
recipe can't inject"), which is not a namespace collision. And it says the same
thing about the surface: this is where you have every tool out.

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
  surface, not assumed. That gives the alias a genuinely finite life: it exists
  for the one load between the rename shipping and the user's next session.
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
   floors calibrated for Craft. The selector is fixed and the swallow removed:
   this scenario's whole point is a deterministic full-UI surface, so a failed
   dial must be loud.
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
