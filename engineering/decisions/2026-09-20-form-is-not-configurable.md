---
status: shipped
summary: >-
  Form is the composition model and cannot be disabled, configured or selected. The `form:`
  front-matter key, the per-slide `form` / `no-form` tokens, `readFormMode`, `FORM_MODES`, the
  mode argument threaded through all three render paths, the Studio's "Deck chrome" toggle and
  the Playground's "Form" select are all removed. Sovereignty stops being spelled as an ABSENT
  class: every slide now carries `data-form="2d"` and `data-frame="<id>"`, so a reader asks which
  FRAME a slide composes under and gets a name instead of inferring it from a missing class. The
  `form` CLASS stays what it always was — the chrome-hosting Frame's CSS hook. Three levels replace the toggle — Form (unconditional) over Medium (`2d` today, a
  renderer's choice) over Frame (the component's choice). Verified pixel-neutral across 84
  component galleries in both moods; all 40 deck-golden drifts reproduce on a clean tree and are
  pre-existing. Two conformance findings fall out: `list bullet` lost its clip cell to a
  variant/component name collision (fixed, one of 273 combinations changes), and `video` cannot
  reach conformance by flag alone (recorded, not forced).
builds-on: 2026-06-16-form-manifest-medium-independent-contract.md, 2026-07-08-runtime-form-default.md, 2026-07-15-model-driven-frame-render.md
---

# Form is not configurable

**Date** 2026-09-20

## The ruling

> "form is our defacto model and should never be disabled… to me there is 2d form and that is
> the default and no way to change it unless it is to 3d form or VR form which we may never
> support."
>
> "everything is a form 2d/standard. they are sovereign but have no business not using form.
> every component must honor form semantics."
>
> "medium is the right lever. form is always on and the default medium is 2d. future is unknown
> but the engine has the necessary interface to support future forms."
>
> — owner, 2026-09-20

## Why a toggle was the wrong shape

Form shipped as a deck-wide feature flag that graduated to default-on (2026-06-26). The flag
outlived its purpose: it existed to stage a migration, and the migration finished. What it left
behind was worse than dead weight, because **the same absent class meant two different things**.
A slide with no `form` class was either a deck that had opted out, or a sovereign Frame that
never takes chrome. Nothing in the DOM distinguished them, so "which Frame composes this slide"
was permanently readable as "is this Form at all" — and the documentation read it that way. The
docs-site craft pages said sovereign layouts "take neither cell"; a sovereign Frame's manifest
says `cells: ["stage"]`.

## The three levels

| Level | The question | Who can express it | Today |
|---|---|---|---|
| **Form** | is this slide composed? | nobody — it is unconditional | always on; no key, class or flag selects it |
| **Medium** *(rendering medium)* | what does it compose *into*? | the renderer, never the deck | `2d` (CSS) |
| **Frame** | which Frame carves this slide into Cells? | the **component**, via its `_class` token | 11 Frames: 2 chrome-hosting + 9 sovereign |

**"Medium" is overloaded and this is not the coupling rung.**
`2026-06-16-form-manifest-medium-independent-contract.md` uses *Medium/Heavy* for how tightly the
manifest drives the CSS; Lattice sits on the *light* rung and that is unchanged. The rendering
medium above is what a Frame renders INTO. That same ADR is what fixed this direction: 2D CSS as
the first renderer, a spatial renderer as the thought experiment that shaped the manifest and was
explicitly not scheduled — "Not building VR."

So the answer to "what about 3D and VR" is: the interface is the Frame manifest, it is already
medium-independent by construction, and a second medium would be a RENDERER, never a deck
setting. Nothing is scheduled and nothing is reserved — a front-matter key nobody can use is the
confusion this record removes, not a hedge against it.

## What sovereignty is now

Every slide carries `data-form="2d"` — it composes as Form, in the 2D medium — and
`data-frame="<id>"`, naming the Frame that carves it: `standard`, or one of the nine sovereign
ids (`title`, `divider`, `closing`, `image`, `premise`, `scene`, `split-panel`, `split-compare`,
`compare-code`). That is the statement that replaced the absent class. Two kernel predicates,
`isSovereignFrame` and `hostsChromeCells`, are what the chrome injectors ask.
`FORM_TOGGLE_SKIP` is `SOVEREIGN_FRAMES`, because it is no longer a toggle's skip-list — it is
the chrome-exempt half of the Frame catalog.

### Why the class did not become universal

The first cut made the `form` CLASS universal and marked sovereignty with a second class,
`frame-sovereign`. It expresses the same fact and it was reverted, because the class is not a
label — it is load-bearing for ~245 engine CSS rules and for the split envelope, and making it
universal moved real decks three separate times:

| Deck | What moved | Cause |
|---|---|---|
| `examples/social-grid` | masthead band went full-bleed; the "Option 1 of 2" pill overprinted the rail | a split page inherits the marker, and the guards then strip geometry the envelope's chrome needs |
| `themes/palette-audit` | three pages gained a stage inset they never had | `:not(.frame-sovereign)` is specificity (0,2,1) where bare `section.form` is (0,1,1), so the guarded rule won contests it used to lose |
| `examples/split-horizontal`, `examples/autosplit-coverage` | content lost its horizontal inset | `premise` split pages carry no `form` on main, so universalising it handed them chrome geometry |

Each was found by a golden, and each needed its own guard or escape. A design that needs a new
escape hatch per discovery is not one to ship. The attributes say exactly the same thing about
the model, are queryable by name rather than by absence, and move nothing: every deck golden and
every component gallery is byte-identical.

The lesson generalises past this change. **A CSS class that a decade of rules select on is an
interface, not a description.** Restating the model is worth doing; restating it by redefining
that interface is not.

## What it cost to verify

| Claim | Evidence |
|---|---|
| The corpus barely used it | one file repo-wide carried `form: off`; one slide carried `no-form`; ten decks carried a redundant `form: standard` |
| Sovereign Frames must stay chrome-free | rendered a `divider` wearing `form` before the gating landed: it picked up a hairline, a progress rail and an accent bar it is designed to refuse |
| The change moves no pixels | 84 component galleries × 2 moods; one drift (`logo`), reproduced on a stashed tree with `dist/` rebuilt |
| No deck golden regressed | 241 deck goldens, 40 drifted — the clean-tree run produced a byte-identical 40-name list, so every one is pre-existing |

## Two conformance findings

**`list bullet` had lost its clip cell.** The stage-wrap decision let ANY token in a class list
veto. The layout-name and variant-modifier namespaces are shared, so a variant token can also
name a component — five such collisions exist (`journey heatmap`, `radar quadrant`,
`compare-prose decision`, `list bullet`, `math stats`). `bullet` is the bullet CHART, classified
`canvas`, so a `list bullet` slide silently lost the bounded box the overflow probe walls. Fixed
by resolving THE layout token (first match, mirroring `layoutTokenFor`). Measured over all 273
declared component × variant combinations: exactly one answer changes.

**`video` is a known gap and was not forced.** It is the one non-sovereign component composing as
Form with no Cell. Flipping `conformance: "strict"` is a no-op — video rebuilds its section and
sat below `mastheadLift`, so the cell the flag builds is discarded. Moving it above `mastheadLift`
(the documented fix, the one `contact` and `wifi` use) does build the cell and REGRESSES the
layout: the lift pulls the h2 and lead out of the `.video-lead` pair, collapsing the `companion`
composition from side-by-side to stacked and clipping the caption. Both attempts were rendered,
reviewed and reverted. Closing it means teaching video's transform to keep its title in-card the
way wifi does with `.qr-head > h2` — its own change, with its own evidence.

## Migration

`lint:deck` warns and never blocks (HARD RULE #29's posture). `retired-form-key` flags any
`form:` value and, for `off` alone, names what will change about the render. `retired-form-token`
flags a `form` / `no-form` slide token and points at a sovereign component as the real way to get
a slide with no chrome. `form` also left `UNIVERSAL_GROUPS.chrome`, so neither editor offers it,
and joined `STRUCTURAL_ROOT_CLASSES` in the ownership gate beside `chart-frame` — engine
scaffolding an author can neither select nor refuse.

## What was deliberately left alone

- The **manifest `form` field** (`bookend` / `canvas` / `grid` / `ledger` / …) — the composition
  AXIS, a different thing wearing the same word. Four of its twelve values are realized by any
  Frame at all, which is why `design/forms.md` §8 used to call the Frame catalog "the twelve Form
  values" and was wrong three ways. The field, its enum and Fabricate's editor for it are
  untouched.
- **`lib/forms/frame/minimal/`** — a live Frame reached by `class: no-progress`, not the retired
  `form: minimal` mode that shares its name.
- **`section.form > footer`'s 52cqi budget.** Its comment claimed it served "the un-migrated /
  sovereign frames"; it could never match one, because those slides had no `form` class. Letting
  it through wrapped the running footer onto a second line on three gallery pages where nothing
  was overprinting. Guarded, with the stale claim about its own reach corrected in place. Giving
  sovereign Frames a footer budget may well be right — they do carry a page number to collide
  with — but that is a layout decision owed its own evidence.
