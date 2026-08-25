- **The kpi status pill's ground no longer follows the tile it lands on.** It was the
  palette's `--pass-bg` / `--warn-bg`, which are `color-mix(… N%, transparent)` — an alpha
  tint, so the same pill scored three different ways across the three tiles kpi paints it on,
  and the ink sat on a tint of *itself*. It is now `--kpi-{pass,warn}-pill-bg`, one opaque 8%
  mix into `--bg`, declared once and shared by all eight per-modifier sites. Clears **30** of
  the 66 frozen sub-AA pairs, worst `carbone|light` hero-warn at 3.24:1.
- **The pill's border is measured for the first time.** An opaque ground can land on its
  tile's own color, so the border is now what guarantees the chip has an edge — four new
  surfaces in `tools/composed-contrast.js` with a justified 2.5 floor and the reasoning
  written down, on the `PANEL_EDGE_MIN` precedent.
- **`policy-recommendation`'s stance tint is 9%, down from 12%** — the measured knee. Clears
  the eight `amend` badge pairs; 8% clears no more and would cost the ask bar's fill.
- **`redline`'s own-hue card is 4%, down from 5%**, levelling it with the four `.split` /
  `.three-col` sites that always shipped at 4%. Clears four dark-arm `<del>` pairs.
- **The frozen contrast baseline falls from 66 pairs to 22**, with no palette file touched and
  no curated hue moved. What remains is `carbone`'s light arm — inks for a light canvas the
  palette does not have yet, which #1302 owns — and `concrete`'s dark `--fail`, re-derived as
  infeasible without a visible design change.
