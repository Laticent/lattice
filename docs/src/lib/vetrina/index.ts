// Vetrina — a self-driving UI walkthrough engine. Theater over real state, seamlessly
// interruptible. Framework-free core; the React adapter lives in ./react.
//
//   run()          the whole engine (take-over, abort-racing, teardown)
//   storyboard()   the Step[] data model -> a Walkthrough
//   scene()        the fluent recording builder (build() === storyboard(seed, toData()))
//   Theme / --vt-* CSS-first tokens + a JS convenience
//   waitFor/loop/retry   abort-aware recipes over the runner
//
// See engineering/decisions/2026-07-05-vetrina-walkthrough-library.md for the contract.

export type { LoopOpts, RetryOpts, WaitForOpts } from './recipes';
export { loop, retry, waitFor } from './recipes';
// `holdUntil` is intentionally NOT public — it's the internal gate behind the descriptor's
// `Step.until`. Authors use `until` (declarative) or `waitFor` (raw). One public poll-wait.
export type { AwaitUserOpts, RunContext, RunHandle, RunOptions, StopReason, TypeOps, TypeOpts, Walkthrough } from './runner';
export { run } from './runner';
export type { SceneBuilder } from './scene';
export { scene } from './scene';
export type { DragHandle, Gesture, Stage, StageOptions, Target } from './stage';
export { createStage, isAbortError, wait } from './stage';
export type { Step } from './storyboard';
export { readMs, storyboard } from './storyboard';
export type { Color, ResolvedTheme, Theme, VtToken } from './theme';
export { resolveTheme } from './theme';
