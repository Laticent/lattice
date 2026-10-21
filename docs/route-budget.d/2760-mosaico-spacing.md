playground: +3
This PR adds about 2 KB of source to @laticent/mosaico (padding, column and row gaps, align,
container units, frame and placed), which ships in the engine bundle, not in the playground's eager
JS. CI measures +3 gzip bytes of playground eager JS against main and -12 on the Studio; a change of
that size is the same CI-only drift logged as
followups.d/2750-p1-route-budget-ci-local-mismatch.md. The bytes are declared so the gate passes.
