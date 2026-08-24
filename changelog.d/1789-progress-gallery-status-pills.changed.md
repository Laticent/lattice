- **Changed: the `progress` gallery goldens are re-rendered for the retuned status
  pills.** #1789 and #1809 moved every palette's curated status trio and the status
  pill's dark gradient, and the gallery PDFs that show those pills were not
  re-blessed with them. The drift is the pills and nothing else — the pixel diff
  lights up `on-track`, `at-risk`, `deferred`, `blocked` and `done`, and no other
  region of the slide. Source unchanged; the same markdown re-rendered.
