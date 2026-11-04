---
origin: 3024
priority: P2
recorded: 2026-11-03
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §Phasing
deferred: blocked — slide-camera.mjs changes picture-export bytes, which waits on the owner's sign-off on a dark and a light render of a representative deck (CLAUDE.md Quality Bar)
source: https://github.com/Laticent/lattice/pull/3024
---

# Three CSS reference readers the Segno census never counted (five found, two moved)

why now   — R4's census was a hand-kept list. The inversion review of #3024 found five readers no list named that decide
            a fetch, an embed or a refusal. The security spine's S3 census gate will find whatever is left on day one
            (`followups.d/3022-p2-security-spine-s0-s3.md`), so each needs a move or a written, sanctioned exclusion.
done      — `lib/export/player-prune.js` `namesRemoteResource` (the Reading view's prune), in #3025.
            `docs/src/components/studio/motion/svg-intake.ts` `EXTERNAL_URL_RE` / `EXTERNAL_HREF_RE`, in the spine PR: it
            reads remote-ref.js's `attrIsRemote` and `isRemoteUrl`. The old patterns let through 284 values Chromium
            fetched and 208 WebKit fetched (the web-reference fuzz's declarations on an SVG `<rect>`); the new test lets
            none through and strips everything the old one did (decision note, "R4: the four census readers").
            `lib/core/css-scan.js` `findAddressStrings` and `lib/core/door-attr.mjs` `cssRefTargets`, in the security spine
            S2/S3 PR: both read `cssRefSpans`' new declaration channel (`decls`). The differential and the three-browser
            oracle are in the spine note, "P2, the declaration channel, as built"; the oracle found one bypass in both (an
            address inside `image()`), now refused.
next      — `lib/core/slide-camera.mjs` `CSS_URL` / `REL_URL` (what a picture export inlines): not a refusal; its known
            miss (`u\72l(`) is a missing picture, not a leak. Moving it changes export bytes for such spellings, so it
            ships with a dark and a light render of a representative deck for the owner's sign-off (CLAUDE.md Quality Bar).
done when — the three are moved, or each is a sanctioned entry with its reason in the S3 census gate's allowlist.
evidence  — per reader moved: a differential against a frozen copy and a browser oracle, as R4 and svg-intake did.
verify    — tier 2 trio for the two gate readers (they decide a refusal); maker-checker for slide-camera.
