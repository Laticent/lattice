- **Craft: a docs track for authoring themes, components and finishes.** Twenty-five
  pages under `/craft/`, three tracks read in order — what a theme, a component and a
  finish each is, what each file controls, how to build one from scratch, and the
  checklist that says it is done. Written for someone who has not written CSS before.
- **A live lab on nearly every Craft page.** Twenty-two labs across nineteen pages,
  each a real slide above a real editor: edit the theme CSS, the component CSS or the
  finish CSS and the slide repaints as you type, with a light/dark toggle and a
  reset. Runs the shipped engine through the existing single-slide renderer, so it
  inherits the same sanitizers and palette tracking as the Playground and the
  component specimens.
- **Worked examples, troubleshooting and a glossary.** Each track's finished artifact
  shown whole; the failures that actually happen, sorted by what you are looking at;
  and every term the track uses, including the three that collide.
- **Every CSS example audited against the prose it illustrates.** The syntax-highlighting
  section now shows the twelve `--hljs-*` tokens it names, at values measured to clear
  4.5:1 on the code panel; the ink ramp teaches seven tokens rather than six (`--text-label`
  was missing); the two example manifests now pass `validate()` — they carried invented
  search tags and, in one case, a `capacity` with no `stressDoc`; the finish pages
  distinguish `--fin-mark` from `--fin-mark-text` and scope the 5–16% accent band to
  layers that cover the whole page, which two shipped presets deliberately exceed in a
  narrow one.
- **The diagram lab shows the categorical cycle it teaches.** The `--cat-*` family is
  the one group with **no engine default** — omit it and the tokens resolve to nothing,
  so every node in a flowchart draws in `--surface-inverse` with body ink on top. The
  themes track said omitted tokens "fall back to the engine's defaults" as a general
  rule; that is true of every other group and false of this one. The seed now carries
  four verified slot pairs, and the track names the exception where it matters.
- **Craft labs serve Mermaid from our own origin**, the copy the Playground and Studio
  already use, instead of falling back to the jsdelivr CDN.
- **A third review pass over the track's claims, run before merge.** Seven refutations,
  two of them things a reader would have shipped. The component scaffold seed did not
  match what `npm run new:component` writes — it is now byte-identical to the
  generator's template, and the capstone lab opens on the real thing, whose selector
  the reader's first move corrects. The finish worked example declared
  `--fin-frame: none`; that slot composes into a box-shadow list where `none` is legal
  only as the sole value, so the declaration went invalid and took the tone rail with
  it (measured live: the rail resolves with `0 0 transparent` and vanishes with
  `none`). Also corrected: the specificity gap is lab-versus-engine, not
  component-versus-engine; nothing gates an empty `whenToUse`; `ledger`'s mark is
  ~14px, not a hairline; `color-mode:` has five values and one of them is `print`;
  and nineteen of twenty-five pages carry a lab, not twenty-two.
- **The specificity remedy the track taught did not work.** Repeating a component's
  class buys back one class, but the `article.lattice >` prefix the engine adds is a
  class *and* an element name — so against a base rule that names a class of its own
  (`section.form > .cell-stage`, the first one an author meets) the doubled selector
  still loses. Measured in the built lab: plain 8px, doubled 8px, tripled 42px. Both
  pages that gave the advice now say what doubling buys and when it is not enough.
- **Following the tracks end to end, rather than reading them.** Running
  `npm run new:theme` and `npm run new:component` and doing what the pages say turned
  up what no reading pass could: the theme scaffold writes four files (the track showed
  three), leaves `build:check` red until `npm run build`, stamps a `#FF00FF` placeholder
  swatch nothing reminds you to replace, and leaves the palette suite red until
  `bless-palette-baselines` has frozen the new palette's measurements — while the
  component scaffold makes `npm test` fail *by design*, which the checklist listed as a
  green checkbox. All now documented where the reader meets them.
- **The scaffold seed is gated, not trusted.** `test/unit/tools/craft-scaffold-seed.test.js`
  renders the generator's own template and compares it byte for byte with the lab's
  seed — the one place the track claims a match with a command the reader just ran.
