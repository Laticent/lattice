- **Fixed: 57 British spellings in house prose, and the remaining 34 are now named
  rather than merely absent.** HARD RULE #21 says the tree is swept but not zero and
  declines to restate a total, because the tool that measured the original 71 was
  deleted with the ratchet. A fresh pass with `britishFormRe()` over the repo text
  files plus tracked `.py`, the same matcher on both trees, counted 91 in living
  surfaces before and 34 after. (The gross total barely moves, 482 to 463, because a
  British-to-American map is itself a list of British words.) The `modelled` cluster
  across the three contrast oracles was most of it; the rest were `catalogued`,
  `signalled`, `minimisation`, `behaviourally` and `organisations` in tools, tests,
  specs, docs and four exemplar decks.
- **`engineering/decisions/2026-08-30-british-spellings-remainder.md` lists every
  spelling that stays, with its reason** — GitHub's `cancelled` enum, the OECD's legal
  name, a synonym key an author might type, a pre-registered fixture, a dated decision
  filename, a generated file, a deliberate mention. HARD RULE #21 forbids touching an
  external string, and the last sweep that did shipped three regressions no gate caught.
- **Five `camelCase` identifiers in `tools/check-ownership.js` are renamed** —
  `sectionBoxOffences` and four siblings, 65 sites across the tool and its test. HARD
  RULE #21 says to name identifiers US too, and nothing had ever checked. The one
  remaining hit is `_emphasised_`, markdown emphasis inside the pre-registered benchmark
  calibration document, whose bytes set the `bench:check` baseline.
- **The stemmer audit now reads tracked `.py` files.** `tools/ascii-preview.py` held a
  British spelling that the build pastes into `quote.docs.md` and
  `dist/docs/components.md`, so it was visible in two generated files while its source
  sat outside the walk's extension list.
