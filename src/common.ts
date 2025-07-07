import { GameUI, IUIInstance, MotaOffscreenCanvas2D } from '@motajs/client';
import { Body, Contact, Fixture, World } from 'planck-js';
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
     * 当前时刻
     */
    now(): number;

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

export interface WorldBodyData<T> {
    /** IWorldBody 对象 */
    readonly body: IWorldBody<T>;
    /** 物体实例 */
    readonly ins: IWorldBodyInstance;
}

export interface BodyContact<T> {
    /** 当前物体接触时的构件 */
    selfFixture: Fixture;
    /** 接触到的物体的构件 */
    oppoFixture: Fixture;
    /** 当前物体接触时的物体实例 */
    selfBodyIns: Body;
    /** 接触到的物体的物体实例 */
    oppoBodyIns: Body;
    /** 当前物体对象 */
    selfBody: WorldBodyData<T>;
    /** 接触的物体对象 */
    oppoBody: WorldBodyData<any>;
    /** 在 {@link contact} 属性中，当前物体是否是 A（getFixtureA） */
    isA: boolean;
    /** 接触对象 */
    contact: Contact;
}

export interface IWorldBodyInstance {
    /** 这个物体实例包含的所有的 planck-js 物体 */
    readonly bodyList: Set<Body>;
    /** 这个物体实例所处的世界 */
    readonly world: World;
    /** 这个物体实例所处的地图 */
    readonly map: IMap;
}

export interface IWorldBody<T = void> {
    /**
     * 创建物体实例
     * @param world 物体实例创建至的世界
     * @param data 创建物体所需要的数据
     * @param map 物体实例所在的地图
     */
    create(world: World, data: T, map: IMap): IWorldBodyInstance;

    /**
     * 摧毁这个物体，当物体从世界上移除后执行
     * @param ins 要摧毁的物体实例
     * @returns 是否摧毁成功
     */
    destroy(ins: IWorldBodyInstance): boolean;

    /**
     * 当前物体与另一个物体开始接触，两个物体接触时二者会同时执行此方法，顺序不固定
     * @param body 接触的物体
     */
    contact(contact: BodyContact<T>, timestamp: number): void;

    /**
     * 渲染属于此物体的物体实例
     * @param canvas 渲染至的画布
     */
    render(canvas: MotaOffscreenCanvas2D, ins: IWorldBodyInstance): void;

    /**
     * 更新这个物体的某个物体实例，一般可以发生在角色升级时等情况
     * @param ins 物体实例
     */
    updateBody(ins: IWorldBodyInstance): void;
}

export interface IMap {
    /**
     * 重置这个地图
     */
    reset(): void;

    /**
     * 获取这个地图的世界，世界是地图的物理模拟沙盒，每个地图都有自己的世界
     */
    getWorld(): World;

    /**
     * 添加一个物体
     * @param body 物体实例
     * @param data 创建物体时所需的数据
     * @returns 这个物体在本世界的 id
     */
    addBody<T>(body: IWorldBody<T>, data: T): number;

    /**
     * 移除物体
     * @param id 物体在本世界的 id
     * @returns 物体是否移除成功，当物体存在且移除成功时返回 `true`，其他情况返回 `false`
     */
    removeBody(id: number): boolean;

    /**
     * 渲染这个地图
     * @param canvas 渲染至的画布
     */
    render(canvas: MotaOffscreenCanvas2D): void;

    /**
     * 执行一步模拟
     * @param time 模拟时长
     * @param velocityIterations 速度迭代次数
     * @param positionIterations 位置迭代次数
     */
    step(
        time: number,
        velocityIterations?: number,
        positionIterations?: number
    ): void;

    /**
     * 当一个物体更新过之后执行
     * @param ins 更新过的物体实例
     */
    updatedBody(ins: IWorldBodyInstance): void;
}
