- The Studio's cold load no longer carries the CodeMirror stack. Chat syntax
  highlighting now loads its lezer grammars on demand instead of statically, which
  had anchored ~202KB gz of CodeMirror onto the eager path and cut the `Editor`
  lazy split's saving from ~196KB gz to 20KB. Worth **−201KB gz / −575KB raw** on the
  Studio's eager JS. Chat code blocks render readable immediately and gain color a
  frame later; a failed load leaves plain text rather than wedging every later block.
