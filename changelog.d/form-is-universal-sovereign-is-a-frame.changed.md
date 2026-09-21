- **Changed: every slide now states the Form model in the DOM.** The engine, the
  emulator and the browser runtime stamp `data-form="2d"` (this slide composes as
  Form, in the 2D medium) and `data-frame="<id>"` (which Frame carves it —
  `standard`, or one of the nine sovereign ids) on every top-level slide.
  Sovereignty used to be spelled as an ABSENT `form` class, which made "which Frame
  composes this slide" indistinguishable from "is this Form at all"; a reader now
  asks `data-frame` and gets a name.
- **Unchanged on purpose: the `form` CSS class.** It is the chrome-hosting Frame's
  selector hook — what the engine rules that paint the masthead band, the bay, the
  footer Cell and the rail select on — so a sovereign Frame still does not carry it.
  Nothing about any rendered deck changes: every deck golden and every component
  gallery is byte-identical.
- **Changed: the chrome injectors gate on the FRAME.** The masthead band, the footer
  Cell, the progress rail and the watermark ask `hostsChromeCells()`;
  `FORM_TOGGLE_SKIP` is now `SOVEREIGN_FRAMES`, because it is no longer a toggle's
  skip-list.
