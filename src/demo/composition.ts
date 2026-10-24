/**
 * demo 的真实组合根（D-19）：Rapier 初始化与构造分离，接线顺序照抄
 * `tests/kingdom/harness.ts`——物理 → 感知 → 晚绑定战斗访问器的伤害接收方 →
 * 伤害旁路装饰器 → 控制 → 王国世界，且装饰器注入控制、接收方保持原样（G-3）。
 * 本文件不引用 Pixi、不推进任何模拟状态；`createDemoSetup` 是同步的，
 * 因此 reset 可以在一个帧边界内重建整套世界（Pitfall 18）。
 */

import RAPIER from '@dimforge/rapier2d-compat';
import { MathRng } from '@/common/rng';
import { ControlSystem } from '@/control/ControlSystem';
import type { IUnitAI, IUnitAIProvider } from '@/control/types';
import type { IDemoSetup } from '@/demo/types';
import { BattleDamageSink } from '@/kingdom/DamageSink';
import { IdleAI } from '@/kingdom/IdleAI';
import { KingdomWorld } from '@/kingdom/KingdomWorld';
import { KingdomSensingWorld } from '@/kingdom/SensingWorld';
import { createDefaultKingdomConfig } from '@/kingdom/strategies';
import { ArmyOrderKind } from '@/kingdom/types';
import type { IArmy, IScenario, IWorld } from '@/kingdom/types';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { RenderDamageTap } from '@/render/DamageTap';
import type { IRenderServices } from '@/render/types';
import type { IUnit } from '@/units/types';

/**
 * 已释放的 setup 集合（`disposeDemoSetup` 的幂等依据，D-19/T-05-40）。
 * 用 `WeakSet` 只按对象身份记一次，不阻止 setup 被回收，也不改变 `IDemoSetup` 的形状。
 */
const DISPOSED_SETUPS = new WeakSet<IDemoSetup>();

/**
 * 初始化 Rapier WASM（Pitfall 18）：幂等，必须在构造任何世界之前完成。
 * 这是 demo 唯一的异步步骤；之后的 `createDemoSetup` 全部同步。
 * @returns 初始化完成的 Promise。
 */
export function initDemoRuntime(): Promise<void> {
    return RAPIER.init();
}

/**
 * 构建一套真实世界并交给渲染层（D-19）：按冻结顺序接线，绝不伪造单位/战斗/伤害。
 * `control` 收到的是 `RenderDamageTap`（包装真实 `BattleDamageSink`），
 * 因此每一条真正结算的命中都会进入渲染层的读取口。
 * @param scenario 只读场景表（真实表或其 demo 变体）。
 * @returns 已接线、可释放的 setup；调用前 `initDemoRuntime()` 必须已完成。
 */
export function createDemoSetup(scenario: IScenario): IDemoSetup {
    const physics = new PhysicsWorld(
        { dt: DT, geometry: DEFAULT_GEOMETRY },
        new MathRng()
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
    const tap = new RenderDamageTap(sink, unitId =>
        physics.getUnitState(unitId)
    );

    const provider: IUnitAIProvider = {
        /**
         * 注册时为每个单位创建一个待命 AI；世界会在第一个子步按模式替换它。
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

    const control = new ControlSystem(physics, sensing, provider, tap);
    const rng = new MathRng();
    const world = new KingdomWorld(
        physics,
        control,
        rng,
        scenario,
        createDefaultKingdomConfig()
    );
    worldRef = world;

    issueInitialEngagementOrders(world);

    const services: IRenderServices = {
        world,
        catalog: control,
        physics,
        damageFeed: tap
    };

    const setup: IDemoSetup = {
        world,
        control,
        physics,
        damageFeed: tap,
        services,
        scenario,
        dispose(): void {
            disposeDemoSetup(setup);
        }
    };
    return setup;
}

/**
 * 幂等释放一套 setup（D-19/T-05-40）：世界 → 控制 → 物理。
 * 顺序不可颠倒——世界只清理自己创建的障碍，控制与物理仍由外层持有者释放；
 * 重复调用为空操作，绝不重复释放 Rapier 世界。
 * @param setup 待释放的 setup。
 */
export function disposeDemoSetup(setup: IDemoSetup): void {
    if (DISPOSED_SETUPS.has(setup)) {
        return;
    }
    DISPOSED_SETUPS.add(setup);
    setup.world.dispose();
    setup.control.dispose();
    setup.physics.dispose();
}

/**
 * demo 的确定性开战触发器（D-19/REND-04）：给每支有名册的军队下达一条真实的
 * `IWorld.issueOrder` `MoveTo`——目标是最近的敌方军队中心；平方距离平局取较小军队 id。
 * 这只是模拟输入，不是伪造实体：单位、战斗与伤害都由真实系统产生。
 * 视野半径只有 100 m 而默认两军相距约 790 m，因此不靠视野运气也能让两军相向行军。
 * @param world 已构造的王国世界。
 */
function issueInitialEngagementOrders(world: IWorld): void {
    const armies: IArmy[] = [];
    for (const faction of world.getFactions()) {
        for (const armyId of faction.getArmyIds()) {
            const army = world.getArmy(armyId);
            if (army !== null) {
                armies.push(army);
            }
        }
    }

    for (const army of armies) {
        if (army.getUnitIds().length === 0) {
            continue;
        }
        const center = army.getCenter();
        if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) {
            continue;
        }
        const enemy = nearestEnemyArmy(army, armies);
        if (enemy === null) {
            continue;
        }
        const target = enemy.getCenter();
        if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) {
            continue;
        }
        world.issueOrder({
            armyId: army.getId(),
            kind: ArmyOrderKind.MoveTo,
            targetX: target.x,
            targetY: target.y
        });
    }
}

/**
 * 在给定军队集合中找 `army` 最近的异势力、有名册的军队（平方距离、id 决胜）。
 * @param army 参照军队。
 * @param armies 全部军队。
 * @returns 最近的敌方军队；不存在时为 `null`。
 */
function nearestEnemyArmy(army: IArmy, armies: readonly IArmy[]): IArmy | null {
    const center = army.getCenter();
    let nearest: IArmy | null = null;
    let best = Number.POSITIVE_INFINITY;

    for (const candidate of armies) {
        if (
            candidate.getId() === army.getId() ||
            candidate.getFactionId() === army.getFactionId() ||
            candidate.getUnitIds().length === 0
        ) {
            continue;
        }
        const other = candidate.getCenter();
        const dx = other.x - center.x;
        const dy = other.y - center.y;
        const distance = dx * dx + dy * dy;
        if (
            Number.isFinite(distance) &&
            (distance < best ||
                (distance === best &&
                    (nearest === null || candidate.getId() < nearest.getId())))
        ) {
            best = distance;
            nearest = candidate;
        }
    }

    return nearest;
}
