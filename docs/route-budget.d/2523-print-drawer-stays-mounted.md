studio: +332
playground: +17
home: +16
components: +16
getting-started: +16
The Studio's Share sheet now stays mounted after its first open, so the Print drawer keeps its
preview frames and its print frame between opens (WebKit never frees a destroyed preview
document). The Studio's bytes are that keep-mounted logic: the Share sheet's show counter and
frozen Print view, and the Print panel's per-show reset, `inert` print frame and cancelled-print
check. The 16–17 B on every other route is `PanelSheet` in the shared `ui/panel.tsx`, which now
honors the instant-open flag on its persistent branch and passes a `ref` through `PanelBody`.
Nothing to give back: none of it is reachable without the Share sheet or the panel primitive it
changes.
