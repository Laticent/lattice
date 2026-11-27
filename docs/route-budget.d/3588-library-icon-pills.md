studio: +724
The Library's section pills are icons in the dock and on the phone (storage slice 4, design §7 of
2026-11-22-local-first-drive-storage.md), and the Studio's eager pre-paint shell draws them too, with the
kinds button's place and the Backup and restore button, so the row does not refold or shift when the Library
loads. The largest movers, per CI: panel-shells +315, the lucide icon chunks +245 and +219, and a
LanguageSelect/workspace-backup-meta re-split netting +16 (795 together; other chunks shrank to the 724 total). Given back first: PillTabs no longer imports the tooltip (a `renderHint` prop), which had re-split
two shared chunks for +458 on every route with a pill strip, and the Backup and restore dialog loads on first open.
