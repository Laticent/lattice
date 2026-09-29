- **Fixed: paging through the Print deck preview no longer builds a new preview per page.** The
  preview cells now come from the Studio's shared preview pool, which reuses its frames, and
  printing the same deck again reuses the frame it already printed. On an iPad, where the browser
  never gives a discarded preview back, paging through a long deck used to hold one preview's
  memory per page viewed for the rest of the session.
- **Fixed: the Print deck preview sits on the Studio's own dark surface, not a fixed navy.** Its
  stage now uses the theme's `--surface-inverse`, the surface the landing page's hero preview
  already uses, so it matches the Studio chrome instead of showing a navy panel no theme but
  indaco uses.
- **Fixed: the Print deck preview stage is sized to the paper.** It was a fixed 180px tall, so the
  sheet showed at 264×160 at every width, with dark bands either side, and a portrait sheet shrank
  to about 100px wide. The stage now takes its height from the paper's proportions, so a landscape
  sheet fills the drawer's width (367×223 on desktop), and a portrait sheet is capped at 420px or
  55% of the screen's height.
