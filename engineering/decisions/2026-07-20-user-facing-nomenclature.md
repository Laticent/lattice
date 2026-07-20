---
# status is one of: proposed | in-progress | blocked | shipped | superseded
status: in-progress
summary: The thing an author picks per slide is a "layout" (human word) whose system word is "component" — extending the §2.5 two-register law to the pick itself, not overturning it. Fixes the shipped Style/Finish drift, publishes a user↔internal crosswalk, gates the human word against drift, and builds a user-facing containment diagram. 5 phases, one branch/PR each.
---

# User-facing nomenclature — "layout" for humans, "component" for the machine

**Roll-up:** ◐ in-progress · Phase 1 (ratify) in flight · Phases 2–3 queued · Phase 4
deferred (owner gate) · Phase 5 optional.

## Symptom

An author cannot make sense of the surface vocabulary: `deck`, `slide`, `layout`,
`component`, `chart`, `diagram`, `finish`, `theme`, `content`, `chrome` — with
`layout` and `component` used interchangeably. `getting-started.md` literally
apologizes for the synonym: *"every layout (a component, in the catalog's
vocabulary)."*

## Root cause

Not a broken model. Function · Form · Substance · Finish resolving into Frame ·
Cell · Tile is sound. The pain is **register-leak** — engine/designer vocabulary
bleeding onto author-facing pages — plus **three terms doing two jobs each**
(`layout≡component`, `content` triple-booked, `finish` = the axis *and* the
`finish:` key), plus **one live drift**: the Finish axis is called **"Style"** in
the machine source of truth (`lib/concepts/concepts.json`) and the published
`concepts.mdx`, but **"Finish"** in the prose docs. The §2.5 two-register law
("one system word + one human word per concept; code uses system, author copy
uses human") is real and correct — it is simply **enforced only over the four
axes, only inside `design/`**, and not on the surface a user reads.

## Decision

**The thing an author picks per slide (`<!-- _class: X -->`) is a *layout* to
every human, and a *component* to the machine.** This is not a new rule — it is
§2.5 applied to the pick:

- **`layout`** = the **human word** — author-facing docs, UI, prompts, the
  reference. It is already §2.5's ratified human word for the Form axis; we
  extend it to name the pick itself (the author experiences choosing a component
  as *"choosing how this slide is laid out"*; the formal fact that the pick is a
  four-axis *join* is invisible and irrelevant to them).
- **`component`** = the **system word** — `lib/components/`, `components.json`,
  `_class`, `AGENTS.md`, agent navigation, the spine grammar in `concepts.md`.
  Unchanged. **Zero code churn.** At the spine `component` is the *precise* word
  (the pick is a join object, which `layout` understates), so it stays there.

### Why `layout` and not `component` on the surface

The decision reversed an initial "component everywhere" lean under adversarial
review. Three things broke it:

1. **`component` everywhere violates §2.5.** `component` is a *system* word by
   construction (it names the join object; it lives in the code). "Keep component
   on the surface too" collapses both registers onto the machine word — the exact
   anti-pattern §2.5 exists to prevent. The "everything is already named
   component in code" fact argues that component is the *system* register, which
   §2.5 says the surface must not speak.
2. **The false-friend reverses for this audience.** For finance/legal/consulting
   authors, `component` mis-signals "engineering tool, not for me" — the flinch
   that kills adoption. `layout` keeps them in slide-land, the domain they are
   actually in. Lattice's users are migrants *from* PowerPoint / Slides / Keynote
   / Canva — all of which say **"layout."**
3. **You don't escape a category by renaming its central noun; you escape it by
   being better.** Tesla owns *"car"*; Notion kept *"page."* Category winners
   *redefine* a familiar word. Revealed preference: the system docs themselves
   can't stop saying "layout" for the smart thing — `design-system.md` writes
   *"a layout overflows when it holds more content it's built for,"* describing
   the exact content-awareness "layout" was feared too dumb to carry.

### "Shape" is retired

The earlier proposal to rename the Form-axis human word `Layout → Shape` (to stop
`layout` doing two jobs) is **dropped**. It solved a collision that only exists if
you surface the Form-axis *value* (grid/stack/panel) to authors as "layout" —
which we don't. An author only ever meets **one** "layout" (the pick); the
Form-axis value stays a designer concept (`Form`, system word) or a differently-
labeled browse facet. And `shape` is already load-bearing in the code
(`design-system.md` §"data shape"; `forms.md` `shape` field), so it would arrive
pre-polluted. No third synonym is coined.

The baggage worry (that `layout` imports PowerPoint's passive-placeholder model)
is handled by **redefinition, not flight**: the copy defines a Lattice layout as
content-aware and opinionated, and may use "like a PowerPoint layout, but —" as a
one-line teaching bridge. We pay the familiarity cost once, on purpose, instead
of forever, by accident.

## The user ↔ internal crosswalk

The contract that keeps the two registers from drifting. Each user-facing term
maps to its internal system term(s) and the one dimension it lives on
(A = Containment, B = Classification, C = Styling). Phase 2 gates the human word
against this table.

| Dim | User-facing | Internal system term(s) | Note |
|---|---|---|---|
| A | **Deck** | deck | containment root |
| A | **Slide** | root Frame | Frame is internal-only |
| A | **Chrome** | chrome Cells + Tiles | content's complement (define precisely) |
| A | **Content** *(region)* | stage Cell + content Tile (z2) | the region you fill |
| B | **Layout** *(the pick)* | **Component** (the join) | human word = layout; system word = component |
| B | Purpose | **Function** (7 families) | browse facet — why |
| B | *(browse: shape)* | **Form** → Frame types (12) | designer concept; not a second author "layout" |
| B | Material | **Substance** (prose·structure·series·graph) | browse facet — what source |
| B | **Chart** | component, `substance: series` | a Material value, not a peer kind |
| B | **Diagram** | component, `substance: graph` | a Material value, not a peer kind |
| C | Finish *(axis)* | Finish axis | **not "Style"** |
| C | **Theme** | `theme:` | color / palette |
| C | **Mode** | `mode:` | the typographic hand |
| C | **Backdrop** | `backdrop:` *(Phase 4; today `finish:`)* | rename kills the self-clash |
| C | Accent *(adv.)* | `accent:` → `spectrum*`/`rule`/`eyebrow` | one dial over 7 keys |

## Plan — 5 phases, one branch/PR each (HARD RULE #17)

Sequenced by downstream impact: ratify the record everything cites, lock it so it
can't rot, then ship the visible payoff; breaking renames and cosmetic cleanups
follow, gated.

### Phase 1 — Ratify the model · **Status:** ◐ in-progress
This note (the record). Update the canon so it states layout=human / component=
system for the pick: `design/design-system.md` §2.5 + §6, `design/concepts.md`,
`docs/src/content/docs/model/concepts.mdx`. Fix the Style→Finish drift in
`lib/concepts/concepts.json`, `concepts.mdx`, and
`docs/src/components/model/ConceptWalkthrough.astro`; rebuild `dist`. Non-breaking.
Maker-checker on the §2.5 edit (shared-vocabulary blast radius). Gate: `build:check`.

### Phase 2 — Lock the crosswalk · **Status:** ☐ proposed (ships with Phase 1)
Extend the concepts drift gate (`tools/check-ownership.js` / `build-concepts`) to
assert the **human word agrees** across `lib/concepts/concepts.json`, the prose
docs, and the site. This is the mechanism whose absence let Style/Finish diverge.

### Phase 3 — Diagram + author-facing copy · **Status:** ☐ proposed (new branch)
Build `docs/src/components/model/LayoutDiagram.astro` — a containment/russian-doll
figure (Deck ▸ Slide ▸ Layout ▸ your content; theme as the outer coat; chrome at
the edges), rhyming with `FormDiagram`, light/dark, responsive — plus its page.
Rewrite onboarding (`getting-started`, `introduction`, `authoring`, `overview`) to
the layout lexicon: retire `component` from author copy, redefine `layout`, kill
the apology, keep axes + Frame/Cell/Tile off the author path, present
theme/mode/backdrop as three flat knobs. Rename docs-site "Component reference" →
"Layout reference", `/components/` → `/layouts/` (redirect + search alias).
Gate: website screenshots at 1440/820/390 (HARD RULE #23, QUALITY BAR).

### Phase 4 — Contract renames · **Status:** ⏸ deferred (owner gate)
`finish:` → `backdrop:` and the `content` component → `prose`, each with
back-compat aliases, a **Breaking:** changelog entry, and its own focused PR.
Touches examples/galleries; export sign-off if rendered bytes move. Held pending
explicit owner go-ahead (the "rename appetite" decision).

### Phase 5 — Surface cleanups · **Status:** ☐ proposed (optional)
`bucket`→category, `kicker`→eyebrow, `lede`→subtitle, fold `variant` under
`modifier`, the accent-dial presentation. Doc-layer, lower urgency.

## Provenance

Design driven by a three-lens analysis (linguist · communication/learning ·
systems/ontology) and an adversarial red-team of the naming call. The naming
verdict is the red-team outcome: "component everywhere" did not survive; the
§2.5-prescribed split (layout in front of humans, component in the machine) did.

## See also

- `design/design-system.md` §2.5 — the two-register law this decision extends.
- `design/concepts.md` — the one map (owns the axes ↔ nouns relationships).
- `engineering/architecture.md` — the concept model in code + the drift gate
  Phase 2 extends.
