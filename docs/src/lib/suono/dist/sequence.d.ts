import type { Bytes, Clip, PlayOptions, PlayResult, Sequence, SequenceOptions, StageState } from './types';
/** The slice of a Stage the scheduler needs — narrow, so a test injects a fake. */
export interface SequenceStage {
    decode(bytes: Bytes, key?: string): Promise<Clip>;
    play(clip: Clip, opts?: PlayOptions): {
        done: Promise<PlayResult>;
        stop(): void;
        pause?(): void;
        resume?(): void;
    };
    suspend(): void;
    resume(): void;
    /** Context lifecycle — used to avoid creating an AudioContext during a pre-gesture warm. */
    state(): StageState;
}
export declare function makeSequence<T>(stage: SequenceStage, opts: SequenceOptions<T>): Sequence;
