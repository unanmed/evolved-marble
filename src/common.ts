import { GameUI } from '@motajs/client';
import { DefineComponent, DefineSetupFnComponent } from 'vue';

export const enum SceneMode {
    /** 不显示任何画面 */
    None,
    /** 仅显示信息，不显示画面 */
    Info,
    /** 显示画面 */
    Scene
}

export interface SceneUIProps<S, T extends IDisplayInfoBase> {
    scene: IScene<S, T>;
}

export const enum InputType {
    KeyDown,
    KeyUp
}

export type SceneGameUI<S, T extends IDisplayInfoBase> = GameUI<
    | DefineComponent<SceneUIProps<S, T>>
    | DefineSetupFnComponent<SceneUIProps<S, T>>
>;

export interface IScene<S, T extends IDisplayInfoBase> {
    /** 当前的渲染模式 */
    readonly mode: SceneMode;
    /** 绑定的训练器 */
    readonly trainer: ITrainer<S, any, T> | null;

    /**
     * 获取训练时的必要显示信息
     */
    getDisplayInfo(): T | null;

    /**
     * 绑定训练器至这个场景
     * @param trainer 要绑定的训练器
     */
    bindTrainer(trainer: ITrainer<S, any, T> | null): void;

    /**
     * 设置显示模式
     */
    setMode(mode: SceneMode): void;

    /**
     * 获取当前的显示模式
     */
    getMode(): SceneMode;

    /**
     * 获取此场景的渲染组件
     */
    getGameUI(): SceneGameUI<S, T>;

    /**
     * 获取本场景的必要状态，可以用于模型训练。
     */
    getState(): S;

    /**
     * 加载这个场景
     */
    load(): Promise<void>;

    /**
     * 当这个场景显示到画面上时触发
     */
    onShown(): void;

    /**
     * 每个滴答执行一次:
     * - 在显示游戏画面时，每帧执行一次，时刻是真实时刻
     * - 在不显示游戏画面，即显示信息或不显示时，会尽可能快地执行，时刻是非真实时刻，两次滴答固定间隔 16.67ms
     * @param timestamp 当前时刻
     * @param dt 与上一帧的时刻差值
     * @param lastTick 上一帧的时刻
     */
    onTick(timestamp: number, dt: number, lastTick: number): void;

    /**
     * 当触发按键时执行
     * @param type 按键输入类型
     * @param ev 事件对象
     */
    onInput(type: InputType, ev: KeyboardEvent): void;

    /**
     * 当模式切换时执行
     * @param mode 切换至的模式
     */
    onModeChange(mode: SceneMode): void;
}

export interface IDisplayInfoBase {
    /** 当前训练到了第几轮 */
    episode: number;
}

export interface ITrainer<S, SL, T extends IDisplayInfoBase> {
    /**
     * 获取训练器的当前信息
     */
    getDisplayInfo(): T;

    /**
     * 保存必要的训练状态
     */
    save(): SL;

    /**
     * 加载必要的训练状态
     * @param data 状态信息
     */
    load(data: SL): void;

    /**
     * 当此训练器绑定至场景上时执行的方法
     * @param scene 绑定至的场景
     */
    onBind(scene: IScene<S, T>): void;
}
