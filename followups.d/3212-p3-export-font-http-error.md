---
origin: 3212
priority: P3
recorded: 2026-11-15
area: website
severity: low
swimlane: engineering/decisions/2026-11-15-studio-map-load-cost.md §4
deferred: off-path — the export pipeline's behavior, which is the owner's sign-off (CLAUDE.md Quality Bar), in a map-performance PR
source: https://github.com/Laticent/lattice/pull/3212
---

# The export encodes an HTTP error page as a font face

```text
  P3 · [no ticket] decide what an export does when a vendored face answers with an error
       why now   — faceBase64 (docs/src/playground/font-embed.js) base64-encodes whatever the
                   fetch returns. A face URL that answers 404 (a tab left open across a deploy
                   asks for the old hashed file) becomes an @font-face whose data is an HTML
                   page: the face never loads, and the PDF / PPTX / PNG / player export
                   completes in a fallback face with no notice. Found by the PR 3212
                   maker-checker review; pre-existing, not worsened. #3212 made the slide map's
                   posters strict (`faceBase64(url, { strict: true })`) and left the export as
                   it was. The icon and emoji rules behind both paths share caches and stay
                   non-strict, so a poster can still keep a broken icon face on that same 404.
       done when — the owner picks the export's answer (fail with a "reload the page" notice,
                   or retry once and then fail, or keep completing but tell the reader which
                   face fell back), and the icon/emoji caches follow the same rule.
       verify    — tier 0 (font-embed.family.test.ts has the 404 arm to extend), plus one
                   real export against a served build with a face path removed.
```
