// The deck-scope "Acronyms" editor — a structured UI over the `acronyms:` front-matter, so an author
// teaches read-aloud how to SAY a term (its spoken expansion) and, optionally, gives it a glossary
// DEFINITION, without hand-writing YAML. Each entry is `TERM → expansion (+ definition?)`; committing
// writes the whole `acronyms:` block back via `setFrontMatterAcronyms` (the reader,
// `acronymEntries`, picks it up reactively). Sibling of LexiconEditor, same commit-on-blur discipline;
// the extra field (definition) and the block-object serialization are the only differences.
//
// Why it matters for pacing: the read-aloud estimator counts SYLLABLES of the spoken form. A bare
// "EBITDA" gets spelled out (E-B-I-T-D-A ≈ 6 beats); teaching `EBITDA → "ee bit dah"` makes the voice
// say it right AND the caption timing count the right 3 beats. See the acronyms-in-Lexicon pivot in
// engineering/decisions/2026-07-13-pace-calibration-apply-and-rewriter.md.

import { Plus, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AcronymEntry } from '../../lib/front-matter';

interface Row {
  id: string;
  term: string;
  expansion: string;
  definition: string;
}

let ROW_SEQ = 0;
const toRows = (acronyms: ReadonlyMap<string, AcronymEntry>): Row[] =>
  [...acronyms].map(([term, e]) => ({ id: `a${ROW_SEQ++}`, term, expansion: e.expansion, definition: e.definition ?? '' }));

/** The `acronyms:` map as an ordered [term, entry] list. A blank TERM or a blank EXPANSION drops the
 *  row (both are required — the parser skips an entry with no expansion); duplicate terms de-dupe
 *  last-wins. An empty definition is omitted (shorthand form). */
function toEntries(rows: readonly Row[]): [string, AcronymEntry][] {
  const seen = new Map<string, AcronymEntry>();
  for (const r of rows) {
    const term = r.term.trim();
    const expansion = r.expansion.trim();
    if (!term || !expansion) continue;
    const definition = r.definition.trim();
    seen.set(term, definition ? { expansion, definition } : { expansion });
  }
  return [...seen];
}

export function AcronymEditor({
  acronyms,
  onChange,
}: {
  acronyms: ReadonlyMap<string, AcronymEntry>;
  /** Commit the whole registry (writes the `acronyms:` block). Called on blur / add / remove. */
  onChange: (entries: [string, AcronymEntry][]) => void;
}) {
  const [rows, setRows] = React.useState<Row[]>(() => toRows(acronyms));
  // Re-seed on a CONTENT change (deck switch, AI edit) — keyed on the content signature, not the Map
  // identity, so our own commit (same content back) doesn't fight typing.
  const sig = [...acronyms].map(([t, e]) => `${t}\u0000${e.expansion}\u0000${e.definition ?? ''}`).join('\u0001');
  const lastSig = React.useRef(sig);
  React.useEffect(() => {
    if (sig !== lastSig.current) {
      lastSig.current = sig;
      setRows(toRows(acronyms));
    }
  }, [sig, acronyms]);

  const commit = (next: Row[]) => {
    const entries = toEntries(next);
    lastSig.current = entries.map(([t, e]) => `${t}\u0000${e.expansion}\u0000${e.definition ?? ''}`).join('\u0001');
    onChange(entries);
  };

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => {
    setRows((rs) => {
      const next = rs.filter((r) => r.id !== id);
      commit(next);
      return next;
    });
  };
  const add = () => setRows((rs) => [...rs, { id: `a${ROW_SEQ++}`, term: '', expansion: '', definition: '' }]);
  const commitCurrent = () => commit(rows);
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur(); };

  return (
    <div className="my-2">
      {rows.length === 0 ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          No acronyms yet. Add a term and how it should be read aloud (e.g. <span className="font-mono">EBITDA → ee bit
          dah</span>) so the voice says it right and the caption times it right.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 rounded-md border border-border p-1.5">
              <div className="flex items-center gap-1.5">
                <Input
                  aria-label="Term"
                  value={r.term}
                  placeholder="EBITDA"
                  onChange={(e) => update(r.id, { term: e.target.value })}
                  onBlur={commitCurrent}
                  onKeyDown={blurOnEnter}
                  className="h-8 w-24 shrink-0 font-mono text-[13px]"
                />
                <span aria-hidden className="shrink-0 text-[12px] text-muted-foreground">→</span>
                <Input
                  aria-label="Spoken expansion"
                  value={r.expansion}
                  placeholder="ee bit dah"
                  onChange={(e) => update(r.id, { expansion: e.target.value })}
                  onBlur={commitCurrent}
                  onKeyDown={blurOnEnter}
                  className="h-8 flex-1 text-[12.5px]"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${r.term || 'acronym'}`}
                  onClick={() => remove(r.id)}
                  className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <Input
                aria-label="Definition"
                value={r.definition}
                placeholder="Definition — optional, for a glossary"
                onChange={(e) => update(r.id, { definition: e.target.value })}
                onBlur={commitCurrent}
                onKeyDown={blurOnEnter}
                className="h-7 text-[11.5px] text-muted-foreground"
              />
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="outline" size="sm" onClick={add} className="mt-2 h-8 gap-1.5 text-[12px]">
        <Plus className="size-3.5" /> Add acronym
      </Button>
    </div>
  );
}
