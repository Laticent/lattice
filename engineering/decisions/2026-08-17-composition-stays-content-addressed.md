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
| `resolveThemeImports('indaco-dark')` — what `cssFor` actually calls | **0.028** |
| `cssFor('indaco-dark')`, uncached | **41.4** |
| share | **0.07 %** |

(Measured on this machine, 200 iterations, `dist/lattice.css` as the base. The often-quoted
2.27 ms figure is the scan over the 1 MB *base* sheet — a call `cssFor` never makes: it hands
`resolveThemeImports` the theme, and `composeCss` inlines the base separately.)

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
`replaceThemeNameImports(css, fn)`, over one private regex built fresh per call (a shared
`/g` literal carries `lastIndex` between callers, which would make one scan resume mid-sheet
after another's). `flattenCssImports` reads through the first; `ThemeStore.resolveThemeImports`
rewrites through the second, and `THEME_NAME_IMPORT_RE` is gone from `lib/engine/themes.js`.

**The widening is not cosmetic.** A theme whose parent import uses the bare form was silently
composing to scaffold-only CSS — the same failure mode #1680 §2 measured for the `-dark`
wrappers, from a different cause:

```
@import indaco;  (bare)   before:   2,313 bytes   (scaffold only)
                          after:  769,370 bytes
```

**Equivalence, measured against the shipped old store** loaded out of a worktree at the base
commit rather than a copy of it, both fed identical bytes:

```
composed CSS identical: 128/128   (32 palettes x 4 sizes: default, hd, story, 4:3)
positive control (bare import):  2,313 -> 769,370 bytes   — the widening fires
negative control (url() import): identical, url preserved — both stores leave it alone
```

**The gate is `test/unit/theme/import-grammar.test.js`**: fifteen `@import` forms, eight that
must resolve and seven that must not, driven through BOTH consumers plus the grammar itself.
Confirmed non-vacuous three ways — restoring the store's old regex fails 4 arms, restoring the
flattener's old regex fails 4 arms, and splicing a private regex back into the store fails 2.

That third mutation is worth recording, because the first version of the agreement test **did
not catch it.** It derived the store's side by re-reading the bytes through `themeNameImports`,
so the two sides agreed by construction and it passed with the grammar re-split — a test that
asserts the invariant it is named for and cannot observe it. It now observes the store by
registering a uniquely marked stylesheet under every name either grammar could produce and
reading which markers got spliced. The session's pattern, a seventh time, in the test this time.

## 7. What this note does NOT claim

- It does not claim `resolveThemeImports` is optimal, only that replacing its SOURCE with the
  manifest is a net loss. Unifying its regex with `chain.mjs`'s is a separate, positive change.
- It does not claim the store can never know a declared edge. `add(name, css, { extends })`
  — the caller declaring what it read from the manifest — is a coherent design; it was rejected
  here because it still cannot remove the content path, so it also lands at two sites.
- The divergence in §4 is **not verified as live**. Constructing an input that reaches it
  requires a caller-supplied stylesheet using the bare form, which nothing in this repo emits.
