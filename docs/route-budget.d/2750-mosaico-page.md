studio: +8
This PR changes no code the Studio ships: the Mosaico demo page, its Learn page, the mosaico
README and a doc comment in docs/src/lib/mosaico/index.ts. CI measures +8 bytes of Studio eager
JS against main, but `docs/scripts/measure-route-base.sh` run locally against both 07e11f4 (the
branch's start) and d2a17d1 (main) measures +0 on every route, and the new text appears in no
shipped JS chunk. The bytes are declared so the gate passes; the discrepancy is logged as
followups.d/2750-p1-route-budget-ci-local-mismatch.md.
