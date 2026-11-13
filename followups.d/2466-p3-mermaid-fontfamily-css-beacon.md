---
origin: 2466
priority: P3
recorded: 2026-11-10
area: engine
severity: low
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
deferred: off-path — pre-existing on Mermaid 11.17.2 too; the Mermaid 12 bump neither caused nor changed it
---

# A diagram's `fontFamily` directive can carry a CSS `url()` into the SVG's style

```text
  P3 · [no ticket] an author fontFamily value lands in the SVG <style> as CSS
       why now   — the red-team pass on the Mermaid 12 bump: `%%{init: {"fontFamily":
                   "x; background:url(https://evil.example/y)"}}%%` lands in the drawn SVG's
                   `<style>` five times, on 12.3.0 and on 11.17.2 alike. The effect is a fetch of
                   an outside address when a viewer opens the page (a tracking beacon), not
                   script. The CLI bake's page is offline; a deck viewer is not.
       where     — Mermaid's theme CSS assembly, and the engine's handling of an author's
                   `%%{init}%%` (lib/plugins/mermaid/shared/init-directive.js) or the SVG it hands
                   back (lib/core/sanitize-style-text.mjs is the style-channel sanitizer, #22).
       done when — an author font value cannot add a declaration or a `url()` to the drawn SVG's
                   style, with a test on the drawn SVG.
       evidence  — the directive above, before and after, with the drawn `<style>`.
       verify    — tier 1 checker; it is a style sink (HARD RULE #22).
```
