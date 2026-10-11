---
group: Test & verify
---
Visual regression gate (LOCAL spot-check): render every committed deck fresh and pixel-diff it against its golden PDF; fails on unblessed drift. Covers BOTH scopes — the 75 gallery goldens under lib/ (light+dark) and the 185 single-artifact deck goldens under examples/, exemplars/, design/, themes/ and the CI baseline deck (#1379). `--scope galleries|decks|all` (default all), `--only <gallery-stem|deck/path>`, `--bless`.
