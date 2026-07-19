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
renderer that runs, a stylesheet that holds together, a script that turns
Markdown into a PDF. If *what you built* means the object — a thing that
renders slides — then the object is more reachable than it was three years
ago. That much is true, and I won't pretend otherwise.

It's also the least interesting thing about the work.

The claim is true about the noun and false about the verb. Anyone can now
*have* a slide engine. Almost no one can *do* what building Lattice took —
hold a standard, make the calls, keep the whole thing coherent while it's
under pressure. AI didn't shrink that. It left it standing while everything
around it got easy, which is a different thing than making it easy.

## What the machine is standing on

Lattice is a few hundred thousand lines across a few thousand files. That's
not the tell. The tell is the folder next to the code: hundreds of dated
decision documents, each one a choice made, defended, and — more than once —
reversed when the evidence turned. A rule I wrote and later retired, because
I went back and re-tested the assumption under it and it no longer held. A
feature that would obviously sell, vetoed on purpose, with the reason
written down so I couldn't quietly change my mind.

Those documents are the product. The CSS is only where the judgment landed.

A model is fluent at the move from a decided question to working code. It is
not the thing that knew the question was worth asking, or which of two
plausible answers would still be right in six months. Point someone without
that judgment at the same model and they get fluent output over an
incoherent system — a hundred locally-reasonable choices that never add up,
no rules holding underneath, no taste keeping the thing honest. The output
looks finished. It just doesn't survive being pushed.

Run the experiment. Give a capable person my exact tools, my exact month,
my exact brief: build a boardroom-grade slide engine. They ship a working
prototype in days — the part the belief points at. Then they reach the first
real fork, and they have no way to choose, because nothing has bitten them
yet. So they take the easy branch. Six weeks later it's quietly on fire, and
they can't say why. Every hard rule in Lattice exists because someone already
paid that tuition. A greenfield built with a better shovel still has all the
same landmines, still armed.

## Give two people the same tool and they pull apart

The deepest mistake in *anyone can do it now* is reading a lower floor as a
lower ceiling.

AI did raise the floor. The worst thing a person can produce today is much
better than the worst they could produce alone, and that's a genuine good.
But the ceiling went up too — because someone with judgment now spends their
scarce hours on judgment instead of on boilerplate. Hand the same tool to
two people and they don't converge. They pull apart faster than before,
because the tool amplifies whatever direction you were already facing. Point
a real sense of quality through it and you get something excellent. Point an
absent one through it and you get more mediocrity, produced quicker. The gap
between them doesn't close. It widens — and then hides the widening behind
everyone's nicer baseline.

## What actually got scarcer

Three things, and a model hands you none of them.

- **Knowing what good is before you see it.** A model steers toward
  *plausible*, which is a polite word for average. A board deck can't be
  average and survive the room. Someone has to hold a standard the machine
  has no access to.
- **Deciding what not to build.** Half of those decision documents are
  restraint — vetoes, retirements, *we could, and we won't, and here's why.*
  AI is an engine of more. Saying no is a subtractive skill, and a
  generative tool has no instinct for it.
- **Owning the reversal.** Holding a belief loosely enough to kill it, but
  firmly enough to have shipped it in the first place, is the rarest move in
  building anything — and the one a model is worst at. That's a temperament,
  not a feature.

## Ask the tool itself

Here's the part people skip: the tool will tell you the same thing, if you
ask it honestly.

Every time an AI works inside Lattice, it works downstream of a standard it
didn't set. It's fluent inside the frame. It did not decide the frame should
exist, or what *good* means here, or when the frame itself has gone wrong.
When it goes off, it goes off confidently, plausibly, in the average
direction — and the thing that catches it is a person with taste saying *no,
not good enough.* Take that person out of the room and you don't get the
work without the human. You get fluent drift.

So when someone says AI means anyone can do what you did, what they're
picturing is the tool *without you.* And that version doesn't make Lattice.
It makes the confident average. You were the correction on the average the
whole time.

## What to do with the belief

Don't argue the surface — you'll lose, because at the surface the belief is
true. Anyone really can generate a thing that renders slides. Move the
conversation to where it's false: pick any hard fork in the work and ask the
skeptic what they'd have chosen, and why. The belief evaporates the moment
it has to produce judgment on demand, because judgment is exactly what didn't
get automated.

Then use the belief instead of defending against it. Make the judgment
legible — the decision documents already do this, and they're the receipt
that separates the real thing from a copy of its surface. Spend the hours the
tool frees on the parts only a person can do: the standard, the reversals,
the restraint. Let the commodity part be a commodity. Compete where the model
can't follow.

## The part that doesn't automate

Photography didn't end painting. It ended the market for mediocre painting,
and made the deliberate kind matter more. The people who mistook *I can
produce an image now* for *I can paint now* were wrong in exactly the way
this belief is wrong.

So build the kind of work whose value you can point to but couldn't prompt
out of thin air — the reasoning, the standard held across a thousand small
choices, the calls that were only obvious after someone made them. That isn't
the work AI replaces. It's the work it's waiting for, and mostly not finding.

The machine owns what's correct. You own what's good. That line runs through
all of Lattice, and it's the answer to the whole question: anyone can have
the engine now. Doing what the engine is built on is still yours.

## Where to go next

- [Principles](/principles/) — the convictions the engine is built on.
- [The story](/story/) — why Lattice exists, and what the name means.
