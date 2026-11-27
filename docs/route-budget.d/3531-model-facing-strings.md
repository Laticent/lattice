studio: +28
The Studio's eager chunks carry the instructions it sends its model, and #3531 corrected them: the authoring rules,
the edit-block protocol and the language directive now name `@meta{…}` records, `class=` variants and a real
`class=spotlight` photo instead of `_class`, a `bleed` layout and a ```chart fence that do not exist. The accurate
text is a little longer: architect +15, studio-store +10, architect-edits +3 gzip bytes, as CI measured them on
824f8e2. Nothing was given back: each remaining byte is wording the model reads, and shortening it would change what
the model is told again.
