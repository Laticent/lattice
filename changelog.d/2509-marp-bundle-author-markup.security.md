- An Export-to-Marp bundle now refuses an author's forged plugin markers, as the engine has since
  #2557: raw HTML in the deck that spells `data-lattice-hydrate`, `-config`, `-settle`, `-final` or
  `-off` is renamed `data-author-lattice-…` in the bundle's Markdown. That includes a `header:` or
  `footer:` directive that spells one only after YAML decodes it (`data-lattice\x2dhydrate`), which
  Marp renders as HTML. A deck with no such markup exports byte-identically.
- In a bundle whose producer left a drawing plugin off, an author's raw
  `<pre><code class="language-mermaid…">` stays code, including one spelled
  `language-mermaid-source`, which the runtime used to draw; so does a ```` ```mermaid-source ````
  fence Marp renders.
