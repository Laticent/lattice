# `.lattice` file shared test cases

These cases say what a conformant reader returns, or refuses, for a given archive. They are written
against [`spec/LATTICE-FILE-1.0.md`](../../LATTICE-FILE-1.0.md), not against Lattice's code.

**License:** CC-BY-4.0, like the spec. **Owner:** @saden1.

## A case

Each `<name>.json` describes one archive entry by entry, and what reading it must give:

```json
{
  "title": "One sentence: what the case shows",
  "spec": "LATTICE-FILE-1.0",
  "section": "5",
  "entries": { "deck.md": "# One\n", "manifest.json": { "format": "lattice", "version": 2 } },
  "expect": { "ok": false, "refused": "newer-version" }
}
```

An entry's value is its text. A JSON object or array under `manifest.json` is written as JSON; a
string is written as it stands, so a case can hold a manifest that does not parse. The runner zips
the entries in the order listed.

| `expect` field | Meaning |
|---|---|
| `ok` | The reader opens the file. |
| `source` | The deck it returns, exactly. |
| `title` | The title it returns, after §5's clamp. |
| `comments` | How many comments it returns. |
| `themes` | The names of the theme packages it returns, in order. |
| `refused` | Why it refuses, by the name §5 gives each refusal: `missing-entry` (§5.2), `not-lattice` (§5.3), `bad-version` or `newer-version` (§5.4). |

A reader's own message for a refusal is its own business. A conformant reader refuses each of these
files for the reason named, however it says so.

## Running them

The reference reader is TypeScript in the Studio, so these run in the docs workspace's unit tier:
`docs/src/components/studio/lattice-file.conformance.test.ts`, with a failing arm. It zips each case
with JSZip, as the reference writer does, and reads it with `readLatticeFile`.
