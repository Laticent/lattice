- **Fixed: narration no longer reads content marked `aria-hidden="true"`.** A speech
  projection is exactly the consumer that attribute is written for, but `SKIP_SELECTOR`
  and `speechText` both ignored it, so decoration was spoken on captions, Present and
  Read·Article. The shipped `.vtt` for any deck with a `journey` chart said
  "Pprospect" — the actor dot's initial run into the label beside it — and a math
  slide read its expression a third time from the visual KaTeX copy. Both are gone.
  Read·Article is untouched by construction: the attribute is in the SPEECH selector
  only, because `closest()` matches self-or-ancestor and a shared entry would have
  dropped every block nested under a hidden wrapper — a rendered Mermaid diagram and
  the deck logo among them.
