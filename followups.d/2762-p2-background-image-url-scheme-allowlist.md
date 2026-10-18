---
origin: 2762
priority: P2
recorded: 2026-10-17
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-17-meta-record.md
source: https://github.com/Laticent/lattice/pull/2762
---

# Add a scheme allowlist for background-image and logo URLs.

Found by the red team on the @meta design (PR #2762). Verified on `main` with `lib/engine/index.js` `render`:
`<!-- _backgroundImage: url(javascript:alert(1)) -->` and `<!-- _backgroundImage: url(https://evil.example/b) -->`
both reach a real `background-image` declaration on the `<section>`. `javascript:` is inert in modern browsers; the
remote URL is a fetch every time a shared or exported deck is opened (HARD RULE #22 names the beacon-in-every-copy harm).
No other value is affected: `_color: red;background:url(...)` stays inside a quoted custom property.

```text
  P2 · [no ticket] Add a scheme allowlist for background-image and logo URLs.
       why now   — the @meta design (D11) promises that the host guards URL-typed fields, and today nothing does;
                   the guard is built once for the new record and the existing comment path.
       where     — lib/core/bg-image.js and the declaration sink in lib/engine/slides.js (quoteDeclValue,
                   realDeclValueIsSafe); allowlist: relative paths, data:image, https:.
       done when — a `javascript:`, `file:` or `data:text` URL is dropped with a diagnostic; https: and relative
                   paths still render; a unit test pins each.
       evidence  — the before/after render of the two decks above.
       verify    — tier 1; unit tests plus a render of a deck with a background image.
```
