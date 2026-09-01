- The docs end-to-end suite starts again when an agent runs it on astro 7. astro 7 backgrounds
  `astro preview` when it detects an agentic environment — not unconditionally, and not on a CI
  runner — and a command that exits makes Playwright report
  `Process from config.webServer exited early` before any test body runs. `npm run preview:e2e`
  goes through `docs/scripts/preview-e2e.mjs`, which serves IN-PROCESS through astro's programmatic
  `preview()`, so there is no fork to detect and CI and an agent session behave identically. It
  sets `strictPort`, so a busy port fails loudly instead of sliding to the next one and leaving
  Playwright waiting out its timeout on a URL nothing is serving.
