---
status: shipped
summary: >
  The manifest-contract thread left one follow-up: make the ENGINE's composition chain-driven
  too, so `ThemeStore.resolveThemeImports` stops parsing `@import` on every render. Measured
  against the store's actual contract, that follow-up inverts its own thesis. The store serves
  callers who have no manifest and never will, so the content scan cannot be deleted — a
  manifest-driven path would sit IN FRONT of it, making two derivation sites where there is one.
  There is no performance case either: the scan is 0.028 ms of a 41.4 ms uncached compose, 0.07%.
  What the investigation DID find is a live-shaped divergence the thread created and did not
  notice: the two surviving content scanners — the store's `THEME_NAME_IMPORT_RE` and
  `chain.mjs`'s `flattenCssImports` — disagree on two `@import` forms. That is the same defect
  the whole thread is about, one level down, and it is what should be fixed instead.
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

## 6. What shipped

`lib/theme/chain.mjs` now owns the grammar — `themeNameImports(css)` and
`replaceThemeNameImports(css, fn)` over one regex, **and it skips matches inside comments**.
`flattenCssImports` reads through the first; `ThemeStore.resolveThemeImports` rewrites through
the second, and `THEME_NAME_IMPORT_RE` is gone from `lib/engine/themes.js`.

The grammar is the **union** of what the two accepted, minus the flattener's `url` false
positive. Be precise about the bare `@import x;` arm, because an earlier draft of the code
comment was not: it is **not** what `checkThemeRoles` extracts (that gate is quoted-only), and
it is not valid CSS either, so real Marp ignores it. It is in the union because
`flattenCssImports` accepted it deliberately — #1680's first cut dropped it and a checker made
it restore it — and narrowing now would re-break what that review fixed.

**Two real defects fell out, one of them mine.**

*Mine:* widening the store to the bare form made a theme's own COMMENT resolve. `lib/theme/serialize.js`
interpolates a Studio user's free-text description into the header comment, so
`"A calm blue palette. Like @import onyx; but warmer."` spliced 768 KB of `onyx` into a theme
that declared no parent — and because `composeCss` strips comments *after*, the leaf's remaining
prose was torn open and read as a selector, silently dropping the rule behind it. A checker
demonstrated it end to end. It does not ship: the scanner skips comments.

*Pre-existing, found on the way:* the **quoted** form had the same hole, and had it before this
change. A comment reading `/* … @import 'onyx'; … */` spliced the palette. On the path, so
fixed in place rather than logged.

**The widening is still not cosmetic.** A theme whose parent import uses the bare form was
composing to scaffold-only CSS — the failure mode #1680 §2 measured for the `-dark` wrappers,
from a different cause.

**Equivalence, measured against the shipped old store** loaded out of a worktree at the base
commit rather than copied, both fed identical bytes:

```
composed CSS identical: 128/128   (32 palettes x 4 sizes: default, hd, story, 4:3)
positive control  (bare import):            2,313 -> 769,370 bytes   — the widening fires
regression control (bare, in a COMMENT):    no leak, byte-identical to the old store
regression control (quoted, in a COMMENT):  old LEAKED 770,735 bytes -> new 2,296  — pre-existing hole closed
negative control  (url() font import):      identical, url preserved — both stores leave it alone
```

**The gate is `test/unit/theme/import-grammar.test.js`**: twenty-two `@import` forms — quoted,
minified, bare, url(), paths, mismatched quotes, uppercase, and five comment shapes including an
unterminated one — driven through BOTH consumers plus the grammar itself.

**Non-vacuity, and what the first cut got wrong.** Four mutations, all firing:

| mutation | arms failed |
|---|---|
| store's OLD private regex spliced back | 2 |
| store gets a private regex IDENTICAL to the shared one | 1 |
| store gets a genuinely DIVERGENT private regex (`/i`, `[^'"]+`) | 2 |
| comment-awareness removed from the shared scanner | 3 |

The middle two **passed** against the first cut of this test, and a checker found that. The
agreement arm derived the store's side by re-reading the bytes through `themeNameImports`, so it
agreed by construction; its candidate list also omitted `a` and `onyx`, which left the
quoted-path and comment rows guarded by nothing. It now observes the store by registering a
uniquely marked stylesheet under every name *either* grammar could produce.

The same review killed a second inert arm. It was titled *"a shared `/g` regex cannot leak
lastIndex between callers"* and could not fail: `matchAll` and `replace` do not advance
`lastIndex` — only `exec`/`test` do — so it passed with a shared literal spliced in. The stated
rationale was wrong in the code comment, this note, and the commit message. The fresh regex per
call stays (it costs nothing and protects a future `exec`-based caller), but it is now described
as defensive rather than load-bearing, and the arm tests the property that is actually true.

That is the session's pattern an eighth and ninth time, both in the evidence rather than the
code. Recording the count because it is the finding: on this thread, the tests and harnesses
have been wrong more often than the changes they were written to check.

## 7. What this note does NOT claim

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
- **A third narrowing of `flattenCssImports` is not in the §4 table**: `@import indaco` with no
  terminator at all, and the media-qualified bare `@import indaco screen;`, both resolved before
  and do not now. Both are invalid CSS and nothing in the repo emits either, but the table did
  not name them and this bullet does.
