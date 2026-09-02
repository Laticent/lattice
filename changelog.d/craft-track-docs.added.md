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
