studio: +9
playground: +2
This PR changes the live runtime's logo-wall stamp (lib/transformers/logo-marks.js, shipped in the
runtime bundle loaded inside the preview frame), a test, a spec and docs/public/_headers; nothing
in any route's eager JS. CI measured +2 on the playground before the rebase and +9 on the Studio
(-3 on the playground) after it: the same CI-only drift #2744, #2750 and #2760 hit, moving between
routes from run to run, logged as followups.d/2750-p1-route-budget-ci-local-mismatch.md. Declared so
the gate passes.
