studio: +1100
playground: +250
home: +250
The Studio's Library now holds photos, and a deck can show one with `asset:<name>`. The Studio carries the Images tab's wiring in the shell (the asset stamp in the preview cache key, the open-deck effect and the live usage count) plus the small `asset-render-hook`; CI measured +859 bytes gz before the change below.
Given back first: the Library-photo code does not live in `render-engine.ts`, which the home page and the Playground share and which has no Library to serve there. It is a registered hook that only the Studio installs, and the registry, the IndexedDB read and the object-URL code are a dynamic import that loads when a deck names a photo. CI measured +367 (Playground) and +365 (home) when that code sat in `render-engine.ts`; what remains on those two routes is the hook slot itself. The sanitizer's `blob:` allowance is the rest: it is in the shared `sanitize-slide-html.mjs`, which every preview imports.
