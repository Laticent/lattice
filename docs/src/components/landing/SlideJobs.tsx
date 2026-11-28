import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SLIDE_JOBS } from './room-decks';

// "What does this slide need to do?" — the visual vocabulary, grouped by the job a slide
// does, inside "Say more with less". Six jobs, ONE live slide at a time: six live slides in
// a row would cost a phone several screens and six engine renders, so the visitor picks a
// job and the engine renders that one (Radix unmounts the hidden panels).
//
// Every slide is a real engine render through the shared <DeckPreview> bridge, never a
// drawing. Each panel reads its `look` line BEFORE the slide: what to look at, and what it
// proves (the owner's rule: introduce, then look). The sources are in room-decks.ts.

export type SlideJobsData = {
	/** Per job, in SLIDE_JOBS order: whether its slide holds a fence a runtime draws (computed at
	 *  build time by index.astro, where the plugin registry's probe runs). The slides themselves
	 *  come from room-decks.ts, so the props stay small. */
	drawn: boolean[];
	themeBase: string;
	runtimeUrl: string;
	engineUrl: string;
	dagreUrl: string;
	katexUrl: string;
};

const JOBS = SLIDE_JOBS;

export default function SlideJobs({ data }: { data: SlideJobsData }) {
	const [job, setJob] = React.useState(JOBS[0]?.job ?? '');
	const options = React.useMemo(
		() => ({
			themeBase: data.themeBase,
			runtimeUrl: data.runtimeUrl,
			engineUrl: data.engineUrl,
			dagreUrl: data.dagreUrl,
			katexUrl: data.katexUrl,
		}),
		[data.themeBase, data.runtimeUrl, data.engineUrl, data.dagreUrl, data.katexUrl],
	);
	return (
		<div className="lx-ui min-w-0">
			<Tabs value={job} onValueChange={setJob}>
				{/* Three by two on a phone, one row of six from `sm`: every job stays visible,
				    none folds into a menu. */}
				<TabsList
					aria-label="What the slide needs to do"
					className="grid w-full grid-cols-3 gap-1 group-data-[orientation=horizontal]/tabs:h-auto sm:grid-cols-6"
				>
					{JOBS.map((j) => (
						<TabsTrigger key={j.job} value={j.job} className="min-h-10 text-[14px]">
							{j.job}
						</TabsTrigger>
					))}
				</TabsList>
				{JOBS.map((j, i) => (
					<TabsContent
						key={j.job}
						value={j.job}
						className="mt-3 grid grid-cols-1 items-start gap-x-[clamp(20px,3vw,36px)] gap-y-3 lg:grid-cols-[1fr_1.6fr]"
					>
						{/* At lg the line sits beside the slide, so a full-width 16:9 render does
						    not cost a desktop screen; below lg it sits above it. */}
						<p className="m-0 text-[15px] leading-[1.55] text-foreground lg:pt-2">
							<code className="font-mono text-[0.9em] text-primary">{j.layout}</code> · {j.look}
						</p>
						<DeckPreview
							options={options}
							sample={j.sample}
							drawn={data.drawn[i] ?? false}
							active={job === j.job}
							frame="stage"
							className="live-host relative m-0 aspect-video w-full overflow-hidden"
							aria-label={`A ${j.layout} slide for the job "${j.job}", rendered by Lattice`}
						/>
					</TabsContent>
				))}
			</Tabs>
		</div>
	);
}
