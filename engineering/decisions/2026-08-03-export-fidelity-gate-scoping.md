---
status: proposed
summary: Scoping note, not a decision. Both adversarial lenses independently converged on one structural change — add @marp-team/marp-cli as a devDependency and make a real end-to-end export render a blocking gate. Today marp-fidelity.js's `mirrored` rows are verified by STRING SEARCH (does `${e.via}(` appear in lib/runtime/index.js), which is spelling, not fidelity; nothing on our side has ever rendered an exported bundle, and the 2026-07-29 post-mortem names that as the root cause of four shipped defects. The argument for it is that everything in this repo which stuck became a gate and everything that stayed prose rotted — the preview-gaps table, the 90-day timer, the "~800 lines" figure, the Two-renderer demotion. The argument against is real: it re-introduces a Marp dependency, costs CI minutes, and the runner needs Chromium. Includes the cheaper runner-up (delete `marp: true` from the authoring contract) and an honest account of what neither fixes.
---

# Scoping: an executable export-fidelity gate

**Not a decision — a scoping note.** The owner asked for this to be scoped, not
built. Nothing here has been implemented.

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
2. Export a fixed **template deck** through `tools/export-marp.js` — the same
   template §5b proposes shipping in `dist/`, so the artifact does double duty.
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
