home: +1123
The home page's two live demos (the slide-jobs picker and the venue demo, PR #3618) load their bodies with `import()` once they near the viewport; the eager cost is the one shell module that waits for that (`docs/src/components/landing/LiveDemos.tsx`, 1,123 B gz). The owner raised the home ceiling 1,536 B for it in its own PR (#3629, "D1 A").
