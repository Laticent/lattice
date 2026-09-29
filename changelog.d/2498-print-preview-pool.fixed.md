- **Fixed: paging through the Print deck preview no longer builds a new preview per page.** The
  preview cells now come from the Studio's shared preview pool, which reuses its frames, and
  printing the same deck again reuses the frame it already printed. On an iPad, where the browser
  never gives a discarded preview back, paging through a long deck used to hold one preview's
  memory per page viewed for the rest of the session.
- **Fixed: the Print deck preview sits on the Studio's own dark surface, not a fixed navy.** Its
  stage now uses the theme's `--surface-inverse`, the surface the landing page's hero preview
  already uses, so it matches the Studio chrome instead of showing a navy panel no theme but
  indaco uses.
