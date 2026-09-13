- `guards: strict` no longer removes more text than it needs to. The measurer read a
  slide's geometry in two units at once, so a scaled preview cut a paragraph to a sixth
  of its lines; `line-height: normal` was guessed at 1.4x the font size, which cost seven
  lines on a 16px face; and the line count was rounded rather than counted. All three are
  measured now, from the renderer's own line boxes and in the same unit the overflow
  probe uses. Every existing gate could see a cut that was too SMALL and none could see
  one that was too large — the new post-condition (a clamp never leaves a whole line of
  its box empty) is that arm. Driven on the real Playground: the same deck now clamps to
  the same line count at a 42% and a 33% preview scale, where it previously cut to three
  lines at one width and went silent — with the overflow ring on — at the other.
- The live preview and the export now reach the same verdict on a trim. They shared the
  kernel and not the policy: the export refused a cut that did not make the slide fit
  while the runtime kept it, so a `--fluid` export shipped a clamp — on a slide still
  carrying the overflow ring — that the same run's console reported as reverted.
- A residual too small for the overflow warning to see no longer passes as a fit, and a
  residual on a box the guard never touched no longer throws away a good cut elsewhere on
  the slide.
- Clamping one column no longer credits its recovered height to another. A two-up card
  the planner declared fitting came back 16px over, and the guard then threw the whole
  cut away — so `strict` was refusing fits it could have made on exactly the split
  layouts it exists for.
- An author's own `id` can no longer collide with the guard's internal one. A deck
  writing `<p id="s1tb0">` could make the guard clamp a different element than the one it
  planned, including a heading, which no role is ever allowed to be.
- A throwing overflow probe now counts as "still overflowing" rather than as a pass, and
  the export and the runtime resolve `guards-strict` with the same matcher —
  `no-guards-strict` used to enable the trim on one path and not the other.
