---
group: Lint & audit
---
Chart paint guard across delivery modes: renders the chart gallery through the real composeCss() in headless Chromium (indaco/cuoio/concrete × light/dark). Fails on any NEW opaque-black SVG paint on the scoped preview path (the #956 class), and on any paint a chart LOSES when shown outside its slide: flat (Read · Article, the #2344 class) or baked (a stylesheet-free SVG). Ratchets against test/viz-render/black-baseline.json; a copy-loss entry carries a `why`.
