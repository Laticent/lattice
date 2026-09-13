- **Two chart labels that print on a tinted mark now use the body ink, and the
  family is AA-clean on every theme.** `state-chart`'s step ordinal and
  `kanban`'s size token were both set in `--text-muted`, which is calibrated
  against the slide — but neither sits on the slide. Measured on the rendered
  gallery they were **4.02:1** (light) / **4.48:1** (dark) and **4.49:1** /
  **3.38:1** against the surfaces they actually sit on, all under the 4.5:1 floor.
- Verified across **12 themes × 2 media** — light, dark, all five `a11y-*`
  variants, in `screen` and in `print` (the media the CLI vector PDF renders
  with): **0 text contrast failures**, down from up to 9 per theme.
