- **Added: `npm run check:jank` — a sweep that asks whether a layout stays put as its
  content grows.** Every fit gate in the repo asks whether content *fits*; none asks
  whether a box *moves*. The new tool renders one slide per content step (the deck built
  from the component's own manifest skeleton, so its documented chrome is in the sweep),
  measures the real geometry in Chromium, and reports the three failures nothing else
  sees: an anchor that **drifts** as the content grows, a **collision** between an
  absolutely positioned box and a flex-centered one — which overflows nothing, so no
  channel in the engine reports it — and **crowding** into the section's padding, inside
  the frame and untagged. `--anchors` lists the marks a component has and how far each
  travels, so the first run does not need a suspicion to start from; `--anchor
  'h2::after'` names what must hold still; `--style` injects CSS so a fix can be proved by
  sweeping with it neutralized; `--json` for machine use. A setup it cannot measure —
  a bad flag, an anchor that resolves on some slides only, a sweep with no ink on any
  slide — exits 2 rather than reporting a clean 0. The tool is on-demand; its
  falsifiability test (`test/integration/invariants/jank-sweep.test.js`, 18 arms,
  ~100s)
  runs in the PR tier, because a geometry rig that has quietly stopped finding anything
  reports "no collision" for the same reason an unplugged smoke alarm reports no fire.
  The method and its judgment calls are documented in `engineering/jank.md`.
