---
kind: plugin
name: Code
order: 8
promise: Paste code, name the language; it's highlighted in your theme.
intro: A fenced code block tagged with its language, like `ts` or `python`, comes out on a code panel with every keyword, string and comment in the theme's syntax colors. One line above the block, `@code{…}`, adds a title, line numbers, a focus on the lines that matter or a diff — and copy buttons where the deck is read in a browser.
useWhen: Your slides show an API call, a config file, a query or a migration, and a screenshot of an editor would be blurry, unsearchable and the wrong colors.
syntax: '```ts'
facts:
  - { k: You write, v: 'A fenced block with a language' }
  - { k: Highlights with, v: 'highlight.js 11 (BSD-3), bundled' }
  - { k: Languages, v: 'About 190; a deck loads only the ones it names' }
  - { k: Loaded, v: By default; free until a deck has code }
reference:
  - label: The plugin's reference
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/code/code.docs.md
    note: Every `@code` field, the languages, and how highlighting reaches each export.
  - label: Why we built it this way
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-15-code-plugin.md
    note: The measurements, the formatter bake-off and the decisions behind them.
  - label: The code slide
    href: /components/code/code/
    note: A slide built around one block, and how many lines each room can read.
  - label: The compare-code slide
    href: /components/code/compare-code/
    note: Two versions side by side.
  - label: lattice fmt
    href: /reference/cli/
    note: Format every block in a deck from the command line.
examples:
  - key: plain
    label: On any slide
    caption: A fence with a language, colored in the theme's syntax palette.
    sample: |
      ## Load a user, from cache first.

      ```ts
      export async function load(id: string): Promise<User> {
        const hit = cache.get(id);
        if (hit) return hit;
        return api.get(`/users/${id}`);
      }
      ```
  - key: record
    label: A title, numbers and focus
    caption: "@code{…} above the fence: the file name, line numbers, two lines at full strength, and copy buttons."
    sample: |
      <!-- _class: code -->

      ## The retry lives in one place.

      `@code{title=src/fetch.ts, numbers, focus=4-5, copy}`

      ```ts
      export async function fetchJson(url: string) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const res = await fetch(url);
          if (res.ok) return res.json();
          await sleep(attempt * 250);
        }
        throw new Error(`gave up on ${url}`);
      }
      ```
  - key: diff
    label: A change
    caption: "@code{diff}: + and - mark the lines, and the code on them is still highlighted."
    sample: |2
      <!-- _class: code -->

      ## One query instead of fifty.

      `@code{diff, title=orders.py}`

      ```python
       def totals(customer_ids):
      -    return [db.total(c) for c in customer_ids]
      +    rows = db.totals(customer_ids)
      +    return [rows[c] for c in customer_ids]
      ```
  - key: compare
    label: Before and after
    caption: The compare-code slide sets two blocks side by side; the plain code span above each is its label.
    sample: |
      <!-- _class: compare-code -->

      ## Same config, half the lines.

      `Before`

      ```yaml
      services:
        web:
          image: app:latest
          environment:
            - NODE_ENV=production
            - PORT=8080
      ```

      `After`

      ```yaml
      services:
        web: { image: app:latest, env_file: .env }
      ```
---

## The problem

Code on a slide is usually a screenshot of someone's editor. It's the wrong font and the wrong colors for the deck, it blurs when it's printed or projected, and nobody can search it, copy it or read it aloud. Changing one line means taking the screenshot again.

Pasting the code as plain text fixes that but loses the color that makes code readable at a glance: which word is a keyword, where a string ends, what's a comment. And a slide full of code has a second problem — the audience doesn't know which two lines you're talking about.

## The idea

- **You write a fence with a language.** ```` ```ts ````, ```` ```python ````, ```` ```sql ````, ```` ```sh ```` — any of the roughly 190 languages highlight.js knows, and their usual short names.
- **It wears the theme.** Each kind of word — keyword, string, comment, number, type — takes one of the theme's syntax colors, checked for contrast on the code panel. Switch themes and the code recolors with everything else.
- **One line configures a block.** An `` `@code{…}` `` span on the line above a fence adds a title bar, line numbers, focus on some lines (the rest recede), a tint on others, or a diff. It renders nothing itself.
- **Nothing runs in the deck.** The colors are worked out when the slide is rendered, so the PDF, the PowerPoint, the webpage and the Studio all show the same highlighted text — and a deck only loads the languages its fences name.
- **Copy where it can be copied.** With `copy`, readers of the webpage, the Studio or the Playground get two buttons: copy the code, or copy it with its colors. They never appear in a PDF, a picture or Present.

## How to use it

Code is on in every deck. Write a fence and name the language:

````markdown
```ts
export async function load(id: string): Promise<User> {
  return cache.get(id) ?? api.get(`/users/${id}`);
}
```
````

To configure one block, put a record on the line above it:

````markdown
`@code{title=src/load.ts, numbers, focus=2}`

```ts
export async function load(id: string): Promise<User> {
  return cache.get(id) ?? api.get(`/users/${id}`);
}
```
````

| You want | Write |
| --- | --- |
| A file name above the code | `title=src/load.ts` |
| Line numbers (never copied with the code) | `numbers`, and `start=120` to begin elsewhere |
| Two lines at full strength, the rest faded | `focus=3-4` |
| A tint on a line, nothing faded | `mark=4` |
| Added and removed lines | `diff`, with `+`, `-` or a space starting each line |
| Long lines wrapped instead of cut off | `wrap` |
| Copy buttons in the browser | `copy` |
| The same setting on every block | `code: numbers, wrap` in the deck's front matter |

To keep code tidy, `lattice fmt deck.md` formats every block with the usual formatter for its language — Prettier for web languages, ruff for Python, sql-formatter for SQL. In the Studio, `@code{format}` formats a block when you leave the editor.

## Where else it fits

Lattice uses highlight.js, the same widely used open-source highlighter many documentation sites and blogs run. So the habits carry over: a fenced block copied from a README, a pull request or a wiki page lands on a slide unchanged and comes out highlighted. Code slides suit engineering reviews and design walkthroughs, API launches, onboarding decks, incident write-ups (the query that caused it, the diff that fixed it), and teaching.

## How Lattice uses it

The `code` slide gives one block the room, and the `compare-code` slide sets two versions side by side; both require this plugin. On any other slide, a fence is still highlighted. A fence another plugin owns — ```` ```mermaid ````, ```` ```math ````, ```` ```functionplot ```` — goes to that plugin instead, so a diagram is drawn, not colored as text.

## What it doesn't do

- **A fence without a language stays plain.** It sits on the code panel, uncolored. `lint:deck` names a language tag nothing knows.
- **It doesn't run or check your code.** It colors words by their kind; a typo highlights as happily as working code.
- **A slide holds about fourteen lines.** A code slide doesn't scroll or shrink the type, so longer blocks are cut off, and `lint:deck` warns first. Trim to the lines that make the point.
- **Copy buttons stay in the browser.** A PDF, a PowerPoint, an image or a video never shows them.
- **Formatting is an editing step.** Rendering never reformats your code; `lattice fmt` or the Studio does, where you can see the change.
