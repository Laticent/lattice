// ④ It's just Markdown — one promise, proven five ways. Angle: every beat is a text→boardroom
// transform, and the reveal caption NAMES the magic each time ("a '>' became a pull-quote"). The
// repetition builds the mental model: whatever you write, it comes out boardroom-grade.

import { landing, newDeck, revealSlide, SLIDE, type TourBuild, teachBeat, toWalkthrough } from './tour-kit';

const S = [SLIDE.title, SLIDE.bigNumber, SLIDE.kpi, SLIDE.quote];

export const justMarkdown: TourBuild = ({ mobile }) =>
	toWalkthrough([
		teachBeat('One idea to take away: everything here is plain Markdown.', 600),
		...newDeck(mobile, 'A blank deck to prove it.', '“My First Deck.”'),
		...revealSlide(mobile, S, 1, { teach: 'A “#” heading and two lines…', reveal: 'Five words became a title slide.', cadence: mobile ? 18 : 16, wow: true }),
		...revealSlide(mobile, S, 2, { teach: 'A dash, a number, a note…', reveal: 'A bullet became a hero metric.', cadence: 11 }),
		...revealSlide(mobile, S, 3, { teach: 'A numbered list of values…', reveal: 'A list became a KPI board.', cadence: 7, wow: true }),
		...revealSlide(mobile, S, 4, { teach: 'A blockquote with a name…', reveal: 'A “>” became a pull-quote.', cadence: 10 }),
		...landing(mobile, 'The same Markdown you already know. Boardroom out.'),
	]);
