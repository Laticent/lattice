- The Compose (rich) editor and its ProseMirror stack now load when you switch to
  Compose, not on every Studio load. Markdown is the default pane, so this takes
  ~92KB gz (~294KB of parse) off the cold path. Switching to Compose shows a brief
  prose-shaped placeholder while the chunk streams in. Studio eager JS:
  **740.9KB → 648.7KB gz**.
