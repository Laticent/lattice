// ② The full walkthrough — Write · Polish · Ship. Angle: a chaptered tour so a newcomer always has
// a map. Three title-card beats announce the acts; each act opens with a patient "here's what's
// next" line. The complete journey — build, restyle, coach, present, export.

import { coach, landing, newDeck, present, reskin, revealSlide, SLIDE, share, type TourBuild, teachBeat, toWalkthrough } from './tour-kit';

const S = [SLIDE.title, SLIDE.bigNumber, SLIDE.radar, SLIDE.closing];

export const walkthrough: TourBuild = ({ mobile }) =>
	toWalkthrough([
		teachBeat('A quick tour, in three parts: write it, polish it, ship it.', 600),
		...newDeck(mobile, 'Every deck starts here — a blank canvas.', '“My First Deck.”'),
		// ── ① Write ──
		teachBeat('① Write — slides are just Markdown.', 500),
		...revealSlide(mobile, S, 1, { teach: 'A heading and two lines…', reveal: '…a boardroom title.', cadence: mobile ? 18 : 16, wow: true }),
		...revealSlide(mobile, S, 2, { teach: 'A number worth showing off.', reveal: 'The whole slide is the metric.', cadence: 11 }),
		...revealSlide(mobile, S, 3, { teach: 'A list of values…', reveal: '…becomes a chart.', cadence: 8, wow: true }),
		...revealSlide(mobile, S, 4, { teach: 'And a close.', reveal: 'Four slides, drafted in a minute.', cadence: 8 }),
		// ── ② Polish ──
		teachBeat('② Polish — restyle the whole deck at once.', 500),
		...reskin(mobile, 'One theme reskins every slide — the layouts never change.', 'Light or dark, instantly.'),
		...coach('The Architect Coach scores it against a boardroom rubric.'),
		// ── ③ Ship ──
		teachBeat('③ Ship — present it, or hand it off.', 500),
		...present('Present it full-screen, board-ready.'),
		...share('Or export a pixel-perfect PDF.'),
		...landing(mobile, 'Write, polish, ship. Now make it yours.'),
	]);
