studio: +10
playground: +10
This PR changes no code the docs site bundles: a bench tier under test/benchmark/, two e2e specs,
workflow.md and followups.d/. CI measured studio +4 and playground +1 bytes against main (3f85abb
merged into 68d9eac). Two fresh local builds of the same pair, one of 68d9eac and one of the merge,
each in its own worktree, measured identical on every metric of every route. So the bytes are CI-side
build noise of the kind #2708 declared, which survives #2709's checkout fix. Declared so the gate passes.
