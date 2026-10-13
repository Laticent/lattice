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
            the engine and not the device; the native picker (Photo Library, Take Photo), a phone's H.264
            MP4, and the pool's memory on iOS are untested.
where     — the Studio chat on an iPhone and an Android phone, against a real OpenRouter key.
done when — on each phone: a photo from the library and one just taken attach and send; a 15 second clip
            attaches (or is refused in words) and a video-capable model describes it; a reply with a
            diagram, a table and a slide draws and scrolls without the tab reloading; the status line
            names each phase on a multi-step turn. Each result is written into the decision note.
evidence  — screenshots or a screen recording per phone, and the model's reply to the clip.
verify    — tier 1; needs a device and a real key (HARD RULE #23). Do not run it from CI (HARD RULE #24).
