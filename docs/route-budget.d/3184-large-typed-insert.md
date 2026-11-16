studio: +71

The deck editor's large typed-insert handler (`docs/src/components/studio/editor-large-insert.ts`): an `insertText` of
64 K characters or more, such as an IME commit, dictation or a drop, goes in as one transaction instead of being laid out
by the browser first. It took a 14 MB photo deck from 15.5 s to 1.8 s in Chromium and from 282 s to 1.2 s in WebKit. It
ships with the editor, which the Studio loads eagerly.
