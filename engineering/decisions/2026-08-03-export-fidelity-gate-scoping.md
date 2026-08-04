---
status: in-progress
summary: Scoping note, not a decision. Both adversarial lenses independently converged on one structural change — add @marp-team/marp-cli as a devDependency and make a real end-to-end export render a blocking gate. Today marp-fidelity.js's `mirrored` rows are verified by STRING SEARCH (does `${e.via}(` appear in lib/runtime/index.js), which is spelling, not fidelity; nothing on our side has ever rendered an exported bundle, and the 2026-07-29 post-mortem names that as the root cause of four shipped defects. The argument for it is that everything in this repo which stuck became a gate and everything that stayed prose rotted — the preview-gaps table, the 90-day timer, the "~800 lines" figure, the Two-renderer demotion. The argument against is real: it re-introduces a Marp dependency, costs CI minutes, and the runner needs Chromium. Includes the cheaper runner-up (delete `marp: true` from the authoring contract) and an honest account of what neither fixes.
---

# Scoping: an executable export-fidelity gate

**Not a decision — a scoping note.** The owner asked for this to be scoped, not
built.

> **Partly built, 2026-08-04.** The line above used to end "Nothing here has been
> implemented," and that stopped being true. `test/integration/export/marp-kit-render.test.js`
> now renders `dist/marp-kit` through real marp-cli on every `code` PR. **Steps 2
> and 3 of The shape shipped; step 4 did not, and step 1 was deliberately
> rejected.** See §Resolution at the end before treating anything here as
> outstanding.

## Where it came from

The adversarial pass on `2026-08-02-marp-reference-register.md` ran three lenses.
Two of them — a Munger inversion asked *"it is 18 months from now and the
decoupling failed, what happened?"*, and a red team asked to refute the
register's claims — **converged independently on the same recommendation.**
Neither was prompted toward it.

## The problem it solves

**Nothing on our side has ever rendered an exported bundle.**
`engineering/decisions/2026-07-29-export-to-marp-broken.md` states the root cause
without hedging:

> NOTHING on our side ever rendered the bundle, so every claim about it was
> inference.

Four independent defects had been shipping — escaped runtime `<script>` tags,
~835 CSS rules dead to Marpit's selector scoper, no bundled fonts, two transforms
with no DOM mirror. They were found in an afternoon by exporting a deck,
installing marp-cli, and *looking at the pages*. None was caught by any gate,
ever.

**The ledger that is supposed to hold this line does not measure anything.**
`test/unit/core/marp-fidelity.test.js` verifies a `mirrored` row by checking that
the string `` `${e.via}(` `` appears in `lib/runtime/index.js`. That is a spelling
check. It cannot detect a mirror that exists and is wrong, and it says nothing
about what marp-core actually produces.

## The shape

1. Add `@marp-team/marp-cli` as a **devDependency** — quarantined to the test
   tier, never a runtime dependency. `npm install @slidewright/lattice` stays
   marp-free, which is the property `marp-independence.md` §1 actually claims.
2. Render the **`dist/` kit's `sample.md`** (register §5b) — the same artifact a
   recipient copy-pastes, so the gate tests the thing users actually get. It must
   carry its own `<script>` imports for the runtime and `mermaid-v11.min.js`, and
   exercise a Mermaid diagram plus a runtime-built component, or the gate passes
   on a deck too simple to break.
3. Render the bundle with **real marp-cli**.
4. Assert the result against the engine's own render, **one assertion per
   `lib/core/marp-fidelity.js` row** — `baked` and `mirrored` rows asserted to
   reproduce, `unmirrored` rows asserted to fail *in the documented way*.

That last clause is the interesting half: it turns the ledger from a list of
claims into a list of *measurements*, and makes an `unmirrored` row that silently
starts working just as loud as a `mirrored` row that silently breaks.

## Why it is the highest-leverage single change

**Everything in this repo that stuck became a gate. Everything that stayed prose
rotted.** That is not a slogan — it is the observed record:

| Stayed prose | What happened |
|---|---|
| The "Known preview gaps" register | 1 row in 3 weeks; its own text admits an empty table means nothing |
| The 90-day re-evaluation timer | Retired on 2026-07-10; `gotchas.md` still called it "the real backstop" three weeks later |
| "~800 lines" for the runtime mirror | Wrong from 2026-07-09; corrected to 2,064 and **stale within hours**; actually 2,182 |
| The Two-renderer rule's demotion to "opt-in" | 17 of 17 transformers still carry a mirror; nobody has ever taken the exception |

| Became a gate | What happened |
|---|---|
| `margin` discipline | Budget 0, achieved, holds |
| Hex literals | Budget 0 + allowlist, holds |
| Cascade layers | Budget 0 + order pin + stale-sanction check, holds |
| Preview HTML sinks | Allowlist + stale-entry failure, holds |
| Agent model pinning | Enforced per file, holds |

§5b of the register is currently prose. So is its template deck. On this record
that predicts the outcome.

**It is also the precondition for the `_class` → `layout` rename.** The rename is
deferred "until the format boundary exists," which is an unfalsifiable condition.
With this gate the rename becomes *a red CI job you fix*. Without it, it is a
leap of faith across ~837 files, and it will never be the cheapest thing on
anyone's list.

**The irony is the point:** to become independent of Marp you must depend on Marp
in exactly one place — the test tier. A boundary you never cross is not a
boundary; it is a hope.

## The honest case against

- **It re-introduces a Marp dependency.** `marp-independence.md` currently leads
  with "zero `@marp-team` packages." That claim would need re-scoping to
  "zero in `dependencies`" — true, narrower, and less quotable.
- **CI cost.** marp-cli drives headless Chromium. This belongs in the integration
  tier or nightly, not the PR gate, unless it proves fast.
- **A gate on an UNVERIFIED surface.** It measures marp-cli's `pdf`/`html`
  routes, which definitely execute the runtime. It says **nothing** about the
  marp-vscode preview pane, where the script-execution question is still open —
  so it does not close that.
- **HARD RULE #24 shape applies.** A real external dependency in the test tier
  needs the same quarantine discipline as the OpenRouter spender.

## The cheaper runner-up

If only one small thing gets done instead:

**Delete `marp: true` from the authoring contract.** `engineering/workflow.md:118`
and `design/skills/deck.md:83,222` prescribe it on every new deck;
`docs/src/playground/deck-config.js:334` leads every emitted block with it. Have
the *exporter* inject it instead, and add a lint rule barring it in source decks.

That removes **237 files** from the coupling permanently, ships in an afternoon,
and is measurable on `tools/marp-inventory.mjs`. It is the single largest
regenerative source in the tree — the direction lives in one dated decision doc
while three contract docs and one code emitter prescribe the opposite.

What it does **not** do is stop the export from silently breaking, which is the
worse of the two failure modes.

## What neither fixes

The inversion's sharpest finding, recorded here because it outlives both options:

> §5b's fidelity mechanism is `lattice-runtime.js`. The old justification for the
> runtime mirror was "an author might want the VS Code preview to look right
> mid-draft" — genuinely optional, and demoted to opt-in on 2026-07-09. The new
> justification is **"the exported artifact a recipient opens is correct."**
> *That cannot be demoted.*

So §5b, as written, takes the one regenerative structure the 2026-07-09 audit
identified and upgrades it from a taste preference to a product guarantee. A gate
makes the mirror *correct*; it does not make it *smaller*.

If that is a problem worth solving, the lever is **`baked` over `mirrored`** —
`liftImageBgImages` and `bakeSplits` already rewrite the source so plain Marp
needs no plugin. Making `baked` the preferred coverage verdict, with `mirrored`
as a shrinking ratchet (the `US_ENGLISH_BUDGET` pattern), is the only version of
this that ends rather than grows. That is a separate decision and is not proposed
here.

## Open questions for whoever picks this up

1. PR gate, integration tier, or nightly? (Chromium cost decides it.)
2. Assert on rendered DOM, on rasterized pixels, or both?
3. Does the template deck live in `examples/`, `test/fixtures/`, or `dist/`
   directly — and is it the *same* artifact §5b ships to recipients?
4. Does an `unmirrored` row asserted to fail become a maintenance burden of its
   own, and what happens when Marp upstream fixes one?

## Resolution (2026-08-04) — what shipped, what was rejected, what is still open

`test/integration/export/marp-kit-render.test.js`.

**Step 1 — devDependency: REJECTED, and this is the weakest call in the set.**
The note predicted that adding `@marp-team/marp-cli` to `devDependencies` would
force `marp-independence.md`'s headline — "zero `@marp-team` packages" — to be
re-scoped to "zero in `dependencies`": *"true, narrower, and less quotable."* The
gate instead fetches marp-cli on demand with
`npx -y @marp-team/marp-cli@${MARP_CLI_RANGE}`, importing the range from
`lib/core/marp-bundle.js` so the gate and the artifacts it gates cannot ask for
different tools.

**State the cost plainly, because a Munger inversion was right about it:** a
`devDependency` buys a lockfile entry, an integrity hash, one resolved version,
and Dependabot visibility. `npx` at a RANGE buys none of those, and the repo now
downloads and executes registry content on the required merge path. Trading
reproducibility for a sentence in a positioning doc is not a good trade, stated
out loud. Two things make it survivable rather than reckless, and neither is a
refutation:

- lifecycle scripts are off (`npm_config_ignore_scripts=true`, verified end to
  end on a cold cache), so an install hook cannot run in a job with the repo
  checked out;
- the resolved version is captured and printed into **every** failure message, so
  a red gate can be triaged as "marp-cli moved" versus "we broke it". It moves:
  the range resolves to **4.5.0** today, while the kit README's reference render
  was 4.3.1.

There is also a real argument FOR the range that the inversion did not weigh: it
is what the kit's README tells recipients to run, so an exact pin would gate a
version nobody uses. **If this is revisited, the honest options are a
devDependency plus a corrected `marp-independence.md` sentence, or an exact pin
plus a scheduled range-drift check — not the status quo defended on the
positioning claim.**

**The skip is LOCAL-ONLY, and that was a fix, not the original design.** As first
written the suite self-skipped everywhere, including CI. The inversion named that
as the change's highest-damage failure mode and it was right: `# skipped 6` in a
several-hundred-line TAP stream is not a signal anyone reads, so the gate would
have reported green while covering nothing — permanently and invisibly, on the
first `npx` ENOENT, proxy, or registry-auth change. It now retries three times,
skips off-CI (where hard-failing a laptop with no network just trains people to
ignore it), and **throws on CI**.

**Steps 2 and 3 — SHIPPED, over BOTH artifacts.** The note asked for the kit
deck. The gate renders the kit *and* an Export-to-Marp bundle produced by
`tools/export-marp.js`, with the same assertions parameterized over both.

That widening came from the inversion's load-bearing objection, which is worth
recording because it nearly shipped as a hole: the kit and the bundle share their
ASSET list by construction, but not the machinery that has actually broken. Two
independently authored marp configs (`build-marp-kit.js` `marpConfig()` against
`lib/core/marp-bundle.js` `MARP_CONFIG_CJS`), and `withRuntimeScripts()`, the
baked front-matter block and per-deck `themeSet` generation existing only in the
bundle — which is where **all four** defects in the 2026-07-29 post-mortem lived.
A kit-only gate would have tested the twin of the risky generator while reading,
to anyone skimming, as "CI renders our Marp export." The bundle costs ~4s.

**Step 4 — one assertion per `marp-fidelity.js` row: NOT DONE.** This is the
half that turns the ledger from claims into measurements, and it is still the
most valuable thing left here. Today's gate asserts a targeted set (page count,
the Mermaid tooltip pin, the split panel, MathJax layout, theme registration,
font loading) chosen from what actually broke in #1325 — not a row-by-row sweep,
and specifically **no `unmirrored` row is asserted to fail in its documented
way.** So the note's sharpest idea is unbuilt: an `unmirrored` row that silently
starts working is still silent.

**The four open questions, answered by what shipped:**

1. **PR gate** — it runs in `test:integration:pr`. Chromium cost turned out not
   to decide it: both fixtures together are ~19s warm, because the decks are
   `size: hd`. (At `size: 4k` the same 13 slides never finished rendering, >200s
   repeatedly. Keep them at `hd`.)
2. **Rendered DOM, plus two things off the rasterized artifact.** `pdfinfo` for
   the page count, because a blank trailing sheet is a *print* artifact that
   exists on no other surface, and `pdftotext` on the first and last page —
   a count alone is satisfied by thirteen blank pages, and the specific bug this
   gate exists for appends an EMPTY sheet, which a last-page text probe catches
   independently of the count. Everything else is asserted on the live DOM of a
   real browser driving marp's `--html` output. No pixel diffing — that gate was
   retired for runner-dependent rasterization and nothing here argues for
   bringing it back.
3. **`dist/` directly, and yes — the same artifact**, plus a freshly exported
   bundle. Renders go to `.scratch/marp-render/` rather than a random temp dir so
   CI can upload them on failure; the committed kit is copied, never written
   into, so `build:check`'s byte-compare is untouched.
4. **Unanswered, because step 4 was not built.** Still open.

**What the note could not have known, and the gate now proves.** Its case-against
worried this would be "a gate on an UNVERIFIED surface" — true of marp-vscode,
irrelevant here: the assertions were verified by **mutation and deletion**, not by
going green.

| Experiment | Result |
|---|---|
| No-op `pinMermaidTooltip` in a scratch runtime | **14 pages for 13 slides** — the original bug, reproduced |
| Partial regression (tooltip left `absolute` but repositioned) | 13 pages — the count MISSES it; the tooltip assertion catches it |
| Delete `fonts/` from a scratch kit | `document.fonts.check()` → false, 37 faces `error` — both font assertions fire |

That last experiment also **killed an assertion**. A third font check matched
`getComputedStyle(h1).fontFamily` against `/Playfair Display/` — and it passes
with `fonts/` deleted, because computed `font-family` is the DECLARED list, never
the resolved face. It read like coverage and was a tautology. Removed. A vacuous
assertion is worse than a missing one, because it is counted.

Two more nets came out of the adversarial pass and are worth naming as a pattern:
a `pageerror` assertion (every other check samples ONE construct, so a runtime
that builds the split panel and then throws on a later slide passed all of them),
and keeping the renders on disk instead of `rm -rf`-ing them, since the entire
argument for this gate is that the defects were visible on page one of a PDF.

**Status: `in-progress`, not `shipped`** — step 4 is the remainder, and the
cheaper runner-up (delete `marp: true` from the authoring contract, 237 files) is
untouched and still available.
