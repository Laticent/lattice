- **The Studio's pre-paint shell drew an EMPTY column where the Craft activity rail goes, so a
  reload at Craft on desktop showed a blank 52px strip beside a fully-drawn top bar until the
  island mounted.** The band itself was placed correctly — the seed publishes `--sh-rail` for
  desktop-Craft only — but it shipped as `<div class="ssr-band ssr-activityrail"></div>` with
  nothing inside, so hydration dropped seven panel launchers in at once. The rail is now the
  app's OWN control set at build time: it moved out of `StudioShell` into
  `chrome-parts.tsx` as `ActivityRail`, beside `BarIcon` and `PostureDial`, and both surfaces
  render that one source — the app with live panel state, the shell with every panel closed,
  which is the state the app boots with at every stop. The control-parity matrix now compares
  three chrome regions instead of two (`.ssr-activityrail` against
  `nav[aria-label="Studio panels"]`), so a launcher added to the rail and not to the shell
  fails on the first run; verified to bite by re-emptying the band, which names all seven. A
  new `@minfont` parity case at 1280x720 covers the one case where identical markup was not
  enough: at a raised browser minimum font size the rail's captions push its natural height
  (690px) past its column (666px), and only the app's rail shrank to fit — the shell's flex
  column floored the nav at its content height and the band clipped the rest, leaving the
  account chip 20px low. `min-h-0` on the shell's nav restores the app's box.
