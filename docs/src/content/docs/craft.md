---
title: The craft
description: On the belief that AI means anyone can build what Lattice is — why the artifact got cheap, the judgment behind it didn't, and the part of the work that doesn't automate.
---

There's a thing people say when you've built something you care about:
*with AI, anyone could do that now.* I've had it said about Lattice, and it
deserves a straight answer — because the belief is half right, and the half
that's right was never the hard part.

*— Sharmarke Aden, who builds Lattice*

## The noun got cheap; the verb didn't

AI made the artifact cheaper. Anyone can prompt a model into a slide
renderer that runs, or a stylesheet that mostly holds together. If *what you
built* means the object — a thing that renders slides — then yes, the object
is more reachable than it was three years ago. I won't pretend otherwise.
The reachable object is also the least interesting thing about the work.

The claim is true about the noun and false about the verb. Anyone can now
*have* a slide engine. Almost no one can *do* what building Lattice took —
hold a standard and keep the whole thing coherent while it's under pressure.
AI made everything around that work easier and left the work itself exactly
where it was.

## What the machine is standing on

Lattice is a few hundred thousand lines across a few thousand files, but the
code isn't what matters. Look at the folder beside it: hundreds of dated
decision documents, each a choice made, defended, and sometimes reversed when
the evidence turned against it. A rule I wrote and later retired, because I
went back and re-tested the assumption under it and it no longer held. A
feature that would obviously sell, killed on purpose, with the reason written
down so I couldn't quietly change my mind.

Those documents are the product. The CSS is only where the judgment landed.

A model is fluent at the move from a decided question to working code. It is
not the thing that knew the question was worth asking, or which of two
plausible answers would still be right in six months. Without that judgment,
the same model produces fluent output over an incoherent system: a hundred
locally-reasonable choices that never add up to one coherent thing. It looks
finished. Push on it and it falls apart.

Run the experiment. Give a capable person the same tools I have, the same
month, and one brief: build a boardroom-grade slide engine. They ship a
working prototype in days — the part the belief points at. Then they reach
the first real fork, and they have no way to choose, because nothing has
bitten them yet. So they take the easy branch. Six weeks later it's quietly
on fire, and they can't say why. Every hard rule in Lattice exists because
someone already paid that tuition. A greenfield built with a better shovel
still has the same landmines, still armed.

## Same tool, wider gap

The deepest mistake in *anyone can do it now* is reading a lower floor as a
lower ceiling.

AI did raise the floor. The worst thing a person can produce today is much
better than the worst they could produce alone, and that's a genuine good.
But the ceiling went up too, because someone with judgment now spends their
scarce hours on it instead of boilerplate. The tool doesn't average people
toward each other. It amplifies whatever direction they were already facing,
so good taste and no taste end up further apart, not closer. Aim it with a
real sense of quality and the results are excellent; aim it with none and you
reach mediocrity sooner. The gap between the two doesn't close; it widens, and
then hides behind everyone's nicer baseline.

## What actually got scarcer

Three things, and a model hands you none of them.

- **Knowing what good is before you see it.** A model steers toward
  *plausible*, which is a polite word for average. A board deck can't be
  average and survive the room. Someone has to hold a standard the machine
  has no access to.
- **Deciding what not to build.** Half of those decision documents are
  restraint — vetoes, retirements, *we could, and we won't, and here's why.*
  AI is an engine of more. Saying no is a subtractive skill, and a generative
  tool has no instinct for it.
- **Owning the reversal.** It takes holding a belief loosely enough to kill
  it, and still having believed it enough to ship it in the first place — the
  rarest move in building anything, and the one a model is worst at. No amount
  of raw capability stands in for it.

## Ask the tool itself

Ask an AI honestly and it will tell you this itself. Every time one works
inside Lattice, it works downstream of a standard it didn't set — fluent
within the rules, but never the thing that decided the rules should exist, or
what *good* means here, or when the whole approach has gone wrong. When it
goes off, it goes off confidently, plausibly, in the average direction, and
what catches it is a person with taste saying *no, not good enough.* Take that
person out of the room and you don't get Lattice-without-the-human. You get
fluent drift.

So when someone says AI means anyone can do what I did, what they're picturing
is the tool without me — and that version produces the confident average. I
was the correction on the average the whole time.

## What to do with the belief

Don't argue the surface claim, because you'll lose: at that level it's true.
Anyone really can generate a thing that renders slides. Move the argument to
where the belief is false. Pick any hard fork in the work and ask the skeptic
what they would have chosen, and why. It falls apart the moment it has to
produce judgment on demand, which is the one thing that never got automated.

Better, use the belief instead of defending against it. Make the judgment
legible — that written record already does it, and it's the receipt that tells
the real thing from a copy of its look. Spend the hours the tool
frees on the work only a person can do, and treat the commodity part as a
commodity. Compete where the model can't follow.

## The part that doesn't automate

Photography didn't end painting. It ended the market for mediocre painting,
and made the deliberate kind matter more. The people who mistook *I can
produce an image now* for *I can paint now* were wrong in exactly the way this
belief is wrong.

So build the kind of work whose value you can point to but could never prompt
out of thin air: the reasoning, and the standard held steady across a thousand
small choices that were only obvious once someone made them. AI doesn't
replace that work. It waits for it, and mostly doesn't find it.

One line runs through all of Lattice, and it answers the whole question too:
the machine owns what's correct, and you own what's good. Anyone can have the
engine now. Doing what the engine is built on is still yours.

## Where to go next

- [Principles](/principles/) — the convictions the engine is built on.
- [The story](/story/) — why Lattice exists, and what the name means.
