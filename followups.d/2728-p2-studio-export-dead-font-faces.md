---
origin: 2728
priority: P2
recorded: 2026-10-16
area: website
severity: medium
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md
source: https://github.com/Laticent/lattice/pull/2728
---

# The Studio's Webpage export ships a second, unloadable set of the bundled font faces

Found by #2728's Studio check. Besides the embedded `#lattice-embedded-fonts` block, the Studio export carries `@font-face` rules for Outfit, Playfair Display and JetBrains Mono with relative URLs. Opened from disk under the player's `font-src data:` policy, those faces end in `error` (Chromium's `document.fonts` lists `300:error`, `400:error`, …). The CLI strips relative `@font-face` rules in `assemblePlayer`; the Studio path does not.

They were harmless while every face declared one weight, because Chromium groups identical descriptors and falls back to the working copy. #2728's font merge had to refuse any family declared elsewhere because of them, so the Studio gets no merge savings while they ship.

where — the Studio's `buildSelfContainedDoc` / `share-export.ts` path, against what `assemblePlayer` strips for the CLI (HARD RULE #1: one rule for both hosts).
done when — a Studio Webpage export carries no `@font-face` outside `#lattice-embedded-fonts`, `document.fonts` shows no `error` face, and the Studio export's font block merges like the CLI's. Checked in Chromium and WebKit, old against new pixels.
