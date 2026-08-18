- The Studio's cold load no longer carries the CodeMirror stack. Chat syntax
  highlighting now loads its lezer grammars on demand instead of statically, which
  had anchored ~202KB gz of CodeMirror onto the eager path and cut the `Editor`
  lazy split's saving from ~196KB gz to 20KB. Studio eager JS: **976.1KB → 774.9KB
  gz (−201.2KB, −21%)**; raw parse weight 2833KB → 2258KB. Chat code blocks render
  readable immediately and gain color a frame later.
