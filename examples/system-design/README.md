# examples/system-design/ — the tutorial, in chapters

`examples/system-design-foundations.md` is one deck: 234 slides, 235
PDF pages with its generated glossary. These are the same slides cut into
13 chapter decks, each one readable on its own — its own title slide, an
agenda marking which of the deck's six chapter groups it sits in, an orientation
slide saying what it assumes from the chapters before it, and a closing slide
pointing at the next one. Chapter 13 ends on the deck's own closing slide
instead of a second one.

**Generated — do not hand-edit.** The omnibus is the single source of truth for
every slide body here; `tools/build-system-design-chapters.js` owns the wrapper
slides and the cut. Fix prose in the omnibus and run `npm run chapters:system-design`
(`build:check` fails on a stale, missing or orphaned chapter).

| # | Chapter | From | Slides | Pages |
|---|---|---|---|---|
| 1 | [Before Anything, a Tuesday](ch01-a-tuesday.md) | Part zero | 9 | 13 |
| 2 | [The Words for It](ch02-the-words.md) | Part one | 19 | 23 |
| 3 | [Protagonist and Antagonist](ch03-protagonist-and-antagonist.md) | Part two | 10 | 15 |
| 4 | [Which Answer Is Wanted](ch04-solution-types.md) | Part three | 13 | 18 |
| 5 | [The Data Kit](ch05-the-data-kit.md) | Part four | 44 | 49 |
| 6 | [The Compute Kit](ch06-the-compute-kit.md) | Part four | 10 | 15 |
| 7 | [The Network Kit](ch07-the-network-kit.md) | Part four | 11 | 16 |
| 8 | [The Scale Kit](ch08-the-scale-kit.md) | Part four | 14 | 18 |
| 9 | [The Reliability Kit](ch09-the-reliability-kit.md) | Part four | 13 | 18 |
| 10 | [The Security Kit](ch10-the-security-kit.md) | Part four | 18 | 23 |
| 11 | [Designing Instagram](ch11-designing-instagram.md) | Part five | 38 | 43 |
| 12 | [Designing a Parking App](ch12-designing-a-parking-app.md) | Part six | 20 | 25 |
| 13 | [The Map Back](ch13-the-map-back.md) | Part seven | 13 | 17 |

**Slides** counts what came from the omnibus — 232 of its 234, the two it
does not carry being the deck's own title and agenda, which each chapter
replaces with its own. **Pages** is what the chapter actually renders to: those
slides, plus the wrappers, plus a glossary appendix where the chapter's trimmed
acronym registry still defines something. 293 pages in all.

Render one by hand (set `CHROME_PATH` first; see `engineering/development.md`):

```
node lattice-emulator.js examples/system-design/ch07-the-network-kit.md examples/system-design/ch07-the-network-kit.pdf
```
