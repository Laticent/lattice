---
theme: indaco
---

<!-- _class: title -->

`Lattice · Video plugin`

# A clip, drawn from your own record.

Four providers, three layouts, one line of Markdown each.

---

<!-- _class: video companion qr -->

## YouTube — the clip leads, a code lets the room follow.

Ninety seconds of a first-day admin going from signup to a published deck. Scan the code to open the video on your own screen.

`@video{"https://www.youtube.com/watch?v=aqz-KE-bpKQ", title="Ree A., Head of Ops at Northwind", poster="sample:photo-wide.jpg"}`

---

<!-- _class: video companion -->

## Vimeo — the same slide, without the code.

The poster is a plain link when you do not opt into `qr`. It still opens the clip, in print and on screen.

`@video{"https://vimeo.com/1084537", title="The launch film, director's cut", poster="sample:photo-pano.jpg"}`

---

<!-- _class: video companion qr -->

## TikTok — a vertical clip keeps its own shape.

Short vertical video plays in a tall player. The poster is cropped to the slide's frame, and the badge names the provider.

`@video{"https://www.tiktok.com/@scout2015/video/6718335390845095173", title="Behind the scenes at the studio", poster="sample:photo-tall.jpg"}`

---

<!-- _class: video gallery qr -->

## Instagram — the exhibit, matted.

`@video{"https://www.instagram.com/p/DWm0UOZgVVf/", title="NASA: Artemis II lifts off for the Moon.", poster="sample:photo-square.jpg"}`

---

<!-- _class: content -->

## Paste the address you already have.

It accepts the spelling you copy from a browser bar.

| Provider | Accepted forms | Badge |
|---|---|---|
| YouTube | `watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `live/` | Watch on YouTube |
| Vimeo | `vimeo.com/123456`, `player.vimeo.com/video/123456` | Watch on Vimeo |
| TikTok | `@name/video/…`, short `vm.tiktok.com/…` links | Watch on TikTok |
| Instagram | `reel/`, `p/`, `tv/` | Watch on Instagram |

---

<!-- _class: video gallery -->

## No poster? A drawn stand-in holds the place.

`@video{"https://youtu.be/dQw4w9WgXcQ", title="Leave the poster off and the slide still reads as a video."}`

---

<!-- _class: cards-grid three -->

## The address comes only from your record.

> Nothing reads a slide's text, so a plugin's drawing never becomes a poster, a link or a scannable code.

- Quote a tricky address
  - An equals sign or a comma needs quotes, so a start time such as `?t=90` stays inside it.
- One record, one line
  - In running text it stays code, and the linter says why.
- Foreign hosts get no badge
  - A provider's name in a path or fragment does not make it that provider.

---

<!-- _class: closing -->

`Next`

## Write the record. Lattice draws the rest.
