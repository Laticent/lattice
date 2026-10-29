studio: +56
playground: +30

The Studio's web-images pre-check (`web-image-hint.ts`) gains one pattern, a Mermaid
`click … href` line, so a deck whose only web address is a diagram link shows the "Load" strip
the scanner already counts it for (followups 2909-p5). That is 22 bytes on the studio route.

`renderMarkdown` (`render-engine.ts`, in the eager `theme-fetch` chunk on studio and playground)
gains a `warmDraw: false` option, so the web-images scan no longer reopens a draw frame the
preview closed. That measured 24 gzip bytes; the lines above add a few bytes of slack for
compression variance. Nothing to give back: one regex arm and one guard.
