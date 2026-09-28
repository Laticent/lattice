---
origin: 2435
priority: P1
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2435
---

# Settle the two open points in the code-package input, then document code packages publicly

```text
why now   — #2435 shipped `slide.facts`, the stable input the owner asked for before code packages go public (contract note §9, "both, in two steps"). Two points the inversion lens raised are still open, and each is cheap to change now and a breaking change once outside packages exist. Documenting code packages publicly is unblocked by #2435 and waits only on these.
where     — engineering/decisions/2026-09-24-code-package-contract.md §11 "Open, for the owner"; lib/packages/slide-facts.mjs (`tokens`, FACTS_VERSION); lib/packages/code-door.js and docs/src/lib/code-packages/door-run.ts (where `tokens` is passed); lib/packages/gate.js `refuseCode` (where a manifest facts version would be checked); the public docs site (docs/src/) for the write-up.
done when — (1) DONE 2026-09-28: the owner chose the full theme contract (`requiredTokenList()`), which is what #2435 ships, recorded in contract note §11; (2) the owner has decided whether a manifest declares the facts version it reads, and a door refuses a mismatch, and that is implemented or explicitly declined in §11; (3) a public docs page explains writing a code package: the `slide` shape with `facts` as the promise and `html` as the tweak surface, `kit.measure`, the worker (no document, no network), consent, and the class and address rules.
evidence  — the unit tests for the token list and the version check; the docs page screenshotted with tools/screenshot.js at 1440/820/390; the dateline conformance package from test/integration/export/code-package-door.test.js still drawing in the real CLI with 0 requests.
verify    — tier 1 checker, because (1) and (2) narrow an input the trio already reviewed and the docs page is prose; move to tier 2 if (2) adds a new refusal path to the door.
```

Needs the owner's two answers first: ask them in one round with a recommendation each (a curated list; a manifest version with refusal), then proceed.
