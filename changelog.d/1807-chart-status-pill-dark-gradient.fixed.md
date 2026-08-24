- **Fixed: the `chart-status` pill's dark gradient no longer washes out its own
  label.** The pill mixes its status hue into black and labels the result with
  `--text-heading`; those stops were calibrated for the dimmer status hues that
  predate the trio respacing, so a lighter `--pass` lifted the ground toward the
  light label. Measured across all 32 palettes and 5 states, the worst pair was
  `laguna|pass` at **3.12:1**, and `crepuscolo|pass` surfaced as a real sub-AA
  finding on a rendered `--player` export. The dark stops move `48%` → `42%` and
  `64%` → `54%` — the minimum that clears, worst now 4.62:1. This is the same
  correction the trio respacing made one file over for `--state-*-fill`
  (`58%` → `50%`); the pill's own gradient was its missed sibling.
- **Added: `tools/composed-contrast.js` now models the `chart-status` pill.**
  Five surfaces (`chart/status-pill-pass` … `-mute`) score `--text-heading` on the
  gradient's 100% stop, on both arms. Nothing analytic could see this surface
  before, because its ground is a raw `color-mix()` rather than a `*-bg` token — it
  took a rendered export to find it. The new surfaces immediately caught 19
  sub-threshold pairs on the pill's **light** arm, worst `concrete|pass` at 2.48:1;
  those carry no regression, are frozen with their measurements, and are tracked as
  #1807, because clearing them means restyling every status pill on every palette in
  light mode.
