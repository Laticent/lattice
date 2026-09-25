- **Security: a workspace backup from someone else now meets the same import gates as a Library
  zip.** Restore used to save every theme and component in a backup straight to the Library, so
  a backup file someone sent you skipped the CSS and sample-slide gates. Restore now checks each
  item: a theme or component that would reach the network is skipped and named in the restore
  message, and every deck and every other item still comes back. A `.lattice` file's deck and
  manifest are now read under the same size budget as its packages, so an archive that
  understates an entry's size can no longer make the Studio inflate it in full.
