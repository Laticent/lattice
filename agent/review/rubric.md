# The review rubric

The 18 checks `check.mjs` applies, in plain form — so you can see what it looks for,
and so a human reviewing by hand looks for the same things.

**Prefer running the checker.** It is deterministic and costs nothing; reading this
list and self-assessing costs a full pass over the deck and is easy to be generous with.

| Trap | Fix |
|---|---|
| a heading that is a category label, not the takeaway | make the heading the message itself — "Revenue grew 18%, led by APAC" |
| a title slide with placeholder text, or no subtitle to orient the room | name the deck, and add one plain line of framing under the h1 |
| a data slide whose heading names the topic, not the "so what" | put the conclusion the data supports in the h2, not just its subject |
| a hero number with nothing to compare it to | add a baseline, direction, or target — a bare number is a boast, not a claim |
| a slide dense enough that it holds more than one idea | split it, or cut to the essential point and push detail to speaker notes |
| an element run well past its word budget | tighten hard to the essential point |
| an element crowding its word budget | trim toward the soft target so it reads light |
| a heading too long to land on one tight line | trim to a single assertion; qualifiers and caveats go in the body |
| a numbered divider whose heading fills the band under the section mark and runs off the frame | trim the section name, or drop `numbered` on that slide |
| stacked possessives ("the system’s policy’s…") that stumble read aloud | one possessive at a time; restructure the phrase to speak cleanly |
| three or more headings opening the same way | vary the opening and verb — identical openings read as a drone |
| two slides making the same claim | give each a distinct takeaway, or merge the duplicate slides |
| a heading with no body — a placeholder shipped as content | fill it with the supporting content, or make it a deliberate divider |
| an image that carries meaning but has no alt text | describe what it shows in the brackets so screen readers reach it |
| a deck that never states what it wants from the room | add a decision slide or a plain "we recommend…" line near the close |
| a long deck with no roadmap the audience can track | add an agenda slide near the top |
| more slides than the talk time supports | aim for ~1–2 minutes per slide; cut the rest |
| a chrome slot (eyebrow, subtitle, key-insight) over its word budget | tighten the slot toward its soft budget — chrome frames the slide, it doesn’t carry it |

---

Source: `RUBRIC` in `lib/authoring/review-core.js` — the same array the checker runs.
