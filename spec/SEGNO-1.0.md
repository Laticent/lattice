# Segno notation — spec 1.0

<!-- spec-parts
schema: none: the grammar is stated in full in §3
reference: docs/src/lib/segno/notation-grammar.ts docs/src/lib/segno/notation.ts
tests: spec/conformance/segno/
-->

**Version:** 1.0 · **Status:** Draft, for the owner's sign-off · **Date:** 2026-11-27 · **Owner:** @saden1 ·
**License:** [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) (this document and its shared test cases)

Segno notation is the small curly-brace syntax an author types inside other text to give it settings:
`{BETA, tag, c4}` in a code span draws a pill, `~{12 14 17}` draws a spark, and
`<!-- @meta{panes="60/40 stack"} -->` sets a slide's layout. This spec says what a span of the notation
is and how a reader turns it into a tree, so that any tool can read a span the way Lattice does.

It covers the **syntax and its tree** only. What a value means is the host's business: whether `c4` is
a color, whether `5` is a number, what the `~` tag draws. LFM says that for the spans it hosts
(LFM's inline-notation section, for code spans; LFM's record section, for `@meta`).

The owner chose on 2026-11-27 to freeze the notation as a 1.0 spec (D2 on #3441). So the notation
changes only under §8: a later version may add to it and never change or remove what 1.0 reads.

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. The four parts

| Part | Where it lives |
|---|---|
| Document | this file |
| Schema | §3 below: the grammar, stated in full |
| Reference implementation | the grammar as data, `notationSpec` in `docs/src/lib/segno/notation-grammar.ts`; the reader, `parse` in `docs/src/lib/segno/notation.ts`, which reads with the parser generated from that grammar (`notation.generated.ts`) |
| Shared test cases | [`spec/conformance/segno/`](./conformance/segno/README.md) |

## 2. Terms

- A **span** is the whole text a host hands the reader: the inside of one inline code span, or the
  record text of an `@meta` comment. A reader reads all of it, or refuses it.
- An **item** is one entry: a **value**, or a **name** joined to a value by `=` (`who=sales`).
- A **value** is one of four kinds: a **scalar** (a bare run or quoted text), a **record**
  (`{…}`), a **list** (`[…]`) or a **description** (`{> …}`).
- **Space** means U+0020 space, U+0009 tab and U+00A0 no-break space, the last because text pasted
  from documents and chat carries it. No other character is space, and a line break is not one.

## 3. The grammar

This is the grammar the reference implementation compiles. It is LL(1): a reader can decide every
choice on one character, so it reads a span in one left-to-right pass.

```ebnf
span      = { ws } , ( TAG , record , { ws } | top ) ;
top       = record , { ws } | list , { ws } | quoted , { ws } | topbare , [ "=" , { ws } , value ] ;
record    = "{" , ( ">" , desctext | first , { "," , { ws } , item } ) , "}" ;
list      = "[" , { ws } , [ item ] , { "," , { ws } , [ item ] } , "]" ;
quoted    = '"' , { "\" , ANY | NOT( '"' | "\" ) } , '"' ;
value     = record , { ws } | list , { ws } | quoted , { ws } | bare ;
first     = record , { ws } | list , { ws } | quoted , { ws } | firstbare , [ "=" , { ws } , value ] ;
item      = record , { ws } | list , { ws } | quoted , { ws } | bare , [ "=" , { ws } , value ] ;

bare      = NOT( STOP | WS ) ,         { NOT( STOP ) } ;
topbare   = NOT( STOP | WS | TAG ) ,   { NOT( STOP ) } ;
firstbare = NOT( STOP | WS | ">" ) ,   { NOT( STOP ) } ;
desctext  = { "\" , ANY | NOT( "}" | "\" ) } ;

ws        = WS ;
WS        = U+0020 | U+0009 | U+00A0 ;
STOP      = "," | "=" | "{" | "}" | "[" | "]" | '"' | "|" ;
TAG       = "~" | "^" | "!" | ">" ;
```

`NOT( … )` is any one character outside the set. `ANY` is any one character. The span MUST end where
the grammar ends: text after the span's value is a refusal (§5).

Three consequences an author meets:

- **A record starts with its first value.** `{` must be followed directly by something other than
  space or `}`. `{ ok }` and `{}` are refused.
- **A tag only opens the span.** A tag character directly before the span's own `{` names what kind
  of record it is (`~{…}`, `^{…}`, `!{…}`, `>{…}`). A span's top-level bare value therefore cannot
  start with one (`~/path` is refused). Inside a record or list a tag character is ordinary text
  (`{~5 min}`).
- **`>` first means a description.** A record whose first character is `>` holds prose, not items
  (`{> Slipped a week}`). A later item may start with `>` (`{3, >5}`).

## 4. The tree

A reader that accepts a span returns its **top item**. The tree below is what the shared test cases
compare. Positions (UTF-16 offsets into the span) are part of the reference reader's tree, but are
not compared.

### 4.1 Items and records

An item has a value and, when it was written `name=value`, a name. A record's items are in the
order written. A record holds at least one item (or is a description, §4.7).

### 4.2 Names

The text before `=` MUST be a name: an ASCII letter, then ASCII letters, digits and `-`
(`[A-Za-z][A-Za-z0-9-]*`). Space between the name and its `=` belongs to no name, and a reader MUST
drop it: `{a =b}` and `{a<TAB>=b}` read the same as `{a=b}`. Anything else before an `=` is refused
(`bad-name`), so `acme.tally=3` and `acme:tally=3` are refusals in 1.0. A reader MUST return a name in lower case: `Shape=tag` and
`shape=tag` read the same. Value text keeps its case.

### 4.3 Bare values

A bare value is the run of characters up to the next STOP character. Its inner spaces are kept and
its trailing spaces are dropped. It never starts with space: space after `,`, after `=` and before
the span's value belongs to no value. A bare value has no type: `5`, `$4.2M`, `Q1..Q3` and `at-risk`
are all text, and the host decides what each one means.

### 4.4 Quoted text

Quoted text runs from `"` to the next `"` that no backslash escapes. Inside it, `\"` reads as `"` and
`\\` reads as `\`. Every other backslash is kept, with the character after it (`\n` stays two
characters). Quoted text keeps all of its spaces, may hold any STOP character, and is marked as
quoted in the tree, so a host can tell `"5"` from `5`.

### 4.5 Lists

A list holds values in order. An element's position is the number of commas before it, so an empty
element holds its place: `[, Reach]` is a list whose first element is empty (`null`) and whose
second is `Reach`. Empty elements after the last value are dropped, so `[a, , ]` holds one element
and `[]` holds none. An element MUST NOT be named: `[a=1]` is refused (`named-in-list`).

### 4.6 Tags

A tagged span's top item carries its tag character. No other item has a tag.

### 4.7 Descriptions

A description is the prose between `{>` and the first `}` that no backslash escapes. Inside it,
`\}` reads as `}` and `\\` reads as `\`. Its spaces at both ends are dropped. It is a kind of its own,
never a scalar: `{>5}` is a description that says "5", not the number 5.

### 4.8 The span's top item

The span's top item may be a record, a tagged record, a list, quoted text, a bare value or a named
item on its own (`after=Design`). Space before it is skipped.

## 5. Refusals

A reader MUST refuse a span that the grammar does not match, and a span whose tree breaks §4.2 or
§4.5. It MUST NOT return a partial tree for a refused span. A reader SHOULD report the code below for
each refusal, because the shared test cases name it; how it words its message is its own business.

A span can break more than one rule. A reader that reports codes MUST then report the one this order
picks, so two readers agree on every span:

1. **The grammar first.** If the span does not match §3, report the code of the first fault met
   reading left to right. A quote or bracket that is never closed is met at the end of the span, so
   `{a, b|c` is `reserved-pipe`. `too-deep` is a grammar fault, met at the bracket that goes past §6.
2. **Then the tree.** Only a span that matches §3 is checked against §4.2 and §4.5, and the first
   fault left to right gives `bad-name` or `named-in-list`. So `{x.y=1|2}` is `reserved-pipe`, not
   `bad-name`.

| Code | When |
|---|---|
| `reserved-pipe` | a `|` outside quotes. It is reserved so a later version can give it a meaning (§8) |
| `unclosed-quote` | a `"` that is never closed |
| `stray-equals` | an `=` with no name before it, or a second `=` in one item (`a=b=c`) |
| `space-after-brace` | space directly after a record's `{` |
| `unclosed-bracket` | a `{` or `[` that is never closed |
| `bad-name` | the text before `=` is not a name (§4.2) |
| `named-in-list` | a list element written `name=value` (§4.5) |
| `too-deep` | more brackets nested than §6 allows |
| `syntax` | any other mismatch: an empty record, a tag character starting a bare span, text after the span's value |

The reference reader also offers a fix for some refusals: a quote or bracket to close, a space to
remove, an item to quote. Fixes are informative: a reader MAY offer them, and conformance does not
test them.

## 6. Limits

A span MAY nest 32 levels of brackets (records and lists together). A reader MUST read 32 and MUST
refuse 33 (`too-deep`). The cap keeps a hostile span from costing more than its length: with it, and
with the grammar LL(1), a reader's work grows in proportion to the span's length.

## 7. What a host decides

The notation leaves these to the host that reads a span, and a host's own spec states them:

- Whether a piece of text is a span at all. For inline code, LFM's inline-notation section says so.
  Its rule is that a span is notation only when it opens with `{` and then neither space nor `}`,
  optionally after one tag character, and that a backslash before that opener keeps the whole span as
  code. The backslash is the host's escape: it is not part of the span this spec reads.
- What it does to its text before a reader sees it. A host MAY undo its own escapes and MAY join
  wrapped lines, as long as it states each step. For example, an `@meta` comment first decodes the
  comment escape `--\>` and then joins each line break outside quotes, with the next line's indent,
  into one space. The span this spec reads is the text after those steps. Without such a step, a line
  break inside a bare value stays in it (§2).
- Forms it reads itself, outside the notation. A host MAY accept a form that this spec refuses, if
  it reads that form itself and never hands it to a Segno reader. For example, an `@meta` record
  accepts `{}` as an empty record, which §5 refuses. LFM states such forms as its own.
- What each tag, word, name and value means, and which items a form accepts.
- Which kinds a place accepts. An `@meta` record, for one, accepts only scalar fields and refuses
  lists and nested records in them; LFM states that subset.

## 8. Versioning

The notation has one version line, 1.x. A **minor** version MAY make a refused span readable: give
`|` a meaning, allow a name to hold `.`, add a tag character. It MUST NOT change the tree of any
span that 1.0 reads, and MUST NOT refuse any span that 1.0 reads. So a span that reads under 1.0
reads the same way under every 1.x, and a host may rely on the 1.0 grammar for what it writes.
A change that would alter or refuse a span 1.0 reads is a 2.0, and needs a new major version of this
spec and the owner's sign-off.

A host MAY accept only part of the notation (a **profile**). LFM's `@meta` record is one. A profile
MUST read every span it hands a Segno reader exactly as this spec does. The steps and forms §7 lets a
host state for itself are outside that rule, because the notation never reads them.

## 9. Security

The notation is data. A reader MUST NOT evaluate it, fetch anything a value names, or treat a value
as markup. Because the grammar is LL(1) and the nesting is capped (§6), no span costs more than work
in proportion to its length. Hosts that put a value into a document still owe their own sanitizing;
this spec does not make any value safe to render.

## 10. Document history

- **1.0, 2026-11-27, Draft.** First statement of the notation as the reference implementation reads
  it on `main`, written by the Segno desk at the owner's choice (D2 on #3441).
