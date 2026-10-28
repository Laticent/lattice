studio: +6200
The Studio's one undo history: every write to the deck now goes through one commit path in
`StudioShell` (+4.3KB gzipped), and `studio-filo.ts` adds the keymap that sends ⌘Z to Filo from
any focus and the rules for which history owns it (+1.9KB). CI measured +6,072 B; +6,200 covers
gzip variation.
