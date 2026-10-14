# Agentic engineering, from the ground up

A teaching course for new computer-science graduates who have never written code on a
professional team. It rebuilds the talk one folder up
(`../agentic-engineering-practices.md`) for that audience: the talk assumes the listener
already works on a team, and this course does not.

| File | What it is |
| --- | --- |
| `agentic-engineering-course.md` | The deck: a primer, eight chapters, and a glossary |
| `agentic-engineering-course.pdf` | The rendered deck (`venue: laptop`), rendered by hand |
| `harness.mjs` | The teaching harness: measures each chapter against the bar below |
| `terms.json` | Every term a new graduate might not know, with its other spellings |
| `scorecard.md` | The human half of the bar, scored per chapter |

## How the course is built

- **The primer comes first.** It teaches the path a change takes (repository, commit,
  pull request, CI, merge) and what an agent is, so nobody starts a chapter cold.
- **Each chapter stands on its own.** It opens with a "You need" slide that restates the
  few earlier terms it uses, so the chapters can be taken in any order.
- **Every chapter has the same frame:** a divider, "You'll learn", "You need", two or three
  topics, a "Common mistakes" slide, a "Check" question (answer in the speaker notes), and
  a "Try it" exercise.
- **One story runs through it all:** Sam, a new engineer at a small online shop, and a cart
  total that is one cent off.

## The bar

The harness checks the parts a machine can measure. Change a number here and in
`harness.mjs` together.

| Check | The bar | Why |
| --- | --- | --- |
| Chapter frame | Every frame slide is present, plus at least one topic slide | A predictable shape lets a learner find their place. The primer has no "You need" slide because nothing comes before it |
| Define before use | Each term in `terms.json` is restated on "You need" or taught on the slide that first uses it | Undefined jargon is the curse of knowledge in its plainest form |
| One new idea per slide | At most one `Teaches:` term per slide | A beginner can absorb one new name at a time |
| Density | 8–16 slides per chapter (18 for the primer); at most 45 words on a slide | One sitting per chapter; a slide supports the speaker, it doesn't replace them. Code, glossary and table slides are exempt, because the code is the content |
| Reading level | Flesch–Kincaid grade 9 or below, per chapter | Plain words for readers who are new to the field, and for readers whose first language isn't English |
| Running example | At least two slides per chapter use the shop story | A concrete case before every abstraction |
| Notes | Every slide has speaker notes | The notes carry the full explanation, so the deck works when it's read alone |

A slide marks the term it teaches on the last line of its speaker notes:
`Teaches: decision record`.

Run it from this folder:

```sh
node harness.mjs            # one line per chapter, exit 1 if any chapter misses
node harness.mjs --json     # the same, as JSON
```

Then lint and render from the repository root:

```sh
npm run lint:deck -- --strict engineering/decisions/2026-09-24-agentic-practice-audit/course/agentic-engineering-course.md
node lattice.js engineering/decisions/2026-09-24-agentic-practice-audit/course/agentic-engineering-course.md \
  engineering/decisions/2026-09-24-agentic-practice-audit/course/agentic-engineering-course.pdf
```

## What the harness can't measure

A chapter can pass every check and still teach badly: the explanation can be wrong, the
example can be a bad fit, or the order can be confusing. `scorecard.md` covers that half,
with six criteria scored by a person. A third test, a cold read by someone from the target
audience, is the real proof, and it hasn't been done yet.
