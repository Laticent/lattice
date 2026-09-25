---
origin: 2358
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2358
---

# In the exported player, tapping a slide's video poster leaves the deck

why now   — found checking the iPhone report on #2358. The slide's `a.video-poster` reaches the
            player with no `target`, so a tap navigates the player's own tab to YouTube and the
            reader loses their place (offline, it lands on an error page). The reader-view card
            added in #2358 keeps `target="_blank"`, so only the slide poster is affected.
where     — where the player sanitizes or rebuilds slide markup (lib/export/player-core.mjs and
            the sanitizer config it passes), for `a.video-poster`; or a player click handler that
            opens external links in a new tab.
done when — tapping a slide's video poster in an exported player opens the clip in a new tab
            and the deck stays where it was.
evidence  — a Chromium arm on an exported player that taps the poster and asserts a second page
            opened while the first still shows the deck.
verify    — tier 0.
