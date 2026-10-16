---
origin: 2447
priority: P1
recorded: 2026-09-28
area: docs
severity: medium
swimlane: design/skills/cli.md
source: https://github.com/Laticent/lattice/pull/2447
---

# Verify the Studio narrated Webpage export feeds `lattice video`

why now   — the one claim in the CLI guide that rests on code reading. The guide's
            "Render a narrated video" section tells readers to take a Studio export
            (Share → Webpage with Include narration audio) and pass the .html to
            `lattice video`. The sandbox could not drive that step: the Studio's
            on-device voice reports "Could not load in this browser" in headless
            Chromium, so the menu label and the export's fitness were never run.
where     — docs/src/content/docs/guides/cli.md §Render a narrated video;
            docs/src/content/docs/reference/cli.md §`lattice video`;
            docs/src/components/studio/ShareSheet.tsx + NarrationExportOptions.tsx
done when — in a desktop browser, a Studio Share → Webpage export with Include
            narration audio on runs through `npx lattice video <file>.html talk.mp4`
            and writes an MP4 with audio plus a .vtt; the guide's wording matches
            the menu the person clicked, or is corrected
evidence  — the MP4 and .vtt, decoded (video:avc + audio:aac, nonzero speech), and a
            screenshot of the Share → Webpage options step
verify    — tier 0 gates, because it is a docs claim with no code path of its own;
            the risk is wording, and the run itself is the check
