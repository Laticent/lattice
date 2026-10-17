playground: +2
This PR changes the live runtime's logo-wall stamp (lib/transformers/logo-marks.js, shipped in the
runtime bundle loaded inside the preview frame), a test, a spec and docs/public/_headers; nothing
in the playground's eager JS. CI measures +2 gzip bytes there and -2 on the Studio, the same
CI-only drift #2744, #2750 and #2760 hit, logged as
followups.d/2750-p1-route-budget-ci-local-mismatch.md. Declared so the gate passes.
