---
status: shipped
summary: Every Marp reference in the tracked tree, classified by disposition and made regenerable. 664 files carry one — 3,122 prose/code lines plus 253 `marp: true` front-matter keys. The answer to "why does Marp linger beyond being an export target" is that it lingers in four separate ways, and only one of them is the export target: the export channel (37 files, intended), the FILE FORMAT (195 files — LFM is Marpit-compatible by design, so these can never leave without breaking the format), the marp-vscode live-preview compatibility tax (292 files, the largest bucket, and the ONLY genuinely optional one — it exists solely because the 2026-07-09 audit's §5(b) decided on 2026-07-10 to keep marp-vscode as a first-party preview surface), and frozen history plus porting provenance (121). Actual drift: 19 files fixed here — 12 found by hand, then 7 more (four sibling resolvers, lib/engine/css.js, design/forms.md again, and lib/integrations/markdown-it/markdown-it.docs.md) surfaced only after an independent checker found the tool's rewrite detector was near-inert and its OVERRIDES were suppressing the very signal the register promised would catch a regression. `node tools/marp-inventory.mjs` regenerates the whole register, which is the point — the two prior audits were hand-written and stale within days.
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
natively. And yet **664 tracked files mention Marp**: 3,122 prose/code lines
plus 253 `marp: true` front-matter keys.

That gap is not one thing rotting. It is **four different things wearing the
same word**, and only the first is the export target. Counts below are as the
tree stands **after** this change's fixes — re-run the tool to confirm:

| What | Files | Can it go? |
|---|---:|---|
| **The export channel** | 37 | No — it *is* the product surface |
| **The file format** | 195 | No — LFM is Marpit-compatible *by design* |
| **The marp-vscode preview tax** | 292 | **Yes — but only as a block, and only by revisiting one decision** |
| **Frozen history + porting provenance** | 121 | No — dated records and attribution |
| **Actual drift** | *(19, fixed here)* | **Gone — 0 actionable files remain** |

The headline: **the largest bucket is not the export target and not residue —
it is the VS Code live preview.** 292 files (236 of them nothing but a `marp: true`
key on a deck, 3 more carrying it alongside prose) exist so that opening a `.md` in the "Marp for VS Code"
extension shows something recognizable. That surface runs raw `marp-core`, not
our engine. It is the single lever that would meaningfully cut the Marp
footprint, it was explicitly considered and **kept** on 2026-07-10, and nothing
has changed since to reopen it. §5.

Genuinely wrong: **19 files**, all fixed here — 12 found by hand, then 7 more
that only surfaced once an independent checker showed the tool could not see
them (§9b). Two earlier drafts of this line were themselves wrong: one claimed
"71 lines," a figure its own checker could not reproduce by any method because
the tool did not exist before the fixes; the next said 13, before the repaired
tool found the rest. The count here is files, not lines, for that reason.

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
than absorbed silently — 189 files are default-placed today, and the tool says
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
| `export` | 37 | 358 | 1 | **KEEP** — the Export-to-Marp channel |
| `interop` | 195 | 464 | 10 | **KEEP** — Marpit file-format compatibility |
| `provenance` | 10 | 142 | — | **KEEP** — porting attribution in `lib/engine/` |
| `history` | 111 | 1,286 | 3 | **KEEP FROZEN** — dated records |
| `preview` | 292 | 545 | 236 | **CONTINGENT** — the marp-vscode tax |
| `rewrite` | 0 | 0 | — | **REWRITE** — wrong about what renders Lattice (18 fixed here) |
| `remove` | 0 | 0 | — | **REMOVE** — points at a deleted file (1 fixed here) |
| `generated` | 19 | 327 | 3 | **GENERATED** — follows source (HARD RULE #2) |

## §1 — `export` (37 files): relevant, keep

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

## §2 — `interop` (195 files): the file format, not a dependency

This is the bucket most likely to be mistaken for residue, and it is the reason
the raw count is startling. **LFM's slide model is Marpit-compatible on
purpose** (`spec/LFM-1.0.md` §"Marpit / Marp"): `---` separators, YAML front
matter, `<!-- _class: -->` directives, `![bg]` background syntax, and Marpit's
`magicCommentMatchers` note semantics. A comment saying "Marp's slide
separator" is not drift — it is naming the format the engine implements.

Two entries worth calling out because they look like leaks and are not:

- **`lib/base/base.tokens.css:182-186`** defines `--marp-slide-header-color`,
  `--marp-slide-footer-color`, `--marp-slide-pagination-color`. These are
  marp-core's *own* variable names, carried deliberately so a Marp-rendered
  surface picks up the Lattice palette. It is a Marp-vocabulary name sitting in
  the public token API — a real, accepted exception to HARD RULE #11's
  role-based naming, and it earns its place at the format boundary.
- **`lib/base/base.tokens.css:756-773`** requires a plain `:root` block rather
  than `:where(:root)`, because Marpit's scoper mishandles the wrapped form.
  A live constraint on shipped CSS, imposed by the format.

Nothing to do. Removing these would break the format, not clean it up.

## §3 — `provenance` (10 files): attribution, keep

`lib/engine/*` cites what each module ports: `slides.js` names
`@marp-team/marpit`'s tokenizer as "algorithm ported, not vendored";
`css.js` names `scaffold.js`, `printable.js`, `theme_set.js`. This is the
engine's citation of its source. Keep it — the alternative is an engine that
re-implements a documented pipeline while pretending it invented it.

## §4 — `history` (111 files, 1,286 lines): frozen

`engineering/decisions/**` and `CHANGELOG.md`. The single largest line count in
the whole inventory, and **none of it is actionable** — a dated record is
accurate as of its date. `.github/workflows/ci.yml`'s tombstone comments for
the removed `engine-parity` job are the same thing at smaller scale: they
explain why a gate is absent, which is worth more than the silence would be.

Rewriting history to reduce a grep count would be the actual defect.

## §5 — `preview` (292 files): the answer to "why does it linger"

**This is the bucket that answers the question.** It is the largest by file
count, it is the only genuinely optional one, and it has nothing to do with the
export target.

The "Marp for VS Code" extension previews `.md` decks by running **raw
marp-core**, not Lattice's engine, and it offers no engine hook. Everything
below exists to make that third-party preview show something recognizable:

- **236 decks carry `marp: true`** and nothing else. The owned engine consumes
  the key without acting on it (`lib/engine/directives.js:34,74` — a deck-level
  global, never a section attribute). The extension activates on it, which is
  why the key sits in this bucket. **It is not preview-only, though:**
  `docs/src/playground/deck-config.js:334` leads every exported front-matter
  block with `marp: true` "so an exported `.md` renders", and both
  `design/skills/deck.md` and `engineering/workflow.md` prescribe it as part of
  the authoring contract. So these 236 are the surface a marp-vscode retirement
  would *touch*, not 236 free deletions — the export path emits the key too.
- **`lib/runtime/index.js`** (**2,064 lines**, measured) re-implements
  front-matter parsing and deck-wide register propagation on the live DOM, and
  selects on `marp-pre` — marp-core's custom `<pre is="marp-pre">` element.
  *(`engineering/marp-independence.md` Cost 3 has said "~800 lines" since
  2026-07-09; nobody re-measured it, and this register repeated the figure
  before its own checker caught it. Corrected in both places — the mirror is
  **2.6× larger** than the number the keep-marp-vscode decision was weighed
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

**This was already put on the table and kept.** The 2026-07-09 audit's §5(b)
proposed retiring marp-vscode as a first-party preview surface; the call on
2026-07-10 was explicit — *"5b is off the table for now since it works."*
§5(a) demoted the Two-renderer rule to opt-in the same week, so the tax stopped
*growing*, but the existing 292 files stayed by design.

Two things are worth knowing before anyone reopens it:

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
   - `gotchas.md:1547-1556` states the CSS-only reading **flatly** — the webview
     has "a strict Content Security Policy that disallows script execution."
   - `gotchas.md:1520` then says of that same claim: *"Status of this claim:
     UNVERIFIED and contested … has never been tested against a real VS Code,"*
     and cites a 2026-07-29 field report describing structural components
     rendering correctly there — which would require the runtime to run.
   - `marp-independence.md` Cost 3 (`:108`) simply agrees with the unhedged
     half, unhedged.

   So it is not "both cannot be right" — one passage asserts a fact, another
   says that fact is untested. What is genuinely unresolved is its **epistemic
   status**, and three passages (not two) would need correcting once it is
   settled.

This is the highest-value open item in the register. It does not change the
§5(b) decision, but it means the cost of that decision is unknown to within
"a **2,064-line** runtime mirror either works on that surface or does nothing
there" — and the cheapest possible experiment, opening a deck in a real VS Code
and looking, has never been run. Per HARD RULE #23 this is **UNVERIFIED**, not
resolved: a headless sandbox cannot drive the VS Code extension host.

## §6 — `rewrite` (12 files, 70 lines): all fixed here

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

## §8 — `generated` (19 files, 327 lines)

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
  marp-vscode, and reopening it is condition-driven. Cutting 292 files on an
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
| **The `rewrite` detector was near-inert.** Signals matched only against lines already containing "marp" — but "three render paths" almost never shares a line with that word. | 40 files carried a live false claim while the tool printed "0 actionable". `lib/core/resolve-finish.js` was caught **only because its line happened to say "Marpit"**; its four identical siblings were invisible. Fixed: phantom-path phrases are now scanned over **every** tracked text file, separately from the Marp row set. |
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
  `lib/runtime/index.js`'s 2,064-line mirror does anything on that surface, and
  therefore what §5's 292 files actually buy. Three passages move when it lands:
  `gotchas.md:1547-1556` (asserts CSS-only flatly), `gotchas.md:1520` (says that
  assertion is untested), and `marp-independence.md:108` (agrees with the
  unhedged half). **Unreachable from a headless sandbox.**
- **There is no scheduled re-evaluation of §5(b), by design.** Do not wait for
  one — the 90-day timer an earlier draft of this register cited was retired on
  2026-07-10. Reopening marp-vscode is condition-driven, and this register is
  the evidence base if a condition trips: re-run the tool and compare.
- **Re-measure before re-citing.** The "~800 lines" figure survived from
  2026-07-09 to 2026-08-02 across two audits because each one quoted the last.
  Any load-bearing number in this file (line counts, file counts, register rows)
  is cheap to recompute and was wrong at least once.
- **42 files still carry a phantom-render-path phrase** ("three render paths",
  "cross-renderer parity"), listed by every tool run. The ones on this change's
  path are fixed; the rest span `docs/src`, `examples/`, `design/skills/` and
  `engineering/`, and sweeping them here would violate HARD RULE #17. They are
  now **visible on every run** rather than invisible, which is the difference
  that matters. Fix opportunistically or in a dedicated pass.
- **189 files are default-placed into `interop`.** Each run prints them. Not a
  defect; triage them opportunistically when touching the file, and add an
  `OVERRIDES` entry when a placement is worth pinning.
