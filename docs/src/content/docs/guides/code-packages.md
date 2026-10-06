---
title: Writing a code package
description: How to write a component that draws its slides with JavaScript — the slide it receives, the one tool it gets, the sandbox it runs in, and the rules its output follows.
---

Most components are CSS: the author writes Markdown, and the component's
stylesheet lays it out. A **code package** is a component that also carries
JavaScript. Lattice runs that script on every slide the component claims, and
the script returns the slide's new markup.

Use one when CSS cannot draw the slide from the author's Markdown: a chart
computed from numbers, a layout that depends on counting items, a shape built
from text. If CSS can do it, write a plain component instead. A plain component
needs no approval, and it renders everywhere a deck renders.

This page covers what the script receives, what it may return, where it runs,
and how a user approves it. The example at the end is complete. Copy it,
install it, and it draws.

## What a code package is

A code package is a component package with one more file. The folder is named
for the component, and every file inside starts with that name:

```text
dateline/
  dateline.manifest.json   the name, the type, and the facts version it reads
  dateline.styles.css      the component's CSS, as for any component
  dateline.gallery.md      a sample slide that uses it
  dateline.transform.js    the script
```

The manifest must say which version of the slide's facts the script reads:

```json
{ "name": "dateline", "type": "component", "format": 1, "facts": 1 }
```

`"facts": 1` is required. Lattice refuses a code package whose manifest leaves
it out or names a version this Lattice does not hand out. It refuses the
package when you install it, when a deck renders it, and when the Studio
imports it, and it says which line to add. When the facts change shape one day,
Lattice will still hand your package the version it asked for, or refuse it in
plain words. It never hands your package a shape it was not written for.

Four more rules decide whether Lattice accepts the package at all:

- **Only a component carries code.** A theme, finish or motion package with a
  script in it is refused.
- **One script, named `<name>.transform.js`.** Any other script in the folder
  refuses the package, so nothing runs that the user did not see.
- **One ES module with one default export.** The file must end in
  `export { yourFunction as default };`, which is how esbuild writes a bundle
  in ES module format. A bundler is the easy way to get it; a file written by
  hand works too.
- **At most 1,000,000 characters.** Bundle your helpers into the file; the
  package imports nothing at run time. Leave source maps out: a trailing
  `//# sourceMappingURL=` line means the file no longer ends in the export.

## The function

The default export is a function. Lattice calls it once for each slide the
component claims. It passes the slide and a small kit, and it takes back a
string:

```js
function dateline(slide, kit) {
  // read slide.facts, return one <section>…</section>
}
export { dateline as default };
```

A slide belongs to your component when its class list names it, as in
`<!-- _class: dateline -->`. One component draws each slide, and the order is
fixed, not the order of the classes: first the shipped components that draw
with code, such as `bar`, then installed packages in name order. So
`<!-- _class: bar dateline -->` is a bar chart. On the command line, Lattice
prints a warning that names the component that drew the slide instead.

The function must return a string that holds **exactly one `<section>`**. It
must return that string directly. The call does not wait for a promise, so an
`async` function fails. If the function throws, or returns anything else,
Lattice keeps its own drawing of the slide and adds a visible note that names
your package and the reason.

### The slide

`slide` is frozen. It holds:

| Field | What it is |
|---|---|
| `facts` | The slide's plain content: **the stable promise.** Read this. |
| `html` | The slide's `<section>` as Lattice rendered it: the surface you can adjust. |
| `index` | The slide's position in the deck, counting from 0. |
| `idPrefix` | The prefix this render gives the ids it creates. |
| `baseUrl` | The address relative images resolve against, or `''`. |

**`facts` is what you build on.** A version may gain new fields, but a field
changes meaning or goes away only in a new version, and your manifest names the
version you read. **`html` is Lattice's own
markup.** Read it when you want to adjust Lattice's drawing rather than replace
it, and expect that markup to change between releases.

`slide.facts`, version 1:

| Field | What it holds |
|---|---|
| `version` | `1` |
| `classes` | The slide's `class` directive, split into words. Never a class Lattice added. |
| `directives` | Every per-slide directive Lattice applied, in camelCase, each value as written |
| `title` | The text of the slide's first `#` or `##` heading, or `''` |
| `blocks` | The content in reading order: `heading`, `paragraph`, `list`, `table`, `code`, `quote`, `image` |
| `text` | Every block's text, one block per line |
| `tokens` | The theme token names, each with its `--`, such as `--cat-1-mark` |

Text is plain: the Markdown marks are gone, entities are decoded and white space
is collapsed. `**Kickoff**` arrives as `Kickoff`, and a link arrives as its
words. Headings, paragraphs and list items also carry `runs`, the text cut
wherever its marks change. Each run is `{ text, code?, pill?, strong?, em?,
del?, mark?, math?, href? }`, so the address of a link and the value in
`` `12` `` are still there when you need them. A list's `items` carry `text`,
`runs`, `paragraphs` and their own nested `items`. A table carries `caption`,
`head` and `rows`. Code keeps its exact text.

The running header and footer on every slide are not content. Their text is in
`directives`, not in `blocks`.

To color something, use a name from `facts.tokens` as `var(--name)`. Every name
on the list resolves in every shipped theme, so the slide follows the deck's
palette, dark mode included. Most names are colors; a few, such as
`--spectrum`, are gradients.

### The kit

`kit` holds one thing: `kit.measure(text, font)`. It returns the width of
`text` in pixels when set in `font`, a CSS font such as `'600 24px serif'`.
Use it to fit labels. It measures with the fonts installed on the machine: the
deck's web fonts are not loaded in the worker, and a font the machine lacks
measures as its fallback, without an error. Leave room for the difference. Your
bundle brings every other helper it needs.

## Where the code runs

Lattice runs your function in a **worker** inside a sandboxed page. The worker
has no `document`, no `window` and no DOM, and two walls keep it off the
network:

- The page's content-security policy allows no requests, and the worker
  inherits it. `eval` and `import()` do not work.
- Before your code starts, Lattice removes the worker's network tools:
  `fetch`, `XMLHttpRequest`, `WebSocket`, `WebSocketStream`, `EventSource`,
  `WebTransport`, `importScripts`, `Worker`, `SharedWorker`, `BroadcastChannel`,
  `Request`, `caches` and `indexedDB`. Each is `undefined`, and your code cannot
  put one back. This second wall exists because a browser does not always
  apply the inherited policy: Firefox let `EventSource` from a worker reach a
  local server that the policy should have blocked.

Build your markup as a string. Plain JavaScript (strings, arrays, regular
expressions, `Math`, `Intl`) is all there, and so is `OffscreenCanvas`, which
`kit.measure` uses.

Time and size are bounded. One slide may take 2 seconds. All the code packages
in one render share 30 seconds. A slide's output may be at most 4,000,000
characters, and in the Studio so may all the package output in one render. When a slide runs out of time, Lattice keeps its own drawing of that
slide and adds a note that names your package and the reason.

On the command line, the sandbox browser also runs under the operating system's
own sandbox wherever the machine allows it. The approval prompt says whether it
is on.

## What your output may contain

Lattice cleans your section before it reaches the deck, as it cleans any slide.
Scripts, event handlers and anything else that could run are removed, and so
are `<style>`, `<link>`, `<iframe>`, `<object>`, `<embed>`, `<form>`,
`<input>`, `<base>` and `<meta>`. Put your styles in `<name>.styles.css`, not in
the output. Your section also follows three rules of its own. Lattice drops
anything that breaks one and keeps the rest.

**Classes: your own name, or ones the slide already had.** Every class in your
output, on the section and inside it, must be one the section you were handed
carried, or your component's name, or your name followed by a dash:
`dateline`, `dateline-row`. Lattice drops any other class. Other parts of
Lattice act on class names after your code runs, so this rule stops a package
from switching them on. Write your CSS the same way:
`section.dateline .dateline-row`. A class of your own that contains `mermaid`,
`language-` or `functionplot` is dropped too.

**Addresses: only the ones you were handed.** A link, an image source or a CSS
`url()` survives only when the section you were handed held that exact address,
or when it is a `data:` URL or a `#fragment`. Your package can show the author's
own image and keep the author's own link. An address your package makes up is
dropped, remote or local, so the output cannot send the slide anywhere. The
whole attribute goes with it: a `style` that sets a color and a made-up
`url()` loses the color too. A Mermaid diagram that names an address the slide
did not hold is worse: Lattice refuses your whole output for that slide.

**Lattice's own markers stay Lattice's.** Any `data-lattice-…` attribute,
`lattice-…` class and speaker note survives only when the section you were
handed held it. The same goes for Lattice's other internal attributes:
`data-mermaid-…`, `data-img-…` and `data-pane…`. An `id` must start
with your name and a dash (`dateline-…`), or be one you were handed.

The `<section>` tag itself stays Lattice's: its id, attributes and style are
kept as they were. From the tag, your output gives only the class list. If you
leave off a class Lattice gave the section, Lattice puts it back, so a package
that builds its section from `facts` alone does not need to know those classes.
The speaker notes and the deck's own styles go back in as well.

### Naming the component

A name is lowercase letters, digits and dashes, and it starts with a letter.
Because your package adds classes in its own name, a code package may not take
a name that starts a class Lattice uses. `chart` would add `chart-frame`, and
`logo` would add `logo-wall`. Nor may it take a name that Lattice's runtime
matches on, such as `lat`, `lattice` or `mermaid`. `lattice packages add`
refuses such a name and says why. It never renames a code package, because the
code finds its slides by that name.

## How a user approves it

Nothing runs until the person rendering the deck approves your exact code.

**On the command line**, `lattice packages add` installs the package, prints the
script's file name, size and SHA-256, says what contains it (including whether
the OS sandbox is on here, and if not, how to turn it on), and asks. With no
terminal to ask on, as in CI, it installs the package unapproved, and `--trust`
approves it without asking:

```sh
npx lattice packages add dateline.zip             # describe the code, then ask
npx lattice packages trust component/dateline     # approve later
npx lattice packages trust component/dateline --yes   # approve without asking
npx lattice packages untrust component/dateline   # withdraw it
```

The approval is for those exact bytes, and for that OS sandbox or a stronger
one. Change one byte of the script and Lattice asks again. A deck that uses an
unapproved package does not render: Lattice stops, names the package and prints
the command that approves it.

**In the Studio**, import the zip in the Library. A slide that uses an unapproved
package shows Lattice's own drawing with a note. A notice above the preview shows
the code's size and SHA-256 and offers to run it. The approval is kept in that
browser only, never in a deck or a file, so no file can approve itself.

A deck exported to Marp does not run code packages. Those slides show the
author's content instead.

## A complete example

`dateline` draws a dated list as rows. It reads only `slide.facts`, so it keeps
working when Lattice's markup changes. Make a folder named `dateline` with these
four files.

`dateline.manifest.json`:

```json
{ "name": "dateline", "type": "component", "format": 1, "facts": 1 }
```

`dateline.styles.css`:

```css
section.dateline .dateline-rows { display: grid; gap: 0.25em; }
section.dateline .dateline-date { color: var(--cat-1-mark); }
```

`dateline.gallery.md`:

```md
<!-- _class: dateline -->

## Plan

- 2026-01-10 Kickoff
```

`dateline.transform.js`:

```js
function dateline(slide) {
  const f = slide.facts;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const list = f.blocks.find((b) => b.type === "list");
  const rows = (list ? list.items : []).map((item) => {
    const m = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/.exec(item.text) || [null, "", item.text];
    return '<li class="dateline-row"><b class="dateline-date">' + esc(m[1]) + "</b> " + esc(m[2]) + "</li>";
  });
  return '<section class="dateline"><h2>' + esc(f.title) + '</h2><ol class="dateline-rows">' + rows.join("") + "</ol></section>";
}
export { dateline as default };
```

The script escapes the text it writes into the markup. The facts are plain text,
so a `<` in an author's list item arrives as a `<`, and the markup must escape
it.

Install it, approve it, and render a deck that uses it:

```sh
npx lattice packages add ./dateline     # answer y to approve
npx lattice deck.md deck.pdf
```

```md
<!-- _class: dateline -->

## Launch plan

- 2026-01-10 **Kickoff**
- 2026-03-02 Beta & pilot
- 2026-06-30 [General availability](https://example.com)
```

Each list item becomes a row with its date in bold: `Kickoff` without its
asterisks, `General availability` without its link. To share the package, run
`npx lattice packages export component/dateline -o dateline.zip`.

## What to read next

- [Using the command line](/guides/cli/#approve-a-component-that-runs-code):
  installing, approving and exporting packages.
- [Themes & palettes](/guides/themes/): the token names your CSS and your
  markup can use.
