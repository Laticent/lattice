---
theme: indaco
---

# Caption Disclosure Fixture

This deck exists to prove `--strip-say` leaves no trace of which slides carried one.

<!-- @say{CAPTIONLEAKTOKEN alpha, the author's read-as override for slide one.} -->

---

## Second slide

- A point
- Another point

<!-- @note{PRIVATELEAKTOKEN bravo: the author's private remark, slide two.} -->
<!-- @say{CAPTIONLEAKTOKEN bravo, the read-as override for slide two.} -->

---

## Third slide

Closing.

<!-- @say{CAPTIONLEAKTOKEN charlie, a front-matter caption keyed by slide.} -->
