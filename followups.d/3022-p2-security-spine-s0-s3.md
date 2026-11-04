---
origin: 3022
priority: P2
recorded: 2026-11-03
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-03-security-findings-spine.md §Phasing
deferred: blocked — the census's remaining readers: deck-export.js changes export bytes and waits on the owner's sign-off on a dark and a light render; the rest are hints and a closer that follow it
source: https://github.com/Laticent/lattice/pull/3022
---

# Build the security spine: one policy table, lint warns from source, the renderer blocks

why now   — The owner answered D1 to D5 on 2026-11-03. `lint:deck` has no security rule today, and the facts
            it needs live privately inside `remote-ref.js` (the fetch attribute sets) and
            `sanitize-slide-html.mjs` (the strip list), where only the renderer can read them.
where     — new lib/core/content-policy.js; remote-ref.js and the sanitizers import from it; lint-core.js gains
            the rules; tools/check-ownership.js gains the census rule. The note's §Phasing.
done when — S0: the table exists and the renderer reads it, byte-identical on the corpus. S1: lint warns on
            Markdown web addresses. S2: lint warns on raw HTML and CSS, with lintCoreGz raised by the measured
            amount. S3: the census rule fails on a private reader or a private copy of a list.
evidence  — per phase, as the note's table says; S2's differential (lint warns on exactly what the renderer
            blocks, both run independently on seeded markup) is the acceptance test.
verify    — tier 2 trio for S0 and S2 (they touch the sanitizer's inputs); maker-checker for S1 and S3.

## Status after the spine PR (2026-11-04)

S0 and S1 landed (decision note, "S0, as built" and "S1, as built"). What remains, with what the review found:

- **S2 scope, beyond the note's table.** The renderer blocks these, and `web-image` stays silent on them: a
  `backgroundImage:` front-matter key and `<!-- _backgroundImage: … -->` directive (blocked as `css`),
  ``@video{"…", poster="https://…"}`` (blocked as `css`), raw `<img src>`, and a Mermaid label. Also a duplicated
  front-matter `header:` (the engine reads the last, lint the first) and an address at the site's own origin, which the
  Studio allows (`withOwnOrigin`) and lint cannot know. S2's differential should be committed as a standing test, and
  it should compare addresses, not sites.
- **S2 budget.** `lintCoreGz` has 34 B left under its ceiling after S1; S2 needs the raise D5 allows, through
  `route-budget:rebaseline --raise --ceiling` in its own PR.
- **S3's day-one census, beyond followups.d/3024.** `docs/src/components/studio/web-image-hint.ts` (its own fetch-
  attribute list), `lib/core/pane-css.js` (a private `</style` closer), `lib/core/door-attr.mjs` `ADDRESS_START` (a
  third "is this a network address" test, shared with css-scan.js), `docs/src/components/studio/export/deck-export.js`
  (a per-tag attribute list), and `lib/export/inline-url-media.mjs` (origins by `new URL().origin`).
- **The two gate readers' exclusions rest on "no bypass known".** Before S3 sanctions them, run the svg-intake oracle's
  method (the web-reference fuzz's declarations, judged by three browsers) against `findAddressStrings` and
  `cssRefTargets`.

## Status after S2 (2026-11-04)

S2 landed (decision note, "S2, as built"): the HTML and CSS rules, every source the review listed above (`backgroundImage`,
`@video poster` as the video plugin's `video-web-poster`, raw `<img src>`, a Mermaid label, the repeated front-matter
`header:`), and the differential as a standing test that compares addresses. The site's own origin stays a documented
limit: lint cannot know the site. `lintCoreGz`'s ceiling moved by the measured 13,469 B. S3 remains.

## Status after S3 (2026-11-04)

All four phases landed (decision note, "S3, the census, as built"). What remains is the census's own follow-ups, each a
sanctioned entry in `SANCTIONED_SPINE_READERS` that names this file: move `docs/src/components/studio/export/deck-export.js`'s
url() inliner onto `cssRefSpans` (it changes the Studio export's bytes, so it ships with a dark and a light render for the
owner's sign-off), `lib/core/pane-css.js`'s raw-text closers onto the HTML reader's `rawTextEnd`, and the source hints in
`web-image-hint.ts` and `inline-url-media.mjs` onto the lint rules' readers. `slide-camera.mjs` is followups.d/3024's.

