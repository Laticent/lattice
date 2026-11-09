- **Fixed: an agenda's page numbers attach by name.** An agenda only shows page numbers when each line names the
  section at its position. A list reordered or renamed after it was filled, by hand or in an exported Marp bundle, used
  to get the right number of page numbers in the wrong places; it now shows none.
- A filled agenda keeps its page numbers when a section heading ends in inline code; the code is read as part of the name, not as the line's own page reference.
- Inline code inside an agenda title stays next to its words. Only a line's last inline code is its right column (a page number or a tag); before, every code span in the line stretched across the row, so `finish: atrium` floated mid-row.
