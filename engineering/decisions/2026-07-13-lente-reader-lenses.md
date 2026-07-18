---
status: proposed
summary: >
  Lente — a framework-free, deterministic READER-LENS library that lets ONE canonical deck be
  read at several honest altitudes (full / brief / the-ask / story / evidence) without ever
  editing the source. Today's reader lens (docs/src/components/studio/lint.ts presentationPairs)
  is a fixed full/exec/onepager heuristic held as ephemeral React state: it is deterministic but
  the AUTHOR cannot control which slides belong, and two AI "Reshape" chips REWRITE the deck
  source in place with no review — the out-of-the-loop behavior a stakeholder cannot accept.
  DECISION: membership travels ON each slide as an approved <!-- _lens: … --> tag; a front-matter
  lenses: block is the registry (label / order / base / approved); a deterministic, transparent,
  NO-AI suggester only PROPOSES membership and the author APPROVES a lens by previewing the
  reader's actual deck, not by ticking a matrix. The human gate is a LIBRARY invariant, not
  Studio discipline: the read path refuses to project an unapproved (or content-drifted) lens for
  EVERY consumer (Studio, export, share link, headless), and it cannot even import the suggester.
  Ships as @slidewright/lente (docs/src/lib/lente/), the fourth spin-off-able sibling beside
  Cadenza / Vetrina / Suono — curated index, co-located tests, import-boundary gate. This doc is
  the DESIGN, hardened by the full adversarial trio (red-team + Munger inversion + independent
  checker); the library, the Studio panel, and the one export-pipeline directive touch are named
  follow-up slices, each its own PR (HARD RULE #17). Chosen via the design-competition workflow
  over three rival framings (Minto/BLUF, Duarte narrative, Information Foraging).
companion:
  - ./2026-07-05-vetrina-walkthrough-library.md
  - ./2026-07-08-library-shape-cadenza-vetrina.md
  - ./2026-07-12-suono-audio-library.md
  - ./2026-06-21-app-redesign.md
---

# Lente — deterministic, human-approved reader lenses (2026-07-13)

> **What it is.** A deck is written once. Different readers open it for different jobs — the
> executive wants the bottom line, the auditor wants the data, the skeptic wants the story.
> **Lente** is a pure function `(slides, registry, lensId) → ordered slide subset` that projects
> the *same* source at the altitude a reader chooses. Membership lives on each slide as an
> **author-approved** comment tag; nothing a machine suggested reaches a reader until a human has
> looked at that reader's actual deck and said yes. It owns no model, no network, no key, and no
> idea what a "good" deck is — it just filters slides a human vetted. (*lente*, Italian: lens —
> matching *vetrina* "shop window".)

**This doc is the DESIGN, not the code.** It is the winner of a four-way design competition
(Minto/BLUF · Duarte narrative · Information Foraging · Role/decision-task), then hardened by the
full adversarial trio required for high-blast-radius work (HARD RULE #25). The library
(`docs/src/lib/lente/`), the Studio **Lenses** panel, and the single export-pipeline directive
registration are **named follow-up slices below**, each its own PR.

> **Correction (2026-07-18) — two claims below overstated the guarantee; the code + README now
> read true, and the design record is corrected here rather than rewritten in place.** A second
> adversarial-trio pass over the shipping libraries found:
>
> 1. **§6.2 — the content hash detects DRIFT, not FORGERY.** `approvalHash` is an *unkeyed* SHA-256,
>    so any actor that can write the deck source can recompute a matching digest. It therefore
>    de-approves a lens on any edit/reorder/retag (the real, useful property), but it does **not**
>    by itself answer "did a human vet *this* deck?" against a source-writer (e.g. the AI-Reshape
>    path). The human-in-the-loop assurance is the **Approve gate** (a person looked and clicked),
>    not a cryptographic property. Wording like "hand-forgery makes it mismatch" / "defeats forgery"
>    is retired. (A *keyed* HMAC/signature would be needed for a true forgery proof — a possible
>    future slice, not claimed today.) The same pass also fixed a real bug: the old pre-image
>    (`${index} ${slide}` joined by `\n`) was **non-injective** and could collide (fail-OPEN); it is
>    now an injective JSON encoding.
> 2. **§6.3 — client-side projection HIDES, it does not WITHHOLD.** Filtering an array the client
>    already holds is `display:none`, not redaction: a `brief` reader who views source sees every
>    non-member slide's bytes. Fail-closed is a UI-integrity guarantee (a cooperating renderer won't
>    over-show), **not** confidentiality. Real redaction requires the host to project server-side and
>    never ship non-member slides — outside this pure/no-network library. The "redaction" /
>    "confidentiality breach" framing is scoped accordingly.

---

## 1. Why this exists — deterministic, but not the author's

Every reader lens in Lattice today runs through `presentationPairs` in
`docs/src/components/studio/lint.ts:92`: a pure heuristic that keeps slides whose `_class` is a
"headline" component (`title`, `kpi`, `stats`, `big-number`, `closing`). It is **already
deterministic** — same deck in, same subset out, no AI. Three things are wrong with it:

1. **The author cannot control it.** Membership is hard-coded in the function. There is no way to
   say "this slide belongs in the exec view and that one doesn't."
2. **It is ephemeral.** The lens is `React.useState('full')` (`PresentOverlay.tsx:51`,
   `StudioShell.tsx:191`), reset on every open, never persisted, never travels with the deck.
3. **The "dynamic" part is genuinely out-of-the-loop.** The two AI "Reshape" chips
   (Technical / Narrative) in the Architect card call a model and **overwrite the deck source in
   place** — `runArchitectAction → setSource`, `StudioShell.tsx:1162`, no diff, no review. An
   unbuilt proposal (`2026-06-21-app-redesign.md` §6.2) would have an AI *regenerate* `deck.lenses[]`
   whenever the source changed. **That is the behavior this design exists to replace** — the
   stakeholder requirement is that a human decides what a reader sees, every time.

The fix is not "make it deterministic" (it already is) — it is **"make it the author's, and prove
the human is in the loop no matter how the deck is consumed."**

---

## 2. The organizing idea, and an honest word about the science

A reader opens a deck to accomplish a **task** (approve, audit, be persuaded, brief up) at a
**depth appetite** (how much effort they'll spend right now). Those two axes — task-based
information seeking (Wilson 1999; Vakkari 1999) and Need-for-Cognition / the Elaboration
Likelihood Model (Cacioppo & Petty 1982/1986), reinforced by Fuzzy-Trace Theory's gist-vs-verbatim
split (Reyna & Brainerd 1995) — are drawn from replicated communication science, and neither is a
personality type. The design **never profiles or classifies the reader**: it exposes self-selected
task+depth *affordances* and lets the reader pick. It leans on **nothing** from VARK learning
styles (no evidence — Pashler et al. 2008) or MBTI typing.

**The honest framing (hardened per the inversion, Regret 5).** The literature is a *consistency
check, not a derivation*. Three independent design tracks in the competition — one built on
Minto/BLUF, one on Duarte narrative, one on Information Foraging — converged on nearly the *same*
lenses from unrelated theories. That convergence tells us the lenses are **pre-theoretical folk
categories that decks are actually consumed as**, and the science is reassurance that they're
sound, not the thing that generated them. The per-slide *membership rules* in §4 have **no
scientific backing at all** — they are transparent heuristics about component meaning, judged by
one metric: **how many cells the author has to fix**. The doc says this plainly so a domain-aware
reader is not sold rigor the rules don't have.

### The eight reader types → the lens set

| Reader wants… | Task | Depth | Lens |
|---|---|---|---|
| bottom-line · so-what · TLDR · executive summary | "brief me" | low / gist | **brief** |
| the ask | "what am I deciding" | task role, gist | **ask** |
| story · problem statement | "walk me through why" | medium | **story** |
| technical depth | "prove it" | high / verbatim | **evidence** + **full** |

Four folk types collapse into `brief`; two into `story`; technical depth fans across `evidence`
(the auditor's fast path) and `full`. **Honest limitation:** "problem statement" is folded into
`story`, but a problem-statement reader really wants the *Complication* (the pain / stakes / why-now),
which `story` dilutes across the whole arc. v1 ships them as one lens and records this as a known
compromise; §11-D carries the split as an open fork.

---

## 3. Schema — per-slide tag + front-matter registry

Two carriers, matching the locked constraint: **membership travels on the slide; front matter is
the registry.**

### 3.1 Per-slide tag — `<!-- _lens: … -->`

A slide declares membership as a space-separated, **lowercase** token list in an HTML comment,
mirroring the `_class` grammar authors already know (`CLASS_RE`, `lint.ts:44`):

```markdown
<!-- _class: kpi -->
<!-- _lens: brief ask -->
# Revenue up 38% YoY

---

<!-- _class: diagram -->
<!-- _lens: -evidence -->      # exclude this slide from the base:all `evidence` lens
# System topology
```

- A positive token (`brief`) **includes** the slide in that lens (meaningful for a `base: none`
  lens).
- A `-token` (`-evidence`) **excludes** it (meaningful for a `base: all` lens).
- A slide carries a token **only where its membership differs from the lens's base**, so real decks
  stay clean; the review UI writes the shortest correct form.
- **Case is locked to lowercase** (`_lens`, not `_Lens`) — see the engine touch in §7, finding M5.

### 3.2 Front-matter registry — the `lenses:` block

A nested inline-flow-map block, parsed by a reader modeled on the **existing**
`parseFinishOverride` (`front-matter.ts:113`, which already parses `key: { a: b }` — verified,
and the basis on which competing Track 2 was refuted):

```yaml
---
title: Q3 Board Review
lens-default: brief                # the lens a shared/pinned link opens in (default: full)
lenses:
  brief:    { label: "Bottom line",  base: none, approved: "sha256:…" }
  ask:      { label: "The ask",      base: none, single: true, hidden: true }
  story:    { label: "The story",    base: none, hidden: true }
  evidence: { label: "Show the work", base: all, hidden: true }
---
```

Per-lens fields: `label` (relabel; the **id** is fixed — see M6), `base` (`none` additive |
`all` subtractive), `single: true` (first member only — the `ask`), `hidden: true` (defined but
kept out of the reader's picker — author staging), `order: N`, and **`approved: "sha256:…"`** — a
**content hash**, not a boolean (§6). `full` is implicit, always present, un-removable, always
reader-eligible. **`includes:` is NOT in v1** (§5, deferred).

### 3.3 Workspace defaults + per-deck opt-out

- **Workspace config** (`slidewright.workspace.json`, or a `lenses` key in the workspace-settings
  store) ships the five lens *definitions* with house labels, bases, and suggester rules. A deck
  with no `lenses:` block inherits the definitions — but inherited lenses arrive **unapproved**, so
  a reader still sees only `full` until an author approves.
- **Per-deck override** merges by id (field-by-field); `evidence: { drop: true }` removes an
  inherited lens for this deck; a top-level `lens-defaults: off` scalar opts the deck out of all
  workspace lenses. This is the per-deck opt-out.

---

## 4. Default lens set + deterministic suggester

Each rule is a **pure function of `_class` + slide structure**, keyed off the component catalog at
`dist/docs/components.json`, whose `function` field is a verified 7-value axis
(`anchor · statement · evidence · comparison · inventory · progression · imagery`). **No AI, no
model call.** Determinism is scoped to a catalog version (§6, finding m5).

- **full** — identity. Every slide, author order. Un-removable, always reader-eligible, the safe
  base view.
- **brief** — `base: none`. Suggest if: `function == anchor && form == bookend` (title/closing),
  OR `function == statement` **excluding `bucket == connect`** (the contact/wifi carve-out —
  finding m4/checker), OR name ∈ {`kpi`, `stats`}. Exclude dividers and all detail. (Superset of
  today's `exec` set; the review grid surfaces the *added* cells.)
- **ask** — `base: none, single: true`. Suggest exactly one, first match: last `closing`, else a
  `decision` component, else top metric (`big-number` > `kpi` > `stats`), else — **nothing**.
  **If no confident match, the suggester emits NO slide and the UI shows "no clear ask found — tag
  one," never a default-to-title guess** (finding, inversion R5). Generalizes today's `onepager`.
- **story** — `base: none`. Suggest if: `function == anchor` (adds `divider` — the one lens that
  keeps chapter frames), OR `function == progression` (`list-steps`, `timeline-list`, `roadmap`,
  `journey`, `gantt`), OR it is the first non-anchor slide (the problem/context setup).
- **evidence** — `base: all` (subtractive; keeps most slides). Suggest EXCLUSION if:
  `function == imagery`, OR `function == statement && bucket == connect`, OR
  `function == anchor && form == divider`.

**Default reader-VISIBLE set is `full` + `brief` only** (hardened per inversion R3). `ask`, `story`,
and `evidence` ship `hidden: true` — defined, suggestible, one click from visible, but not thrust
on every reader as a five-way picker (choice overload with no evidence readers switch). The hero
use case is **author-distributes-a-pinned-view**: the author sends the board a link at
`lens-default: full` and the exec a link at `lens-default: brief`. That gives the author's tagging
labor a guaranteed consumer (the link they send) instead of betting on reader discovery. §11-A
carries "how many lenses ship visible" as an open fork.

---

## 5. Deferred to v2 — the `includes:` inheritance ladder

Track 1's `includes:` ladder (a lens unions in another lens's members, so one tag inherits down
nested lenses) was the best *ergonomics* idea in the competition and is why it graded 7/10. **It is
deferred from v1** because the adversarial trio found it concentrates almost all of the design's
danger, and its payoff shrinks once the default reader-visible set is two lenses (§4), not a
five-level pyramid:

- Cross-polarity union (`brief` includes `evidence`) silently balloons an additive lens to nearly
  the whole deck — the opposite of "brief," and a confidentiality leak (red-team **B2**).
- Approval does not compose: approving `brief` that `includes` an unapproved `draft` leaks
  un-reviewed slides to readers (red-team **M1**).
- `rebaseLensTags` on a base flip drops inheritance-only members (red-team **M2**).
- Cycles can form only across the workspace/deck merge, escaping a pre-merge check (red-team **m2**);
  `includes: full` silently equals the whole deck (**m3**).

If v2 revives it, the required guardrails are: reject `includes` on OR targeting a `base: all`
lens; require **every lens in the transitive closure to be approved** before the outer lens is
reader-eligible; validate the **merged** registry for cycles with a visited-set; materialize
inherited members into explicit tags before any base flip. Until then, a nested lens is expressed
by tagging its slides directly — more tokens, but no undefined semantics.

---

## 6. The human-in-the-loop contract — a LIBRARY invariant, content-bound

This is the core requirement and the axis the winning design led on. It has three parts, each
hardened by the trio.

**(1) Eligibility lives in the library, not the Studio.** A non-`full` lens is reader-eligible
**only** when its `approved` hash is present *and matches the current content*. The read path splits
into two functions with different jobs, and the distinction is load-bearing: `lensPairs` is the raw,
author-side projection — a predicate filter that returns a lens's membership *without* an approval
check (it fails OPEN, so the author can preview an unapproved lens to decide whether to approve it).
`lensEligibility` is the READER gate — it wraps `lensPairs` and returns `{status:'unavailable', reason}`
for any lens that is unapproved, content-drifted, hidden, or empty, projecting slides ONLY when the
lens is genuinely eligible (it fails CLOSED). Every reader consumer (`PresentOverlay`, export, share
link, headless) MUST route through `lensEligibility` — calling `lensPairs` directly on the reader path
would leak an unapproved lens. The read path and the suggester are **different modules in different
files, and the core never imports the catalog**, so the heuristic physically cannot write its own
approval. This holds off-Studio, which is where a boolean-in-Studio gate would have failed.

**(2) `approved` is a content hash, not a boolean** (hardened per inversion R2). A bare
`approved: true` is forgeable plaintext — any hand edit, paste, or the Studio's own AI chat
(`setSource`) can type it, and in a codebase that threat-models AI-generated and shared untrusted
decks (HARD RULE #22) that makes the guarantee hollow. Instead, Approve writes
`approved: "sha256:<hash of the resolved membership + the body text of every member slide>"`. At
read time the eligibility check recomputes the hash; **any post-approval edit, reorder, or
hand-forgery makes it mismatch, and the lens de-approves itself** — automatically, for every
consumer, with no Studio involvement. This is the only version of "approved" that survives a
domain-aware stakeholder asking "did a human actually vet *this* deck?"

> **Implementation note (slice 1, maker-checker).** The shipped `approvalHash(slides, reg, lensId)`
> deliberately does **not** fold the catalog version into the digest (the earlier draft above said
> "+ catalog version"). The read path is a pure function of the approved tags + base and never touches
> the catalog, so a reader's view is catalog-independent; binding the catalog version would spuriously
> de-approve a lens on every reclassification even when the reader's slides are byte-identical.
> Catalog-staleness ("classification changed since you approved") is surfaced by the *suggester* on
> re-run, not by revoking an unchanged reader view. The maker-checker pass confirmed this closes no
> hole. Reader-view membership scanning also skips fenced code blocks, so a deck that *documents*
> `_lens`/`_class` syntax inside a ` ``` ` fence is never falsely tagged.

**(3) Fail CLOSED, visibly — never silently to `full`** (hardened per red-team M4). A scoping lens
is often a *redaction* (the brief deliberately omits appendix/backup slides). Silently substituting
the **full** deck when a lens is empty/unapproved/drifted would show a `brief` reader everything the
author kept out — a confidentiality breach dressed as a fallback. For a lens the reader **explicitly
selected**, Lente returns an explicit **"this view is unavailable"** state that the reader UI
surfaces, not a silent full deck. (`full` remains the default a reader *lands* on, which is safe
because it's the author's whole deck by definition.)

Empty lenses (author rejected every suggestion) are not reader-eligible; `readerLenses` omits them;
`validateRegistry` asserts `lens-default` never names an empty/hidden/unapproved lens, **re-checked
at read** (finding m7), not only at approve.

---

## 7. The one engine touch — register `_lens`, and sign off the bytes

An untagged `<!-- _lens: … -->` comment **leaks into exported HTML/PDF** — verified: an unknown-key
comment is *retained* (`directives.js:135`, `if (!KNOWN_DIRECTIVES.has(key)) return full`). That
would leak internal lens membership into any shared file. The fix, and its full requirements:

1. Add `'lens'` to `KNOWN_DIRECTIVES` (`directives.js:31`) but **not** `APPLIED_DIRECTIVES` — a
   known key is *stripped* from the body (`directives.js:139`), so it never reaches markdown-it and
   is never a `<section>` attribute. Zero output bytes.
2. **Also add `'lens'` to `DIRECTIVE_KEYS`** (`docs/src/components/studio/slide-directives.ts:17`)
   — a parity test asserts set-equality (`slide-directives.test.ts:34`), so omitting this is
   **build-breaking** (independent checker, the one blocking omission in the raw design).
3. **Also add `'lens'` to `FLAG_DIRECTIVES`** (`directives.js:58`) so the degenerate bare form
   `<!-- _lens -->` (no colon) strips as empty instead of leaking (red-team **M5**); and lock
   Lente's tag matcher to lowercase so `<!-- _Lens: … -->` can't both leak and silently drop
   membership.
4. This changes the **bytes of an exported artifact**, so per the QUALITY BAR it is **not**
   auto-shippable: render a representative deck in **dark and light** mode and produce an
   **export-byte diff** (expected: zero delta, since the tag strips) for human sign-off, with tests
   covering the bare and case-variant forms.

Note (red-team m8): registering `lens` also strips any *prose* `<!-- lens: … -->` comment (a deck
literally about camera lenses) that previously survived. Low probability, documented behavior change.

---

## 8. Library API — `@slidewright/lente`

Framework-free, zero-dep, pure; its own package + import-boundary gate + co-located tests +
companion doc — the fourth spin-off sibling on the **Cadenza / Vetrina / Suono** template
(`docs/src/lib/vetrina/`, boundary gate `checkVetrinaBoundary`/`VETRINA_DIR`,
`tools/check-ownership.js:1496` — with `checkSuonoBoundary` proving the pattern repeats). Lives at
`docs/src/lib/lente/`.

```ts
// ── core data model ──────────────────────────────────────────────────
export type LensBase = 'none' | 'all';
export interface LensDef { id: string; label: string; base: LensBase;
  single?: boolean; hidden?: boolean; order?: number; approved?: string; } // approved = content hash
export interface LensRegistry { lenses: LensDef[]; default: string; }       // includes implicit 'full'
export interface LensSlide { slide: string; index: number; }                // index = ORIGINAL author 0-based
export interface ComponentInfo { bucket: string; function: string; form: string; }
export type ComponentCatalog = ReadonlyMap<string, ComponentInfo>;          // injected — core stays repo-agnostic

// ── read path — pure, deterministic, NEVER imports the suggester ─────
export function parseLensRegistry(fm: string, workspace?: WorkspaceLensConfig): LensRegistry;
export function parseSlideTags(slideSrc: string): { include: Set<string>; exclude: Set<string> };
export function lensPairs(slides: string[], reg: LensRegistry, lensId: string): LensSlide[];  // THE CORE
export function lensSlides(slides: string[], reg: LensRegistry, lensId: string): string[];
export function lensIndices(slides: string[], reg: LensRegistry, lensId: string): number[];
export function readerLenses(slides: string[], reg: LensRegistry): LensDef[];
export function validateRegistry(slides: string[], reg: LensRegistry): Diagnostic[];
export function unknownLensTokens(src: string, reg: LensRegistry): string[]; // Graft 3 — mirrors unknownComponents

// ── suggest path — a SEPARATE module; pure, NO AI, returns proposals, writes nothing ──
export interface Suggestion { index: number; lensId: string; member: boolean; reason: string; }
export function suggestMembership(slides: string[], reg: LensRegistry, catalog: ComponentCatalog): Suggestion[];

// ── writers — pure string transforms the UI calls ONLY on Approve ────
export function applyTag(slideSrc: string, lensId: string, member: boolean, base: LensBase): string;
export function emitRegistry(reg: LensRegistry): string;   // Lente's OWN inline-flow-map emitter (§ finding B1)
export function upsertLensRegistry(fm: string, reg: LensRegistry): string;
export function approvalHash(slides: string[], reg: LensRegistry, lensId: string, catalogVersion: string): string;
```

**`lensPairs` MUST be a predicate-filter over the author-ordered slide array** — the single most
important invariant to lock with a test (red-team, "verified safe"): implemented as a filter, the
`{slide, index}` pairs are unique and in author order, so number-keyed captions stay correct even
under reordering; implemented as concatenation of per-lens member lists, it would duplicate and
reorder. A co-located test asserts no duplication and monotonic author indices.

**Registry ownership (Graft 2, hardened per red-team M3).** Lente is the **sole writer** of the
`lenses:` block, with a `parseLensRegistry(emitRegistry(x))` round-trip test and a
**preserve-unchanged-on-unparseable** rule. Honest boundary: the block still flows through the
shared `parseFm`/`emitFm` (`front-matter.ts:36/66`) on every *unrelated* front-matter edit, which
is lossless **only** for a canonically-shaped block (bare `lenses:` header + strictly-indented
children). So Lente emits only the canonical shape, and the migration routes front-matter writes
through Lente when a `lenses:` block is present rather than claiming the generic writer can't touch
it. `emitRegistry` is Lente's own flow-map emitter — **not** `setFrontMatterBlock`, which emits
scalar children and would stringify a lens def to `"[object Object]"` (red-team **B1**).

`index.ts` curates the surface; a `checkLenteBoundary` gate (mirroring `VETRINA_DIR`) fails the
build if core reaches outside the folder.

---

## 9. Studio UX — suggest → preview → approve (approval is a decision about the deck)

Replaces the Inspector's **Reshape** card (`StudioShell.tsx:~1493`) with a deterministic **Lenses**
panel. Hardened per inversion R1 (approval theater) and R4 (don't delete a capability):

1. **Registry editor** — the lens rows: editable `label`, `base` toggle, visibility, drag-reorder,
   add/remove/per-deck-drop. Writes the block via `upsertLensRegistry`. A base flip runs
   `rebaseLensTags` through the diff/approve flow (§6), never a silent invert. Lens **id** is fixed
   (only `label` is editable) — renaming an id would orphan every tag; an id change ships as an
   explicit rewrite migration, not an inline edit (red-team m6).
2. **"Suggest membership"** → runs `suggestMembership` (instant, no model, no spend). Nothing
   persists.
3. **Review — the unit of approval is the reader's DECK, not a cell.** The primary artifact is a
   **live preview of each lens's actual filmstrip / Present view** using the proposed-but-unapproved
   membership — the author *sees the 8 slides, in order, the exec will see*. The proposal grid
   (rows = slides, cols = lenses, per-cell ✓/✗ + one-line reason) is a **drill-down for "why," not
   the consent artifact**, and suggester-matched cells are **not pre-checked as consent** — a
   pre-filled ballot is a rubber stamp. Humans judge "these 8 slides" far better than 240 booleans.
4. **Approve — per lens, gated on having previewed it.** The button for a lens unlocks only after
   its preview has been rendered once ("You've previewed Brief's 8 slides → Approve Brief").
   Approve writes the minimal tags via `applyTag` and the `approved` **content hash** via
   `upsertLensRegistry`. Fully reversible — it's ordinary source text. Until Approve, no reader sees
   the lens (enforced in the library, §6).
5. **AI voice-rewrite is kept, behind a diff gate — NOT deleted** (inversion R4). The
   Technical/Narrative chips do something Lente structurally cannot: they *rewrite slide prose into a
   different voice*, where Lente only *subsets existing slides*. They are a different axis, not a
   thing lens-filtering replaces. The fix for their out-of-the-loop problem is to route
   `runArchitectAction` through the **existing DiffCard review gate** (`StudioShell.tsx:~1481`) so
   the author approves the rewrite diff — the same human-in-the-loop principle, applied to the
   *editing* axis. A zero-config **instant `brief`/`ask` preview for the AUTHOR** (today's
   exec/onepager convenience) is preserved, decoupled from the reader-eligibility gate: Approve
   governs what *readers* get, not what the author can glance at.

---

## 10. Migration — preserve the caption coupling by construction

The `captions:` contract is protected structurally: `lensPairs` returns `{slide, index}` with
`index` = the author 0-based position assigned *before* any filter, identical in shape to today's
`presentationPairs` (`lint.ts:92`). So `PresentOverlay.tsx:132`'s
`fmCaptions.get((setIndices[i] ?? i) + 1)` keeps resolving number-keyed captions under any lens —
unchanged, and robust even to reordering because it resolves by the carried author index, not
position (red-team, "verified safe").

Slices, each its own PR (HARD RULE #17):

1. **Engine touch** — the three allowlist edits (`KNOWN_DIRECTIVES`, `DIRECTIVE_KEYS`,
   `FLAG_DIRECTIVES`) + lowercase lock, shipped with the **export-byte sign-off** (§7). Add a
   `version`/content hash to `dist/docs/components.json` (it has none today — red-team m5) so the
   suggester's determinism-at-approval story is implementable.
2. **Land `lente`** — read core (eligibility + content-hash + fail-closed rules), suggester,
   writers, `unknownLensTokens`, with co-located tests: the predicate-filter/author-index invariant,
   empty-lens & unapproved-lens & drifted-hash fallback, `+x`/`-x` contradiction check (red-team m1),
   round-trip, and preserve-unparseable.
3. **Adapter shim** — keep `presentationSet`/`presentationIndices`/`presentationPairs` signatures
   delegating to `lensSlides`/`lensIndices`/`lensPairs`; widen `PresentLens` from
   `'full'|'exec'|'onepager'` to `string`. Replacing the static `export const LENSES`
   (`lens-picker.tsx:11`) with a registry-derived list is a static→dynamic conversion touching every
   lens-switching surface — a real slice, not "one import line" (red-team m9).
4. **Retire the ephemeral heuristics** — `exec` → `brief` (a superset the author one-click accepts;
   parity is "exec's slides are a subset," not pixel-identical), `onepager` → `ask`. Legacy decks
   (no tags, no block) see **only `full`** until a first Approve — the library enforces it, closing
   the exact out-of-the-loop gap where `exec`/`onepager` filtered with no author consent.
5. **`CHANGELOG.md` `## Unreleased`** — the new lens system + the AI-Reshape-behind-diff change; lead
   `**Breaking:**` for the `PresentLens` widening.

**Who this is for** (inversion R6): a deck **reused across audiences with small edits** — the sweet
spot where tagging labor pays off. A render-once deck needs no lenses; a heavily-churned deck should
expect to re-review. The doc names this so success isn't measured on decks the feature was never for.

---

## 11. Product forks — DECIDED (2026-07-13, product owner)

The four product-shaping calls the trio surfaced are now resolved; each landed on the recommended
path, and the doc body above already reflects them.

- **A — How many lenses ship reader-VISIBLE → `full` + `brief` only.** `ask`/`story`/`evidence` are
  defined and suggestible but `hidden`, one click from visible. Fewer options, less triage tax; the
  pinned-link use case (§4) carries the value.
- **B — `approved` storage → content hash (§6.2).** `approved: sha256(membership + member slide
  bodies + catalog version)`; any later edit or hand-forgery de-approves the lens for every consumer.
  The boolean alternative was rejected as forgeable and staleness-blind — weakest on the exact axis
  the stakeholder is judging.
- **C — AI voice-rewrite → keep, behind the diff gate (§9.5).** The Technical/Narrative chips route
  through the existing DiffCard review rather than auto-applying; deleting them was rejected because
  prose-rewrite is a capability lens-filtering cannot replace.
- **D — problem-statement reader → fold into `story` for v1.** One `story` lens ships, with the
  Complication-dilution limitation recorded (§2); a distinct `problem` lens remains a possible v2
  addition if that reader proves under-served.

---

## 12. Adversarial-review ledger

Chosen by the `design-competition` workflow (4 tracks — Minto/BLUF, Duarte narrative, Information
Foraging, Role/decision-task — each internally iterated, fresh-critic-folded, one shared
fact-checker, comparative judging). Winner: the Role/decision-task + Need-for-Cognition track (9/10),
zero refuted claims in the fact-check (the three refutations landed on the losing tracks). Grafts
adopted from the runners-up: Track 1's `unknownLensTokens` validator (Graft 3) and Track 3's
sole-writer registry ownership (Graft 2); Track 1's `includes:` ladder (Graft 1) deferred (§5);
Track 3's `order: scent` **reordering rejected** (it breaks the caption coupling and authored
adjacency).

Then hardened by the full trio (HARD RULE #25) against the shippable spec. Findings and resolutions:

| # | Source | Finding | Resolution |
|---|---|---|---|
| B1 | red-team / checker | `setFrontMatterBlock` can't emit inline-flow lens defs (`[object Object]`) | Lente ships its **own** `emitRegistry` flow-map emitter (§8) |
| B2 | red-team | `includes` a `base: all` target balloons `brief` to the whole deck (leak) | `includes` **deferred to v2** with guardrails (§5) |
| CHK | checker | registering `lens` in `KNOWN_DIRECTIVES` without `DIRECTIVE_KEYS` **breaks the build** (parity test) | migration step 1 adds **both** + `FLAG_DIRECTIVES` (§7) |
| M1 | red-team | approval doesn't compose across `includes` — leaks un-reviewed slides | resolved by deferring `includes`; v2 requires closure-wide approval (§5) |
| M2 | red-team | `rebaseLensTags` drops inheritance-only members / flips new-slide default | rebase materializes members + routes through diff (§9.1); `includes` deferred |
| M3 | red-team | "sole writer" is an illusion — generic `parseFm`/`emitFm` is the real chokepoint | honest boundary stated; canonical-shape emit + route FM writes through Lente (§8) |
| M4 | red-team | failing **open** to `full` shows a brief-reader redacted slides | **fail closed, visibly** — "view unavailable," never silent full (§6.3) |
| M5 | red-team | strip **leaks** on bare `<!-- _lens -->` and on case variants | add to `FLAG_DIRECTIVES` + lowercase-lock + tests (§7) |
| R1 | inversion | 240-cell grid = approval **theater**; pre-checked cells = rubber stamp | approval unit is the **previewed deck**, per-lens, gated on preview; grid demoted to drill-down (§9.3-4) |
| R2 | inversion | `approved: true` is forgeable plaintext, staleness-blind | `approved` is a **content hash**; edits/forgery de-approve, off-Studio too (§6.2) |
| R3 | inversion | five reader lenses = adoption death (choice overload, unproven switching) | default **visible = full + brief**; others hidden; hero use case = pinned link (§4) |
| R4 | inversion | deleting AI Reshape removes prose-rewrite; regresses day-one exec view | **keep** AI rewrite behind the diff gate; author keeps instant preview (§9.5) |
| R5 | inversion | science is decorative; `ask` guesses wrong; `story`≠problem-statement | science demoted to **consistency-check** (§2); `ask` refuses low-confidence (§4); split recorded as fork D |
| R6 | inversion | per-slide tag maintenance can exceed making a 2nd deck | **target user named** (reused-with-edits deck); fewer lenses shrink the tax (§10) |
| m1 | red-team | `+brief` and `-brief` on one slide is a silent no-op | validator flags the contradiction (§10 slice 2) |
| m4 | red-team / checker | `brief` sweeps in `connect` logistics (wifi/contact) | `brief` carries the `bucket == connect` carve-out (§4) |
| m5 | red-team | `components.json` has no version/hash → determinism story unimplementable | add a content hash to the artifact (§10 slice 1) |
| m6 | red-team | no atomic lens-id rename → orphaned tags | id is **fixed**; only `label` editable; rename ships as a migration (§9.1) |
| m7 | red-team | `lens-default` validated only at approve | **re-validate at read** (§6) |
| m9 | checker | example uses non-existent `timeline` | corrected to `timeline-list` (§4) |

**Verified safe (attacks that did not land):** stripping `_lens` at render shifts **no** offset the
editor-side `splitSlides`/captions rely on (they run on editor source, which retains the comment);
`_lens` and `_class` comment directives don't interfere; the caption contract holds under filtering
because resolution is by carried author index. One degenerate case logged: a slide whose *entire*
body is comments strips to empty and drops the narration projection (graceful fallback, not
corruption) — a test guards it.

---

## 13. Status

**Proposed — design accepted, implementation not started.** No code yet; this doc is the deliverable
of the design + hardening phase, and the four product forks (§11) are decided and folded in. Slice 1 (the engine directive touch + export-byte
sign-off) is the ready next step. When built, the library is the fourth spin-off-able sibling
(Cadenza / Vetrina / Suono / Lente); its README leads with the smallest working `lensPairs` example,
per the house library shape.
