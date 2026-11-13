studio: +500
playground: +500
home: +500
getting-started: +500
components: +500
The touch fix for a closing sheet grows the chunk Vite names `overlay-back`, which every route loads early because the sheets (`ui/sheet.tsx`) and the persistent gallery surface (`ui/persistent-surface.tsx`) live there. `ui/focus-return.ts` decides whether to hand focus back to a text field on a touch screen, remembers the last input (a key or a tap) and the control the opening tap landed on, and focuses that launcher instead, so a screen reader keeps its place. CI measured +238 gzip bytes against main on c44ecbf1, before the launcher and its staleness rule landed; rounded up to +500 for those and for build noise. It adds no module and no preload link.
