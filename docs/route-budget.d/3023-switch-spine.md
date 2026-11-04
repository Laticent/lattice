studio: +550
playground: +4
home: +4
The Studio's slide panel now reads and writes every on/off through the shared switch spine (lib/core/switches.mjs, imported by slide-provenance.ts), so a slide's `with-X` and `no-X` resolve by the same precedence as the engine, the runtime and lint. The 4 bytes on playground and home are `anima-host-sel` checking `with-motion` before `no-motion`. The same PR takes about 4.9 KB gzip OFF `engineJsGz` against main (the runtime no longer bundles plugins.js).
