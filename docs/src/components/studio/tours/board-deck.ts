// ③ Build a board deck — the 4 o'clock meeting. Angle: a scenario with a clock and stakes. Each
// beat advances the story toward "ready"; captions are in-scene. The impressive stuff (KPI board,
// the Coach verdict, one-tap present) is the payoff, not a feature list.

import { coach, landing, newDeck, present, revealSlide, SLIDE, type TourBuild, teachBeat, toWalkthrough } from './tour-kit';

const S = [SLIDE.title, SLIDE.quote, SLIDE.kpi, SLIDE.closing];

export const boardDeck: TourBuild = ({ mobile }) =>
	toWalkthrough([
		teachBeat('You present to the board at 4. It’s 3:40. Let’s build it.', 600),
		...newDeck(mobile, 'A fresh deck for the update…', '…“My First Deck.”'),
		...revealSlide(mobile, S, 1, { teach: 'Open with where the quarter landed.', reveal: 'Your headline — already a title slide.', cadence: mobile ? 18 : 16, wow: true }),
		...revealSlide(mobile, S, 2, { teach: 'Paste the COO’s line…', reveal: '…and it lands as a pull-quote.', cadence: 10 }),
		...revealSlide(mobile, S, 3, { teach: 'The four numbers the board asks for.', reveal: 'A clean KPI board — no fiddling with boxes.', cadence: 7, wow: true }),
		...revealSlide(mobile, S, 4, { teach: 'And the ask for Q1.', reveal: 'The close writes itself.', cadence: 8 }),
		...coach('3:52 — the Coach says it’s board-ready.'),
		...present('3:58. Walk in and present it full-screen.'),
		...landing(mobile, 'Blank to boardroom before four o’clock. Your turn.'),
	]);
