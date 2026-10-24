/**
 * demo 层的全部类型声明：帧驱动器、组合根、操作面板三组窄契约。
 * 本文件只含声明，不含任何类、顶层 `const`、函数体或 Pixi/Rapier 引用；
 * `IRenderServices` 等上游契约一律经 `import type` 复用，绝不重复声明（AGENTS §2）。
 */

import type { IControlSystem } from '@/control/types';
import type {
    IBattleSystem,
    IScenario,
    IWorld,
    IWorldTickResult
} from '@/kingdom/types';
import type { IPhysicsWorld } from '@/physics/types';
import type {
    ICamera,
    IDamageFeed,
    IRenderServices,
    IViewport
} from '@/render/types';

/**
 * 帧驱动器驱动的窄世界读取面（D-17/D-18）。
 * 运行器只推进外层 tick 并查询活跃战斗；它拿不到控制或物理，因而无法二次推进模拟。
 */
export interface IRunnerWorld {
    /** 推进一个外层 `IWorld.tick()`；运行器每输出帧只调用一次。 */
    tick(): IWorldTickResult;
    /** 战斗系统读取面：自动跟拍目标从这里选取。 */
    getBattleSystem(): IBattleSystem;
}

/** 帧驱动器驱动的窄渲染面（D-18）：只画一帧或复位，不调度任何东西。 */
export interface IRunnerRenderer {
    /** 绘制恰好一帧。 */
    renderFrame(): void;
    /** 清空视图/HUD/对象池并把镜头复位到全景。 */
    reset(): void;
}

/**
 * 运行器错误回调（V7）：tick 或渲染抛出的异常在此上报一次，
 * 随后运行器自行暂停，绝不把异常继续抛回计时器回调。
 */
export type RunnerErrorHandler = (error: unknown) => void;

/**
 * 帧驱动器的依赖集合（D-12/D-17/D-18）：
 * `getWorld` 是闭包而非实例，因为 reset 会整体替换世界。
 */
export interface IRunnerDeps {
    /** 重新读取当前世界；每次 reset 后返回新世界。 */
    readonly getWorld: () => IRunnerWorld;
    /** 镜头：自动跟拍目标的唯一写入点。 */
    readonly camera: ICamera;
    /** 渲染器：每帧恰好一次 `renderFrame`。 */
    readonly renderer: IRunnerRenderer;
    /** 会话重置：pause 后重建世界并复位渲染器。 */
    readonly resetSession: () => void;
    /** 错误上报：tick/渲染异常的唯一出口。 */
    readonly onError: RunnerErrorHandler;
}

/**
 * 帧驱动器契约（D-12/D-17）：推进、暂停、单步、复位与每帧延时全部归它，
 * 渲染器自身从不调度。`setAutoFollow` 是操作面板的镜头模式接缝：
 * 默认 `true`（REND-04 自动跟拍），操作者选择全景时为 `false`。
 */
export interface IManualRunner {
    /** 启动循环：立即排定下一帧。已在运行或已释放时为空操作。 */
    start(): void;
    /** 暂停循环并清空待处理定时器（无计时器泄漏）。 */
    pause(): void;
    /** 仅在暂停时推进恰好一帧；正在运行或已释放时为空操作。 */
    stepOnce(): void;
    /** 暂停、执行注入的会话重置、清零帧计数并恢复默认自动跟拍。 */
    reset(): void;
    /** 设置每帧延时（毫秒）；钳制到 `[0, 1000]`，非有限值按下限处理。 */
    setFrameDelay(ms: number): void;
    /** 当前每帧延时（毫秒）。 */
    getFrameDelay(): number;
    /** 开关自动跟拍；关闭后运行器**不再**写镜头目标，操作者全景得以保留。 */
    setAutoFollow(enabled: boolean): void;
    /** 当前是否启用自动跟拍。 */
    isAutoFollow(): boolean;
    /** 循环是否正在运行。 */
    isRunning(): boolean;
    /** 自上次 reset 以来成功输出的帧数。 */
    getFrameCount(): number;
    /** 幂等释放：暂停并阻止后续调度。 */
    dispose(): void;
}

/**
 * 一套已接线的 demo 世界（D-19）：所有对象都是真实系统实例，
 * `services` 是交给渲染层的只读依赖集合。
 */
export interface IDemoSetup {
    /** 王国世界读取面。 */
    readonly world: IWorld;
    /** 控制系统（单位目录与 AI 切换）。 */
    readonly control: IControlSystem;
    /** 物理世界（运动读数）。 */
    readonly physics: IPhysicsWorld;
    /** 伤害/死亡旁路（本套世界专用的装饰器）。 */
    readonly damageFeed: IDamageFeed;
    /** 渲染层只读依赖集合（`catalog` 是控制系统本身）。 */
    readonly services: IRenderServices;
    /** 构造本世界所用的只读场景表。 */
    readonly scenario: IScenario;
    /** 幂等释放：世界 → 控制 → 物理。 */
    dispose(): void;
}

/** 操作面板的依赖集合（D-12/D-24）：面板在 canvas 之外，永不进入视频。 */
export interface IOperatorPanelOptions {
    /** 重新读取当前世界（reset 会替换它）。 */
    readonly getWorld: () => IWorld;
    /** 镜头：模式切换与比例尺读数（比例尺只显示在 canvas 之外的面板里）。 */
    readonly camera: ICamera;
    /** 帧驱动器：暂停/单步/复位/延时。 */
    readonly runner: IManualRunner;
    /** 固定尺寸 canvas：用于点击拾取（D-24）与比例尺的 CSS/后备像素换算。 */
    readonly canvas: HTMLCanvasElement;
    /** 当前画布视口（像素）。 */
    readonly viewport: IViewport;
    /** 当前场景名（仅用于面板文案）。 */
    readonly scenarioName: string;
}

/** 操作面板契约（D-12）：挂载到宿主元素、幂等释放；面板本身从不推进模拟。 */
export interface IOperatorPanel {
    /** 把面板 DOM 挂到宿主元素。 */
    mount(host: HTMLElement): void;
    /** 幂等释放：移除 DOM 与事件监听。 */
    dispose(): void;
}
