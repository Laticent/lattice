# lib/helpers — authoring-time diagnostics

Currently one contract: the `.overflow` warning ring. See
`overflow/overflow.docs.md` — that doc IS the spec; there is no JS to
import here.

The convention: anything that detects content overflowing its slide
(the runtime measures live; the emulator checks during PDF build) adds
`class="overflow"`, and shipped decks must have zero rings.
