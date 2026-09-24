---
status: shipped
summary: "The Studio's `_class:` autocomplete offered every component, every finish and all 139 universal modifiers at every position on the line. It now completes by position, like a shell: the first word is a component, and every later word is only what that component accepts. Which universal modifiers a component accepts is decided by SURFACE, not by a list: each modifier group names the slide part it acts on, lib/components/surfaces.js derives which parts each component has, and a render proof (check:modifier-effects) measures what actually changes and overrides the derivation. The slide's own content and usage counts from the example decks rank the menu. Two list-based designs (exclude-lists, opt-in lists) were built or proposed and rejected because they make 71 manifests keep modifier lists in sync."
---

# Positional `_class:` completion (2026-09-24)

## The symptom

Type `<!-- _class: kpi ` in the Studio and the menu offered all 71 components
again, every finish, and all 139 universal modifiers — the same list at every
position on the line. It never read which component was already named. The data
to do better existed and went unused: each manifest's `variants` and
`variantAxes`, the family modifiers, the engine's `EXCLUSIVE_AXES`, and
`authoring.blocks`. Worse, the menu opened on the space with its first item
highlighted, so an author who pressed Enter to keep the default look got `kpi
attention`.

## The model

**Position.** A `_class:` line has a grammar, `<component> [modifier …]`, and the
completer follows it. The first word offers components. Once the typed text
names no component (`_class: dark` — `dar` still names `radar`), it completes as
the default `content` slide, so the common `_class: dark` keeps working. That
switch needed a `validFor` that fails when the text stops naming a component:
CodeMirror keeps its list while `validFor` matches, and a plain word pattern froze
the component list so `dark` never completed. Every later word offers, in
ranked sections: dependents of the token just typed (`tint-corner` → `at-tl` …),
the component's own variants, its family modifiers, then the modifier groups,
with the finishes last. Tokens already on the line drop out, and so does every other member of an
exclusive axis once one is picked. A bare space opens nothing; the default look is
writing nothing.

**Surface.** The owner's framing was the key: a modifier like `dark` or `silent`
acts on the slide, so it works everywhere; a modifier like `table-fill` acts on a
part only some components have. So every group in `MODIFIER_GROUPS`
(lib/components/index.js) names the surface it acts on — `slide`, `heading`,
`eyebrow`, `table`, `card-row`, `card-surface`, `card-rail`, `chart-marks`,
`key-insight`, `below-note`, `insight-label` — and a modifier is offered only where
its surface exists. "Universal" and "shared" are results of that rule, not labels.

**Derivation, then proof.** `lib/components/surfaces.js` derives each component's
surfaces from facts that already exist: slot selectors and the component's own
sample for heading/eyebrow/table, the manifest's `cards` field for `card-row`
(resolve-cards.js governs nothing else), the stylesheets that read
`--elevation-card` for `card-surface`, the class list of the card-rail paint rule,
the transforms that draw `data-mark` SVG, and `authoring.blocks`. A derivation is a
claim, so `tools/check-modifier-effects.js` proves it: it renders every component's
sample and stress sample bare and once per probed modifier, fingerprints every
element's computed style (custom properties excluded) and box, and records which
surfaces actually change. The measurement is committed as
`lib/core/modifier-effects.generated.json` and REPLACES the derivation for the
surfaces it probes; a component not measured yet keeps its derivation.

**Relevance.** The editor reads the slide below the line: a table, heading or
eyebrow there turns that content surface on (unless the proof found it inert on
this component) and moves its group up. Within each section, modifiers are ranked
by how often the example decks use them after this component, then overall.

**Delivery.** The Studio page does not inline the registry: at ~5KB of JSON it cost
the route 14.7KB of escaped HTML props and failed the route budget
(docs/route-budget.json). It ships as `/studio/modifier-vocab.json`, fetched beside
the component catalog after hydration; until it arrives, completion falls back to
the flat universal list. Overall usage is summed in the browser from the
per-component counts the catalog already carries.

## What the proof found

A content surface (heading, eyebrow, table) is called inert only after it was
EXERCISED: the proof also renders the sample with canonical content injected — an
eyebrow line directly above a heading, a heading, a table — and a surface is inert
only when no modifier on it changed either render. The first version skipped that
step and called a surface inert whenever the sample simply lacked it; the
maker-checker pass caught it (`eyebrow-dot` visibly worked on `kpi`, `code`,
`journey` and `title` with an author's eyebrow in place, yet was hidden there).

Measured now, and repeatable run to run:

- `eyebrow-*` is inert on 7 components (`contact`, `premise`, `scatter`,
  `split-compare`, `split-panel`, `video`, `wifi`).
- The heading modifiers are inert on 8 (`compare-code`, `contact`, `image`,
  `premise`, `split-compare`, `split-panel`, `video`, `wifi`).
- `table-*` does nothing to a table an author adds on 4 (`contact`,
  `split-compare`, `video`, `wifi`).
- `lifted` works on `kpi` only under `ops`/`trajectory`, on `inventory` only under
  `cards`, and on `split-panel` only under `watermark` — hence the per-variant probe.
- `motion-*` does nothing on a plain `line` chart: its transform emits `data-mark`
  only for detail bullets, and the motion host needs one.

The register gaps and the `line` motion gap are pre-existing, found not caused;
they are logged in `followups.d/`, not fixed here (HARD RULE #18).

## The fingerprint had to be earned

Two identical "control twin" slides must fingerprint the same, or the run fails.
That guard fired repeatedly before the fingerprint was trustworthy: absolute box
positions (slides stack down the page), zero-size boxes of `display:none` elements
reporting the page origin, per-slide SVG ids inside `url(#…)` references, and
sub-pixel jitter that flipped rounding boundaries (boxes are now compared with a
half-pixel tolerance, not hashed). A variant whose own twins differ — `divider
numbered` stamps a running section number — is recorded as unmeasurable rather
than trusted. The probe deck also carries the component folder's assets (an
`image` sample renders a different composition without its picture), checks that
the render has exactly one slide per probe, and ignores properties that never
paint (`cursor`, `transition`, …).

## Rejected

- **Exclude-lists** (first build): every universal offered, each manifest lists
  what does not apply. Every new modifier appears on 71 components until someone
  edits 71 manifests.
- **Opt-in lists** ("shared modifiers" as the existing family mechanism): each
  manifest lists what does apply. A new modifier appears nowhere until manifests
  opt in. Both ask manifests to keep modifier lists in sync; surfaces ask
  components only for facts about themselves.
- **The proof as the only source.** A sample can fail to exercise a surface
  (`content`'s sample has no table), so measured-absent is not proof of
  inapplicability. The derivation and the slide's own content cover what the
  sample does not.

## Not done here

- The deck lint does not yet warn on an offered-nowhere modifier; the owner chose
  completion first, lint next (the widened `excludes` does not change lint).
- The proof is on-demand, not CI. Nothing fails when a stylesheet change makes the
  measurement stale, and a NEW component is not required to be measured before
  `npm test` passes (it keeps its derivation). Re-run
  `npm run check:modifier-effects` (about two and a half minutes) after touching a
  component's CSS, or `--only=<name>` for one.
