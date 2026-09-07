- **Fixed: narration no longer reads content marked `aria-hidden="true"`.** A speech
  projection is exactly the consumer that attribute is written for, but `SKIP_SELECTOR`
  and `speechText` both ignored it, so decoration was spoken on captions, Present and
  Read·Article. The shipped `.vtt` for any deck with a `journey` chart said
  "Pprospect" — the actor dot's initial run into the label beside it — and a math
  slide read its expression a third time from the visual KaTeX copy. Both are gone;
  the Read·Article surface is byte-identical across the change.
