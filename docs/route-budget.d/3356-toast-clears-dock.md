playground: +5
home: +5
getting-started: +5

The `panel-dock` marker class on `PanelDock` (`components/ui/panel.tsx`), which one `:root:has()` rule in
`styles/tailwind.css` reads to lift a phone toast above a panel's bottom search field instead of covering it
(measured at 390px: "Added 1 reference file." over the Library's search). Given back first: the measuring hook it
replaces cost 170 bytes on every route and put the Studio past its hard ceiling. The Studio owes nothing.
