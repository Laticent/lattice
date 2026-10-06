- **Import deck… now sits in the deck switcher, under New deck, and in ⌘K.** It used to be
  in the Lattice brand menu, where people looking next to "New deck" didn't find it. It now
  opens **`.lattice`**, **Markdown**, a **webpage (`.html`) export**, and a **PDF or
  PowerPoint exported from Lattice** with the new switch below. The importer detects the
  format from the file's contents, so a renamed file still opens. A PDF or PowerPoint that
  carries no deck is refused with a message saying how to get one that does. Import never
  tries to rebuild a deck from slide pictures. (`docs/src/components/studio/deck-import.ts`)
- **New: "Re-openable in Lattice" on PDF and PowerPoint export.** With the switch on, the
  exported file carries the deck's `.lattice` project, so anyone you send it to can import
  it and edit the deck exactly as you wrote it. In a PDF it is an attachment named
  `deck.lattice`; in a PowerPoint, a package part. The switch is **off by default**,
  because the embedded deck includes your speaker notes and hidden slides. Each deck
  remembers its own setting. Review comments never ride in a PDF or PowerPoint this way;
  to pass them along, send the `.lattice` file. PowerPoint now opens an options step
  before downloading, as PDF already did. With the switch off, PDF and PowerPoint files are
  built exactly as before. (`docs/src/components/studio/embedded-source.ts`,
  `engineering/decisions/2026-10-05-reopenable-exports.md`)
