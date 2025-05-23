import EventEmitter from 'eventemitter3';
import type { OffscreenCanvas2D } from './canvas2d';
import type { InputType } from './common';

interface SceneEvent {
    shown: [];
}

export abstract class Scene extends EventEmitter<SceneEvent> {
    constructor(public readonly id: string) {
        super();
    }

    abstract load(): Promise<void>;

    abstract render(canvas: OffscreenCanvas2D): void;

    abstract onShown(): void;

    abstract onTick(timestamp: number, dt: number, lastTick: number): void;

    abstract onInput(type: InputType, ev: KeyboardEvent): void;
}
