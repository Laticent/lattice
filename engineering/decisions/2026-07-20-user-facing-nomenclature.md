---
# status is one of: proposed | in-progress | blocked | shipped | superseded
status: in-progress
summary: Canonical public-facing terms — "layout" (the thing an author picks per slide) and "Style" (the deck's look and feel). Per owner direction, the internal Function·Form·Substance·Finish / Frame·Cell·Tile model is left sovereign (NOT rewritten); the user-facing mental model ships as a NEW page + containment diagram, and the component→layout / Finish→Style renames across the author docs, /model/ tech docs, and Studio UI are deferred to their own lanes. The analysis + adversarial trio below are the reasoning of record.
---

# User-facing nomenclature — "layout" for humans, "component" for the machine

**⟳ Owner redirect (2026-07-20) — read this first; it supersedes the execution
plan below.** The approach changed after the analysis. We do **not** rewrite the
internal model docs — the Function·Form·Substance·Finish / Frame·Cell·Tile model
stays sovereign. Instead:

1. The **user-facing mental model ships as a NEW page** —
   `docs/src/content/docs/mental-model.mdx` + `components/mental-model/DeckDiagram.astro`
   (a containment/russian-doll diagram: Deck ▸ Slide ▸ Layout ▸ content). **Done on
   this branch**, rendered-verified at desktop + mobile.
2. **Canonical public terms:** **layout** (the pick) and **Style** (the look/feel).
   *"Style" stays canonical — this reverses the earlier "Finish wins" call in the
   analysis below (owner: "style fits our lattice style").*
3. Renaming `component`→`layout` and `Finish`→`Style` across the **author docs, the
   `/model/` tech docs, and the Studio UI is deferred** to its own lanes — not in
   scope here.

The earlier model-doc edits (commit `b4b2229`) were **reverted**. Everything below
(the three-lens analysis, the red-team, the adversarial trio, the crosswalk) stands
as the **reasoning of record**; only its "edit the existing model docs" execution
plan is superseded by (1)–(3). *Note: the drift the analysis calls "Style→Finish"
resolves the opposite way now — Style is canonical, so the catalog's existing
"Style" is correct and stays.*

## Symptom

An author cannot make sense of the surface vocabulary: `deck`, `slide`, `layout`,
`component`, `chart`, `diagram`, `finish`, `theme`, `content`, `chrome` — with
`layout` and `component` used interchangeably. `getting-started.md` literally
apologizes for the synonym: *"every layout (a component, in the catalog's
vocabulary)"* (`getting-started.md:94`).

## Root cause

Not a broken model. Function · Form · Substance · Finish resolving into Frame ·
Cell · Tile is sound. The pain is **register-leak** — engine/designer vocabulary
bleeding onto author-facing pages — plus **three terms doing two jobs each**
(`layout≡component`, `content` triple-booked, `finish` = the axis *and* the
`finish:` key), plus **one live drift**: the Finish axis is called **"Style"** in
the machine source of truth (`lib/concepts/concepts.json:44`) and three rendered
docs-site surfaces, but **"Finish"** in the prose docs and §2.5. The §2.5
two-register law ("one system word + one human word per concept; code uses
system, author copy uses human") is real and correct — it is simply **enforced
only over the four axes, only inside `design/`**, and not on the surface a user
reads. The drift gate never reads the `human` field at all (`lib/concepts/index.js`
`validateShape` checks `system`/`source`, never `human`), which is why "Style"
survived.

## Decision (ratified — source-verified)

**The thing an author picks per slide (`<!-- _class: X -->`) is a *layout* to
every human, and a *component* to the machine.** Not a new rule — §2.5 applied to
the pick:

- **`layout`** = the **human word** — author-facing docs, UI, prompts, the
  reference. §2.5's ratified human word for the Form axis (`design-system.md:103`),
  extended to name the pick itself (the author experiences choosing a component as
  *"choosing how this slide is laid out"*; the pick being a four-axis *join* is
  invisible to them).
- **`component`** = the **system word** — `lib/components/`, `components.json`,
  `_class`, `AGENTS.md`, agent navigation. **Zero code churn** (verified: no
  `layout:` manifest field, no `--layout` flag; the only "layout" in code is
  register-leak in user-facing strings, which Phase 3 fixes). At the spine
  `component` is the precise word (the pick is a join, which `layout` understates).

### Why `layout` and not `component` on the surface

Reversed an initial "component everywhere" lean under adversarial review:

1. **`component` everywhere violates §2.5.** `component` is a *system* word by
   construction (it names the join; it lives in the code). Keeping it on the
   surface collapses both registers onto the machine word — the anti-pattern §2.5
   exists to prevent.
2. **The false-friend reverses for this audience.** For finance/legal/consulting
   authors, `component` mis-signals "engineering tool, not for me." `layout` keeps
   them in slide-land. Lattice's users migrate *from* PowerPoint / Slides /
   Keynote / Canva — all of which say **"layout."**
3. **You don't escape a category by renaming its noun; you escape it by being
   better.** Tesla owns *"car"*; Notion kept *"page."* Revealed preference: the
   system docs can't stop saying "layout" for the smart thing —
   `design-system.md` writes *"a layout overflows when it holds more content it's
   built for."*

The baggage worry (that `layout` imports PowerPoint's passive-placeholder model)
is handled by **redefinition, not flight** — but the trio flagged that a single
optional gloss line won't carry it. Phase 3 makes the content-aware redefinition
a **required, repeated** element of the onboarding (diagram + intro + first
authoring page each state it), not one bridge sentence.

## Form-axis surface word — RESOLVED: "Arrangement"

"Shape" was **out** (retired: `shape` is already load-bearing —
`design-system.md:241` "data shape", `forms.md:235` `shape` field). And the trio
found the deeper problem: **`concepts.mdx:32` is a *published* author-reachable
page whose "Human word" column labeled the Form axis "Layout."** Once "layout"
names the pick, that page double-booked the word — the exact overload we're
killing. So the Form axis needed a word that is **neither "Layout" nor "Shape."**

**Resolved (owner, 2026-07-20): the Form axis's human word is "Arrangement."**
Collision-audited before adoption (0 hits as a key/class/value/tag across
`lib/components/index.js`, `lib/concepts/concepts.json`, `lib/forms/` — unlike
"Composition", whose gallery-footer use made it a soft collision). Form's system
word stays "Form"; its human word becomes "Arrangement"; the *pick* keeps "layout"
(human) / "component" (system). Three distinct words, no double-book — which the
Phase 2 uniqueness gate now enforces.

## The crosswalk — ratified core

Verified against source (`design/forms.md`, `lib/concepts/concepts.json`,
`lib/components/index.js`, the resolvers). This is the contract Phase 2 gates.

| Dim | User word | Internal system term(s) | Note |
|---|---|---|---|
| A | **Deck** | deck (the file) | containment root |
| A | **Slide** | root Frame | Frame is internal-only |
| A | **Chrome** | chrome-band Cells + Tiles | content's complement (define precisely) |
| A | **Content** *(region)* | stage Cell + content Tile (z2) | the region you fill — see collision note |
| B | **Layout** *(the pick)* | **Component** (the join) | human = layout; system = component |
| B | **Arrangement** | **Form** (12 Frame types) | how it's composed; NOT "layout" (that's the pick) |
| B | Purpose | **Function** (7 families) | browse facet — why |
| C | **Theme** | `theme:` | color / palette |
| C | **Mode** | `mode:` | the typographic hand |
| C | **Finish** *(feel/axis)* | Finish axis | **not "Style"** — the drift being fixed |
| C | Finish *(preset key)* | `finish:` | selects the backdrop preset; **key stays `finish:`** |
| C | Backdrop *(layer)* | `.backdrop` wrapper; tuned by `finish-override: → backdrop:` | render layer + its nested map; **not** a top-level key |

## Proposed — each needs a collision audit before adoption

The trio found the first crosswalk coined author words that **already collide**.
None of these is ratified; each is gated on a grep against component names,
front-matter keys, Substance/Form values, `TAG_GROUPS` terms, and route segments.

| Candidate | Intended for | What the trio found | Status |
|---|---|---|---|
| **"Material"** | Substance's surface word | **Collides** with the live `material` tag dimension (`lib/components/index.js:403`, "I have a ___") — same "what you put on the slide" meaning, different construct | **REJECTED.** Substance is engine-owned; leave its word "Content" (authors don't pick it). No author word coined. |
| ~~**Form-axis word**~~ | the Form facet on the model page | "Layout" taken; "Shape" pre-polluted | **RESOLVED → "Arrangement"** (0-collision audited); now in the ratified crosswalk |
| **"category"** (bucket) | rename `bucket` on surface | `bucket` is a manifest field + `groupByBucket()` API + **route segment** (`[bucket]/[name].astro`) + a tag-rule clause — not doc-only | Deferred; re-scope as system-or-drop |
| **Accent "one dial"** | collapse the accent keys | **No `accent:` key exists** — the 7 registers (`spectrum:`,`spectrum-edge:`,`spectrum-card:`,`spectrum-card-edge:`,`spectrum-trim:`,`rule:`,`eyebrow:`) are independent siblings (`2026-07-15-accent-finish-consolidation.md`) | A *future* consolidation proposal, not a current fact |
| **Chart / Diagram as "a series/graph component"** | crosswalk shorthand | Chart is a **bucket/family of 13** (3 are `structure`/`graph`, not series); Diagram is one component (`graph`) | Reword to "chart family, prototypically series" |
| Contract renames `finish:`, `content` | de-overload the two contracts | `backdrop:` + `prose` taken (blocked); floated `body`/`plain` **also not clear** (`plain` = `eyebrow:` default; `body` overloaded) | Phase 4, owner-gated, target TBD by audit |

## Plan — phases, one branch/PR each (HARD RULE #17)

### Phase 1 — Ratify the model · **Status:** ◐ in-progress
Update the canon to layout=human / component=system for the pick
(`design-system.md` §2.5+§6, `concepts.md`, `concepts.mdx`), **relabel the
Form-axis human word to "Arrangement"** (on `concepts.mdx`, §2.5, and the concept
catalog) so "layout" isn't double-booked. Fix the Style→Finish drift in
**five** surfaces — `lib/concepts/concepts.json`, `concepts.mdx`,
`ConceptWalkthrough.astro`, **`ConceptLattice.astro` (no-JS fallback), and
`ConceptGraph.astro`** — plus the now-stale "'look' collides with *Style*"
sentence (`concepts.mdx:36`); rebuild `dist`. Reconcile stale counts in the edited
docs (**53→59 components, 12→13 buckets** incl. `connect`; getting-started's "55").
Do **not** touch the Content/Material split here (deferred). Non-breaking.
Maker-checker whose charter is a **collision audit** (not just prose review).
Gate: `build:check`.

**Landed (2026-07-20):** canon edits in — `concepts.json` (form.human→Arrangement,
finish.human→Finish, component gains human "Layout"), the five Style→Finish
surfaces (`concepts.json`, `concepts.mdx`, `ConceptWalkthrough`, `ConceptGraph`,
`ConceptLattice`), §2.5+§6, `concepts.md`, and — caught by the maker-checker —
`forms.md` (which owns the Form vocabulary and still mapped Form→"Layout").
`dist/docs/concepts.json` regenerated; `build:check`, 6/6 concept tests, and lint
green; "Arrangement" collision-audited (0 identifier hits). **Deferred (off the
naming path, logged per HARD RULE #18):** the stale component/bucket counts
(53→59, 12→13 incl. `connect`, "55") in `design-system.md` §1/§3/§9 and
`getting-started.md` — a separate count-reconciliation, folded into Phase 3's
docs pass rather than smeared into this naming diff. **Next:** Phase 2 gate.

### Phase 2 — Lock the crosswalk, gate the *class* · **Status:** ☐ proposed (ships with Phase 1)
The gate must catch the class, not the instance. It asserts: (a) each axis human
word matches across **rendered** surfaces (the `concepts.json` field, the mermaid
node text in `concepts.md`/`concepts.mdx`, and the `s:'…'` JS literals in
`ConceptWalkthrough`/`ConceptGraph`/`ConceptLattice`) — not just one JSON field;
(b) **human-word uniqueness** across all concept nodes (so "Layout" can't name two
things); (c) **cross-namespace collision** — no user-facing word equals a live
component name, front-matter key, Substance/Form value, `TAG_GROUPS` term, or
route segment unless sanctioned. Without (c), the Material/backdrop/prose class
ships green.

### Phase 3 — Diagram + author copy · **Status:** ☐ proposed (new branch)
Build `LayoutDiagram.astro` (containment/russian-doll: Deck ▸ Slide ▸ Layout ▸
your content; theme as the outer coat; chrome at the edges), rhyming with
`FormDiagram`, light/dark, responsive, + its page. Rewrite onboarding
(`getting-started`, `introduction`, `authoring`, `overview`) to the layout
lexicon — as **self-consistent slices** (copy sweep first: no author page uses
both "component" and "layout" for the pick; diagram second; title last). **Relabel,
don't move** the reference: keep the `/components/` URL canonical (system register;
~75 static URLs on `lattice.style`, ~15 internal links, README absolute URLs, a
route test, and `AGENTS.md` all depend on it) and change only the human page
**title/nav label** to "Layout reference" + sweep the `SiteHeader`/`ComponentsLayout`
"Components" drawer copy. If a URL move is ever insisted on, it carries enumerated
per-path `redirects` + a same-commit link sweep — not a search alias.
Gate: website screenshots at 1440/820/390 (HARD RULE #23).

### Phase 4 — Contract renames · **Status:** ⏸ deferred (owner gate)
The `finish:` key and the `content` component stay as-is unless a focused, aliased
PR is commissioned. `finish:`→`backdrop:` is **BLOCKED** (`backdrop:` is a live
nested key; top-level is `retired-backdrop-key`-guarded, `lint-core.js:1700`).
`content`→`prose` is **BLOCKED** (`prose` is a Substance value). Floated `body`/
`plain` are **also not collision-clear** and would need their own audit.
Recommendation: keep `finish:`; resolve its mild axis/key overload in docs wording.

### Phase 5 — Surface cleanups · **Status:** ☐ proposed (optional)
`lede`→subtitle, fold `variant` under `modifier`. **`kicker`→eyebrow** and
**`bucket`→category** are NOT doc-only and hit already-taken words (`eyebrow:` is a
live key; `bucket` is a field + route segment) — each needs the collision audit
before adoption. Lower urgency.

## Trio audit — corrections applied (2026-07-20)

An adversarial trio (red team · Munger inversion · independent checker) audited
this record and the plan against source before Phase 1 executed. Verdict: **not
safe to execute Phase 1 as first written.** Cross-confirmed findings, folded in
above: the Form-axis "Layout" overload is already live on a published page
(→ open decision); "Material" collides with the `material` tag dimension
(→ rejected); the Phase 2 gate was scoped to the instance not the class
(→ rescoped to uniqueness + cross-namespace + rendered surfaces); the
`/components/` rename blast radius (→ relabel, not move). Single-lens catches:
`accent:` is not a key and Chart is a 13-member bucket (→ crosswalk fixed); the
Style→Finish fix needs 5 surfaces not 3; stale counts; `body`/`plain` not
collision-clear. Confirmed solid: component=system / zero churn (both directions),
§2.5 ratifies Form=Layout and Finish=Finish, the drift is real, the gate never
reads `human`, the `backdrop:`/`prose` blocks hold.

## Provenance

Design driven by a three-lens analysis (linguist · communication/learning ·
systems/ontology), an adversarial red-team of the naming call (which settled
layout-for-humans / component-for-the-machine), and the full adversarial trio
above (which narrowed the crosswalk to the verified core and rescoped the gate).

## See also

- `design/design-system.md` §2.5 — the two-register law this decision extends.
- `design/concepts.md` / `docs/.../model/concepts.mdx` — the one map (the latter is
  a *published* page; the Form-axis label there is the open decision).
- `engineering/architecture.md` + `lib/concepts/index.js` — the concept model in
  code + the drift gate Phase 2 rescopes.
- `2026-07-15-accent-finish-consolidation.md` — the 7 accent registers (no `accent:` dial).
