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
**Status:** shipped — §5's recommendation (1)–(3); the manifest-driven composition in §1 was
investigated and deliberately NOT built
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

## 6. What shipped, and what the trio changed about it

`lib/theme/chain.mjs` owns one content-side grammar — `themeNameImports(css)` and
`replaceThemeNameImports(css, fn)` — and BOTH consumers scan **comment-stripped** text
through it. `THEME_NAME_IMPORT_RE` is gone from `lib/engine/themes.js`;
`flattenCssImports` no longer strips separately before calling.

**The first cut of this change was wrong in five ways, and the adversarial trio
(HARD RULE #25) found all five.** Recording them, because the pattern is the finding.

| # | what | found by |
|---|---|---|
| 1 | There is a **THIRD** content-side reader — `THEME_IMPORT_RE` in `lib/engine/css.js`, which resolves the base `@import 'lattice'`. It is quoted-only. Widening this grammar to a bare `@import x;` therefore made `@import lattice;` resolve here, get handed off at `BASE_THEME`, and compose to **2 KB of scaffold**. The changelog's headline "fixed unquoted imports" was false for the only import most themes have. The first cut also **deleted the comment that pointed at that third reader.** | red team + inversion |
| 2 | Comment RANGE-SKIPPING read a comment closer followed by `*` — the `/*!banner*/*{…}` minified-reset idiom — and an opener inside a string or `url()` as comment OPENERS, so one stray sequence silently dropped every later import: a parent lost, an unstyled deck, no error. **A regression the change itself created.** | red team |
| 3 | `inComment` was O(matches × ranges) per compose: **12.5 ms → 1,945 ms** on 440 KB, **20.3 s on 1 MB**. The Studio re-registers its theme on every render and `add()` clears the whole cache, so a large pasted theme froze the tab per keystroke. **Also self-inflicted.** | red team |
| 4 | The two consumers **still disagreed** — the flattener pre-stripped comments, the store range-skipped, so `@import /* c */ 'onyx';` (valid CSS) resolved in one and not the other. 129 divergences in 300,000 fuzzed inputs. The central claim of the change was false. | red team + inversion |
| 5 | `@import "extra.css";` in a `--css` layout sheet — valid CSS, the documented CLI form — **silently stopped being flattened**. Driven end to end through the real emulator: canary present on the base commit, absent on the branch. The old flattener resolved it by accident (its `['"]?` bookends captured the stem and stopped at the dot); the rework dropped it while the note claimed a pure union. | checker |

**What the rework does instead.** The grammar is **quoted-only** — matching CSS itself,
`checkThemeRoles`' extractor, real Marp, and `css.js` — with an explicit optional `.css`
suffix so the `--css` form in (5) is supported deliberately rather than accidentally.
The bare arm is **dropped**: it is not valid CSS, nothing in the tree emits it, and
keeping it is what caused (1) and (2). Comment handling is a single shared
`stripComments`, the same shape `composeCss` and `css.js` already use, which is what
finally makes (4) true — and it removes the range machinery behind (2) and (3) entirely.

**Byte figures, re-measured after the rework:**

```
composed CSS identical: 128/128   (32 palettes x 4 sizes)
  — a checker re-ran it across all 17 REAL size names: 544/544 identical.
    Worth knowing: '', hd and 4:3 compose byte-identically ('4:3' is not even a
    registered size), so the maker's "4 sizes" was really 2 distinct compositions.

quoted import in a COMMENT:  old LEAKED 770,735 bytes -> new 2,296   <- the real fix
bare import (now rejected):  old 2,313 -> new 2,313                  <- widening withdrawn
url() font import:           identical, url preserved
--css sibling sheet:         inlined on main, inlined again after the rework
@import lattice; (bare):     2,302 both here and in css.js — consistent, no hand-off gap
DoS input 440 KB:            1,945 ms -> 9.9 ms
1 MB all-comment:           20,267 ms -> 11.2 ms
```

**Corpus sweep, re-derived** (the first cut cited "113 files, 0 divergences", which a
checker could not reproduce from the stated inputs — neither the count nor the zero).
Honest numbers, over `themes/ dist/ docs/ examples/ tools/ lib/ test/`:

```
files scanned 2,293  ·  containing @import 191
differ from the OLD STORE grammar:      31
differ from the OLD FLATTENER grammar:  60
```

Every one is comment-borne — that is, every one *is* the comment fix — and every one
involves `lattice`, which both consumers special-case, so composed output is unchanged.
The conclusion the old number was reaching for holds; the number did not.

**The gate is `test/unit/theme/import-grammar.test.js`** — 28 forms across both
consumers and the grammar itself, including every attack above. Three arms were
hardened after the checker showed them inert: the "fresh regex" arm could not fail even
against a shared literal driven through `exec`; arms 3 and 4 asserted "nothing extra"
only on rows expecting nothing, so a consumer splicing an EXTRA theme passed every other
row; and the agreement arm's candidate list omitted `lattice` and a full quoted URL.

**Deliberate narrowings, disclosed** (the first cut called itself "a union minus one
false positive" and was not): the flattener no longer follows `@import 'a/b.css';`
(which resolved the stem `a`), mismatched quotes, the media-qualified bare form, the
bare form with no terminator, or the bare form at all. Nothing in the tree emits any of
them; `@import "name.css";` — the one that had a real user — is restored explicitly.

## 7. What this note does NOT claim## 7. What this note does NOT claim

- It does not claim `resolveThemeImports` is optimal, only that replacing its SOURCE with the
  manifest is a net loss. Unifying its regex with `chain.mjs`'s is a separate, positive change.
- It does not claim the store can never know a declared edge. `add(name, css, { extends })`
  — the caller declaring what it read from the manifest — is a coherent design; it was rejected
  here because it still cannot remove the content path, so it also lands at two sites.
- The divergence in §4 is **not verified as live**. Constructing an input that reaches it
  requires a caller-supplied stylesheet using the bare form, which nothing in this repo emits.
  Every `@import` in the tree was swept old-grammar vs new (113 files across `themes/ dist/
  docs/ examples/ tools/`): **0 divergences**, so the widening is inert on everything shipped.
- **The browser surface is VERIFIED** (HARD RULE #23) — a real Chromium against the served
  docs site, registering through the real public API (`window.LatticePlayground.addThemes`) and
  reading back `render().css` from the shipped Rollup bundle
  (`/playground/v/<hash>/lattice-playground.js`). Four cases, discriminating in both directions,
  with `onyx` carrying a token nothing else declares so the answer cannot be faked by the
  legitimately-inlined base:

  | leaf theme | onyx spliced? | prose leaked? | own `--accent` survives? |
  |---|---|---|---|
  | comment *mentions* `@import onyx;` (bare) | no ✓ | no ✓ | yes ✓ |
  | comment *mentions* `@import 'onyx';` (quoted) | no ✓ | no ✓ | yes ✓ |
  | **real** `@import 'onyx';` | **yes** ✓ | no ✓ | yes ✓ |
  | **real** bare `@import onyx;` | **yes** ✓ | no ✓ | yes ✓ |

  762,454 bytes for the comment cases against 1,530,948 for the real-import ones, and
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
