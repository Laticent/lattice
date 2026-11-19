- **The Studio assistant can find and replace across a deck.** Ask it to change "Oct. Tenth" to
  "October Tenth" and it searches every slide at once (`find_text`), then stages the change
  (`replace_text`) on one review card with a row per slide, instead of reading slides one by one and
  rewriting each in full. It replaces words in headings, eyebrows, body text, quotes, alt text, spoken
  lines, speaker notes and descriptions. It never touches link or image targets, URLs, layout
  directives, code, math, HTML or the front matter, and it leaves a slide alone when the new words
  would change its structure: a note turned into a directive, a new heading or table cell, a comment
  closed early. It tells you what it left alone.
- **Fixed: a word change across two identical slides no longer shows as a slide insert and delete** on
  the assistant's review card. When the deck keeps its slide count, the card now lists a plain change
  for each slide that changed.
- **Fixed: the Studio assistant's speech preview reads what the voice reads.** On a slide with a
  spoken line (`<!-- say: … -->`), `preview_speech` showed the on-screen text, words the voice never
  says. It now follows the same order as Present and the export: the spoken line, a front-matter
  `say:` entry, chart narration, then the slide text, which it labels approximate. It previews up to
  10 slides at once, lists each term that fired as written and as spoken (a possessive or plural on
  its own line), and names words no term covers that a voice may stumble on, such as `Ilcea.K` or
  `McKinsey`.
