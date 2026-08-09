---
status: shipped
summary: >
  The owner asked for one engine-owned JSON object with a schema that every surface could
  perform CRUD against, to end front-matter/slide-directive reader drift. The first design —
  an authored "vocabulary" schema plus a derived per-deck "index" — went through two citation
  corrections (a direct owner catch, then an independent fact-checker pass) before an
  adversarial trio (red team + Munger inversion, run per HARD RULE #25) rejected the DESIGN
  itself, not just its evidence. Both lenses converged independently: the format's own
  justification was falsified by code that shipped mid-review (#1433, which proved the "no
  second representation — call the engine" shape beats a cached/declared one, on this exact
  problem, days earlier); the design's flagship new field (per-key read strictness) encodes
  the wrong rule (strictness is a (key, role) property, demonstrated live in
  `deck-class-register.js`); its "declared registries don't rot" precedent argues the
  opposite once read as history (`manifest.schema.json` rotted 7 weeks undetected); its
  headline quantified benefit (a 4x navigation regression) was already fixed on `main`,
  attributed to a comment describing a superseded state; and red-team reproduced, live and
  end-to-end, the actual defect this doc exists to fix — a plain YAML trailing comment on a
  register line silently diverges the Lattice engine from Export-to-Marp today — which is a
  LEXICAL bug the proposed schema (a semantic/type layer) cannot touch. This note keeps that
  record and replaces the two-object design with what both lenses converged on: no new
  artifact. One shared front-matter reader (`lib/core/front-matter-key.js`), taught to strip
  trailing comments and accept hyphenated keys; every register kernel routed through it under
  a `check-ownership.js` gate modeled on the shipped `checkClassAttrReads`; the author-facing
  key list DERIVED from that routing rather than declared (per #1339's already-rescoped
  recommendation, and proven buildable — a 12-line scan derives 20 registers with their
  kernels); `writeFrontMatterLine` moved to `lib/core/`. Stable slide ids and a future
  authored/resolved provenance display are preserved as separate, smaller future decisions,
  not built speculatively. The §4 fix IS BUILT: ~40 private readers across 20 files routed onto
  one rule, a mutation-tested check-ownership gate on both reader shapes, two sync-gated ESM
  mirrors, 5634 unit + 449 integration green, and the CLI verified emitting the right palette
  on a deck that only differs by a trailing comment — the check that caught the fix being
  incomplete while every unit suite was green. The two-object design remains rejected.
companion:
  - ./2026-08-03-authoring-vocabulary-audit.md
  - ./2026-07-29-front-matter-lossless-writers.md
  - ./2026-08-02-slide-class-taxonomy.md
  - ./2026-06-13-lfm-standard.md
  - ./2026-08-05-deck-class-register-boundary.md
  - ./2026-08-05-one-class-directive-reader.md
  - ./2026-08-05-slide-boundary-reconciliation.md
---

# Front-matter reader drift — the two-object design was rejected; here is what closes it instead

**Date:** 2026-08-05 · **Status:** shipped (§4 built; the two-object design rejected) · **Decision owner:** Sharmarke
**Area:** engine / authoring vocabulary / docs-site Studio + playground / export

This note keeps the record of a rejected design, the way
`2026-08-05-slide-boundary-reconciliation.md` keeps the record of its own first cut: *"the
adversarial trio took it apart, and this note keeps the record because the failure was
structural."* Same day, same shape of failure, same house rule — HARD RULE #25's adversarial
trio exists to catch exactly this before it reaches a human decision, and it did.

## The ask

> "what i am concerned about is different surfaces having their own kernels/engine for this
> stuff. it makes it harder to edit and maintain and drift becomes a real problem."
>
> "my hope is there is a single shared object between the surfaces in json object with
> schema. this way we have a true spec for all the surfaces to perform CRUD operation on
> that is owned by the engine. this object can then become what the manifest uses."
>
> "the object should hold front matter, additional deck metadata like page count, slide
> metadata … think about what is of value across the surfaces that use it and how it would
> and could be used in the future."

---

## 1 — What was proposed, and what it went through

The first design split the ask into two objects: an authored **vocabulary** (a JSON Schema
declaring every front-matter key and comment directive — type, legal values, precedence,
exclusivity), and a derived per-deck **index** (counts, resolved front matter, a `slides[]`
with stable id, page number, class tokens, source span). CRUD split so reads came from the
index and writes went through a spliced markdown writer.

It survived two correction rounds. The owner caught a wrong claim directly (slide metadata
IS authored, the draft said otherwise). An independent `fact-checker` pass then caught two
more, load-bearing ones: a false "drift concentrates on the docs site" diagnosis, and a
citation of issue #1416 as proof of something #1416's own shipped fix actually disproves.

Then a `red-team` pass and a Munger `inversion` pass ran in parallel — the remaining two
lenses of HARD RULE #25's mandatory trio. Both were told only to attack the design, not its
citations, and both — independently, with no shared context — concluded the same thing:
reject it. That convergence, from agents that couldn't see each other's evidence, is the
strongest signal in this whole investigation.

## 2 — Why the design is rejected

**The premise it was built to satisfy no longer exists.** The doc's central reason for
shipping JSON instead of an importable module — *"a browser-side consumer needs the answer as
data, not as a second copy of the parser… that is exactly why the deck index ships as
JSON"* — rests on a ~36 KB bundle-weight constraint. `2026-08-05-slide-boundary-reconciliation.md`
(#1433), merged into `main` the same day, mid-review, measured that constraint away: shipping
the engine's **own parser** to the browser (`lib/core/slide-boundaries.mjs`, consumed by
`single-slide-render.ts`, `lint.ts`, `rehearsal.js`, and the generated playground bundle)
cost **+0.016 ms on the median deck** and left the bundle **smaller**, 126 KB vs 133 KB. The
repo already ships 143 KB of inlined engine code to the browser today
(`docs/src/playground/authoring-core.generated.js`). "Data, not a module" was solving a
problem that had already been solved a different way.

**Its flagship new field encodes the wrong rule.** §3 of the rejected design proposed
declaring `readStrictness` per KEY — loose for a key nothing writes, column-0-strict for a
key a writer also touches. `lib/core/deck-class-register.js` — the design's own worked
example — reads `class:` **loosely** in three places and **strictly** only in its own writer,
in the same file, with the asymmetry justified in capitals in its own header: *"a refusal
that reads more strictly than the thing it is refusing simply fails to fire."* Strictness is
a property of the **(key, role)** pair, not the key. A per-key field would have declared the
wrong answer for the exact key the design cited as its example, and a checker enforcing it
would have silently un-fired the refusal #1416/#1427 shipped to fix.

**Its own precedent argues the opposite, read as history.** §3 staked the whole mechanism on
`manifest.schema.json` never having rotted because it's gated. `2026-07-05-quality-driven-refactor.md`
records that schema rotting invisibly for roughly seven weeks — an unconsumed field, a
third drifted copy, an unenforced `additionalProperties: false` — found only by a
purpose-built change-coupling audit, not by the gate. And this repo has now tried "declare +
cache with a confidence flag" on almost this exact problem once already this week and lost:
#1433's own first cut declared its own boundary rule and shipped six confirmed wrong answers
under `certain: true` before the trio caught it and replaced it with "ask the engine."

**It fixes the wrong layer.** §1's defect family is a set of regexes disagreeing about a
lexeme. The proposed cure is a type declaration (`color-mode: {type: "enum", values: […]}`).
Declaring `color-mode` as an enum does not make `"dark  # pin it"` parse to `dark`. See §3
below for the live reproduction.

**Its headline quantified benefit no longer exists.** §4's central evidence for the index —
*"a rail click cost 52.1 ms p50… against 12.8 ms… a 4× regression"* — quotes a comment in
`single-slide-render.ts` describing a state that memo *fixed*, three words trimmed from the
middle of the sentence that says so. The 4× cost is gone on `main` today.

**CRUD covered the easy half and called it done.** The design's entire write API was a flat
front-matter scalar splice. Real token-bag CRUD for slide-comment directives already ships —
`docs/src/components/studio/slide-directives.ts` — with a refusal path, group semantics, and
comment-reconstruction safety, and its own comment states: *"groupMembers comes from the
generated vocabulary (never a hand-list) so groups can't drift."* The working writer is
already fed by a **derived** vocabulary, in the one place the design proposed replacing it
with a declared one.

**Two structural defects nobody caught until the trio:** `sourceSpan` (byte offsets) would
self-invalidate on the design's own write path — any splice shifts every later slide's
offsets, and nothing in the design accounts for it. And retiring `positionIsTrustworthy`'s
refusal path removes the one thing standing between a surface and *"the plausible lie"* (the
function's own words) with no replacement failure mode — a safety regression on the design's
own stated stakes, not a neutral trade.

**The migration violated the rule that governs this repo's PRs.** §8 promised "rival readers
deleted in the same PR that adds the object," which means one branch touching the engine,
Studio, playground, linter and export. §9 promised "three independently shippable slices,"
which HARD RULE #17 reads as the definition of a violation. The design held both without
noticing the contradiction.

## 3 — The actual defect, reproduced

This is the bug the design exists to fix, live on `main`, reproduced against the real engine:

```js
const { render } = require('./lib/engine');
render('---\ntheme: indaco   # board palette\nmode: sketch  # keep\n---\n\n# T')
```

```
engine directives (lib/engine/directives.js):  { theme: 'indaco   # board palette', mode: 'sketch  # keep' }
real YAML (what Export-to-Marp keeps):         { theme: 'indaco', mode: 'sketch' }
```

An ordinary trailing YAML comment — something any author might type — corrupts both values on
the engine's read path (comparing them against a known enum then silently fails, since neither
string matches `indaco` or `sketch` exactly) while Export-to-Marp, which parses real YAML,
keeps them clean. **Two different decks from one source, today.** This is the #1416 shape
again, and it has nothing to do with whether `color-mode` is declared as an enum in a schema
— it is `lib/engine/directives.js:113`'s key-value line not stripping a trailing comment,
full stop.

The census was also undercounted. Of 18 `lib/core/resolve-*` kernels, exactly **one**
(`resolve-color-mode.js`) uses the shared reader (`lib/core/front-matter-key.js`). The other
17 carry private regex pairs — a fence spelling and a value charset each — sitting in
`lib/core/`, the exact directory this investigation's earlier revision already identified as
where drift actually lives.

## 4 — What ships instead — **SHIPPED in this change**

No new object, no new format, no HARD RULE #1 amendment. One shared reader, taught correctly,
enforced by a gate — the same shape that already closed #1358, #1374, #1402/#1416, and #1383.

> **Built and verified.** The scope grew once, on evidence: driving the real CLI (per HARD
> RULE #23) showed the fix had not reached it, and the gate — once widened to the second
> pattern shape — found readers the manual sweep had missed. Final count: **~40 private
> readers across 20 files**, including the same registers re-read privately by BOTH render
> paths, which is why no unit test could see the defect. `finish: atrium  # for review` now
> renders `finish finish-atrium content form`, identical to the uncommented deck; before,
> it produced no finish class at all. Two ESM modules stay sync-gated mirrors under the
> documented Rollup constraint. See §7 for what was and was not verified.

1. **Fix `lib/core/front-matter-key.js`'s two readers** to strip an unquoted trailing `#`
   comment before trimming (careful: a comment marker inside a quoted value —
   `title: "a # b"` — must survive; this needs the same quote-aware handling
   `stripQuotes` already does, done before the comment strip, not after).
2. **Fix `lib/engine/directives.js:113`'s key-discovery regex** to accept hyphens
   (`[A-Za-z_][\w-]*`), so `color-mode`, `spectrum-*` and `motion-*` finally enter
   `KNOWN_DIRECTIVES` instead of being invisible to the engine's own directive map.
3. **Route all 18 `resolve-*` kernels through the shared reader.** One real, load-bearing
   exception exists already and must be preserved, not swept: `resolve-pace.mjs` and
   `resolve-captions.mjs` are ESM, imported directly by the docs site's Rollup build, which
   cannot resolve named exports off a CommonJS module outside its root — so they inline their
   own regex by necessity, documented in place. That is a `SANCTIONED_FRONT_MATTER_READERS`
   entry with its reason, not a rival to delete. Whether to close it later by giving
   `front-matter-key.js` an ESM twin is an open question (§6), not a blocker now.
4. **Add `checkFrontMatterReaders` to `tools/check-ownership.js`**, modeled directly on the
   shipped `checkClassAttrReads` (`tools/check-ownership.js:2448`): scan `lib`, `docs/src`,
   `tools` for a front-matter key-value regex outside the shared reader; fail on an unlisted
   offender, naming the shared reader; fail on a stale sanction too, so the allowlist can't rot
   the way `SANCTIONED_CLASS_ATTR_READS` doesn't. Budget 0 + the one named exception from item 3.
5. **Derive the author-facing key list** — fixing `editor-complete.ts`'s stale
   `FRONT_MATTER_KEYS` and `deck-config.js`'s `FIELD_DEFAULTS`, the doc's only confirmed
   user-visible defect — from a scan over the routed kernels plus `KNOWN_DIRECTIVES`, per
   #1339's already-rescoped recommendation (*"derive the registry rather than declaring
   it"*). Proven buildable: a 12-line scan over `lib/core/resolve-*` derives 20 registers with
   their kernels. If a fuller scan turns out not to be buildable, #1339 already names that as
   the honest signal a declared registry would have been unverifiable too — so this is not a
   riskier bet than the design it replaces, it is the same bet with its own stated fallback.
6. **Move `writeFrontMatterLine`** from `docs/src/components/studio/front-matter.ts:216` to
   `lib/core/`. The one piece of the original design nobody contested.
7. **Delete the rival block-parser charsets** in `deck-config.js`, `front-matter.ts`, and
   `resolve-captions.mjs`'s variant, once routed through the shared reader.

This is genuinely one PR under HARD RULE #17 — unlike the rejected design, there is no
separate "declare the vocabulary" phase to accidentally split off. The gate and the deletion
of every rival it would flag are the same change.

## 5 — Preserved, not built

- **Stable slide ids.** `2026-07-04-comments-layer.md` specifies a comment anchored to "a
  STABLE per-slide id, NOT an ordinal" but the shipped feature anchors by index. That gap is
  real and has a named consumer. It deserves its own small decision when picked up — not a
  slice bolted onto this one, and not blocked on anything above.
- **Authored-vs-resolved provenance.** The rejected design's §4.1 argued a Studio Inspector
  might someday want to show "what you wrote" distinct from "what rendered." No such consumer
  exists yet. Build it when one does.
- **A shared deck-index object, in general.** Not ruled out forever — but this repo has now
  rejected "declare it and cache it with a confidence flag" twice in one week (#1433, this
  note) on real evidence. The bar for a third attempt is a demonstrated need from an actual
  consumer that the fix in §4 cannot serve, not the general drift complaint alone.

## 6 — Open questions

1. Should `front-matter-key.js` grow an ESM twin so `resolve-pace.mjs` and
   `resolve-captions.mjs` can drop their justified exception, or does the sanctioned allowlist
   stand indefinitely? Not urgent — two named, documented, gate-visible exceptions are a
   reasonable steady state.
2. Exact comment-stripping regex needs its own test fixture set (quoted `#`, unquoted `#`, a
   `#` inside a URL value, a bare `#` with no space before it) before it ships — this note
   proposes the fix's *shape*, not a verified implementation.
3. Where does the derived key list get published for `dist/docs/grammar.json` and the two
   Studio consumers — a build step alongside the existing `tools/build-docs-portal.js`, or a
   new small generated file? Either is fine; not decided here.

## 7 — Verification note

Everything in §2–§3 is drawn from the `red-team` and `inversion` agent reports run against
this doc on `origin/main` at `fa2fa69`, both of which independently re-verified their own
citations with `Bash`/`grep`/live `node -e` reproduction — not re-derived from memory here.
**What §4's implementation carries, stated at its real strength:**

- **Verified on the real surface.** `node dist/lattice-emulator.js` rendering two decks that
  differ only by a trailing comment now emits the same `--accent` (`#C8A040`, cuoio); before,
  the commented one emitted `#82C8E5` (the indaco default). That check is what caught the fix
  being incomplete — every unit suite was green at the time.
- **Gates:** `npm test` 5634/5634 · `npm run test:integration:pr` 449/449 · `npm run lint`
  clean · `npm run check:ownership` clean · `npm run build:check` up to date.
- **The gate is mutation-tested**, both halves: injecting a private reader fails the build with
  the intended message, and a stale sanction fails it too. A gate that cannot fail is worse
  than none, so this is asserted rather than assumed.
- **The corpus was scanned before choosing the semantics**, not after: exactly one committed
  deck carries a `#` inside a quoted front-matter value (`meta: "Default layout · #1292"`), and
  zero carry unbalanced quotes or an unquoted leading `#`. The quote-awareness is there because
  that one deck proves it is needed, and the unterminated-quote behaviour is unobservable today.
- **`color-mode:` behaviour changed deliberately**, reversing a decision from #1427 one day
  prior. That decision's own stated reason was the cost of forking a parse for one key; this
  change removes the cost by making the strip shared, which is the sweep `resolve-pace.mjs`
  named in its header. The parity invariant #1427 protects (resolver accepts ⟺ linter quiet) is
  preserved and re-verified — a commented *typo* is still caught.

**Not verified:** no `fact-checker` / `red-team` pass has run against the implementation
itself, only against the design. The riskiest surface is the comment-stripping edge cases, now
covered by 21 unit assertions but not by an adversarial reader. The docs-site Studio and
Playground were not exercised; `authoring-core.generated.js` and the playground bundle were
rebuilt and their tests pass, but no browser surface was driven by hand.

**A defect this change created and fixed, worth recording because of how it was caught.** The
mechanical rewrite of the two render paths left **eleven** orphaned references
(`stampClass(fmStamp[1])` where `fmStamp` had just been deleted) in `lib/runtime/index.js`.
They are latent crashes — they throw only when a deck actually declares that register — and
**the full unit suite, the integration tier, lint and `build:check` were all green with them
in place.** They were found by reading the diff, not by any gate. Two gaps behind that:

1. **`biome` does not catch undefined variables** — `noUndeclaredVariables` is not enabled
   (verified: a file containing `const a = undefinedThing[1]` passes `npm run lint` clean).
   Enabling it repo-wide is off-path for this change (HARD RULE #18) and is logged here rather
   than swept in, but it would have caught all eleven instantly.
2. **No test exercises the runtime's deck-register mirror** with a `stamp:` / `tone:` /
   `spectrum:` deck. Pre-existing — the code path had this shape before this change too. That
   absence is precisely why a crash-on-every-stamped-deck survived every gate.

Neither is claimed as fixed. Both are the honest reason this change's diff review mattered more
than its test run.
