import EventEmitter from 'eventemitter3';
import type { Scene } from './scene';
import type { OffscreenCanvas2D } from './canvas2d';
import type { InputType } from './common';

interface SceneControllerEvent {
    change: [scene: Scene];
}

export class SceneController extends EventEmitter<SceneControllerEvent> {
    readonly list: Map<string, Scene> = new Map();

    private lastTick: number = 0;

    private _nowScene: Scene | null = null;
    public get nowScene(): Scene | null {
        return this._nowScene;
    }
    public set nowScene(v: Scene | null) {
        this.changeTo(v);
    }

    constructor(public readonly canvas: OffscreenCanvas2D) {
        super();

        const tick = (timestamp: number) => {
            this.tick(timestamp);
            requestAnimationFrame(tick);
        };
        tick(0);
    }

    add(scene: Scene) {
        this.list.set(scene.id, scene);
    }

    changeTo(scene: Scene | string | null) {
        if (typeof scene === 'string') {
            const target = this.list.get(scene) ?? null;
            this._nowScene = target;
        } else {
            this._nowScene = scene;
        }
        if (!this._nowScene) return;
        this._nowScene.onShown();
    }

    tick(timestamp: number) {
        if (!this._nowScene) return;
        const lastTick = this.lastTick;
        this.lastTick = timestamp;
        if (lastTick === 0) return;
        const dt = timestamp - lastTick;
        this.canvas.clear();
        this._nowScene.onTick(timestamp, dt, lastTick);
        this._nowScene.render(this.canvas);
    }

    ready(): Promise<void[]> {
        return Promise.all(this.list.values().map(v => v.load()));
    }

    input(type: InputType, ev: KeyboardEvent) {
        if (!this._nowScene) return;
        this._nowScene.onInput(type, ev);
    }
}
