# Agentic engineering, from day one

A teaching course for working engineers who have never built software with a coding
agent. It rebuilds the talk one folder up (`../agentic-engineering-practices.md`) as a
course that runs from day one of a new project. It assumes git, pull requests, CI, code
review and testing, and teaches only what changes when an agent does the typing.

| File | What it is |
| --- | --- |
| `agentic-engineering-course.md` | The deck: a primer, eight chapters, and a glossary |
| `agentic-engineering-course.pdf` | The rendered deck (`venue: laptop`), rendered by hand |
| `harness.mjs` | The teaching harness: measures each chapter against the bar below |
| `terms.json` | Every agent term the course introduces, with its other spellings |
| `scorecard.md` | The human half of the bar, scored per chapter |
| `build-test.md` | An independent agent built the booking app from the deck alone: every gap it hit, and what fixed each |

## How the course is built

- **The primer comes first.** It covers only what's new: the agent loop, the context
  window, a one-slide refresher on the path a change takes, your first session with a
  table of tools and their instruction-file names, and the one rule. Nobody starts a
  chapter cold, and nobody sits through what they already know.
- **Day one comes second.** It covers the app's one-page spec, the six setup commits in
  order, and how to show a failing test when the hook blocks failing commits.
- **The kit comes last.** Every file the course shows, ready to copy: the instruction
  file, a plan, the schema, the hook, a lint check, the guardrail, a follow-up file and its
  check. Each was extracted from the deck and run.
- **Each chapter stands on its own** through one line, not a slide: its "Start here" slide
  ends with `You need:` and the earlier terms it assumes, each with a short gloss. That
  restatement costs one line per chapter; a separate "You need" slide cost eight slides
  across the course.
- **Every chapter has the same small frame:** a divider, "Start here" (what you'll learn,
  and what you need), the teaching slides, "Common mistakes", a "Check" question (answer in
  the speaker notes), and a "Try it" exercise. Sections are named in each slide's eyebrow
  ("Chapter 4 · Gates"), not with separate topic slides.
- **"Common mistakes" teaches something new.** Each one names mistakes the chapter hasn't
  shown, such as an agent editing a test to match broken code, rather than recapping it.
- **One project runs through it all, in the second person:** you start a room-booking app
  from an empty repository. It's a new project on purpose: there's no legacy code to work
  around, and every habit is shown at its cheapest moment, day one. Its recurring bug, a
  room booked twice for the same hour from two time zones, is one most engineers have
  seen.

## The bar

The harness checks the parts a machine can measure. Change a number here and in
`harness.mjs` together.

| Check | The bar | Why |
| --- | --- | --- |
| Chapter frame | Every frame slide is present, and every chapter's "Start here" ends in a `You need:` line (Day one included; the Kit and Reference are checked for notes only) | A predictable shape lets a learner find their place. The primer has no `You need:` line because nothing comes before it |
| Define before use | Each term in `terms.json` is named on the `You need:` line or taught on the slide that first uses it | Undefined jargon is the curse of knowledge in its plainest form. The list holds only agent terms; the professional baseline is assumed |
| One new idea per slide | At most one `Teaches:` term per slide | Anyone absorbs one new name at a time, expert or not |
| Density | 8–16 slides per chapter (18 for the primer); at most 45 words on a slide | One sitting per chapter; a slide supports the speaker, it doesn't replace them. Code, glossary and table slides are exempt, because the code is the content |
| Reading level | Flesch–Kincaid grade 9 or below, measured on each chapter's speaker notes | Plain words cost an expert nothing and help every reader whose first language isn't English. Slide text is fragments, which any formula scores as easy, so the notes are measured: they are the full explanation, in ordinary sentences |
| Running example | At least two teaching slides per chapter use the booking-app story; code and diagrams count, the Check slide doesn't | A concrete case before every abstraction, and a chapter can't meet it on its quiz alone |
| Check has an answer | The Check slide's notes say "The answer is X" for one of its options | An unanswered quiz teaches nothing |
| Answer key varies | No one letter answers more than half of the Checks, deck-wide | A learner who spots "it's always B" stops reading the options |
| Glossary covers every term | The Reference glossary defines every term in `terms.json` | The glossary is where a reader goes when a word stops them |
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

Each of the newer checks has been seen to fail. On 2026-10-15, five broken copies of the
deck each failed the check aimed at them:
- a term missing from the glossary;
- a Check answer that isn't one of the options;
- every answer set to B;
- the story removed from the primer;
- unreadable speaker notes.

A check that can't fail proves nothing; the deck teaches the same rule in Chapter 4.

## Why the frame is small

An earlier draft spent 59% of its chapter slides on frame: separate "You'll learn" and
"You need" slides, 22 one-line topic slides, and "Common mistakes" slides that recapped the
chapter. Merging the two opening slides, naming sections in the eyebrow, making the mistakes
new, and removing two ideas taught twice (Chapters 5 and 8, Chapters 6 and 7) cut the
chapters from 118 slides to 88 and raised the teaching share from 41% to 55%, or 64% counting
the new mistakes. Standing alone was never the main cost: it accounted for 8 of the 118.

## What the harness can't measure

A chapter can pass every check and still teach badly: the explanation can be wrong, the
example can be a bad fit, or the order can be confusing. Two tests cover that half:
- `scorecard.md`: six criteria scored by a person;
- `build-test.md`: an independent agent built the app from the deck alone.

The build test found the course strong on ideas and missing the hands-on steps, which
Day one and the kit now supply. A cold read by a person from the target audience is still
the real proof, and it hasn't been done yet.
