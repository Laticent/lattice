studio: +178
playground: +117
home: +119
The Mermaid pass now returns early from its boot wait when a document has no diagram fence and no host Mermaid tag (the home and playground growth, in the shared runtime), and the Studio preview gains the host-side collage hover bridge (`hoverCollageAt`, the studio growth).
Given back first: the code-copy hover bridge now writes its marker only on a change, and the new frame-loop guard replaces a 600-frame wait loop's worth of per-frame work rather than adding a second path.
