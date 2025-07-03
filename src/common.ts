import { GameUI, IUIInstance } from '@motajs/client';
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

export interface IDisplayInfoBase {
    /** 当前训练到了第几轮 */
    episode: number;
}

export interface IHTTPResponseBase {
    code: number;
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
    /** 这个场景的标识符 */
    readonly id: string;
    /** 这个场景的名称 */
    readonly name: string;
    /** 当前的渲染模式 */
    readonly mode: SceneMode;
    /** 绑定的训练器 */
    readonly trainer: ITrainer<S, any, T> | null;
    /** 当前时刻 */
    readonly timestamp: number;

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
     * 执行下一个逻辑帧
     * @param timestamp 当前时刻
     * @param dt 与上一帧的时刻差值
     * @param lastTick 上一帧的时刻
     */
    tick(timestamp: number, dt: number, lastTick: number): void;

    /**
     * 每个逻辑帧执行一次
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

export interface ITrainer<S, SL, T extends IDisplayInfoBase> {
    /** 当前时刻 */
    readonly timestamp: number;

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

export interface ISceneController {
    /** 当前打开的 UI 实例 */
    readonly instance?: IUIInstance;
    /** 当前的场景 */
    readonly nowScene: IScene<any, any> | null;

    /**
     * 切换当前显示的场景
     * @param scene 要切换至的场景
     * @param props 传入场景的参数
     */
    changeTo(scene: IScene<any, any> | string | null): void;

    /**
     * 添加场景实例
     */
    add(scene: IScene<any, any>): void;

    /**
     * 根据 id 获取场景实例
     */
    get(id: string): IScene<any, any> | null;

    /**
     * 加载所有场景的必要信息，全部加载完毕后兑现
     */
    ready(): Promise<void[]>;

    /**
     * 每帧执行一次的函数
     */
    tick(timestamp: number): void;
}

export interface ITickExcitable {
    /**
     * 帧激励函数
     * @param time 当前帧时刻
     */
    tick(time: number): void;
}

export interface ITickExcitation {
    /**
     * 激励一个可激励对象
     * @param target 激励目标
     */
    excite(target: ITickExcitable): void;

    /**
     * 取消激励目标
     * @param target 取消激励的模板
     */
    unexcite(target: ITickExcitable): void;
}

export interface ITrainWorkflow {
    /**
     * 开始训练工作流程
     */
    start(): Promise<void>;

    /**
     * 结束训练工作流程
     */
    end(): void;
}
