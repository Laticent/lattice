# Visual review at scale — parallel agent fan-out

The QUALITY BAR (`CLAUDE.md`) says: rebuild and **actually look at it**. For a
single slide or screen, one agent is enough. A **large visual sweep** is not:
every gallery, a whole-bucket layout audit, a theme rolled across all
components, a responsive pass over many pages — too much for one agent to review
carefully in sequence. Fan it out.

This is MAKER-CHECKER (`CLAUDE.md`) applied to rendered pixels instead of a diff,
and it is the proven pattern. The 2026-06-06 layout audit reviewed all 58
components this way (`engineering/decisions/2026-06-06-layout-audit/README.md`):
11 maker agents, one per bucket (the two largest buckets each got their own),
then 11 independent checkers that re-rendered and adversarially re-scored. The
checkers overturned several maker claims.

## When to fan out

Reach for it when the surface to *look at* is large and splittable:

- all per-component / per-bucket gallery PDFs (light **and** dark),
- a layout or theme audit spanning many slides,
- a docs-site change to verify across desktop · tablet · mobile (§ below),
- a rubric-scoring pass over any large set of components or pages.

Don't fan out a one-slide tweak or a single screen — just look yourself. This
earns its latency only when parallel eyes beat one agent reading in sequence.

## The unit of parallelism — split by content, never by carving a slide

**Split by independent content unit: one agent per deck, per bucket, or per
breakpoint.** Each agent looks at *whole slides*.

**Do not tile a single slide across agents.** Alignment, balance, type
hierarchy, and dead canvas are properties of the whole slide. Give one agent the
top-left and another the bottom-right and neither can judge the composition. The
layout audit split by *bucket* — whole, independent decks — for exactly this
reason.

The one exception is **4K detail drilling**. When a single 4K slide carries more
detail than the API's 2000px-per-image limit can show, split it into regions
with `tools/rasterize-for-review.sh --region` / `--crop`, one agent per region,
to inspect type and stroke fidelity at full resolution. Always pair this with
one agent on the full-slide `--overview` render, so the composition is still
judged as a whole — regions verify detail, they cannot tell you the layout holds.

## The loop

1. **Maker pass.** Spawn N agents in one message, one per deck/bucket. Each
   rasterizes its PDFs to PNG, **views every page**, reads the source and CSS,
   and scores against the rubric
   (`engineering/decisions/2026-06-06-layout-audit/`).
2. **Checker pass.** Spawn N independent agents that re-render the same
   artifacts and adversarially verify every maker claim —
   CONFIRM / REFUTE / REVISE — catching missed issues and re-scoring. The
   checker-adjudicated scores are authoritative.
3. **Lead verification.** Re-render the highest-severity claims first-hand
   before acting. Pixels, not summaries.

Spawn the makers (then the checkers) **concurrently**: one message, multiple
`Agent` calls.

## What each agent runs (don't reinvent — these already exist)

- **PDF → images, full quality:** `tools/rasterize-for-review.sh <pdf> --overview`
  fits a whole slide under the 2000px inline limit (poppler-only, no Chromium);
  `--region` / `--crop` for detail. See the script header for all modes. `Read`
  the output PNG and it renders inline.
- **Deck → per-slide PNG (no PDF in hand yet):** render with the owned engine,
  `node dist/lattice-emulator.js <deck> .scratch/x.pdf`, then rasterize as above
  (`tools/rasterize-for-review.sh .scratch/x.pdf --overview`) for one PNG per
  slide. Needs `CHROME_PATH` for the render; see `engineering/development.md`
  (cloud-sandbox tooling) and `engineering/gotchas.md` (the "no browser" symptom).
- **Web UI:** `tools/screenshot.js <url> <png> --width …` at the three
  breakpoints. See `engineering/development.md` § Previewing the docs site.
- **Drift:** `tools/pixel-check.js`, to catch unintended changes vs. the last
  commit.

Write all PNGs under `.scratch/` (gitignored, 14-day GC).

### Responsive sweeps — desktop · tablet · mobile

For a docs-site change, split by breakpoint: one agent per width (~1440 / ~820
/ ~390px). Each screenshots every changed route at its width, then makes the
cross-cutting "familiar across all three" call the QUALITY BAR requires. Same
maker-checker discipline, same whole-screen rule — don't split one viewport
across agents.

## The export surface — review the artifact, not the preview

The browser export pipeline (Studio/Drawing Board Share → PDF / PPTX;
`docs/src/playground/drawing-board-export.js`) is a THIRD renderer, and it
diverges in its own ways: html-to-image inlines computed styles onto
HTMLElements only, so anything styled from the document stylesheet inside an
`<svg>` needs explicit baking (see `engineering/gotchas.md` § "Charts export
black/unstyled"). A change that renders perfectly in the live preview and
through lattice-emulator can still export corrupted — the black-chart jargon
export shipped exactly that way.

So for ANY export-pipeline change (the capture frame, the rasterizers, the
worker, html-to-image usage, fonts embedding):

1. Build the docs site, open the real Studio, paste
   `test/fixtures/export-coverage-deck.md` (the capture-sensitive component
   sweep: chart SVGs, Mermaid, ribbon chrome, dark bookend), run Share → PDF,
   and **look at every page** of the downloaded artifact.
2. The `chart-export` e2e journey (`docs/e2e/journeys/chart-export.spec.ts`)
   drives the same fixture headlessly and pins the SVG style-baking mechanism —
   run it locally before pushing; it fails on a regression by probe timeout.
3. "It downloaded and the toast fired" is a presence check, not fidelity —
   never accept it as verification of a rendering change.

## Output

Fold the checker-adjudicated findings into one prioritized list and fix what's
short of excellent (QUALITY BAR). For export-affecting work, STOP and show the
human both dark and light renders for sign-off. Durable audit findings belong in
an `engineering/decisions/` note, as the layout audit did.
