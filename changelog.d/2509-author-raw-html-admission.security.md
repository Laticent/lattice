- An author's raw HTML can no longer write the plugin host's figure markers: wherever author markup
  spells `data-lattice-hydrate`, `-config`, `-settle`, `-final` or `-off`, the engine renames it
  `data-author-lattice-…`, so a deck cannot forge a pending figure that a plugin draws from a config
  the author packed. Other
  `data-lattice-*` attributes, such as a motion asset's `data-lattice-motion`, are kept.
- On a host that narrowed its default plugin set, an author's raw-HTML
  `<pre><code class="language-mermaid">` of a plugin the deck did not load stays code: its class
  becomes `language-off-mermaid`, which nothing draws.
- The Playground page's editor lint follows the deck's plugin admission, as the Studio's does, and
  re-lints when the host changes its defaults: with math off, a `---` inside `$$` is a slide break
  there too.
