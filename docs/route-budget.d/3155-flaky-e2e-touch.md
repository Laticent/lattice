playground: +181
studio: +20
home: +80
getting-started: +20
The Playground's Explore switch no longer loses the reader's deck: a warm-up walk that lands after the switch is waited
for instead of written over the preview, a draft one keystroke ahead is patched rather than rewritten, and only a render
made while a walk exists spends the open-on-the-caret target (PlaygroundIsland, +161 gzip bytes). Every route's shared
sheet and panel chunks carry the overlays' longer exit classes, which keep a reopened dialog from being drawn under its
own dimming (overlay-back +13, panel +7). The home page's palette picker also counts its renders in flight on its stage (RestyleShowcase,
+60), the signal restyle-overlap.spec.ts waits on instead of a 1.5 s sleep.
