---
origin: 3024
priority: P2
recorded: 2026-11-03
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §Phasing
deferred: off-path — four readers in other surfaces (the theme gates, the code door, the photo layer, SVG intake); #3024 moved the CLI export and the next PR the Reading view's prune
source: https://github.com/Laticent/lattice/pull/3024
---

# Four CSS reference readers the Segno census never counted (five found, one moved)

why now   — R4's census was a hand-kept list, and every reader on it now reads through `cssRefSpans`. The inversion
            review of #3024 searched the tree for readers that decide a fetch, an embed or a refusal, and found five
            no list named (decision note, "R4: the CLI export", "Readers the census never counted").
done      — `lib/export/player-prune.js` `namesRemoteResource`, the Reading view's prune, now reads `cssRefSpans` and
            `isRemoteRef` (decision note, "R4: the Reading view's prune"). Traced: an imported theme reaches it, behind
            the theme gate and `blockWebCss`, so the escape slipped past only its drop-every-remote rule.
next      — `lib/core/css-scan.js` `findAddressStrings` (theme, layout and package gates; decodes escaped names, no
            bypass found), `lib/core/door-attr.mjs` `cssRefTargets` (no bypass found), `lib/core/slide-camera.mjs`
            `CSS_URL` / `REL_URL` (misses `u\72l(`: a missing picture, not a leak),
            `docs/src/components/studio/motion/svg-intake.ts` `EXTERNAL_URL_RE` (not traced).
done when — each reader is moved onto the shared readers or its exclusion is written down with the reason, and the
            census is a command, not a list. That command is the security spine's S3 census gate
            (`followups.d/3022-p2-security-spine-s0-s3.md`, note `2026-11-03-security-findings-spine.md` §4): this
            item is the list it will find on day one, so do it with S3 or before it.
evidence  — per reader moved: a differential against a frozen copy and a Chromium oracle, as R4 did.
verify    — tier 2 trio for any reader that decides a refusal.
