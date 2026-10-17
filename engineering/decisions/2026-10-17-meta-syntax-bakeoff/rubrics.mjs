/**
 * Criteria 6 and 7 (pre-registration §6): rubric counts, one point per `true`, each with its reason.
 * Judged on the AUTHORING surface (what a person or model types), not on what a reader could be taught.
 */
export const CRITERION_6 = [
  'per-field type check',
  'per-field completion',
  'did-you-mean on a typo',
  'structured single-field edit',
  'line-shaped detection',
  'unambiguous end of record',
  'note with blank lines, no escaping',
  'value with a quote, no escaping',
  'fields are named, not positional',
  'reuses front-matter register names',
];
export const CRITERION_7 = [
  'valid in a standard parser with no error',
  'one obvious spelling',
  'consistent with how LFM marks block constructs',
  'no new delimiter or sigil the spec must reserve',
  'reads as plain words to a first-time reader',
];

const y = (reason) => ({ yes: true, reason });
const n = (reason) => ({ yes: false, reason });

export const RUBRIC = {
  C0: {
    c6: [n('`_class` carries positional class words; only a catalog split types them'), n('completion offers words, not per-field values'), y('unknown-class lint exists today'), y('writeDirective edits one comment'), y('a comment opens on its own line'), y('`-->` ends it'), y('a comment may hold blank lines (but not `-->`)'), y('quotes need no escaping'), n('`_class` words are positional'), n('class tokens (`head-left`, `lifted`) differ from register names')],
    c7: [y('HTML comment'), y('one spelling'), y('the current LFM form'), y('nothing new'), n('`_class: cards-grid three finish-strata head-center` is not plain words')],
  },
  C1: {
    c6: [y('slot spec types each field'), y('completion after `@meta{`'), y('did-you-mean over the slot'), y('rewrite one item'), y('the record sits on one line'), y('closing brace and backtick'), y('only through the ```meta fence, a second spelling'), n('a quote needs `\\"`'), y('named'), y('same names')],
    c7: [y('inline code'), n('two spellings: the line and the fence for long notes'), y('the inline door is LFM\'s inline mechanism'), y('reserves the kind name `meta` only'), y('reads as words')],
  },
  C2: {
    c6: [y('slot spec types each field'), y('completion after `@meta{`'), y('did-you-mean over the slot'), y('rewrite one item'), y('the record sits on one line'), y('closing brace'), y('only through the ```meta fence, a second spelling'), n('a quote needs `\\"`'), y('named'), y('same names')],
    c7: [y('plain paragraph text'), n('two spellings: the line and the fence for long notes'), n('a new block form that is not a fence, comment or inline kind'), n('reserves a bare `@meta` line in the block grammar'), y('reads as words')],
  },
  C3: {
    c6: [y('each line typed against the catalog'), y('completion after `key:`'), y('did-you-mean'), y('edit one line'), y('the fence opens on its own line'), y('a closing fence at least as long as the opener'), y('`note: |` takes blank lines'), y('the rest of the line is the value'), y('named'), y('same names')],
    c7: [y('a fenced code block'), y('one spelling (the info-string shorthand is optional)'), y('LFM already marks plugin blocks with fences'), y('reserves the info string `meta`, as plugin fences reserve theirs'), y('reads as words')],
  },
  C4: {
    c6: [y('each line typed against the catalog'), y('completion after `key:`'), y('did-you-mean'), y('edit one line'), y('the opener `[meta]:` is line-shaped'), y('closing unescaped quote'), n('a blank line cannot appear; each paragraph is its own `note:` line'), n('a quote needs `\\"`, and a JSON value needs it twice'), y('named'), y('same names')],
    c7: [y('a link reference definition'), y('one spelling'), n('not how LFM marks any block'), n('reserves the link label `[meta]`'), n('`[meta]: # "` is not plain words')],
  },
  C5: {
    c6: [y('attributes typed against the catalog'), y('attribute completion is standard in editors'), y('did-you-mean'), y('edit one attribute'), y('`<meta` opens a line'), y('`>` outside quotes'), y('blank lines are legal inside an attribute for the reader'), n('a quote needs `&quot;`'), y('named'), y('same names')],
    c7: [y('raw HTML'), y('one spelling'), n('raw HTML is not an LFM block mechanism'), n('reinterprets the standard `<meta>` element'), y('reads as words')],
  },
};
