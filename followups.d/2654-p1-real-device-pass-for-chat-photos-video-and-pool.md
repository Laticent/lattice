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
            1080×1920, 16.4 MB camera-roll clip added in Library → Videos, read and played in place. ALSO DONE on a real iPhone
            (2026-10-14, preview of #2672): a 6 s clip sent from the chat to Google Gemini Pro Latest was described
            correctly, and the composer, attach buttons and dark mode were confirmed. The location scrub was run on
            a real iPhone 15 Pro file with its GPS tag (IMG_3905.mov): tags gone, same size, identical decoded video.
            STILL OPEN: the chat attach, reload and Regenerate on the phone, an Android phone, a photo from the
            library and one just taken, the figure pool, and the status line, and a Location-ON clip taken through
            the whole path (add it in Library, make a workspace backup, extract `media/<name>.mov`, run `ffprobe`).
            ADDED 2026-10-14: the Architect's edit-on-request prompt (decision note §4e). DONE on a real iPhone (#2691
            preview, Gemini Pro Latest): a question about a clip and a request the deck cannot do both got answers
            and no diff card. STILL OPEN: one edit turn on a real model, checked for plain words and the activity line.
where     — the Studio chat on an iPhone and an Android phone, against a real OpenRouter key.
done when — on each phone: a photo from the library and one just taken attach and send; a 15 second clip
            attaches (or is refused in words: a 9 s phone clip is already 16.4 MB, over the chat's 15 MB cap) and a
            video-capable model describes a clip that fits; a reply with a
            diagram, a table and a slide draws and scrolls without the tab reloading; the status line
            names each phase on a multi-step turn; a question turn gets no diff card and an edit turn reads in plain words. Each result is written into the decision note.
evidence  — screenshots or a screen recording per phone, and the model's reply to the clip.
verify    — tier 1; needs a device and a real key (HARD RULE #23). Do not run it from CI (HARD RULE #24).
