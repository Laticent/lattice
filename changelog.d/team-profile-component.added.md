- **New component: `team-profile`, the people slide.** A roster of named people,
  each under a portrait, with the role they own — meet-the-leaders, meet-the-team,
  and the QBR roll-call. Five compositions off one authoring shape: the default
  three-up cards, `lead` (one hero row above a rule, the rest ranked beneath),
  `bench` (six up, face and role only, for the long roster), `sides` (two labeled
  rosters facing each other), and `bio` (one person per row, the note on a line of
  its own). Write `- Name` and nest the portrait, the backticked role, and one
  line on what they own.
- **Anyone with no photo gets a monogram, not a hole.** The engine reads the
  initials off the name and draws them in the circle, so a half-photographed
  roster still reads as one wall — the customer side of a QBR is almost never
  photographed. The monogram is quiet beside real faces and takes the categorical
  palette when nobody has a photo, because it is standing in for something missing
  in the first case and carrying an identity in the second.
- **Each composition holds the roster it advertises, and reflows to keep it.**
  The counts are measured on real renders rather than inferred: `bench` and the
  default three-up hold twelve and eight, `lead` nine, `sides` six a side, `bio`
  six. `lead`'s ranked band widens by a column per extra person so it stays one
  row — a fixed four columns used to wrap the sixth person to a second row that
  landed off the slide, taking a name with it. A coda or footer takes 121px out
  of the stage, and every composition absorbs it: the default turns its cards on
  their side, portrait beside the words instead of above them; `lead` tightens
  its band; `sides` closes its column gap; `bio`, whose rows are already at their
  floor, drops to five and says so in its capacity note.
