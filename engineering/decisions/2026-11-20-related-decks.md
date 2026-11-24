---
status: proposed
summary: >
  "Related decks" lets one deck point at others the author wants read alongside it. Three shapes: a link written
  in the deck, a "related" list kept in the Library, or the chat reading a linked deck as reference. Recommended:
  a link in the deck's front matter that the chat reads, built on the deck-as-reference text the Library already
  makes (library-deck-ref.ts). Not built; the owner picks.
---

# Related decks: how one deck points at another

**Date:** 2026-11-20 · **Status:** proposed, for the owner to pick · **Builds on:** the Library's deck import
(`docs/src/components/studio/library-deck-ref.ts`), which already turns a deck into reference text, its slide
words and speaker notes.

## The question

An author keeps a Q3 review and a Q4 plan. When they work on the plan, the review matters: the chat should be
able to quote last quarter's numbers, and a reader should be able to find the review. Today the only way to get
there is to import the review into the Library and attach it to the chat by hand, every time.

"Related decks" is a way for a deck to say which other decks belong with it. Nothing is built yet. This note
names what the choice turns on and recommends one shape.

## The axes

1. **Where the link lives.** In the deck's own source, so it travels with an export, a `.lattice` and a backup;
   or in the Studio's storage, so the deck's text stays untouched.
2. **Who reads it.** A person (a link in the switcher or the Library), the chat (as grounding text), or both.
3. **What the link points at.** A deck in this browser's deck list, which does not exist on another device, or a
   reference file in the Library, which carries its own copy of the text.
4. **Cost per chat call.** A related deck read as grounding text is billed on every call that includes it, the
   same as any reference file (`reference-doc.ts` caps one at 40,000 characters).

## The options

### A. A link written in the deck

A front-matter key names the related decks, for example `related: [q3-review]`. The Studio shows them in the
deck switcher, and Present can offer them at the end.

- **For:** it travels with the deck: an export, a `.lattice` and a workspace backup all keep it.
- **Against:** it adds a front-matter key, which the engine, the linter and the docs must all learn. A name that
  points at a deck on another device leads nowhere there.
- **Cost:** a new key in the front-matter grammar, plus a lint rule for a name that matches no deck.

### B. A "related" list in the Library

The Library card of a deck (a reference file with "Open as deck") gets a "Related to…" control, and the Library
stores the pairs.

- **For:** no change to the deck's source or to the engine. It sits next to where decks already land as reference.
- **Against:** the link lives in one browser. It leaves with neither an export nor a shared `.lattice`, so a
  collaborator never sees it.
- **Cost:** a new field on the Library record and its backup row.

### C. The chat reads a linked deck

When the open deck names a related deck, the chat adds that deck's reference text (slide words and speaker notes)
to its grounding, the way an attached reference file is added today.

- **For:** it answers the real need, "use last quarter's numbers", with no step from the author each time.
- **Against:** every call that includes it pays for its text. It needs a link to read, so it is a consumer of A or
  B, not a standalone choice.
- **Cost:** a line in the chat's grounding step, and the cost readout must count the related deck.

## Recommendation

**A and C together: the link lives in the deck, and the chat reads it.** The link has to travel with the deck,
or a collaborator who opens the `.lattice` loses it, which rules B out as the store. C is what makes the link
worth having, and the Library already produces the text C needs. Start the chat reading only decks that are in
the Library as reference files, so the text it sends is the capped reference text, never a whole deck source, and
show the related deck in the chat's cost readout before the call is sent.

If a front-matter key is too heavy for a first step, B is the reversible fallback: it can be dropped later without
touching any deck.

## Not decided here

- The key's name and its exact shape in front matter.
- Whether Present shows related decks to an audience.
- Whether a related deck that is not in the Library is imported automatically or named as missing.
