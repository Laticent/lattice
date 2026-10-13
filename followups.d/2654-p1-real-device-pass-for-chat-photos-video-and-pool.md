---
origin: 2654
priority: P1
recorded: 2026-10-13
area: website
severity: high
swimlane: engineering/decisions/2026-10-13-studio-chat-polish.md §5
source: https://github.com/Laticent/lattice/pull/2654
---

# Drive the Studio chat on a real phone: photo and video pickers, the figure pool, the status line

why now   — every chat claim in #2654 is verified in Chromium and in WebKit at an iPhone profile, which is
            the engine and not the device; the native picker (Photo Library, Take Photo) and the pool's memory on
            iOS are untested. DONE on a real iPhone (2026-10-13, #2672 docs preview, screenshots in the PR): a 9 s,
            1080×1920, 16.4 MB camera-roll clip added in Library → Videos, read and played in place. STILL OPEN: the
            chat attach, reload and Regenerate on the phone, a model reading a clip, an Android phone, a photo from
            the library and one just taken, the figure pool, and the status line.
where     — the Studio chat on an iPhone and an Android phone, against a real OpenRouter key.
done when — on each phone: a photo from the library and one just taken attach and send; a 15 second clip
            attaches (or is refused in words: a 9 s phone clip is already 16.4 MB, over the chat's 15 MB cap) and a
            video-capable model describes a clip that fits; a reply with a
            diagram, a table and a slide draws and scrolls without the tab reloading; the status line
            names each phase on a multi-step turn. Each result is written into the decision note.
evidence  — screenshots or a screen recording per phone, and the model's reply to the clip.
verify    — tier 1; needs a device and a real key (HARD RULE #23). Do not run it from CI (HARD RULE #24).
