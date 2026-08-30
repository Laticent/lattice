---
title: Principles
description: The convictions behind Lattice — why a slide is four decisions, why the colors live in one file, why the system carries the consistency and you carry the judgment.
---

Every design decision in Lattice traces back to a dozen convictions.
They're worth stating plainly, because they explain what surprises
people about it — why you can't drag a box, why every deck on a theme
looks related. None of it is arbitrary. Here is what Lattice believes.

## 1. A slide is four decisions, not one

In most tools you make every choice at once and by hand — the words,
the layout, the colors, the spacing, all tangled together on a blank
canvas. Lattice pulls those apart into four decisions and lets you make
them one at a time.

- **Function** — what the slide is for. Are you stating a claim,
  comparing options, walking through steps, showing evidence? There are
  seven jobs a slide can do, and naming the job is the first decision.
- **Form** — the shape that holds it. A grid, a stack, a split, a
  timeline. The same evidence can sit in a dozen shapes, and the shape
  is a separate choice from the evidence.
- **Substance** — what fills the shape. Prose, a structured list, a
  data series, a graph.
- **Finish** — the palette and the mood. Light or dark, tight or roomy,
  the brand colors.

Separating them means you can change one without disturbing the rest.
Swap the palette and the deck keeps its structure. Move a grid to a
stack and the data comes along unchanged. Re-class a slide and it says
something new in the same skin. Most of what feels like design in other
tools is these four decisions fighting on one surface. Lattice gives
each its own.

## 2. A good deck doesn't need you in the room

A lot of people dislike presentations, and they're usually right to.
The medium isn't the problem. Most decks are badly written and hard to
look at, every slide crammed with as much as it can fit.

The cramming comes from a mistake about what a slide is. A slide is a
frame in a storyboard, not a page of prose. While you talk, the
audience is shown the slide rather than left to read it — it sets the
one beat you're on, and your voice does the rest.

And the standard is higher than it sounds, because the slide gets
read without you. It's forwarded, attached, opened in a room you were
never in. So it has to carry its point alone, with almost no context —
which means less on the slide, written better: one clear claim, a
heading that says something, a shape that fits the thought.

Get that right and the deck stops needing to be presented at all. You
can email it and forget it, and it still makes the case. Lattice is
built for that deck.

## 3. You're competing with what's for lunch

Attention is the scarcest thing in the room, and it's conditional.
Fifteen minutes is a long time to hold someone; every minute has to
earn the next. A dry speaker can survive that — a flat delivery is
forgivable. Material that isn't put together is not. The moment a deck
reads like a chore instead of a story, people check out, and they don't
feel guilty about it. The topic doesn't save you. Your title doesn't
either. You can be the CEO at the front of the room; if the deck is a
mess, the person in the third row is deciding between the chicken and
the fish.

So the deck has one job while you're talking: never be the reason you
lose them. That's the whole argument for restraint — four points to a
slide at the most, or an image with a title, nothing on the screen
fighting the voice that's carrying the story. The best presenters look
less like they're presenting and more like theater, and their slides
are nearly empty. The slide serves the act; it never tries to be it.

Lattice gives you the universal half: the part every good presentation
shares, the reason the best of them land even with people who disagree.
It strips the clutter, holds you to a few points, and keeps the slide
from being what loses the room. The other half is yours alone — your
personality, your expertise, the way you tell it, the humor when the
moment has room for one. That partition is the point. The template
carries what's common to good presentations so the uncommon part — you
— has room to land. It doesn't sand you into a house style; it clears
the stage.

## 4. The colors live in one file

Every color in a Lattice deck comes from a palette — one file, a short
list of named roles. *Accent. Ink. Surface.* The components never name a
color directly; they ask the palette for the role and render whatever
it hands back.

Change a brand's entire visual identity in that one file, and it flows
through every layout, every chart, every diagram on the next build. Two
companies can run the same engine and produce decks that look nothing
alike — the way two sites share HTML and look nothing alike under
different CSS. And a chart's text is never stranded in a color the new
palette didn't plan for. The fill and its ink travel together, so both
adapt when the palette flips.

One palette, every deck. Change it once.

## 5. One source, every format

A Lattice deck has no native binary. The source is Markdown, and the
output is whatever the moment needs: a PDF for the board, a PPTX for
the colleague who lives in PowerPoint, HTML for the web, an image when
a doc needs a single slide. Same deck, same components — you pick the
format at the end, you don't rewrite the deck to get it.

The formats aren't all equal, and that's deliberate. PDF and HTML carry
the deck live. The image exports are flat snapshots, and so is the
PPTX — just a deck of those images. Pixel-faithful, but a
picture of the slide rather than an editable one. That suits handing a
slide to someone to drop into their own deck or present from
PowerPoint. Anything you want to change, you change in the source — the
one place editing ever happens.

Paper is a format too. Nobody asks for it, and the boardroom still
expects it — the laptop is open, and a printed handout sits on the table
beside the screen. Yet print is the format that usually fights you. A
landscape deck gets crushed onto a portrait sheet; a URL and the date
land in the footer; an afternoon disappears into the print dialog. Worst
of all, the color charts come out an indistinguishable gray on the
office laser. None of that should be yours to fix by hand. The board PDF
already prints the way a slide should — landscape, edge to edge, color
exact instead of washed out. And a paper handout has to clear one more
bar: it has to survive black and white. When color drops to gray, the
distinctions have to ride on border, weight, and pattern, not hue. You
print the deck and move on.

## 6. Write what you mean, not where it goes

You write a Lattice deck the way you'd write a memo — in Markdown, the
plain text format behind a million READMEs. A list is a list. A table
is a table. You never place a box, match a font, or nudge anything into
alignment. You say what the slide contains and what it's for, and the
engine decides where it all goes.

That trade has a second half, and it's about words. A heading in
Lattice is meant to be a sentence, not a label. "Revenue" tells the
reader nothing; "Revenue grew 40% on flat headcount" tells them the
whole slide before they read another word. The engine can't write
that line for you, but the system is built to reward it — a deck is
read at speed, and a claim lands faster than a noun.

Because the source is plain text, it has properties a binary slide file
never will. You can diff it, review it in a pull request, grep a whole
archive for a stale figure. If you ever leave Lattice, every deck it
made is still a plain PDF or HTML, sitting next to the Markdown that
built it.
Nothing locks shut behind you. And when the vocabulary runs out — when
you need something the components don't offer — it's plain Markdown and
CSS underneath, and you can edit it directly.

## 7. The system carries the consistency. You carry the judgment.

Most of what goes wrong in a slide deck is mechanical, and Lattice
handles all of it. Contrast that meets WCAG AA, on every component, in
light and dark — checked automatically, not left to chance. Color never
the only signal: about one man in twelve is color-blind and won't say
so — the one who can't read your red from your green might be the one
deciding — so every status carries its shape too, a check or an X that
survives in grayscale. Headings that resolve to the right size, spacing
that holds, alignment that falls where it should. You never spend
judgment on any of it, because none of it is a matter of judgment.

The rest is judgment. Whether the claim is true. Whether the slide
earns its place. Whether the argument lands with this audience, this
quarter. No system checks those, and Lattice doesn't pretend to. It
clears the mechanical work off your desk so the only thing in front of
you is the thinking. The machine owns what's correct; you own what's
good.

## 8. Predictability is worth more than it looks

The same Markdown produces the same output — on your laptop, on a
colleague's, in a build server, this year and next. You notice it only
when it's gone: the deck that reflows the night before the meeting, the
font that renders one way on screen and another on the projector, the
"final-v7" that looks subtly different from "final-v6" and nobody can
say why.

Determinism is what lets you trust the artifact. The deck you reviewed
and approved is exactly the deck that opens in the room — you can put
your name on it without re-reading every slide. It's also what makes
the rest possible: you can't review a moving target, can't diff one,
can't safely hand one off to a colleague or an assistant. The real cost
of an unpredictable tool isn't the occasional surprise. It's the
vigilance you pay, forever, guarding against one.

## 9. You don't memorize it; it shows you

A new vocabulary reads as overhead: component names, slot rules, a
four-layer model to memorize. You're not meant to memorize any of it.

The floor is Markdown, which you already know. A plain text file with
no Lattice vocabulary still renders as a clean deck; you add a component
name when you want one, one at a time, with no cliff to fall off. From
there, the tooling does the teaching. Your editor autocompletes the
components. The gallery shows you each one rendered before you pick it. A
linter flags the handful of real footguns as you type, in the editor
and in the browser, with the very same checks the engine runs.

And then there's the assistant. Because a Lattice deck is structured
text under a named system, an AI can read the catalog and map plain
English onto it: you say "show these four options as a grid," and it
knows the layout, the nesting, the things that trip people up. The
structure that looks like the cost of learning Lattice is exactly what
lets a machine carry the learning for you. The vocabulary isn't a tax
you pay. It's the language the tools — and the assistant — already
speak.

## 10. A deck outlives the meeting

Most tools treat a deck as finished the moment it's sent. But a board
deck comes back: next quarter with new numbers, restyled when the brand
changes, reopened when someone questions a figure. The first draft is a
small part of its life. The longer
part belongs to editors and maintainers, and Lattice is built for them
as much as for the author.

Because the deck is plain text under a stable structure, every later
change stays small and legible. An editor updates the numbers without
touching the claim. A maintainer reskins a hundred decks from one
palette file and trusts the regression tests to catch anything that
moved. The same assistant that helped write the deck can read it back —
summarize it, check its claims, find the slide that's gone stale —
because the structure that made it writable makes it readable.

The rule from before holds across all of it. Automation keeps a deck
well-formed. Whether it stays true is a person's call. An AI can hold a
deck to its own standard forever and never notice the quarter's story
changed. That part stays with you.

## 11. Constraint is what frees you

Some people hear all this and worry that a system flattens the craft —
that making slides is an art, and an engine that picks the component
strips it out. It's a fair worry, and worth answering directly.

Start with what's true. There is real craft in a good deck, and there
is a real risk that everything starts to look the same. Neither is in
dispute.

But look at where the craft lives. Most of what feels artful in a slide
tool is fighting the tool — nudging a box into line, hunting down the
right hex code, redoing all of it when the brand changes. That's
not art. It's labor that feels like art because it's slow and fiddly.
Lattice takes that away and touches none of the decisions that are
actually creative: what the slide should say, what to cut, how the argument
is paced, which of the seven jobs this moment needs. The craft doesn't
disappear. It moves — out of nudging boxes and into the words and the
visual system, where one good decision pays off across a thousand
slides. Markdown didn't make writing less of an art. It moved the
typography into the stylesheet and left the writer with the words.

"Everything looks the same" is really two worries. Inside one company,
decks looking alike is the goal — that's what a brand is. Across
companies, the look is yours to set: a theme is a full visual identity,
not a color swap, and two themes diverge as far as two websites do. The
one real version of the worry is the lazy one — everybody shipping on
the default theme, the way the early web all ran on the same template.
The answer is to make your own theme cheap to build and deep to change.
Whether you take that up is a choice the engine can't make for you.

Consistency and creativity work on different layers. One is the
foundation; the other is what you build on it. A sonnet's fourteen
lines never cost a poet anything. A strong grid has freed
designers for a century. Lattice is that grid, for decks.

## 12. You practice board-ready before you're in the room

"Boardroom-quality" sounds like a standard reserved for boards. It
isn't. The higher you go, the more polish and professionalism are
expected as a matter of course — and you don't reach that level by
waiting until you're there. You practice it on the way up. You don't
have to be presenting to the board to present like you are.

What's usually missing is time, not the standard — the gap between what
the standard asks and what someone early in their career can produce in
the hours they have. Lattice closes that gap. An analyst's first
proposal can carry the same finish as the partner's board deck, so
finish stops standing in for seniority and the argument does the
talking instead. And the habit gets cheap enough to keep: you hold the
line on every memo, not only the high-stakes one once a quarter. That
practice, repeated, is how you become the person who's ready before
anyone hands you the room.

## Where to go next

- [The design system](https://github.com/slidewright/lattice/blob/main/design/design-system.md) —
  the full four-layer model, in depth.
- [Author decks](/guides/authoring/) — the component catalog and
  the authoring contract.
- [Browse components](/components/) — every component, themable in
  any palette.
