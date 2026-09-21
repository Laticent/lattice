- **Fixed: the Studio's Read · Article view shows diagrams as drawings, not as
  Mermaid source.** The engine's render is static, so a ```mermaid fence arrives
  as a `<pre><code>` and the runtime that inflates it never loads in this pane —
  the article showed a wall of source where the player's Read view shows the
  picture. The view now runs the same diagram bake the webpage export runs, and
  freezes the diagram's palette onto the SVG so it keeps its colors in a pane
  that ships no deck stylesheet. A deck with no runtime-drawn content skips the
  bake entirely and is unchanged; a bake that cannot run still renders the
  article, with the fence source it showed before.
  The spent Mermaid source block is hidden in the reading pane the way the engine hides it
  on a slide — without that, a fence on a plain content slide showed its source and the
  drawing, one under the other.
