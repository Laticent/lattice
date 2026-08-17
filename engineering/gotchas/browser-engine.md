# Gotchas — Browser engine (Chromium quirks observed in Marp Preview / Puppeteer)

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## RETIRED (2026-07-10) — `:not(:has(...))` / `:is(:has(...))` were believed unreliable inside Marp's webview Chromium

- **Original claim:** a selector like `p:not(:has(+ h2))` silently
  misfired in the VS Code Marp preview, and `p:is(:has(+ h1), :has(+ h2))
  > code` matched but silently dropped specific property declarations.
  Both were attributed to a Chromium engine quirk in the "Marp for VS
  Code" extension's bundled webview browser, and gated project-wide via
  HARD RULE #12 (`checkThemeHasSelectors` in `tools/check-ownership.js`,
  scoped to `themes/*.css`).
- **Why retired:** re-tested empirically against a real, current Chromium
  build (131.0.6778.204 — the same one `lattice-emulator.js`/CLI/docs
  playground render with) — both forms behaved exactly per spec, 5/5
  test cases. No corroborating Chromium bug report was found anywhere.
  The gate's own "Removable when: verified across all Marp/Electron
  versions" condition had never actually been checked since the rule was
  written. See `engineering/decisions/2026-07-10-hard-rule-12-retirement.md`
  for the test artifact and full reasoning.
- **If this resurfaces:** it's possible an old/unpatched VS Code install
  still carries the bug even though current ones don't — if you see a
  `:has()`-related selector silently misbehave specifically in the vscode
  Marp preview and nowhere else, that's the symptom to look for. The fix
  pattern that worked before (now undocumented as a live constraint,
  kept here for reference): for `:not(:has(X))`, restructure as an
  ordering/specificity decision (declare overrides after bases, or
  enumerate cases explicitly) rather than negating; for
  `:is(:has(A), :has(B))`, expand to a top-level comma list —
  `:has(A), :has(B)` — which is exactly equivalent CSS.
- **Commits:** `e0fe9b1d`, `5a98bc66` (original mitigations, both now
  historical).

## Marp / Chromium `foreignObject` creates anonymous grid items

- **Symptom:** A grid container inside a section places its children
  in unexpected rows. Inline `<code>` or text adjacent to a block
  child (like `<ul>`) wraps to the next row instead of staying on
  the title line.
- **Cause:** Marp wraps each slide in `<svg><foreignObject>`. Inside
  that foreignObject, Chromium creates separate **anonymous** grid
  items for each inline element when a block child is present in the
  same parent. Anonymous items are auto-placed and don't share rows
  with their siblings the way they would in a normal HTML context.
- **Mitigation:** Use **explicit** grid placement: pin the inline
  element with `grid-column: N; grid-row: N`. The block child then
  spans `grid-column: 1 / -1` for full width on the next row.
- **Triggered by:** Any layout that mixes inline + block children
  inside a grid container.
- **Removable when:** Chromium changes its anonymous-grid-item
  behavior in foreignObject (don't bet on it).
- **Commits:** `b8fecac2`.

## Sub-pixel rounding diverges across Chromium platforms

- **Symptom:** A layout with `calc()` expressions mixing units
  (`calc(50% - 4px)`, `calc(50vw - 1em)`) renders slightly differently
  on Chromium-on-Windows vs. Chromium-on-Linux/macOS. Sometimes a
  pseudo-element gets clipped; sometimes a hairline shifts by a pixel.
- **Cause:** Mixed-unit `calc()` values can resolve to fractional
  pixel coordinates. Different Chromium build targets round
  differently at the rasterization stage.
- **Mitigation:** Avoid mixed units in geometry-critical `calc()`.
  When pattern fills are involved, use a tile size that's a power of
  2 (or at least an integer that divides evenly into the slide
  dimensions) so the tile origin always lands on integer pixels. See
  the rhombic-cell pattern at `--lattice-pattern` (`80×80` SVG).
- **Triggered by:** Layouts with sub-pixel `calc()` results, especially
  those with background patterns or hairline rules.
- **Removable when:** Never reliably — keep sizes integer-friendly.
- **Commits:** `263269dc` (image layout simplification).

## MutationObserver fires on its own writes (self-triggering loop)

- **Symptom:** A debounced render runs twice per change instead of
  once. The second run's restoration loop overwrites the first run's
  in-flight render. SVGs flicker and sometimes vanish.
- **Cause:** `MutationObserver(callback).observe(body, { subtree: true,
  childList: true, characterData: true, attributes: true })` fires on
  ANY DOM change inside `body` — including the writes the callback
  itself makes. If the callback adds or replaces nodes, the observer
  re-fires.
- **Mitigation:** **Narrow the observer** to just the mutations you
  actually need. For mermaid bootstrap that means matching only code
  fence additions (`pre > code.language-mermaid`,
  `marp-pre > code.language-mermaid`) — childList only, not attributes
  or characterData. **Drop `characterData: true`** unless you genuinely
  need text-content updates; SVG text creation during Mermaid render
  fires it constantly.
- **Triggered by:** Any broadly-scoped MutationObserver.
- **Removable when:** Never — observer scope is always a tradeoff.
- **Commits:** `f347baf8`, `997a5726`.
