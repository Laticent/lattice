studio: +32
playground: +10
home: +10

The Studio's web-images pre-check (`web-image-hint.ts`) gains one pattern, a Mermaid
`click … href` line, so a deck whose only web address is a diagram link shows the "Load" strip
the scanner already counts it for (followups 2909-p5). That is 22 bytes on the studio route.

`renderMarkdown` (`render-engine.ts`, in the eager `theme-fetch` chunk on studio, playground and
home) gains a `warmDraw: false` option, so the web-images scan no longer reopens a draw frame the
preview closed: 10 bytes on each of those routes. The numbers above are CI's own measurement
against main. Nothing to give back: one regex arm and one guard.
