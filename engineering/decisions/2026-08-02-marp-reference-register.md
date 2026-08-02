---
status: shipped
summary: Every Marp reference in the tracked tree, classified by disposition and made regenerable. 687 files carry one — 3,420 prose/code lines plus 254 `marp: true` front-matter keys. The answer to "why does Marp linger beyond being an export target" is that it lingers in four separate ways, and only one of them is the export target: the export channel (45 files, intended), BORROWED VOCABULARY (203 files — LFM is PROPRIETARY and not Marp-RENDERABLE at fidelity; Marp compatibility belongs in a transformation at the export boundary, and that lowering ALREADY EXISTS — five steps in tools/export-marp.js that already rewrite a Lattice-only front-matter key. It just does not cover directives yet, which is why `_class` → `layout` breaks the Marp render today), the marp-vscode live-preview compatibility tax (293 files, the largest bucket, and the ONLY genuinely optional one — it exists solely because the 2026-07-09 audit's §5(b) decided on 2026-07-10 to keep marp-vscode as a first-party preview surface), and frozen history plus porting provenance (127). Actual drift: 18 files fixed here — 12 found by hand, then 7 more (four sibling resolvers, lib/engine/css.js, design/forms.md again, and lib/integrations/markdown-it/markdown-it.docs.md) surfaced only after an independent checker found the tool's rewrite detector was near-inert and its OVERRIDES were suppressing the very signal the register promised would catch a regression. `node tools/marp-inventory.mjs` regenerates the whole register, which is the point — the two prior audits were hand-written and stale within days.
---

# The Marp reference register — what is left, and what each piece is for

**Ask:** "we still mention marp. i saw it in our architecture documentation. we
are so far removed from it so i wonder why it still lingers beyond being an
export target of ours? I want all marp identified in the engineering docs,
codebase, comments, website, etc and to i want its appear classified [as]
candidate for removal or rewrite and relevant for export."

## TL;DR

The premise is right — Lattice is far removed from Marp. Zero `@marp-team`
packages, no Marp render path, `lib/engine/` re-implements the Marpit pipeline
natively. And yet **687 tracked files mention Marp**: 3,420 prose/code lines
plus 254 `marp: true` front-matter keys.

That gap is not one thing rotting. It is **four different things wearing the
same word**, and only the first is the export target. Counts below are as the
tree stands **after** this change's fixes — re-run the tool to confirm:

| What | Files | Can it go? |
|---|---:|---|
| **The export channel** | 45 | No — it *is* the product surface |
| **Borrowed vocabulary** | 203 | Shrinks — LFM is proprietary; compat moves into the export transform |
| **The marp-vscode preview tax** | 293 | **Yes — but only as a block, and only by revisiting one decision** |
| **Frozen history + porting provenance** | 127 | No — dated records and attribution |
| **Actual drift** | *(18, fixed here)* | **Gone — 0 actionable files remain** |

The headline: **the largest bucket is neither the export target nor residue —
it is the VS Code live preview.** 293 files (237 of them nothing but a
`marp: true` key on a deck) exist so that opening a `.md` in the "Marp for
VS Code" extension shows something recognizable. That surface runs raw
`marp-core`, not our engine.

**The direction set on 2026-08-02 changes what that bucket even means.** Marp
becomes a pure export target reached by an explicit transformation, and LFM is
free to evolve — starting with `_class` → `layout`. As LFM diverges, previewing
*our source* in marp-vscode degrades toward useless, so the bucket's center of
gravity moves to "preview the **exported** bundle" — where the UNVERIFIED
webview question of §5 still matters, because the lowering leans on the runtime
there. §2 and §5b carry the reasoning.

Genuinely wrong: **18 files**, all fixed here — 12 found by hand, then 7 more
that only surfaced once an independent checker showed the tool could not see
them (§9b). **Three** earlier drafts of this line were wrong: "71 lines" (a
figure its own checker could not reproduce, because the tool did not exist
before the fixes); then 13, before the repaired tool found the rest; then 19,
which double-counted `lib/engine/css.js` and `design/forms.md` in both the 12
and the 7. The union is 18. A line about how often this file's numbers were
wrong, which was itself wrong three times, is the argument for running the tool
rather than reading the prose.

## Method — and why it is a tool, not a list

`engineering/decisions/2026-07-09-marp-legacy-audit.md` and its follow-up
`2026-07-10-marp-audit-doc-framing.md` were thorough hand-written inventories
run through an 8-agent adversarial pass. Both went stale fast, and the repo
recorded it doing so: `engineering/gotchas.md`'s preview-gaps register carries
a row explaining that its own predecessor "carried [a list] for a day and was
wrong within a day."

A Marp reference is created by ordinary work — a comment, a compat note, a spec
line. Nothing recounted them. So this register is **generated**:

```
node tools/marp-inventory.mjs           # summary + the actionable list
node tools/marp-inventory.mjs --full    # every file, grouped by disposition
node tools/marp-inventory.mjs --json    # machine-readable
```

Classification order is: a hand-verified `OVERRIDES` entry (each carrying the
reason it outranks the machine), then path, then content signal. Anything the
signals cannot place lands in `interop` and is **printed as UNTRIAGED** rather
than absorbed silently — 194 files are default-placed today, and the tool says
so every run. That is the honest failure mode: a new reference surfaces as
untriaged instead of hiding in a bucket.

Every count in this document came from that command. Re-run it before trusting
any number here.

## The eight dispositions

Two of the eight — `rewrite` and `remove` — are empty as of this change. They
are listed because they are the classes the tool exists to surface: a non-zero
row in either is the signal that something drifted.

| Disposition | Files | Lines | `marp: true` | Verdict |
|---|---:|---:|---:|---|
| `export` | 45 | 406 | 1 | **KEEP** — the Export-to-Marp channel |
| `interop` | 203 | 506 | 10 | **SHRINKS** — borrowed vocabulary, not shared format (§2) |
| `provenance` | 11 | 162 | — | **KEEP** — porting attribution in `lib/engine/` |
| `history` | 116 | 1,364 | 3 | **KEEP FROZEN** — dated records |
| `preview` | 293 | 564 | 237 | **CONTINGENT** — the marp-vscode tax |
| `rewrite` | 0 | 0 | — | **REWRITE** — wrong about what renders Lattice (18 fixed here) |
| `remove` | 0 | 0 | — | **REMOVE** — points at a deleted file (1 fixed here) |
| `generated` | 19 | 418 | 3 | **GENERATED** — follows source (HARD RULE #2) |

## §1 — `export` (45 files): relevant, keep

The one-way handoff. `lib/core/marp-bundle.js` builds the recipient bundle,
`lib/core/marp-fidelity.js` is the ledger of what a Marp render does *not*
reproduce, `tools/export-marp.js` and the Studio/Drawing Board export menus are
the entry points, and the `test/unit/core/marp-bundle.test.js` /
`marp-fidelity.test.js` / `test/unit/tools/export-marp.test.js` trio holds them.
`.claude/settings.json`'s two `Bash(marp*)` / `Bash(npx marp*)` allowances
(`:30-31`) sit here as the best available reading, flagged as such: **nothing
records why they were added.** They landed inside an unrelated theming commit
(`c186442`, #1177) with no annotation, and JSON carries no comments. The
plausible purpose is rendering an exported bundle to check it — which
`2026-07-29-export-to-marp-broken.md` established is the only check this
boundary has — but that is inference, not evidence.

Nothing to do. This is what the user is asking to preserve, and it is
self-contained.

## §2 — `interop` (203 files): borrowed vocabulary, NOT a shared format

> **Reframed 2026-08-02, after this register was drafted.** An earlier version of
> this section called these files "the file format, not a dependency" and said
> removing them "would break the format." **That was wrong, and it is exactly the
> confusion this register was supposed to end.** The correction came from the
> owner, and the repo backs it up.

**LFM is a proprietary format, and Marp cannot RENDER it at fidelity.** Be
precise about the claim, because an earlier draft overstated it as "not
Marp-parseable" and `spec/LFM-1.0.md` refutes that on its own terms: the spec's
governing rule is **graceful degradation** (`:12-15`), every conformant document
is valid CommonMark (`:31`), and a `_class` directive is specified to degrade to
an inert HTML comment (`:56`). An unknown directive *parses*; it just does
nothing. What Marp cannot do is render the result correctly:

- **Directives Marp has never heard of** (`lib/engine/directives.js`): `_focus`,
  `_focusStyle`, `_focusSteps`, `_build`, `_debug`, `_lens`.
- **Front matter that is ours** (`deck-config.js` `EMIT_ORDER`, 17 keys): `mode`,
  `color-mode`, `finish`, `split`, `glossary`, `lift`, `form`, `validate`, plus
  `claim`, `logo`, `meta`. **Seven** of the seventeen are Marp's.

What these 203 files actually record is **borrowed vocabulary** — Lattice took
Marpit's slide model as a starting point (`---` separators, YAML front matter, a
class directive, `![bg]`) and then grew a format Marp cannot parse. Naming that
inheritance in a comment is honest. Calling it *compatibility* is not.

**Where Marp compatibility lives:** in a **transformation at the export
boundary**, never in the format.

> **Corrected 2026-08-03.** An earlier version of this section said the exporter
> passes LFM through "verbatim" and that a lowering "does not live there at
> all." **Both are false**, and a red-team refuted them by running the exporter.
> The corrected version is a *stronger* argument, not a weaker one.

**The lowering already exists.** `tools/export-marp.js:288-323` runs five steps
before `withRuntimeScripts()` is ever reached:

`appendAutoGlossary` → `localizeAssets` → `liftImageBgImages` → `bakeSplits` →
`localizeFrontMatter`

`lib/core/marp-fidelity.js:35` even names the mechanism — a coverage value
called **`baked`**: *"the export rewrites the SOURCE, so plain Marp needs no
plugin."* It already rewrites a **Lattice-only front-matter key**: a probe deck
carrying `split: headings` comes out the far end as `split: rule`, with a
literal `---` inserted where the split semantics were materialized into
Marp-native syntax. `![bg right](url)` is pre-rendered into a `<div
class="lattice-bg…">`.

**What is NOT lowered is the directive vocabulary.** Nothing in the pipeline
rewrites `_class`, `_focus`, `_build`, or `_lens`; marp-core consumes `_class`
directly. So renaming `_class` to `layout` **does** break the Marp render today
— not because a transformation is missing, but because this one does not cover
directives yet.

**That reframes the work.** It is not "build a lowering layer." It is **finish
the lowering that already ships** — extend it to directives, in a pipeline that
already rewrites a Lattice-only key exactly that way. The `_class` rename is the
next increment, not a precondition for a new architecture.

The passthrough framing was also load-bearing for the scars in the record, and
that part survives intact: `html: true` is load-bearing because marp-core would
otherwise escape the injected tags, ~835 CSS rules were dead to Marpit's
selector scoper, and the bundle shipped broken for months (#1256). The cause is
not "no transformation" — it is that **nothing on our side has ever rendered the
output**, which §10 now carries as the one structural fix.

Two entries in this bucket are genuine boundary machinery and stay either way,
because they serve the *Marp-rendered surface*, not our own render:

- **`lib/base/base.tokens.css:182-186`** defines `--marp-slide-header-color`,
  `--marp-slide-footer-color`, `--marp-slide-pagination-color` — marp-core's own
  variable names, so a Marp render picks up the Lattice palette. A
  Marp-vocabulary name in the public token API, and an accepted exception to
  HARD RULE #11.
- **`lib/base/base.tokens.css:756-773`** requires a plain `:root` rather than
  `:where(:root)`, because Marpit's scoper mishandles the wrapped form.

Everything else here is a candidate for the decoupling pass — see §5b.

## §3 — `provenance` (11 files): attribution, keep

`lib/engine/*` cites what each module ports: `slides.js` names
`@marp-team/marpit`'s tokenizer as "algorithm ported, not vendored";
`css.js` names `scaffold.js`, `printable.js`, `theme_set.js`. This is the
engine's citation of its source. Keep it — the alternative is an engine that
re-implements a documented pipeline while pretending it invented it.

## §4 — `history` (116 files, 1,364 lines): frozen

`engineering/decisions/**` and `CHANGELOG.md`. The single largest line count in
the whole inventory, and **none of it is actionable** — a dated record is
accurate as of its date. `.github/workflows/ci.yml`'s tombstone comments for
the removed `engine-parity` job are the same thing at smaller scale: they
explain why a gate is absent, which is worth more than the silence would be.

Rewriting history to reduce a grep count would be the actual defect.

## §5 — `preview` (293 files): the answer to "why does it linger"

**This is the bucket that answers the question.** It is the largest by file
count, it is the only genuinely optional one, and it has nothing to do with the
export target.

The "Marp for VS Code" extension previews `.md` decks by running **raw
marp-core**, not Lattice's engine, and it offers no engine hook. Everything
below exists to make that third-party preview show something recognizable:

- **237 decks carry `marp: true`** and nothing else. The owned engine consumes
  the key without acting on it (`lib/engine/directives.js:34,74` — a deck-level
  global, never a section attribute). The extension activates on it, which is
  why the key sits in this bucket. **It is not preview-only, though:**
  `docs/src/playground/deck-config.js:334` leads every exported front-matter
  block with `marp: true` "so an exported `.md` renders", and both
  `design/skills/deck.md` and `engineering/workflow.md` prescribe it as part of
  the authoring contract. So these 236 are the surface a marp-vscode retirement
  would *touch*, not 237 free deletions — the export path emits the key too.
- **`lib/runtime/index.js`** (**2,182 lines**, measured 2026-08-03) re-implements
  front-matter parsing and deck-wide register propagation on the live DOM, and
  selects on `marp-pre` — marp-core's custom `<pre is="marp-pre">` element.
  *(`engineering/marp-independence.md` Cost 3 has said "~800 lines" since
  2026-07-09; nobody re-measured it, and this register repeated the figure
  before its own checker caught it. Corrected in both places — the mirror is
  **2.7× larger** than the number the keep-marp-vscode decision was weighed
  against.)*
- **`tools/build-runtime.js`** caps the *whole* runtime bundle at `chrome91`
  because the extension's webview trails stable Chromium — a ceiling paid by the
  web-export bundle too.
- **CSS fallback paths** across `lib/base/base.modifiers.css`,
  `compare-code.styles.css`, `diagram.styles.css` and the chart family, plus a
  standing constraint that theme rules avoid a leading `:is(section…)` because
  Marpit's scoper cannot resolve it.
- **`engineering/gotchas.md`'s "VS Code / marp-vscode" section** (`:1448-1688`)
  — 48 Marp lines, part of the 159 in that file. One entry elsewhere in the file
  (`:312`) ends in "no path works in the marp-vscode preview," after three
  implementation attempts at the `logo:` directive.

**This was put on the table once and kept — then superseded.** The 2026-07-09
audit's §5(b) proposed retiring marp-vscode as a first-party preview surface;
the call on 2026-07-10 was explicit — *"5b is off the table for now since it
works."* §5(a) demoted the Two-renderer rule to opt-in the same week, so the tax
stopped *growing*, but the existing 293 files stayed by design.

**That question is now answered from a different direction (2026-08-02).** It is
not being reopened on its own merits and not on a timer — it is **decided as a
consequence** of the format decoupling in §2. When LFM stops being
Marp-parseable, live-previewing our source in marp-vscode cannot work no matter
what we do about it. So this bucket is not a standing cost to re-litigate; it is
a thing the decoupling retires. What replaces it: **preview the exported
bundle**, and ship a copy-paste Marp kit in `dist/` (§5b).

One thing is still worth knowing, and one no longer is:

1. **There is NO live re-evaluation timer — and one doc still says there is.**
   An earlier draft of this register claimed a 90-day trigger fires 2026-10-07.
   That is wrong, and the checker caught it: the 90-day/5-row trigger sits
   inside a `<details>` block the 2026-07-09 audit marked *"superseded
   2026-07-10, kept for record,"* and the decision above it retires the timer in
   as many words — *"kept as historical record … **not as a live plan**. Revisit
   only if the calculus actually changes … **not on a timer**."* Revisiting
   marp-vscode is condition-driven (the preview genuinely stops working, or
   Studio/Playground readiness becomes a live question), not calendar-driven.
   **`engineering/gotchas.md` had not caught up** — it told readers "the real
   backstop is the calendar, not this list … at a fixed 90-day mark." Corrected
   in this change; it was on the path of this audit, so it is fixed here rather
   than logged (HARD RULE #18).
2. **A load-bearing fact underneath it is still UNVERIFIED and contested.**
   Whether the marp-vscode webview executes the deck's scripts decides whether
   `lattice-runtime.js` does anything at all on that surface. The disagreement
   is **internal to `engineering/gotchas.md`**, which is the part an earlier
   draft of this section got wrong by framing it as a two-file contradiction:
   - `gotchas.md:1578-1587` states the CSS-only reading **flatly** — the webview
     has "a strict Content Security Policy that disallows script execution."
   - `gotchas.md:1551` then says of that same claim: *"Status of this claim:
     UNVERIFIED and contested … has never been tested against a real VS Code,"*
     and cites a 2026-07-29 field report describing structural components
     rendering correctly there — which would require the runtime to run.
   - `marp-independence.md` Cost 3 (`:108`) simply agrees with the unhedged
     half, unhedged.

   So it is not "both cannot be right" — one passage asserts a fact, another
   says that fact is untested. What is genuinely unresolved is its **epistemic
   status**, and three passages (not two) would need correcting once it is
   settled.

**This mattered a great deal until 2026-08-02, and now matters much less.** It
priced the preview tax for *our own source*, which the decoupling retires. It is
still live for the **export** path, though, and there it is load-bearing in the
other direction: the lowering leans on `lattice-runtime.js` to reconstruct
Lattice semantics on a Marp-rendered surface, so whether the marp-vscode webview
executes scripts sets the fidelity ceiling **of the exported bundle's preview**.
marp-cli's `pdf`/`html` routes are unaffected either way — they drive a real
headless browser, so the runtime runs.

Per HARD RULE #23 this stays **UNVERIFIED**: a headless sandbox cannot drive the
VS Code extension host. It is a ten-minute experiment for anyone with VS Code
open, and the `dist/` template deck (§5b) is the natural thing to run it on.

## §5b — The direction: Marp is an export target, reached by a transformation

**Set by the owner, 2026-08-02**, in response to this register's first draft:

> "so want full independence from marp, it is export target. i want to be free to
> change `_class` to `layout` and freedom to have custom front matter. LFM and
> `.lattice` are not marp compatible. We transform our proprietary format to a
> format compatible with marp… keeping marp around poisons our codebase and
> confuses other llms and you!"

The one rule, which everything below follows from:

> **Marp compatibility is a property of the TRANSFORMATION, never of the format.**

```
.lattice / LFM  →  [owned engine]      →  PDF / PPTX / HTML   (first-party, no Marp)
                →  [to-marp lowering]  →  Marp-safe .md + dist/marp assets
```

**What is Marp-compatible, and nothing more:** the front matter Marp needs, the
`lattice-runtime.js` bundle, and the VS Code settings file that registers our
themes. That is the whole surface.

**How the lowering works — smart, not janky.** Fidelity comes from the carriers
that already exist, not from pre-rendering markdown into HTML blobs:

1. **Deck-level `class:` front matter** carries the deck-wide registers.
2. **Per-slide `_class:`** carries the slide's layout and modifiers.
3. **`lattice-runtime.js`** reconstructs the rest on the live DOM.

The recipient keeps an **editable markdown deck** — but the three carriers are
**not sufficient on their own**, and the ledger says so. `marp-fidelity.js`
carries six `unmirrored` rows the runtime cannot reach: `_focusSteps` needs
*slide multiplication* (no class value and no DOM script turns one slide into N
under Marp's pagination), plus the heading-period pair, the function-plot and
anima fences, and math (MathJax vs KaTeX). A fourth carrier is already in use
and belongs in the design explicitly: **baking** — `liftImageBgImages` rewrites
`![bg right]` into a `<div class="lattice-bg…">` at export time, and the
ledger's own note records that the imagery pair *"took TWO mechanisms, and
neither half is sufficient."* Its header also warns the ledger reads one file
and that several engine-only HTML-stage post-processors carry no row at all —
so "exactly the rows it tracks" is not a safe reading of coverage.

### What ships in `dist/` — the copy-paste kit

**Not built yet** — `ls dist/` has no such kit today.

**The requirement, stated by the owner 2026-08-03, in their words:** *"when i go
use vscode with marp i simply go and copy files from dist and be working in
vscode in no time. my intention here is not to have to export a deck from studio
to get this working."*

So: **copy from `dist/`, open VS Code, work.** No Studio, no `export:marp`, no
build step on the recipient's side. The kit is a committed, shipped artifact
(`package.json` `files` already publishes `dist/`), regenerated by `npm run
build` like everything else behind the ownership gate. That it *shares code* with
`lib/core/marp-bundle.js` is an implementation detail for keeping the two from
drifting — it is **not** a step anyone using the kit performs.

The full manifest, not a gesture at one:

**Minified builds only** (owner, 2026-08-03). Every asset already exists
minified in `dist/`, so the kit costs no new build step — and `dist/themes/` is
**minified-only** already, with no unminified variant to pick by mistake. The
savings are not marginal: `lattice.min.css` is **564 KB vs 1.34 MB**, and
`lattice-runtime.min.js` is **466 KB vs 3.23 MB** — a 7× difference on the file
a recipient loads over `<script>`.

The `.min` naming is kept **in the kit**, not renamed away (the export bundle
renames `lattice.min.css` → `lattice.css`; the kit should not). A recipient
grabbing files by hand should be able to see what they took.

| File in the kit | Source | Why it must be there |
|---|---|---|
| `lattice.min.css` | `dist/lattice.min.css` | the engine bundle; every palette `@import`s it **by name**, so it must be registered even though the deck names only a palette |
| `cuoio.min.css` | `dist/themes/cuoio.min.css` | **the default theme** — named, not "some themes" |
| `cuoio-dark.min.css` | `dist/themes/cuoio-dark.min.css` | its dark variant; a `color-mode:` deck is broken without it |
| `lattice-runtime.min.js` | `dist/lattice-runtime.min.js` | reconstructs Lattice semantics on a Marp-rendered DOM |
| `mermaid-v11.min.js` | repo root | **third-party**: diagrams are dead without it |
| `fonts/*` | `dist/fonts/` | **third-party**: the CSS references them `url(fonts/…)`-relative, so a kit without them silently falls back to system serif — exactly the #1256 title-slide defect |
| `.vscode/settings.json` | generated | registers **both** CSS files in `markdown.marp.themes` and sets `markdown.marp.enableHtml`, without which the deck's `<script>` tags print as literal text |
| `marp.config.cjs` | generated | `themeSet` + `allowLocalFiles` + `html: true` |
| `README.md` | generated | how to render, and what a Marp render does **not** reproduce (from the `marp-fidelity.js` ledger) |
| **`sample.md`** | **new** | see below |

**Minification is safe here and that is not an accident.** `@theme` and `@size`
live inside a CSS *comment*, which a stock minifier strips — `tools/minify-css.js`
exists to preserve exactly those directive tokens. Verified on the shipped
artifacts: `dist/themes/cuoio.min.css` still declares `@theme cuoio`, and
`dist/lattice.min.css` still declares `@theme lattice` plus its `@size` list. If
that guard ever regresses, the kit degrades to unstyled slides with no error —
which is the kind of failure `sample.md` is there to make visible.

**`sample.md` is the piece that does not exist in any form today**, and it is the
one that makes the kit self-demonstrating. It must be a *well-formed, working*
deck, not a stub:

- **front matter** carrying what Marp needs (`marp: true`, `theme: cuoio`,
  `paginate`, `size`) — the seven-key Marp-legal subset, not LFM's seventeen;
- **explicit `<script>` imports** for the runtime *and* every third-party
  resource it depends on (`mermaid-v11.min.js`), because a recipient copying
  files into their own folder has no build step to wire them;
- content that actually exercises the kit — a Mermaid diagram, a component the
  runtime builds, and a plain prose slide — so that a broken asset path shows up
  as a visibly wrong slide instead of silently degrading.

**Two things fall out of building it this way.** First, the kit is very nearly
*the export bundle minus the user's deck*: `lib/core/marp-bundle.js`'s
`STATIC_ASSETS` already copies the CSS, the runtime and `mermaid-v11.min.js`, and
`fontAssetsFor()` already walks the stylesheet for `url(fonts/…)` references. So
it should be **built by the same code path**, which makes it self-verifying — a
stale kit means a stale export.

Second, `sample.md` is the **fidelity test the export boundary has never had**
(`2026-07-29-export-to-marp-broken.md`: *"a handoff nobody exercises is not
verified; it is unobserved"*). It is the artifact the proposed gate renders — see
`engineering/decisions/2026-08-03-export-fidelity-gate-scoping.md`.

**Why this is an increment, not a new architecture.** *(Corrected 2026-08-03 —
this paragraph previously claimed the export passes LFM through "verbatim" and
that the format "cannot move until the transformation exists." A red-team
refuted both by running the exporter; see §2.)* The lowering **already ships** —
five steps in `tools/export-marp.js`, one of which already rewrites a
Lattice-only front-matter key. What it does not yet cover is the **directive
vocabulary**, which is why `_class` → `layout` breaks the Marp render today.
Extending `bakeSplits`-style rewriting to directives is the next increment in an
existing pipeline.

**Sequencing (decided 2026-08-02):** the `_class` → `layout` rename is
**deferred** — settle the format boundary first, then rename. The rename is the
proof the decoupling worked, not the first step. It touches ~719 files and gets
its own pass under HARD RULE #17.

**This register's job in that work** is to be the map: `interop` (§2) is the
bucket the decoupling shrinks, and `node tools/marp-inventory.mjs` is how anyone
measures whether it actually did.

## §6 — `rewrite`: the 12 found by hand

Factually wrong today — each describes the owned engine as Marp, or cites a
render path or gate retired in P4
(`2026-06-12-p4-regression-gate-retire-marp.md`). These are the same defect
class the 2026-07-09 audit §3 swept; these are the ones that pass missed or
that landed after it.

| File | What was wrong |
|---|---|
| `lattice-emulator.js:3-9,22-24` | The **shipped CLI** (`package.json` `bin`) called itself a "Marp-faithful HTML renderer" that "emulates the HTML structure that Marp CLI produces so that lattice.css (**written for Marp**) renders correctly", and told end users to "use Marp CLI directly". The prior audit corrected this exact wording in `capabilities.md` and never touched the source. |
| `docs/src/pages/index.astro:14,306` | Owned playground bundle called "the marp render engine" |
| `docs/src/pages/playground.astro:3,296` | Claims the playground "runs the marp-cli render path client-side" |
| `docs/src/pages/drawing-board.astro:178,1220` | "The marp render engine bundle" |
| `docs/src/lib/load-engine.ts:1` | "the irreducible marp render engine" |
| `docs/src/lib/prefetch-engine.ts:1` | "the marp render engine bundle" |
| `design/design-principles.md:129,198,224,228` | Four errors. Attributes `data-lattice-pagination` to "the Marp CLI engine" **twice** — it is emitted by `lib/engine/slides.js:219`, and Marp CLI emits `data-marpit-pagination`, an attribute that appeared nowhere in this repo before this change introduced it as a contrast. Heading "Part 2: Marp Directives" frames the owned vocabulary as Marp's. "For the custom renderer (non-Marp CLI)" casts the owned engine as the deviation. |
| `lib/engine/css.js:309` | Same mis-attribution inside the engine itself: "the page number **Marpit** injects via `attr(data-lattice-pagination)`". |
| `design/forms.md:484-486` | "all three render paths (emulator, marp-cli plugins, runtime)" and "the cross-renderer parity gate" — both retired |
| `lib/core/resolve-finish.js:6` | "the three render paths read it"; there are two |
| `examples/sketch.md:127,128` | **Shipped slide content**: "Keeps the three renderers honest" / "Guards cross-renderer parity so the emulator, marp-cli, and runtime never drift" |
| `.github/workflows/ci.yml:166` | Integration tier called "the Marp/Puppeteer/emulator pipeline" |

Five of the twelve are on the **website**, which is what the user saw. The
docs-site engine loader chain — `load-engine.ts` → `prefetch-engine.ts` →
three page-level callers — described the owned bundle as Marp in every link.

`examples/sketch.md` is shipped slide content with a committed PDF, so its fix
carries a deck rebuild.

## §7 — `remove` (1 file): fixed here

`tools/preview.js:111` — the full-diff trigger list matches
`/^marp\.config\.js$/`, a file **deleted in P4**, under a comment reading
"three-renderer paths." Dead pattern, dead comment.

## §8 — `generated` (19 files, 418 lines)

`dist/**`, `docs/public/playground/lattice-playground.js`, `*.generated.js`.
Disposition follows the source; regenerate, never hand-edit (HARD RULE #2).
`docs/public/playground/lattice-playground.js` carries the export-bundle
generator inlined, which is why it greps as Marp-heavy.

## §9 — What this change does, and what it deliberately does not

**Does:** ships `tools/marp-inventory.mjs` and this register; fixes all 12
`rewrite` files and the 1 `remove` file; rebuilds `examples/sketch.pdf`
(page 8 re-rendered and inspected). After the fixes the tool reports
**0 actionable files**.

Of the 13 audited files, **8 still mention Marp** and each is pinned in the
tool's `OVERRIDES` table to its true post-fix class — so a `rewrite` signal
firing on one of those means a regression, not a relapse. The other **5**
(`index.astro`, `playground.astro`, `load-engine.ts`, `prefetch-engine.ts`,
`tools/preview.js`) no longer contain the string at all, so they have left the
inventory entirely and there is nothing to pin. An earlier draft of this section
claimed all of them were pinned; they were not, and the checker caught it.

**Does not:**

- **Touch the `preview` bucket.** §5(b) decided on 2026-07-10 to keep
  marp-vscode, and reopening it is condition-driven. Cutting 293 files on an
  audit's own initiative would be reversing a human call, not executing one.
- **Resolve whether the webview executes scripts (§5).** It needs a real
  VS Code. Marked UNVERIFIED per HARD RULE #23, logged below.
- **Reword the `interop` bucket.** Naming Marpit constructs by their real names
  is accurate; renaming them to reduce a grep count would make the docs worse.

## §9b — What the independent checker found (and why it mattered)

This change originally shipped without maker-checker, on the reasoning that a
diff of comments and prose has no blast radius. That was wrong: the blast radius
of a *register* is epistemic, and an instrument that reports "0 actionable" is
making the strongest claim in the document. A `checker` pass found the
instrument was largely unable to see the drift it advertised.

| Defect | Why it mattered |
|---|---|
| **The `rewrite` detector was near-inert.** Signals matched only against lines already containing "marp" — but "three render paths" almost never shares a line with that word. | 39+ files carried a live false claim while the tool printed "0 actionable". `lib/core/resolve-finish.js` was caught **only because its line happened to say "Marpit"**; its four identical siblings were invisible. Fixed: phantom-path phrases are now scanned over **every** tracked text file, separately from the Marp row set. |
| **`OVERRIDES` outranked everything**, so a pinned file could never fire a `rewrite` signal. | §9's regression guarantee was unreachable by construction. Demonstrated: at the pre-fix commit the shipped tool reported 4 actionable; with the override line neutered, 8. Fixed: drift signals now outrank overrides (but not `history`/`generated`, which quote old language accurately). |
| **`--json` truncated to one 64KB pipe buffer** — 3% of the payload — and exited 0. | The advertised machine interface was broken for its actual use. Caused by `process.exit(0)` discarding buffered stdout on a pipe. I hit this twice while building the register and misattributed it to my own one-liner. Fixed. |
| **A `lib/engine/` source was silently skipped.** `lib/engine/themes.js` uses a literal NUL byte as a cache-key separator; the binary heuristic dropped it. | "Every Marp reference in the tracked tree" was false, inside the engine, in the area §3 claims to enumerate. Fixed: binary-ness is decided by UTF-8 decodability. |
| **`marp: true` is dual-purpose**, not preview-only. | §5 said the preview "is the entire reason". `docs/src/playground/deck-config.js:334` leads every exported front-matter block with the key "so an exported `.md` renders", and `design/skills/deck.md` prescribes it. Corrected below — the key is still classified `preview` because that is the surface it could retire with, but it is **not free to delete**. |
| **`lattice-emulator.js`'s new header overclaimed** — "the canonical and only first-party render path". | I fixed five files in one commit to say *two* paths and shipped a sixth saying *one*. Corrected to `architecture.md`'s wording. |
| **Fixes applied to one occurrence, not all.** `design/forms.md` and `lib/engine/css.js` each carried the same false claim further down the same file. | Fixed, along with four sibling resolvers (`resolve-mode`, `resolve-color-mode`, `resolve-lift`, `resolve-claim`) carrying the identical sentence. |
| **`lib/integrations/markdown-it/markdown-it.docs.md` sat in a KEEP bucket.** | It opened *"Marp is the framework Lattice is built on … **Marp is the foundation**. Every component, every render path, every slide assumes Marp"*, described the deleted `marp.config.js` as live config, then contradicted itself thirty lines later. The single most misleading Marp doc in the tree, classified `provenance` because the word "upstream" appeared in it. Rewritten. |

Smaller ones fixed in the same pass: `remove` was structurally unreachable (no
rule could produce it); `/ported/` matched the word *exported*; `git ls-files`
made the tool silently cwd-dependent (184 files instead of 664 when run from
`lib/`); the `fmOnly` branch was undocumented and sat before the path rules,
misfiling 3 frozen decision docs as `preview`.

**The honest summary:** the tool as first shipped did not find the defects. I
found them by hand and then wrote an overrides table that made the tool blind to
them. It now finds them.

## §10 — Backlog (HARD RULE #18: logged, not silently dropped)

- **Verify whether the marp-vscode webview executes scripts.** Open a Lattice
  deck in a real VS Code with the Marp extension and look. It decides whether
  `lib/runtime/index.js`'s 2,182-line mirror does anything on that surface, and
  therefore what §5's 293 files actually buy. Three passages move when it lands:
  `gotchas.md:1578-1587` (asserts CSS-only flatly), `gotchas.md:1551` (says that
  assertion is untested), and `marp-independence.md:116` (agrees with the
  unhedged half). **Unreachable from a headless sandbox.**
- **There is no scheduled re-evaluation of §5(b), by design.** Do not wait for
  one — the 90-day timer an earlier draft of this register cited was retired on
  2026-07-10. Reopening marp-vscode is condition-driven, and this register is
  the evidence base if a condition trips: re-run the tool and compare.
- **Re-measure before re-citing.** The "~800 lines" figure survived from
  2026-07-09 to 2026-08-02 across two audits because each one quoted the last.
  Any load-bearing number in this file (line counts, file counts, register rows)
  is cheap to recompute and was wrong at least once.
- **39 files still carry a phantom-render-path phrase** ("three render paths",
  "cross-renderer parity"), listed by every tool run. The ones on this change's
  path are fixed; the rest span `docs/src`, `examples/`, `design/skills/` and
  `engineering/`, and sweeping them here would violate HARD RULE #17. They are
  now **visible on every run** rather than invisible, which is the difference
  that matters. Fix opportunistically or in a dedicated pass.
- **194 files are default-placed into `interop`.** Each run prints them. Not a
  defect; triage them opportunistically when touching the file, and add an
  `OVERRIDES` entry when a placement is worth pinning.
