- The Compose (rich) editor and its ProseMirror stack now load when you switch to
  Compose, not on every Studio load. Markdown is the default pane, so this takes
  **−92KB gz / −294KB raw** off the cold path. Switching to Compose shows a brief
  prose-shaped placeholder — which now announces itself to a screen reader, where the
  editor's equivalent placeholder is silent — while the chunk streams in.
