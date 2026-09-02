- **Added: `npm run check:jank` — a sweep that asks whether a layout stays put as its
  content grows.** Every fit gate in the repo asks whether content *fits*; none asks
  whether a box *moves*. The new tool renders one slide per content step (the deck built
  from the component's own manifest skeleton, so its documented chrome is in the sweep),
  measures the real geometry in Chromium, and reports the three failures nothing else
  sees: an anchor that **drifts** as the content grows, a **collision** between an
  absolutely positioned box and a flex-centered one — which overflows nothing, so no
  channel in the engine reports it — and **crowding** into the section's padding, inside
  the frame and untagged. `--anchor 'h2::after'` names what must hold still, `--style`
  injects CSS so a fix can be proved by sweeping with it neutralized, `--json` for machine
  use. On-demand, not a CI gate. The method and its judgment calls are documented in
  `engineering/jank.md`.
