import { EventEmitter } from 'eventemitter3';
import {
    IDisplayInfoBase,
    IScene,
    ITrainer,
    SceneGameUI,
    SceneMode,
    InputType
} from '../common';

export interface ITrainParallelReturns {
    observation: Record<string, any>;
    rewards: Record<string, number>;
}

export interface SceneEvent {
    shown: [];
    modeChange: [mode: SceneMode];
}

export abstract class Scene<
        /** State */
        S = {},
        /** Trainer */
        T extends IDisplayInfoBase = IDisplayInfoBase,
        /** Event */
        E extends SceneEvent = SceneEvent
    >
    extends EventEmitter<E | SceneEvent>
    implements IScene<S, T>
{
    abstract readonly id: string;
    abstract readonly name: string;
    /** 场景的显示模式 */
    mode: SceneMode = SceneMode.None;
    /** 这个场景的训练器 */
    trainer: ITrainer<S, T, any> | null = null;

    constructor() {
        super();
    }

    getDisplayInfo(): T | null {
        return this.trainer?.getDisplayInfo() ?? null;
    }

    bindTrainer(trainer: ITrainer<S, T, any> | null): void {
        this.trainer = trainer;
    }

    setMode(mode: SceneMode) {
        this.mode = mode;
        this.onModeChange(mode);
    }

    getMode() {
        return this.mode;
    }

    abstract getGameUI(): SceneGameUI<S, T>;

    abstract getState(): S;

    abstract load(): Promise<void>;

    abstract onShown(): void;

    abstract onTick(timestamp: number, dt: number, lastTick: number): void;

    abstract onInput(type: InputType, ev: KeyboardEvent): void;

    onModeChange(mode: SceneMode): void {
        this.emit('modeChange', mode);
    }
}
