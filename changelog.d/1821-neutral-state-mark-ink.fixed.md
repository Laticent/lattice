- **Fixed: the "not yet started" state mark paints a neutral again, not the brand accent.**
  A checklist `- [ ]`, an obligation-matrix `[ ]` exempt cell and a roadmap `planned`
  milestone are all documented as one NEUTRAL tier, and all three asked for that neutral by
  naming `--text-label` — which was neutral when they were written. #1801 restored
  `--text-label` to its accent-hued *emphasis* contract, and the three marks silently came
  with it: on the ten palettes that hue that token from the accent (`ardesia`, `brina`,
  `burgundy`, `carbone`, `carta`, `crepuscolo`, `cuoio`, `indaco`, `laguna`, `magnolia`) a
  "not started" ring rendered saddle gold, one row under the amber `--warn` it was supposed
  to contrast with. All three now read `--muted-mark`, the graphical de-emphasis tier whose
  own definition covers "empty/skipped marks". The token keeps its emphasis contract — the
  fix is on the component side. `todo` and `skip` share that ink deliberately and stay
  unmistakable in the shape channel: `todo` is a hollow ring with no inner mark, `skip` a
  filled disc carrying a slash with its label struck through.
