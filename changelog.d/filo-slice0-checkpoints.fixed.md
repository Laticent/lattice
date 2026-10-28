- **Fixed: "Save a version" no longer fails silently when the browser's storage is full.**
  Version history now lives in IndexedDB instead of localStorage, where 25 copies of a large
  deck could not fit in Safari at all and a full quota in any browser dropped the save
  without a word. Existing versions move over automatically on first load. If a save still
  fails, the Studio says so; the version stays in Version history until you reload.
