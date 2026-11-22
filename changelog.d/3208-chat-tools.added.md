- **The Studio assistant can find and replace across a deck.** Ask it to change "Oct. Tenth" to
  "October Tenth" and it searches every slide at once (`find_text`), then stages the change
  (`replace_text`) on one review card with a row per slide, instead of reading slides one by one and
  rewriting each in full. It works the way a word processor does: the words change and their
  formatting stays, so a bold word stays bold. Characters Markdown would read as formatting are
  escaped for you, so replacing "five" with "$5" shows $5, not a math formula, and searching for "$5"
  finds it again. It replaces words in headings, eyebrows, body text, quotes, alt text, spoken lines,
  speaker notes and descriptions, and never touches link or image targets, URLs, layout directives,
  code blocks, math, HTML or the front matter. It tells you what it left alone, such as a phrase that
  runs across bold and plain text.
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
