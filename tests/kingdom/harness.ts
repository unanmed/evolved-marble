import RAPIER from '@dimforge/rapier2d-compat';
import { ControlSystem } from '@/control/ControlSystem';
import type { IControlSystem, IUnitAI, IUnitAIProvider } from '@/control/types';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { BattleDamageSink } from '@/kingdom/DamageSink';
import { IdleAI } from '@/kingdom/IdleAI';
import { KingdomWorld } from '@/kingdom/KingdomWorld';
import { DEFAULT_SCENARIO } from '@/kingdom/scenario';
import { KingdomSensingWorld } from '@/kingdom/SensingWorld';
import type { IKingdomConfig, IScenario, UnitWeight } from '@/kingdom/types';
import type { IRng } from '@/common/types';
import { AttributeKind } from '@/units/types';
import type { IUnit } from '@/units/types';
import { mulberry32 } from '../helpers/rng';

/**
 * `createKingdom` 的可选项。
 */
export interface IKingdomHarnessOptions {
    /** 场景表；默认 `DEFAULT_SCENARIO`。 */
    readonly scenario?: IScenario;
    /** 确定性随机种子；默认 7。 */
    readonly seed?: number;
    /** 可替换策略；默认 `defaultKingdomConfig()`。 */
    readonly config?: IKingdomConfig;
}

/**
 * 一套已接线的王国夹具。
 */
export interface IKingdomFixture {
    /** 王国世界。 */
    readonly world: KingdomWorld;
    /** 控制系统（外部持有，测试需自行 dispose）。 */
    readonly control: IControlSystem;
    /** 物理世界（外部持有，测试需自行 dispose；同时实现静态障碍接缝）。 */
    readonly physics: PhysicsWorld;
    /** 王国感知世界。 */
    readonly sensing: KingdomSensingWorld;
    /** 注入世界构造的单位生成随机源。 */
    readonly rng: IRng;
}

/**
 * Rapier WASM 初始化：幂等且只加载一次（所有真实物理套件共用）。
 * @returns 初始化完成的 Promise。
 */
export function initRapier(): Promise<void> {
    return RAPIER.init();
}

/**
 * 释放一套夹具：先 `world.dispose()`（移除本世界添加的地形与边界墙障碍），
 * 再释放外部持有的控制系统与物理世界。顺序不可颠倒——世界只清理自己创建的
 * 障碍，物理世界仍须由外部持有者释放。
 * @param fixture 已接线的王国夹具。
 */
export function disposeKingdom(fixture: IKingdomFixture): void {
    fixture.world.dispose();
    fixture.control.dispose();
    fixture.physics.dispose();
}

/**
 * 默认单位权重：单位等级（D-18）。
 * @param unit 单位。
 * @returns 等级。
 */
const defaultUnitWeight: UnitWeight = unit =>
    unit.getAttribute(AttributeKind.Level);

/**
 * 默认入驻选择器。
 *
 * 注意（已知契约缺口）：冻结的 `GarrisonSelector` 要求返回单位 **id**，但
 * `IUnit` 不暴露任何 id，调用方也无法从 `IUnit` 反查 id。因此本测试配置返回空选择，
 * 与「抛出即空选择」的容错语义一致；plan 04-05 会决定这一接缝的真实接线方式。
 * @param _city 城池。
 * @param _candidates 候选存活单位。
 * @returns 空选择。
 */
const defaultGarrisonSelector = (): readonly number[] => [];

/**
 * 默认王国配置：等级权重、25 % 入驻比例（测试中为空选择，见上）与抛出型指挥官工厂
 * （本计划不接指挥官，04-05 替换）。
 * @returns 可用的 `IKingdomConfig`。
 */
export function defaultKingdomConfig(): IKingdomConfig {
    return {
        unitWeight: defaultUnitWeight,
        garrisonSelector: defaultGarrisonSelector,
        commanderFactory: () => {
            throw new Error('no commander in this suite');
        }
    };
}

/**
 * 构造一套真实 Rapier 的王国夹具。接线顺序：
 * 物理 → 感知 → 晚绑定战斗访问器的伤害接收方 → 控制系统（待命 AI provider）→ 王国世界。
 * 该顺序是强制的：sink 在 World 之前构造，因此只能通过闭包读取战斗系统。
 * @param options 可选项。
 * @returns 已接线的王国夹具。
 */
export function createKingdom(
    options: IKingdomHarnessOptions = {}
): IKingdomFixture {
    const seed = options.seed ?? 7;
    const scenario = options.scenario ?? DEFAULT_SCENARIO;

    const physics = new PhysicsWorld(
        { dt: DT, geometry: DEFAULT_GEOMETRY },
        mulberry32(seed)
    );
    const sensing = new KingdomSensingWorld(
        scenario.width,
        scenario.height,
        scenario.terrain
    );

    let worldRef: KingdomWorld | null = null;
    const sink = new BattleDamageSink(
        physics,
        () => worldRef?.getBattleSystem() ?? null
    );

    const provider: IUnitAIProvider = {
        /**
         * 注册时为每个单位创建一个待命 AI；World 会在第一个子步按模式替换它。
         * @param _unitId 单位 id（未使用）。
         * @param _unit 单位实例（未使用）。
         * @returns 新的待命 AI。
         */
        create(_unitId: number, _unit: IUnit): IUnitAI {
            return new IdleAI();
        },
        /**
         * 无内部状态需要释放。
         * @param _unitId 单位 id（未使用）。
         */
        destroy(_unitId: number): void {
            // 无状态。
        }
    };

    const control = new ControlSystem(physics, sensing, provider, sink);
    const rng = mulberry32(seed + 1);
    const world = new KingdomWorld(
        physics,
        control,
        rng,
        scenario,
        options.config ?? defaultKingdomConfig()
    );
    worldRef = world;

    return { world, control, physics, sensing, rng };
}
