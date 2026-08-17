---
status: shipped
summary: >
  The manifest-contract thread left one follow-up: make the ENGINE's composition chain-driven
  too, so `ThemeStore.resolveThemeImports` stops parsing `@import` on every render. Measured
  against the store's actual contract, that follow-up inverts its own thesis. The store serves
  callers who have no manifest and never will, so the content scan cannot be deleted — a
  manifest-driven path would sit IN FRONT of it, making two derivation sites where there is one.
  There is no performance case either: the scan is a fifth of a percent of an uncached compose.
  What the investigation DID find is a live-shaped divergence the thread created and did not
  notice: the two surviving content scanners — the store's `THEME_NAME_IMPORT_RE` and
  `chain.mjs`'s `flattenCssImports` — disagree on two `@import` forms. That is the same defect
  the whole thread is about, one level down, and it is what should be fixed instead. The
  adversarial trio then found the FIRST cut of that fix wrong in five ways — a third reader
  nobody had counted, two self-inflicted regressions (a stray comment sequence silently
  dropping every later import; an O(n^2) scan costing 20 s on a 1 MB sheet), a divergence
  between the two consumers it claimed to unify, and a silently broken `--css` CLI form.
  All five are recorded in §6 and fixed.
---

# Composition stays content-addressed; the divergence to fix is the one we made

**Date:** 2026-08-17
**Status:** shipped — §5's items (1) and (3), and item (2) REDUCED to its core after five
review rounds; the manifest-driven composition in §1 was investigated and deliberately NOT
built. §5's full scanner unification is attempted-and-abandoned, and remains open (§6).
**Follows:** `2026-08-16-manifest-is-the-theme-contract.md` (#1680) §3, §5 — which named this
follow-up, and `2026-08-17`'s tools sweep (#1691), which finished the other one.

---

## 1. The follow-up as specified

#1680 §3 states the position precisely and honestly:

> `ThemeStore.resolveThemeImports` parses `@import` on **every** engine render, and it is what
> splices the parent into the composed sheet. […] **chain discovery no longer parses CSS;
> composition still does.** Making composition chain-driven too is a real follow-up, and until
> it lands the directive is load-bearing, not decorative.

The sketch: give `cssFor` the chain (or have `ThemeStore` hold `THEME_EDGES`) and concatenate
parent-first instead of regex-splicing — while preserving the documented fallback for unknown
and cyclic names.

## 2. Why it inverts its own thesis

**The store's contract is content, and #1680 §5 already decided that deliberately:**

> `ThemeStore.resolveThemeImports` stays. It inlines `@import 'x'` against whatever is
> registered, and it must, because the store serves callers who never touched a manifest —
> the Studio's user-authored themes, a shared deck payload, an external `./engine` consumer.
> The store is the last line, working from content alone.

That is not a soft constraint. `lib/engine` ships as the `./engine` export and as
`window.LatticePlayground`; `addThemes([{name, css}])` is documented public API. An external
consumer registering a stylesheet has no `edges.generated.mjs` and no manifest — the bytes are
the only available source of its graph.

So a manifest-driven composition path **cannot replace** the content path. It can only sit in
front of it:

```
today:      cssFor → resolveThemeImports (content)          1 derivation site
proposed:   cssFor → chain (manifest) → fallback (content)  2 derivation sites
```

A thread whose thesis is *"one fact, one derivation"* would end by adding a second derivation of
that fact inside the one component that was correct all along. It would also couple the engine
kernel to a repo-generated artifact that external consumers of `./engine` do not have.

## 3. What the evidence says, measured

**(a) There is no performance case.** The scan is negligible against the compose it sits inside:

| | ms |
|---|---|
| `resolveThemeImports('indaco-dark')` — what `cssFor` actually calls | **0.05** |
| `cssFor('indaco-dark')`, uncached | **26 – 31** |
| share | **~0.2 %** |

Quote the ORDER, not the digits: the compose figure swings 25.8–30.8 ms across runs on one
idle machine, and a checker reproducing this independently measured 29.7 ms where an earlier
draft of this note said 41.4. The claim that survives that spread is "a fifth of a percent",
not a decimal. (The often-quoted 2.27 ms figure is the scan over the 1 MB *base* sheet — a call
`cssFor` never makes: it hands `resolveThemeImports` the theme, and `composeCss` inlines the
base separately.)

**(b) The one caller that could have needed the fallback does not use it.** Studio-authored
themes are the concrete case §5 names. `lib/theme/serialize.js:59` emits exactly one import —
`@import 'lattice';` — and never a sibling palette: a crafted theme is a full token map, so it
is always a ROOT. The content path's sibling-import branch is therefore exercised today only by
the 32 shipped palettes, every one of which the manifest already knows.

That cuts both ways, and honesty requires saying so: it weakens "the fallback is load-bearing
for Studio themes" **and** it removes the only reason to build the manifest path, since the
themes the manifest knows are exactly the ones the content path already resolves correctly.

**(c) The expected diff is zero.** Both encodings are gated equal by `checkThemeRoles`, so a
chain-driven composition produces byte-identical CSS for all 32 palettes by construction. The
verification burden (4224 renders, per #1680 §8) would be paid to prove that nothing changed.

## 4. What the investigation actually found

The thread left **two** content-side `@import` scanners alive, both deliberately, and nobody
compared them. They disagree:

| form | `lib/engine/themes.js:41` | `lib/theme/chain.mjs:113` |
|---|---|---|
| `@import 'indaco';` | resolves | resolves |
| `@import"indaco";` (minified) | resolves | resolves |
| `@import indaco;` (bare) | **MISSES** | resolves |
| `@import 'indaco";` (mismatched quotes) | **MISSES** | resolves |

The store requires matching quotes (`(['"])…\1`); `flattenCssImports` makes them optional, and
its docblock says why — it was written to restore *"the three forms the flattener this restores
accepted: `@import 'x';`, `@import "x";` and the bare `@import x;`"*. One of the two learned
that lesson. The other never heard it.

This is the identical shape #1680 opened with — *"One bug, fixed in one of the places it
existed"* — reproduced inside the fix. And the severity framing is the same: **latent, not
live.** No shipped stylesheet uses the bare or mismatched form, and the two scanners read
different inputs (the store reads registered themes; `flattenCssImports` reads a caller-supplied
`--css` sheet). What it demonstrates is that a fix reaching one copy still does not reach the
other.

## 5. Recommendation

**Do not make composition manifest-driven.** Instead:

1. **Correct the record.** #1680 §3 calls the chain-driven follow-up "a real follow-up." On the
   evidence above it is not one; §3 and §5 should say that composition is content-addressed
   **by design**, because the store's contract is bytes, and that this is the terminal state
   rather than an unfinished edge.
2. **Fix the divergence in §4** — one shared content-side import scanner, exported from
   `lib/theme/chain.mjs` (already the home of `flattenCssImports`, already browser-safe and
   fs-free) and consumed by `ThemeStore`. That genuinely removes a derivation site instead of
   adding one, and it is the change #1680's thesis actually implies.
3. **Gate it.** A test that drives both consumers over the same table of `@import` forms — the
   table in §4 — so the next fix cannot reach one copy and miss the other. Per the thread's own
   hard-won lesson: a gate with no test is a claim.

Estimated blast radius for (2): `lib/engine/themes.js` plus one export in `lib/theme/chain.mjs`
— a shared kernel, so maker-checker minimum under HARD RULE #25, with the 4224-render corpus
comparison as the equivalence evidence.

## 6. What shipped — and why it is smaller than §5 recommended

**§5 recommended unifying the two content-side scanners. That was attempted, reviewed
five times, and abandoned.** What ships is only §5's item (2) reduced to its core: the
engine store stops reading a theme's own COMMENTS as imports. The scanners are NOT
unified; `flattenCssImports` is untouched.

That is not a retreat from the analysis, it is the analysis applied to its own result.
Five rounds — an adversarial trio plus two checkers — found **six** defects, and every
single one lived in the unification machinery, not in the comment fix:

| # | Defect | Where it lived | Found by |
|---|---|---|---|
| 1 | A **third** content-side reader nobody counted (`THEME_IMPORT_RE`, `lib/engine/css.js`, quoted-only). Widening to a bare `@import x;` made `@import lattice;` resolve in the store, get handed off, and compose to 2 KB of scaffold. The cut also deleted the comment pointing at that third reader. | the widening | red team + inversion |
| 2 | Comment RANGE-SKIPPING read a closer-then-star (`/*!banner*/*{…}`) and an opener inside a string as OPENERS — one stray sequence silently dropped every later import. **Self-inflicted.** | the shared scanner | red team |
| 3 | That skipping was O(matches × ranges) per compose: 12.5 ms → 1,945 ms on 440 KB, 20.3 s on 1 MB, on the Studio's per-keystroke path. **Self-inflicted.** | the shared scanner | red team |
| 4 | The two consumers **still disagreed** — 129 divergences in 300,000 fuzzed inputs — because one pre-stripped and the other range-skipped. The unification's whole claim. | the unification | red team + inversion |
| 5 | `@import "extra.css";` in a `--css` sheet silently stopped being flattened. Valid CSS, a documented CLI form. | the flattener's new grammar | checker |
| 6 | The fix for #2 did not fix it: a naive stripper still paired a string's opener with the next real closer. Two test rows passed only because their fixtures had no TRAILING comment. | the shared scanner | checker |

The comment fix itself survived all five rounds unchanged. So the scope was cut to it.

**What that leaves, against `main`:**

- `maskCssComments` in `lib/core/leading-is.js` — the offset-preserving projection of
  the comment walk (`eachCssRun`) that file already owned. The first cut of this PR
  promoted a SECOND copy out of `tools/check-css-values.js` into
  `lib/core/strip-css-comments.mjs`, citing HARD RULE #15 while breaking it: a
  same-named, same-directory `stripCssComments` already existed in `leading-is.js`,
  equally quote- and escape-aware, differing only in delete-vs-blank. A checker fuzzed
  the two at 337,257 inputs and found **0 disagreements about which bytes are a
  comment**; esbuild had already had to rename one of them in the bundle. So the walk
  stays in one place and grew a second projection instead of a second implementation.
  Both callers — the gate and the store — take it from there.
- `ThemeStore.resolveThemeImports` scans a comment-MASKED copy and splices against the
  ORIGINAL, so offsets are exact and bytes outside a matched directive come back as they
  went in. The regex **literal** is unchanged from `main`; the effective grammar is
  slightly wider, because a comment inside the directive now masks to whitespace and
  `@import/* which parent */'onyx';` therefore resolves where it did not before. That is
  more CSS-correct, and it is why the browser row in §7 reads as it does. (An earlier
  draft of this bullet claimed "no widening", which its own §7 table contradicted.)
- `test/unit/theme/store-comment-imports.test.js`, nine arms, each pinned by a mutant:
  reverting to no comment awareness fails 2, the naive stripper fails 2, returning the
  masked text rather than splicing the original fails 2, a non-length-preserving mask
  fails 1, dropping escape-awareness fails 1, an unterminated comment not running to EOF
  fails 1. Arm 9 (the base hand-off) was **vacuous when first written** — the fixture
  never registered `lattice`, so it was satisfied by the unregistered-name branch and
  survived deleting the hand-off outright; found by the pre-merge checker, fixed here.

**Measured:**

```
composed CSS identical: 448/448   (32 palettes x all 14 registered size names)
quoted import in a COMMENT:  old LEAKED 1,530,907 bytes -> new 762,450   <- the fix
string opener + trailing comment: parent retained (defect #6 closed)
url() font import, unknown names, the base hand-off: byte-identical
--css flattener: untouched, so nothing to regress
mask vs the char-by-char original: byte-identical over 180 repo stylesheets
  + 300,000 fuzz cases (independently: 1,097,871 inputs, 0 divergences)
```

**Performance — a regression this PR created and closed before merge.** The stripper it
first promoted accumulated `out += c` one character at a time, which is invisible on a
20 KB palette and not on the 1.5 MB base sheet:

```
resolveThemeImports, dist/lattice.css (1.5 MB, 58% comment)
  main                     3.4 ms
  first cut              122.4 ms      (36x — uncached cssFor('lattice') +248%)
  shipped                 10.6 ms
uncached cssFor: indaco 38.9 ms vs main 38.5 ms · lattice 51.2 ms vs main 49.3 ms
```

Nearly all of it was blanking the comment bytes: `replace(/[^\n]/g, ' ')` costs 132 ms on
this sheet where a run-at-a-time `indexOf` + cached-spaces slice costs 2.6 ms. No shipped
palette was affected either way — but `add()` clears the memo, so the Studio pays the
compose cost per keystroke, and this is the same axis on which the trio rejected an
earlier cut (defect #3). Caught by the pre-merge checker, which measured it in an
isolated process after an in-process first attempt gave the wrong sign.

**Not done, deliberately:** the scanners remain un-unified, and `flattenCssImports`
keeps the naive comment strip it has always had (so the #6 class is still live *there*,
pre-existing and unchanged by this note). §5's item (2) is therefore **open**, with the
five rounds above as the evidence about how to attempt it — the honest lesson being that
the coupling is harder than it looks because the two consumers resolve into different
domains (a registry and a filesystem), which is what the inversion argued in the first
place and what #1, #4 and #5 each demonstrated concretely.

## 7. What this note does NOT claim

- It does not claim `resolveThemeImports` is optimal, only that replacing its SOURCE with the
  manifest is a net loss. Unifying its regex with `chain.mjs`'s is a separate, positive change.
- It does not claim the store can never know a declared edge. `add(name, css, { extends })`
  — the caller declaring what it read from the manifest — is a coherent design; it was rejected
  here because it still cannot remove the content path, so it also lands at two sites.
- The divergence in §4 is **not verified as live**. Constructing an input that reaches it
  requires a caller-supplied stylesheet using the bare form, which nothing in this repo emits —
  though "nothing in the tree emits it" is not evidence about `--css` sheets and `addThemes`
  payloads, which are caller-supplied by construction and unknowable from here. The sweep
  numbers are in §6; an earlier draft of this bullet cited "113 files, 0 divergences", which
  did not reproduce and which §6 retracts.
- **The browser surface is VERIFIED** (HARD RULE #23) — a real Chromium against the served
  docs site, registering through the real public API (`window.LatticePlayground.addThemes`) and
  reading back `render().css` from the shipped Rollup bundle. **Re-driven after the grammar
  changed** — the first version of this table was produced against the bare-accepting cut and
  its last row asserted the opposite of what now ships, which is precisely what HARD RULE #23
  forbids. Six cases, discriminating in both directions, with `onyx` carrying a token nothing
  else declares so the answer cannot be faked by the legitimately-inlined base:

  | leaf theme | onyx spliced? | prose leaked? | own `--accent` survives? |
  |---|---|---|---|
  | comment *mentions* `@import onyx;` | no ✓ | no ✓ | yes ✓ |
  | comment *mentions* `@import 'onyx';` | no ✓ | no ✓ | yes ✓ |
  | **real** `@import 'onyx';` | **yes** ✓ | no ✓ | yes ✓ |
  | **real** `@import 'onyx.css';` (not a form the grammar takes) | no ✓ | no ✓ | yes ✓ |
  | **real** bare `@import onyx;` (not a form the grammar takes) | no ✓ | no ✓ | yes ✓ |
  | **real** `@import /* c */ 'onyx';` | **yes** ✓ | no ✓ | yes ✓ |

  762,710 bytes for the comment cases against 1,531,460 for the real-import ones (re-driven
  against the rebased head, so the digits move with `main`; an independent checker reading the
  pre-rebase build got 762,449 / 1,530,941 — quote the ratio, not the digits), and
  `indaco-dark` still composes with its categorical tokens on the same surface. The first cut of
  this probe used BYTE COUNT as the discriminator and was worthless: a serialized Studio theme
  carries `@import 'lattice';`, so the base inlines either way and both arms sat at ~762 KB.
  **Still not driven:** the Fabricate UI click-path itself (type a description → save → preview).
  What is verified is the bundled store through the API that path calls.
- **The narrowings are now enumerated in §6**, after a checker showed the "union minus one
  false positive" framing was false in five places.
- **`lib/theme/serialize.js` still interpolates a Studio user's description into a CSS comment
  without escaping `*/`** — so a description containing those two characters closes the comment
  and everything after it becomes live CSS. Red team drove it to **script execution in a real
  Chromium** (`window.top.__PWNED` set) via the composed sheet's path into the same-origin,
  un-sandboxed preview `srcdoc`: `docs/src/lib/single-slide-render.ts:663` concatenates theme
  CSS raw, and HARD RULE #22's gate covers the slide-HTML sink only, not the CSS one. This is
  **PRE-EXISTING** — untouched by this change, present on `main` — but it is on this change's
  path and it is why the comment fix alone is not the end of the story. Logged here rather than
  fixed, because closing it properly means escaping at the serializer AND deciding whether the
  #22 gate should cover the CSS sink, which is a separate change.
