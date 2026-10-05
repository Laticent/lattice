- **The Studio chat checks that its slides fit.** Each edit is rendered off-screen and the
  agent is told which slides overflow, cut text or shrink type below the legibility floor. An
  overflow on a slide it wrote counts as an error, so it fixes the slide before you see the
  change. (`docs/src/components/studio/draft-fit.ts`)
