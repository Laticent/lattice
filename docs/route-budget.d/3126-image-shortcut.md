studio: +141
Compose's Placement control writes the slide's class (`placeImage`, `placementAt`) instead of rewriting `![bg]` keywords in the
picture's alt text, and now asks what the engine asks: the scheme allowlist (`url-scheme.js`) and the component names (the
stage catalog). The catalog was already in the Studio, lazily, for reserved names; importing it from Compose moved it into a
shared eager chunk (stage-catalog +619, reserved-names -526), the rest is the placement code (StudioIsland +39).
