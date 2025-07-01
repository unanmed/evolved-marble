import EventEmitter from 'eventemitter3';
import { Scene } from './scene';
import { IUIInstance, UIController } from '@motajs/client';
import { InputType, IScene, ISceneController, SceneMode } from '../common';

interface SceneControllerEvent {
    change: [scene: Scene];
}

export class SceneController
    extends EventEmitter<SceneControllerEvent>
    implements ISceneController
{
    readonly list: Map<string, IScene<any, any>> = new Map();

    private lastTick: number = 0;

    /** 当前打开的 UI 实例 */
    private _instance?: IUIInstance;
    get instance() {
        return this._instance;
    }

    private _nowScene: IScene<any, any> | null = null;
    public get nowScene(): IScene<any, any> | null {
        return this._nowScene;
    }

    constructor(public readonly ui: UIController) {
        super();

        const tick = (timestamp: number) => {
            this.tick(timestamp);
            requestAnimationFrame(tick);
        };
        tick(0);
    }

    /**
     * 根据 id 获取场景实例
     */
    get(id: string) {
        return this.list.get(id) ?? null;
    }

    /**
     * 添加场景实例
     */
    add(scene: Scene<any, any, any>) {
        this.list.set(scene.id, scene);
    }

    /**
     * 切换当前显示的场景
     * @param scene 要切换至的场景
     * @param props 传入场景的参数
     */
    changeTo(scene: Scene<any, any, any> | string | null) {
        if (typeof scene === 'string') {
            const target = this.list.get(scene) ?? null;
            this._nowScene = target;
        } else {
            this._nowScene = scene;
        }
        if (!this._nowScene) return;
        this._nowScene.onShown();
        this.ui.closeAll();
        this._nowScene.setMode(SceneMode.Scene);
        this._instance = this.ui.open(this._nowScene.getGameUI(), {
            scene: this._nowScene
        });
    }

    /**
     * 每帧执行一次的函数
     */
    tick(timestamp: number) {
        if (!this._nowScene) return;
        const lastTick = this.lastTick;
        this.lastTick = timestamp;
        if (lastTick === 0) return;
        const dt = timestamp - lastTick;
        this._nowScene.onTick(timestamp, dt, lastTick);
    }

    /**
     * 加载所有场景的必要信息，全部加载完毕后兑现
     */
    ready(): Promise<void[]> {
        return Promise.all(this.list.values().map(v => v.load()));
    }

    /**
     * 输入按键操作
     */
    input(type: InputType, ev: KeyboardEvent) {
        if (!this._nowScene) return;
        this._nowScene.onInput(type, ev);
    }
}
