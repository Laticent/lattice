---
origin: 2328
priority: P4
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2328
---

# lint:deck is super-linear on large untrusted input — measured on main, not by #2328

```text
why now   — lint-core runs on the browser main thread over untrusted decks (HARD RULE
            #22). On origin/main, `lintTextWith` over one slide holding a single 1 MB
            line of `<!--` repeated takes ~68 s; 280 KB of `a <!--` lines ~3 s; 250 KB
            of `<!-- ` then one `-->` ~4 s. #2328's own rules take 0.08-0.09 s on the
            same inputs, so the time is in rules that predate it.
where     — lib/authoring/lint-core.js lintTextWith: profile the rule loop
            (node --cpu-prof) on the three inputs above to find the offending rule(s).
done when — each input lints in well under a second, and a timing arm pins it the
            way `comment blanking stays linear on untrusted input` does.
evidence  — before/after timings on the three inputs, same machine.
verify    — tier 1 checker, because the fix will touch a browser-bundled parser
            path that reads untrusted text.
```
