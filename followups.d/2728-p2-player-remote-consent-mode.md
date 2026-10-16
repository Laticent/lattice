---
origin: 2728
priority: P2
recorded: 2026-10-16
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md
source: https://github.com/Laticent/lattice/pull/2728
---

# Opt-in viewer consent for remote resources in exported players

Ruled by the owner on 2026-10-16 (§4.3 and §7 of the note): zero remote stays the default.

where — the author declares origins, and the packer writes exactly those into `img-src` / `media-src` / `frame-src`. Remote elements ship inert, with the URL in a data attribute. A banner names each origin, and "Allow" swaps the URL in. With JavaScript off, nothing loads and each placeholder carries a plain link. Embeds go in sandboxed iframes.
also — under `--allow-remote`, the CLI probably ships remote `<img>` URLs that its own CSP then blocks. This is inferred from the code, not run; confirm it first.
done when — a deck with a declared remote image exports, shows the banner, loads only after Allow, and loads nothing with JavaScript off. Tested in Chromium, WebKit and Firefox.
