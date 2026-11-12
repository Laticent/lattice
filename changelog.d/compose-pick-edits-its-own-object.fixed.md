- **A pick in Compose's object editor edits the object it was opened on, never its neighbor.** The editor kept its
  object's position as of its last render; a change that shifted positions before the next render (an earlier code span
  turning into a pill, say) left it pointing at the next object, and a Size pick on a spark could write `lg` to the pill
  beside it. Every write now reads where the open object is at that moment, and refuses an object whose source is not
  the one opened.
