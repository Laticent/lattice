studio: +1500
playground: +100

Compose becomes the Studio's default way to write (PR #3128,
engineering/decisions/2026-11-10-compose-first.md). The eager Studio bundle carries the new
pieces that must be ready before the editor pane paints:
- the stored writing mode;
- the shared `EditModeToggle`;
- the header row's measured fit, which keeps the Compose and Source words until the pane
  cannot hold them;
- Compose's Fix all and Refine wiring;
- the Compose-first tour and lesson lines.

At `ff7b9f4` CI measured +1221 gzip bytes on studio (StudioIsland +911, tours +270,
studio-store +40). It also measured +85 on playground, because the Playground shares the tour
lines table. The checker's fixes in the next commit add a little more. The heavy parts stay
lazy: the lint pass behind Compose's Fix all is `deck-lint.ts`, loaded with `import()`.
