---
origin: 2615
priority: P1
recorded: 2026-10-08
area: website
severity: high
swimlane: engineering/gotchas/studio-playground.md
source: https://github.com/Laticent/lattice/pull/2615
---

# Verify the stale-deploy swap on a real iPhone after a deploy

#2615 makes the Studio and the Playground swap once to a fresh page when a stale cached copy
names a deleted `/_astro/` chunk. It was verified in desktop WebKit 2215 through a proxy, never
on the reported surface (iPhone Safari, Private Browsing) against the real GitHub Pages CDN.

```text
  P1 · [followups.d/2615-p1-verify-stale-deploy-swap-on-iphone.md] Verify the swap on an iPhone
       why now   — the fix's core claim rests on a proxy (pre-merge card: medium, Evidence)
       where     — docs/src/lib/stale-deploy-recovery.js; gotcha "The Studio stays on its
                   loading shell after you open it" in engineering/gotchas/studio-playground.md
       done when — on an iPhone: open /studio/, wait for a deploy that changes the Studio
                   chunks, then within 10 minutes go home -> Studio. The app appears (one
                   extra load) instead of the shell, and the address bar reads /studio/.
       evidence  — a screen recording from the phone, like the original report's
       verify    — tier 0: an observation on the real surface; nothing to review in code
```
