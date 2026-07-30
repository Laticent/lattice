/**
 * The class on the glossary slide's GENERATED term table — the marker that tells
 * the two render paths which table they built.
 *
 * Its own module because both ends need it and neither can import the other:
 * `lib/integrations/markdown-it/plugins.js` emits the table as an HTML string,
 * `lib/core/glossary-slide.js` builds it as nodes, and both range-pill readers
 * have to select exactly the same tables or they disagree.
 *
 * What went wrong without it: each path guessed. The token path read the range off
 * ANY raw-HTML table on the slide; the DOM mirror first read any table at all
 * (so an unrelated source note both blocked the list→table conversion AND supplied
 * the pill: `X` where the engine said `A`), then — after that was narrowed to a
 * `Term`/`Definition` header row — disagreed the other way on a raw-HTML table the
 * token path still accepted. A marker ends the guessing on both sides.
 */

const GLOSSARY_TABLE_CLASS = 'glossary-terms';

module.exports = { GLOSSARY_TABLE_CLASS };
