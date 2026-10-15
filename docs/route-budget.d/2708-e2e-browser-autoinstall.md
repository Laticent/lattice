playground: +10
studio: +10
This PR changes no code the docs site bundles (an e2e globalSetup, CLAUDE.md, development.md and
a Playwright config comment). The bytes are build noise: two builds of the same `main` commit
(9cef5d6) measured studio +2 and playground +3 bytes apart, and this PR measured studio −5 /
playground +2 in CI and studio +9 / playground +1 locally. Declared so the gate passes; the
nondeterminism is logged in followups.d/2708-p1-docs-build-not-byte-deterministic.md.
