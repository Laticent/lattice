playground: +2

The Playground bundles the shared lint core (`lib/authoring/lint-core.js`, via
`docs/src/playground/authoring-core.generated.js`), and this PR changes one rule's severity in it:
`pane-syntax` is now `'warning'`, not `'suggestion'`, so a release carries the warning before the
experimental pane alias can be retired (the 2026-09-28 pane-layouts note §9). That one string is the
2 gzipped bytes, measured by CI against main. Nothing else on the route moved; the Studio's eager JS
fell 18 bytes.
