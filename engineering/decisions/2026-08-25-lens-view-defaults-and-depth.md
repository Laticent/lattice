---
status: in-progress
summary: >
  Settles three gaps the reader-view feature shipped with. (1) NOMENCLATURE — the register split is
  ratified as policy, not left as a code comment: the MACHINE says lens (front matter `lenses:` /
  `lens-default:` / `_lens`, the Lente API), the HUMAN reads view ("Reader views"). Front matter sits
  in the machine register, so nothing migrates. (2) DEFAULT — `lens-default:` has been parsed,
  inherited, emitted and validated since the feature landed while NO consumer honored it, because the
  consumer it was designed for (a pinned share link) was never built. It is now split in two by name:
  `lens-default:` is the soft LANDING view (falls back to Full, the picker still offers everything),
  and a hard PIN travels on the share/export channel, fails closed, and is labeled as hiding rather
  than withholding. (3) DEPTH — a "deep dive" is not a sibling view next door; views split into RUNGS
  (altitudes in one containment-checked chain, the only ones that offer "go deeper") and CUTS
  (arbitrary subsets — the ask, a redaction — that you land on or pin but never escalate from). The
  shipped set already decomposes this way and nothing named it: brief ⊂ evidence ⊂ full are rungs;
  story and ask are cuts. Containment is what makes "go deeper" honest, and it is also what
  neutralizes the finding that deferred `includes:` in the first place. This PR ships the landing
  lever (Present honors it + a control to set it); the pin, the escalation UI, and `includes:` are
  named follow-up slices.
companion:
  - ./2026-07-13-lente-reader-lenses.md
  - ./2026-08-03-authoring-vocabulary-audit.md
---

# Reader views — the default lever, the depth model, and which word we use (2026-08-25)

> **In one line.** The reader-view feature shipped with a default field nothing reads, no way to
> express depth, and two words for one thing. This note settles all three, ships the smallest of
> them, and specifies the rest.

This is the follow-on to `2026-07-13-lente-reader-lenses.md`, which designed Lente and shipped it.
Everything below either ratifies something that feature already does by accident, or fills a gap it
left open on purpose.

---

## 1. The state of play — what is actually wired

Three findings, each checked against the source rather than the design record.

### 1.1 The default lever exists in the format and is inert everywhere else

`lens-default:` is a complete round trip through the library and a dead end past it:

| Stage | Where | Status |
|---|---|---|
| parse | `docs/src/lib/lente/registry.ts:122` | ✅ reads the scalar |
| inherit | `registry.ts:142` | ✅ falls back to the workspace default, then `full` |
| emit | `registry.ts:270` | ✅ writes it only when the deck deviates from the inherited value |
| validate | `validate.ts:32` | ✅ warns "readers will land on Full instead" |
| **honor** | — | ❌ **nothing** |

`PresentOverlay.tsx:91` hard-codes `React.useState<PresentLens>('full')`. The editor's preview does
the same at `StudioShell.tsx:321`. The registry — `.default` included — *is* passed into Present
(`StudioShell.tsx:4943`) and ignored. Outside Lente the only code that touches `.default` is the
remove-view path resetting it to `full` (`StudioShell.tsx:1035`). No UI writes it: `LensesPanel.tsx`
has no default control.

**Why it was never wired is the interesting part.** The field was designed for a consumer that does
not exist. The original §4 names the hero use case as *"the author sends the board a link at
`lens-default: full` and the exec a link at `lens-default: brief`"* — but `ShareSheet.tsx` and
`share-export.ts` contain zero lens references, and there is no `?view=` parameter anywhere. The
lever had nothing to move.

### 1.2 There is no depth mechanism, and the one that was proposed was deferred with reasons

§5 of the original defers the `includes:` ladder to v2 on two adversarial findings:

- **B2** — a `base:none` view including a `base:all` view balloons `brief` to nearly the whole deck.
- **M1** — approval does not compose: approving a view that includes an unapproved one leaks
  un-reviewed slides.

M1 is weaker now than when it was written: `approvalHash` hashes the **projected pairs**
(`project.ts`), so approving a view already means a human previewed and approved exactly the set a
reader gets, union included. **B2 is the finding that still stands**, and §3 below is built around
neutralizing it rather than restricting around it.

### 1.3 The naming is already decided — for the UI only, and only in a code comment

`StudioShell.tsx:4817` carries the call verbatim:

> *"Titled 'Reader views', NOT 'Lenses': every entry point into this panel says 'Reader views' (the
> drawer row, the activity-bar toggle, the command palette) … 'Lenses' survives as the internal name
> (`lensesBody`, `lens-picker`), which is fine; it just is not what a user is shown (#1211)."*

Every entry point obeys it: the drawer row (`StudioDrawer.tsx:372`), the activity bar
(`chrome-parts.tsx:260`, `caption="Views"`), Present's withheld-view copy
(`PresentOverlay.tsx:77-78`), "Add a reader view" throughout `LensesPanel.tsx`. So the split is real
and consistent — it is just not written down anywhere a future session would look, which is why this
note exists.

---

## 2. Decision 1 — the register split is the policy; front matter is machine

**Two registers, permanently:**

| Register | Word | Surface |
|---|---|---|
| **Machine** | `lens` | front matter (`lenses:`, `lens-default:`), the per-slide `_lens` directive, `@workwel/lente`, every type and function name |
| **Human** | **view** | every string a person reads — panel titles, buttons, menu entries, error copy, and prose in the docs |

**Front matter is in the machine register.** It is typed by an author, which is the argument for the
other answer, but it is a schema first: the key is a stable identifier that `lib/engine/directives.js`
registers, that decks in the wild already carry, and that renaming would break for no functional gain.
Authors already cross this seam without trouble — they write `_class:` while the UI says "component".
Nothing migrates.

**What was rejected, and why:**

- *Migrate front matter to `views:` / `view-default:` / `_view`.* One word everywhere an author reads
  or types. Costs a directive migration (`KNOWN_DIRECTIVES` + `DIRECTIVE_KEYS` + `FLAG_DIRECTIVES`),
  the `notes-core` allowlist, the skill, the tests, and a breaking change for every deck carrying a
  `_lens` tag — to relabel a key, not to change behavior.
- *Say "Lenses" in the UI too.* Cheapest in code, but it re-litigates #1211 and puts a term of art in
  front of an author writing a board deck.

**Two leaks this closes:**

1. `design/skills/lens.md` teaches an author the word "lens" in prose. Its prose now speaks "reader
   view" while documenting the lens-named keys — the split, demonstrated on the page where an author
   first meets it.
2. **`lens` is a homonym in this repo.** The components-reference browser's `lens` is a catalog
   *facet* — how the component list is grouped (`SearchControls.tsx:22`, `component-search.ts:210`).
   Unrelated concept, same word, and it long predates the reader-view feature. It is not worth
   renaming; it is worth knowing about before a grep for "lens" produces a confusing map.

---

## 3. Decision 2 — `lens-default:` is a landing view; a pin is a different thing

One scalar was being asked to mean two things, and the ambiguity is why it was easy to leave unwired.

| | **Landing view** | **Pinned view** |
|---|---|---|
| What it says | where a reader *starts* | what a reader may *see* |
| Picker | still offers every eligible view | withheld |
| Ineligible target | falls back to `full` | fails closed — "unavailable" |
| Lives in | the deck (`lens-default:`) | the share/export channel, not the deck source |
| Honest claim | a convenience | UI integrity, **not** confidentiality |

The distinction is load-bearing, because the correct failure behavior is *opposite* in each case.
Falling back to `full` is safe for a landing view — the reader could have picked `full` from the
picker anyway, so nothing is revealed that was not already one click away. Falling back to `full` for
a pin is precisely the leak the fail-closed rule exists to prevent, since a pinned view can be a
deliberate redaction.

**The landing default therefore fails soft, without weakening the fail-closed projection.** It does
so by resolving eligibility *before* selecting: an ineligible `lens-default:` is never set as the
active view, so the projection never has to fail open. `PresentOverlay`'s existing invariant — every
non-`full` id routes through `lensEligibility` — is untouched. That comment already anticipated this
case, listing "a future pinned-link default" among the ids that must fail closed; resolving at
selection is what keeps both properties true at once.

**On the honesty of a pin.** The original's 2026-07-18 correction stands and constrains what the pin
may ever claim: client-side projection **hides, it does not withhold**. A reader who views source
sees every non-member slide's bytes. A pinned link is a promise about a cooperating renderer, not a
confidentiality boundary, and the UI must say so where the author creates one. Real redaction needs
the host to project server-side and never ship non-member slides — outside a pure, no-network
library.

---

## 4. Decision 3 — depth is rungs and cuts, and only rungs have a "deeper"

### 4.1 The insight: the shipped set is already two different kinds of thing

A "deep dive variant" is not a sibling view next door. It is the same argument with its backing —
which means it is *parented*, and it means going deeper must never take a slide away.

That is the property that separates the shipped views into two families. Reading the rule table in
`suggest.ts` against the component classifications in `dist/docs/components.json` — and now pinned by
`docs/src/components/studio/lens-containment.test.ts`, which asserts each relation below against
those same two sources on every PR:

- **`brief` ⊆ `evidence`.** Brief takes anchor bookends, non-`connect` statements, and `kpi`/`stats`.
  Evidence drops only `imagery`, `connect` statements, and anchor **dividers**. Bookends are not
  dividers; `kpi`/`stats` classify as `function: evidence`. Nothing brief keeps, evidence drops.
- **`brief` ⊄ `story`.** Story takes anchors, `progression`, and the first non-anchor slide. Brief's
  `kpi`/`stats` are none of those.
- **`story` ⊄ `evidence`.** Story deliberately keeps chapter **dividers**; evidence deliberately drops
  them. Neither contains the other.

So:

| Family | Members today | Property |
|---|---|---|
| **Rungs** | `brief` ⊂ `evidence` ⊂ `full` | ordered by altitude; each contains the one below |
| **Cuts** | `ask` (one slide), `story` (a narrative slice) | arbitrary subsets; no containment, no order |

The product already curated this without naming it: `STARTER_ARCHETYPE_IDS` ships exactly `brief` and
`evidence` — **the two rungs** — leaving both cuts as opt-in additions.

### 4.2 What follows

**Only rungs offer "go deeper."** A cut is something you land on or pin; escalating from it is
meaningless (there is no altitude above "the ask"). Offering the affordance everywhere is how you end
up with a button that promises more and delivers a different four slides.

**Containment is the invariant, and it is what makes the affordance truthful.** Going deeper is
guaranteed additive: a reader never loses a slide they just read. A bare `deeper: <id>` pointer with
no containment rule — which is where an earlier draft of this note stopped — buys the same button and
none of the guarantee, and lets an author wire `brief → ask` where "deeper" drops four of five slides.
That is not a smaller version of this design; it is the design without the part that makes it honest.

**A chain, not a tree.** One ladder per deck, so "go deeper" is one unambiguous step. A tree (`brief`
with both a finance and a technical deep dive) is more expressive, but it turns the affordance back
into a menu — re-opening the choice-overload fork R3 closed — and multiplies approval units.

**A rung is authored as a delta — constrained `includes:`.** A rung declares its parent and tags only
what it *adds*. This is the reversal of §5's deferral, on a specific ground: **containment is what B2
was missing.** B2's attack is a cross-polarity include (`base:none` including `base:all`) ballooning
an additive view to the whole deck. Under containment that include is not a dangerous-but-legal
configuration to be restricted case by case — it is a violation of the ladder invariant, rejected by
the same rule that makes the UI truthful. One rule, both jobs. And it answers R6 (per-slide tag
maintenance can exceed the cost of just making a second deck), which independently-tagged sibling
views do not: a rung is tagged once, as a diff.

**The costs, stated plainly.** Each rung is its own approval unit with its own hash, and because a
rung's projection contains its parent's, editing a slide in `brief` de-approves `brief` **and every
rung above it**. That is correct — the approved content genuinely changed — and it is a real tax that
argues for two or three rungs, never five. It is also the reason this is specified here and built
later, behind a deck that actually wants it.

---

## 5. What ships now, and what is a named slice

Deliberately small. `lens-default:` has had zero consumers since it landed; the honest first move is
to give it one and let a real deck exercise it before adding a depth vocabulary on top.

**In this PR:**

1. **Present honors the landing view.** Resolved on each open transition, eligibility checked before
   selection, `full` on any miss. Landing on a non-`full` view starts at the top of *that view* rather
   than the editing cursor — the cursor slide may not be a member, and Present under a landing view is
   the reader's experience, not the author's.
2. **A control to set it**, in the Reader views panel: one deck-level "Readers land on" select, plus
   an honest inline note when the chosen view is not currently reader-eligible.

**Named follow-up slices** (each its own PR, HARD RULE #17):

| Slice | What |
|---|---|
| **A3 — the pin channel** | A share/export handoff that carries one view, withholds the picker, fails closed, and states the hides-not-withholds caveat where the author creates it. Touches the export pipeline → export byte sign-off applies. |
| **Rungs + cuts in the schema** | `kind` on `LensDef`, the ladder order, and the containment validator. |
| **`includes:` for rungs** | Delta authoring, gated on the containment invariant. |
| **The escalation affordance** | "Go deeper" in Present, offered only on rungs. |
| **Workspace landing default** | `WorkspaceLensConfig.default` is parsed and inherited but has no UI; the shipped value is `full`. |

---

## 6. What is unverified

- **The containment decomposition is now pinned, but only over the SUGGESTER.**
  `docs/src/components/studio/lens-containment.test.ts` asserts `brief ⊂ evidence ⊂ full` and the two
  non-containments that make `story` a cut, against the real rule table and the real 61-component
  catalog — and it runs on the merge gate (`docs-build`), so a drift in either source fails there
  rather than rotting this note. What is **still** unverified: nothing enforces containment for
  **author-tagged** membership, so a person can tag arbitrarily and produce `brief ⊄ evidence` in
  their own deck. That is the follow-up slice's validator, not something this note can claim.
- **The tagging tax (R6) is still unmeasured.** The `includes:` decision above is argued from the
  shape of the problem, not from a count on a real multi-view deck. If a deck ever carries a ladder,
  count it.
- **No adversarial trio ran on this note.** The original design was hardened by the full trio; this
  follow-on was not. The two decisions with real blast radius — the pin channel and `includes:` — are
  specified here but not built, so the trio applies to them when they ship, per HARD RULE #25.
