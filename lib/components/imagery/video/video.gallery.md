---
marp: true
theme: indaco
paginate: true
header: "Lattice · video"
---

<!-- _class: title silent -->

# video

`Imagery · Canvas · Prose`

A video as a static, PDF-safe embed: a poster that links to the clip, a play badge, the provider's name, and a scannable QR to the same URL — never a live iframe.

---

<!-- _class: video companion -->
<!-- _footer: "Default · video" -->

## Onboarding that sticks — watch a customer do it live.

Ninety seconds, unscripted: signup to a published deck without touching support.

- https://www.youtube.com/watch?v=aqz-KE-bpKQ
- Ree A., Head of Ops at Northwind `caption`


---

<!-- _class: video companion -->
<!-- _footer: "Companion — claim leads, the clip proves it · video companion" -->

## Onboarding that sticks — watch a customer do it live.

Ninety seconds, unscripted: signup to a published deck without touching support.

- https://www.youtube.com/watch?v=aqz-KE-bpKQ
- Ree A., Head of Ops at Northwind `caption`
- video-poster.svg `poster`


---

<!-- _class: video gallery -->
<!-- _footer: "Gallery — a contained, matted exhibit · video gallery" -->

## Exhibit 1 — the onboarding flow, end to end.

- https://vimeo.com/1084537
- The reference onboarding walkthrough, contained on its matte. `caption`
- video-poster.svg `poster`


---

<!-- _class: video companion qr -->
<!-- _footer: "qr — add a scannable code (a modifier, combine with any composition) · video qr" -->

## Scan to watch the walkthrough.

The full 90-second tour — scan to open it on your phone.

- https://www.youtube.com/watch?v=aqz-KE-bpKQ
- Scan to watch `caption`
- video-poster.svg `poster`


---

<!-- _class: video companion dark -->
<!-- _footer: "Composition: dark · video dark" -->

## Onboarding that sticks — watch a customer do it live.

Ninety seconds, unscripted: signup to a published deck without touching support.

- https://www.youtube.com/watch?v=aqz-KE-bpKQ
- Ree A., Head of Ops at Northwind `caption`


---

<!-- _class: video companion compact -->
<!-- _footer: "Composition: compact · video compact" -->

## Onboarding that sticks — watch a customer do it live.

Ninety seconds, unscripted: signup to a published deck without touching support.

- https://www.youtube.com/watch?v=aqz-KE-bpKQ
- Ree A., Head of Ops at Northwind `caption`


---

<!-- _class: video companion accent -->
<!-- _footer: "Composition: accent · video accent" -->

## Onboarding that sticks — watch a customer do it live.

Ninety seconds, unscripted: signup to a published deck without touching support.

- https://www.youtube.com/watch?v=aqz-KE-bpKQ
- Ree A., Head of Ops at Northwind `caption`


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · video" -->

## When NOT to reach for video.

- **Expecting it to autoplay in the PDF.** A PDF is paper — it can't play video, and the engine bars iframes for security. `video` is a poster + scannable link by design. If you need in-app playback, that's a separate interactive surface, not a boardroom deck.
- **A wall of caption.** The caption is one line — 'Scan to watch', a title, a runtime. If you're writing a paragraph about the video, put it in a `content` slide and drop the clip in as a supporting `video`.
- **Instagram with no poster.** Instagram's public thumbnails aren't fetchable, so an Instagram `video` with no `poster` bullet falls back to a plain placeholder tile. Author a `poster` for a real still.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `image` — the visual is a still photo or screenshot, not a video
- `closing` — the send-off is a call to action with a QR, not a specific clip
- `diagram` — the motion you want is an animated process — a Mermaid diagram may say it statically
