---
origin: 2329
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2329
---

# Sweep the remaining `neighbour*` spellings

why now   — the #2279 brief named two British spellings and #2329 fixed those two. A grep
            found 41 more lines outside engineering/decisions/, exemplars/, the changelog
            archive and the US-English tooling, in code comments, tests, docs and e2e specs
            (HARD RULE #21).
where     — `grep -rn -i neighbour . --exclude-dir={node_modules,dist,.git,decisions,exemplars,changelog,followups.d} --exclude=BACKLOG.md --exclude=mermaid-v11.min.js --exclude='us-english*.js'`
done when — that grep returns only EXTERNAL strings (a quoted stemmer case, a test fixture
            asserting the British form), each one named in the PR.
evidence  — the grep before and after.
verify    — tier 0: the gates. Check each hit for #21's external-string carve-out.
