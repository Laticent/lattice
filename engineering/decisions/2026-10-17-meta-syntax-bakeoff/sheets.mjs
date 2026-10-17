/**
 * One-page rule sheets for the writer test (pre-registration §3 criterion 5, §8). Same shape for every
 * syntax: what a record looks like, how values are written, how a long note is written, how several
 * records go on one slide, one example. Labels are blind (S1..S6); LABELS maps them back.
 */
import { classWords } from './catalog.mjs';

export const LABELS = { S1: 'C3', S2: 'C0', S3: 'C5', S4: 'C1', S5: 'C4', S6: 'C2' };
const EXAMPLE = '(the example sets layout = content, footer = Q3 "review", and a note of two paragraphs "Open cold." and "Then pause.")';

export const SHEETS = {
  C0: `Records are HTML comments, one comment per field. The slide's layout, variants, modifiers and registers are written together in ONE comment as space-separated class words: <!-- _class: WORDS -->. Every other field is its own comment: <!-- _name: value -->. A bare word comment with no name (for example <!-- stress-slide -->) is a marker. A comment that is not a field is a speaker note; a note of several paragraphs is ONE comment with a blank line between paragraphs. The value is the rest of the comment up to -->. Surrounding double quotes on a value are removed. A pane field is <!-- _pane: value -->. Several records go on separate lines.
Example ${EXAMPLE}:
<!-- _class: content -->
<!-- _footer: Q3 "review" -->
<!--
Open cold.

Then pause.
-->`,
  C1: `A record is ONE line of inline code (single backticks) holding @meta{ name=value, name=value }. Names are used exactly as given. A value is written bare unless it contains a comma, =, {, }, [, ], a double quote or |, or starts or ends with a space, or is empty: then wrap it in double quotes, writing \\" for a quote and \\\\ for a backslash. A note paragraph is note="...". The line cannot hold a line break or a blank line, so fields with those go in a fenced block instead: three backticks and the word meta, one "key: value" per line, closed by three backticks; a note of several paragraphs is written "note: |" followed by each paragraph indented two spaces with a blank line between paragraphs. If a value contains a backtick, wrap the record in double backticks with a space inside each end. Several records go on separate lines.
Example ${EXAMPLE}:
\`@meta{layout=content, footer="Q3 \\"review\\""}\`
\`\`\`meta
note: |
  Open cold.

  Then pause.
\`\`\``,
  C2: `A record is ONE line holding @meta{ name=value, name=value } with no other markup around it. Names are used exactly as given. A value is written bare unless it contains a comma, =, {, }, [, ], a double quote or |, or starts or ends with a space, or is empty: then wrap it in double quotes, writing \\" for a quote and \\\\ for a backslash. A note paragraph is note="...". The line cannot hold a line break or a blank line, so fields with those go in a fenced block instead: three backticks and the word meta, one "key: value" per line, closed by three backticks; a note of several paragraphs is written "note: |" followed by each paragraph indented two spaces with a blank line between paragraphs. Several records go on separate lines.
Example ${EXAMPLE}:
@meta{layout=content, footer="Q3 \\"review\\""}
\`\`\`meta
note: |
  Open cold.

  Then pause.
\`\`\``,
  C3: `A record is a fenced block: a line of three backticks and the word meta, the fields, then a line of three backticks. Inside, one "key: value" per line; the value is the rest of the line. A value that starts or ends with a space, starts with | or a double quote, or contains a line break must be written as a JSON string (double quotes, with \\" \\\\ \\n inside). A note of several paragraphs is written "note: |" followed by each paragraph indented two spaces, with a blank line between paragraphs; a note of one line is "note: text". Names are used exactly as given. Several records go in separate fences.
Example ${EXAMPLE}:
\`\`\`meta
layout: content
footer: Q3 "review"
note: |
  Open cold.

  Then pause.
\`\`\``,
  C4: `A record is a reference definition: a line that starts [meta]: # " and continues on the following lines, with one "key: value" per line, ending with a line holding only a closing double quote. Everything between the opening and closing quote is the record, and inside it a double quote is written \\" and a backslash is written \\\\. The value is the rest of the line; a value that starts or ends with a space, starts with | or a double quote, or contains a line break must be written as a JSON string (which is then escaped again for the outer quotes). A blank line cannot appear inside the record, so each paragraph of a note is its own "note: text" line. Names are used exactly as given. Several records go on separate blocks.
Example ${EXAMPLE}:
[meta]: # "
layout: content
footer: Q3 \\"review\\"
note: Open cold.
note: Then pause.
"`,
  C5: `A record is one HTML element <meta name="value" name="value">, attributes always in double quotes. In a value, write & as &amp;, " as &quot;, < as &lt; and > as &gt;. Line breaks inside a value are allowed. A note of several paragraphs is ONE note attribute with a blank line between paragraphs. Names are used exactly as given. Several records go on separate lines.
Example ${EXAMPLE}:
<meta layout="content" footer="Q3 &quot;review&quot;" note="Open cold.

Then pause.">`,
};

const fmt = (v) => JSON.stringify(v);
function lines(rec, mode) {
  const out = [];
  const r = { ...rec };
  if (mode === 'comments') {
    const cls = classWords(rec); const rest = {};
    for (const [k, v] of Object.entries(r)) if (!['layout', 'variant', 'universal', 'modifiers', 'unplaced'].includes(k) && !classWords({ [k]: v })) rest[k] = v;
    if (cls) out.push(`  class words = ${fmt(cls)}`);
    for (const [k, v] of Object.entries(rest)) out.push(...fieldLines(k, v));
  } else for (const [k, v] of Object.entries(r)) out.push(...fieldLines(k, v));
  return out;
}
function fieldLines(k, v) {
  if (k === 'note') return v.map((p, i) => `  note paragraph ${i + 1} = ${fmt(p)}`);
  return [`  ${k} = ${fmt(v)}`];
}
/** The slide specs. mode 'typed' lists typed fields; 'comments' lists class words for the control. */
export function specText(slides, mode) {
  return slides.map((s, i) => [`Slide ${i + 1}`, ...s.records.flatMap((r, j) => [` record ${j + 1}:`, ...lines(r, mode)])].join('\n')).join('\n\n');
}

export function writerPrompt({ slides, order, outPath }) {
  const sheet = order.map((lab) => `### ${lab}\n${SHEETS[LABELS[lab]]}`).join('\n\n');
  const typed = specText(slides, 'typed'); const comments = specText(slides, 'comments');
  return `You are a careful technical writer. Below are rule sheets for six ways of writing per-slide metadata records (labels S1..S6), and 12 slide specs. Use ONLY these sheets; do not read any other file in any repository.

For EACH syntax and EACH slide, write exactly the text that records that slide's fields in that syntax (metadata text only, no slide body, no commentary). Where a slide has more than one record, write all of them in that syntax. Follow each sheet's escaping rules exactly; the text will be read back by a strict program, and anything it cannot read exactly counts as a mistake.

Slide specs for S1, S3, S4, S5, S6 (field = value pairs; values are JSON strings, so decode them):

${typed}

Slide specs for S2 only (it writes layout, variants and registers as class words in one comment):

${comments}

Rule sheets (presented in your own order):

${sheet}

OUTPUT: write one JSON file to ${outPath} with the shape {"S1": {"1": "text", "2": "text", ... "12": "text"}, "S2": {...}, ... "S6": {...}}. Each value is the exact text for that slide in that syntax, with newlines as \\n. Write the file with a tool, not as chat text. When finished, reply with one line: done.`;
}
