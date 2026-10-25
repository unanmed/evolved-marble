/**
 * 王国世界：`class KingdomWorld implements IWorld`（D-01/D-09/D-28/KING-01..03/06/08）。
 * 唯一的编排器与组合根：从场景表构建势力/城池/军队、把单位注册进注入的
 * `IControlSystem`、按 1 或 24 个一游戏分钟子步推进、在子步之间切换单位 AI。
 *
 * 外部所有权：`physics` 与 `control` 由组合根创建并持有，本类**不**释放它们
 * （`dispose()` 只清理内部引用；A18/C-19：`IWorld` 不暴露 `getControl`/`getPhysics`）。
 *
 * `DT` 永不改动：24× 通过 24 个一游戏分钟子步实现，每个子步恰好一次 `control.tick()`
 * （research Pitfalls 4/5）；本文件不读 wall-clock（Pitfall 18）。
 */

import { advanceArmyCenter, Army, computeFormationSlots } from '@/kingdom/Army';
import { BattleAI } from '@/kingdom/BattleAI';
import { BattleSystem } from '@/kingdom/BattleSystem';
import { BrakeAI } from '@/kingdom/BrakeAI';
import { City } from '@/kingdom/City';
import {
    ARMY_FORMATION_RADIUS,
    ARMY_SPEED_METERS_PER_HOUR,
    ARMY_VISION_RADIUS,
    BATTLE_AREA_HALF_EXTENT,
    BATTLE_AREA_HYSTERESIS,
    BATTLE_TICK_MINUTES,
    BATTLE_TRIGGER_DISTANCE,
    BOUNDARY_WALL_THICKNESS,
    BRAKE_MIN_MINUTES,
    CITY_VISION_RADIUS,
    GARRISON_HEAL_PER_HOUR,
    MARCH_HEAL_PER_HOUR,
    MAX_SCENARIO_ARMIES,
    MAX_SCENARIO_UNITS,
    MINUTES_PER_HOUR,
    PEACE_TICK_MINUTES,
    SPAWN_RING_RADIUS,
    TRAINING_HOURS_CAPITAL,
    TRAINING_HOURS_NORMAL
} from '@/kingdom/constants';
import { Faction } from '@/kingdom/Faction';
import { IdleAI } from '@/kingdom/IdleAI';
import { MarchAI } from '@/kingdom/MarchAI';
import { validateScenario } from '@/kingdom/scenario';
import { TimeSystem } from '@/kingdom/TimeSystem';
import {
    ArmyOrderKind,
    ArmyState,
    CityKind,
    UnitControlMode
} from '@/kingdom/types';
import type {
    IArmy,
    IArmyOrder,
    IArmySpawnSpec,
    IBattle,
    IBattleSystem,
    ICity,
    ICommander,
    ICommanderContext,
    IFaction,
    IKingdomConfig,
    IMapBounds,
    IMutableArmy,
    IMutableCity,
    IMutableFaction,
    IScenario,
    ITerrainRect,
    ITimeSystem,
    IVec2,
    IVisibleArmyBrief,
    IVisibleCityBrief,
    IWorld,
    IWorldTickResult
} from '@/kingdom/types';
import { rememberUnitIdentity } from '@/kingdom/strategies';
import type { IControlSystem, IUnitAI, IUnitBrief } from '@/control/types';
import type { IPhysicsWorld, IStaticObstacleWorld } from '@/physics/types';
import type { IRng } from '@/common/types';
import { spawnUnit } from '@/units/spawn';
import { AttributeKind } from '@/units/types';
import type { IHealableUnit } from '@/units/types';

/**
 * 行军抵达容差（米）：一个游戏分钟的行军距离。中心每个子步恰好前进该距离，
 * 越过目标后的下一步距离同样落在容差内，因此抵达判定不会漏掉目标。
 */
const ARRIVAL_TOLERANCE_METERS = ARMY_SPEED_METERS_PER_HOUR / MINUTES_PER_HOUR;

/**
 * 王国世界：场景构建、子步循环、军队/战斗/AI 模式编排与读取面。
 */
export class KingdomWorld implements IWorld {
    /** 外部持有的物理世界（同一实例提供静态障碍接缝，不在 `dispose` 中释放）。 */
    private readonly physics: IPhysicsWorld & IStaticObstacleWorld;
    /** 外部持有的控制系统（AI 切换的唯一通道，不在 `dispose` 中释放）。 */
    private readonly control: IControlSystem;
    /** 注入的随机源（单位生成）。 */
    private readonly rng: IRng;
    /** 构造本世界的只读场景表。 */
    private readonly scenario: IScenario;
    /** 注入的可替换策略。 */
    private readonly config: IKingdomConfig;
    /** 时间系统（唯一的游戏时钟）。 */
    private readonly time: TimeSystem;
    /** 地图尺寸。 */
    private readonly bounds: IMapBounds;
    /** 场景地形矩形（构造时复制）。 */
    private readonly terrain: readonly ITerrainRect[];
    /** 战斗容器。 */
    private readonly battles: BattleSystem;
    /** 本世界添加的地形障碍 id（`dispose` 时移除）。 */
    private readonly terrainObstacleIds: number[] = [];
    /** 本世界添加的四道地图边界墙 id（`dispose` 时移除，且永不进入 `getTerrain`）。 */
    private readonly wallObstacleIds: number[] = [];

    /** 势力 id → 势力。 */
    private readonly factions = new Map<number, IMutableFaction>();
    /** 军队 id → 军队。 */
    private readonly armies = new Map<number, IMutableArmy>();
    /** 城池 id → 城池。 */
    private readonly cities = new Map<number, IMutableCity>();
    /** 单位 id → 单位实例（`IHealableUnit`：回血经 G-1 接缝）。 */
    private readonly units = new Map<number, IHealableUnit>();
    /** 单位 id → 所属军队/势力。 */
    private readonly unitArmy = new Map<
        number,
        { armyId: number; factionId: number }
    >();
    /** 单位 id → 当前安装的王国 AI 模式（只有 World 写）。 */
    private readonly modes = new Map<number, UnitControlMode>();
    /** 单位 id → 当前阵型槽位。 */
    private slots = new Map<number, IVec2>();
    /** 军队 id → 正在增援的活跃战斗 id（`getEngagedBattleId` 的数据源）。 */
    private readonly armyBattle = new Map<number, number>();
    /** 单位 id → 最近一次所属的活跃战斗 id（离区刹车判定）。 */
    private readonly lastBattleOfUnit = new Map<number, number>();
    /** 单位 id → 刹车窗口结束的游戏分钟。 */
    private readonly brakeUntilMinutes = new Map<number, number>();
    /** 刚结束战斗、需要在本子步显示 `Reorganizing` 的军队 id。 */
    private readonly reorganizingArmies = new Set<number>();
    /** 军队 id → 指令被接受时的游戏分钟（`afterMinutes` 是相对时间）。 */
    private readonly orderAcceptedAt = new Map<number, number>();
    /** battleId → 曾加入过该战斗的全部单位 id（城池战败方重组的数据源）。 */
    private readonly battleParticipants = new Map<number, Set<number>>();
    /** 势力 id → 指挥官；工厂失败的势力没有条目（世界继续运行）。 */
    private readonly commanders = new Map<number, ICommander>();
    /** 下一个单位 id（单调递增，永不重用，T-04-07）。 */
    private nextUnitId = 1;
    /** 下一个军队 id（单调递增，永不重用；初值高于全部场景军队 id）。 */
    private nextArmyId = 1;
    /** 是否已释放（`dispose` 幂等）。 */
    private disposed = false;

    /**
     * 构造王国世界：**先完整校验场景表**（非法表绝不触及物理世界或控制系统），
     * 再建模型、加入地形/边界墙、建战斗容器、最后物化单位。
     * 物理与控制实例由调用方持有，本类不释放它们。
     * @param physics 物理世界；组合根必须传入同一个同时实现
     * `IStaticObstacleWorld` 的 `PhysicsWorld` 实例。
     * @param control 控制系统（单位注册与 AI 切换的唯一入口）。
     * @param rng 随机源（单位生成）。
     * @param scenario 只读场景表。
     * @param config 可替换策略（权重/入驻/指挥官）。
     */
    constructor(
        physics: IPhysicsWorld & IStaticObstacleWorld,
        control: IControlSystem,
        rng: IRng,
        scenario: IScenario,
        config: IKingdomConfig
    ) {
        validateScenario(scenario);

        this.physics = physics;
        this.control = control;
        this.rng = rng;
        this.scenario = scenario;
        this.config = config;
        this.time = new TimeSystem();
        this.bounds = { width: scenario.width, height: scenario.height };
        this.terrain = scenario.terrain.map(rect => ({ ...rect }));

        for (const spec of scenario.factions) {
            this.factions.set(spec.id, new Faction(spec.id, spec.name));
        }
        for (const spec of scenario.cities) {
            this.cities.set(
                spec.id,
                new City(
                    spec.id,
                    spec.factionId,
                    spec.x,
                    spec.y,
                    spec.kind,
                    spec.garrisonCap,
                    spec.trainingClass
                )
            );
        }
        for (const spec of scenario.armies) {
            const armyId = spec.id;
            this.armies.set(
                armyId,
                new Army(
                    armyId,
                    spec.factionId,
                    spec.x,
                    spec.y,
                    spec.heading,
                    () => this.armyBattle.get(armyId)
                )
            );
        }

        this.fillFactionRosters();
        this.nextArmyId = scenario.armies.reduce(
            (next, spec) => Math.max(next, spec.id + 1),
            1
        );

        for (const faction of this.factions.values()) {
            try {
                const commander = this.config.commanderFactory(faction.getId());
                if (
                    commander !== null &&
                    commander !== undefined &&
                    typeof commander.decide === 'function'
                ) {
                    this.commanders.set(faction.getId(), commander);
                }
            } catch {
                // A broken factory leaves that faction commander-less.
            }
        }

        this.battles = new BattleSystem(
            this.physics,
            unitId => this.unitArmy.get(unitId)?.factionId,
            unitId => this.units.get(unitId) ?? null,
            () => [...this.armies.values()],
            () => this.time.getGameMinutes(),
            this.config.unitWeight,
            BATTLE_AREA_HALF_EXTENT,
            BATTLE_TRIGGER_DISTANCE,
            BATTLE_AREA_HYSTERESIS,
            (battle, contested) => this.handleBattleEnded(battle, contested),
            () => [...this.cities.values()],
            armyId => this.armies.get(armyId) ?? null,
            (absorbed, survivor) => this.handleBattlesMerged(absorbed, survivor)
        );

        this.addStaticGeometry();

        for (const spec of scenario.armies) {
            this.spawnArmyUnits(spec);
        }
    }

    /**
     * 推进一个外层 tick：和平 24 个子步、战斗 1 个子步；若和平 tick 中途开战则提前结束。
     * 子步循环**之后**重新决策速率，因此「本 tick 开战」返回 `minutesPerTick: 1`
     * （KING-02/D-09）。`DT` 从不修改。
     * @returns 本 tick 实际推进的游戏分钟与结束时的每 tick 分钟数。
     */
    tick(): IWorldTickResult {
        this.expireFulfilledOrders();
        this.runCommanders();

        const rate = this.battles.hasActiveBattle()
            ? BATTLE_TICK_MINUTES
            : PEACE_TICK_MINUTES;
        this.time.setMinutesPerTick(rate);

        let advanced = 0;
        for (let step = 0; step < rate; step += 1) {
            this.stepSubstep();
            advanced += 1;
            if (rate > 1 && this.battles.hasActiveBattle()) {
                break;
            }
        }

        const finalRate = this.battles.hasActiveBattle()
            ? BATTLE_TICK_MINUTES
            : PEACE_TICK_MINUTES;
        this.time.setMinutesPerTick(finalRate);
        this.time.advanceTick();

        return {
            gameMinutes: advanced,
            minutesPerTick: this.time.getMinutesPerTick()
        };
    }

    /**
     * 时间系统读取面。
     * @returns 时间系统。
     */
    getTime(): ITimeSystem {
        return this.time;
    }

    /**
     * 地图尺寸。
     * @returns 地图尺寸（新对象）。
     */
    getBounds(): IMapBounds {
        return { ...this.bounds };
    }

    /**
     * 场景地形矩形（新数组与新对象，调用方无法改写内部表）。
     * @returns 地形矩形列表。
     */
    getTerrain(): readonly ITerrainRect[] {
        return this.terrain.map(rect => ({ ...rect }));
    }

    /**
     * 构造本世界的只读场景表。
     * @returns 场景表。
     */
    getScenario(): IScenario {
        return this.scenario;
    }

    /**
     * 全部势力（上帝视角）。
     * @returns 势力列表（新数组）。
     */
    getFactions(): readonly IFaction[] {
        return [...this.factions.values()];
    }

    /**
     * 按 id 读取势力。
     * @param factionId 势力 id。
     * @returns 势力或 `null`。
     */
    getFaction(factionId: number): IFaction | null {
        return this.factions.get(factionId) ?? null;
    }

    /**
     * 按 id 读取军队。
     * @param armyId 军队 id。
     * @returns 军队或 `null`。
     */
    getArmy(armyId: number): IArmy | null {
        return this.armies.get(armyId) ?? null;
    }

    /**
     * 按 id 读取城池。
     * @param cityId 城池 id。
     * @returns 城池或 `null`。
     */
    getCity(cityId: number): ICity | null {
        return this.cities.get(cityId) ?? null;
    }

    /**
     * 该势力当前可见的军队简讯（D-25/A21，无记忆）：己方军队始终包含；
     * 敌方军队在中心落入己方视野圆**或**其任一单位位置落入视野圆时可见
     * （research Pitfall 16）。名册为空的军队（战后残留）既不可见也不出现在
     * 己方简讯中——它的身份仍保存在世界里（D-05），只是不可观测。
     * 每次调用都重新计算并返回全新的精简简讯。
     * @param factionId 势力 id。
     * @returns 军队简讯列表。
     */
    getVisibleArmies(factionId: number): readonly IVisibleArmyBrief[] {
        const faction = this.factions.get(factionId);
        if (faction === undefined) {
            return [];
        }
        const ownArmyIds = new Set(faction.getArmyIds());
        const circles = this.visionCircles(faction);
        const briefs: IVisibleArmyBrief[] = [];

        for (const army of this.armies.values()) {
            if (army.getUnitIds().length === 0) {
                continue;
            }
            const own = ownArmyIds.has(army.getId());
            if (!own && !this.armyInsideCircles(army, circles)) {
                continue;
            }
            const center = army.getCenter();
            briefs.push({
                id: army.getId(),
                factionId: army.getFactionId(),
                center: { x: center.x, y: center.y },
                heading: army.getHeading(),
                state: army.getState()
            });
        }
        return briefs;
    }

    /**
     * 该势力当前可见的城池简讯（D-25/A21，无记忆）：己方城池始终包含；
     * 其余城池（含无主城）在城池点落入视野圆时可见。简讯只含
     * `id`/`factionId`/`position`/`kind`，训练与驻军内部状态不可达。
     * @param factionId 势力 id。
     * @returns 城池简讯列表。
     */
    getVisibleCities(factionId: number): readonly IVisibleCityBrief[] {
        const faction = this.factions.get(factionId);
        if (faction === undefined) {
            return [];
        }
        const ownCityIds = new Set(faction.getCityIds());
        const circles = this.visionCircles(faction);
        const briefs: IVisibleCityBrief[] = [];

        for (const city of this.cities.values()) {
            const position = city.getPosition();
            const own = ownCityIds.has(city.getId());
            if (
                !own &&
                !this.isInsideAnyCircle(position.x, position.y, circles)
            ) {
                continue;
            }
            briefs.push({
                id: city.getId(),
                factionId: city.getFactionId(),
                position: { x: position.x, y: position.y },
                kind: city.getKind()
            });
        }
        return briefs;
    }

    /**
     * 该势力当前可见的单位 id（D-25，无记忆）：己方单位始终包含；
     * 敌方单位仅当其物理位置落入视野圆时包含；没有物理读数的单位跳过。
     * @param factionId 势力 id。
     * @returns 单位 id 列表。
     */
    getVisibleUnitIds(factionId: number): readonly number[] {
        const faction = this.factions.get(factionId);
        if (faction === undefined) {
            return [];
        }
        const circles = this.visionCircles(faction);
        const ids: number[] = [];
        for (const [unitId, owner] of this.unitArmy) {
            if (owner.factionId === factionId) {
                ids.push(unitId);
                continue;
            }
            const state = this.physics.getUnitState(unitId);
            if (state === null) {
                continue;
            }
            if (this.isInsideAnyCircle(state.x, state.y, circles)) {
                ids.push(unitId);
            }
        }
        return ids;
    }

    /**
     * 构建一个势力的视野圆并集：己方每支军队中心一个 `ARMY_VISION_RADIUS` 圆，
     * 己方每座城池点一个 `CITY_VISION_RADIUS` 圆（D-25）。
     * 名册为空的军队不产生视野圆：没有单位就没有观察者，
     * 直接驻留的空军队不应继续“看”地图。
     * @param faction 势力。
     * @returns 视野圆列表（每次调用新建）。
     */
    private visionCircles(
        faction: IMutableFaction
    ): Array<{ x: number; y: number; radius: number }> {
        const circles: Array<{ x: number; y: number; radius: number }> = [];
        for (const armyId of faction.getArmyIds()) {
            const army = this.armies.get(armyId);
            if (army === undefined || army.getUnitIds().length === 0) {
                continue;
            }
            const center = army.getCenter();
            circles.push({
                x: center.x,
                y: center.y,
                radius: ARMY_VISION_RADIUS
            });
        }
        for (const cityId of faction.getCityIds()) {
            const city = this.cities.get(cityId);
            if (city === undefined) {
                continue;
            }
            const position = city.getPosition();
            circles.push({
                x: position.x,
                y: position.y,
                radius: CITY_VISION_RADIUS
            });
        }
        return circles;
    }

    /**
     * 判断敌方军队是否可见：中心落入任一视野圆，或名册内任一单位位置落入视野圆
     * （Pitfall 16：只看中心会漏掉阵型边缘的接触）。
     * @param army 敌方军队。
     * @param circles 视野圆列表。
     * @returns 是否可见。
     */
    private armyInsideCircles(
        army: IMutableArmy,
        circles: readonly { x: number; y: number; radius: number }[]
    ): boolean {
        const center = army.getCenter();
        if (this.isInsideAnyCircle(center.x, center.y, circles)) {
            return true;
        }
        for (const unitId of army.getUnitIds()) {
            const state = this.physics.getUnitState(unitId);
            if (state === null) {
                continue;
            }
            if (this.isInsideAnyCircle(state.x, state.y, circles)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 点是否落在任一视野圆内（只比较平方距离，不分配 `Math.hypot`）。
     * @param x 点 x 坐标。
     * @param y 点 y 坐标。
     * @param circles 视野圆列表。
     * @returns 是否在并集内。
     */
    private isInsideAnyCircle(
        x: number,
        y: number,
        circles: readonly { x: number; y: number; radius: number }[]
    ): boolean {
        for (const circle of circles) {
            const dx = x - circle.x;
            const dy = y - circle.y;
            if (dx * dx + dy * dy <= circle.radius * circle.radius) {
                return true;
            }
        }
        return false;
    }

    /**
     * 战斗系统读取面。
     * @returns 战斗容器。
     */
    getBattleSystem(): IBattleSystem {
        return this.battles;
    }

    /**
     * 下达或覆盖一条军队指令：无效指令被静默丢弃（T-04-04）。
     * 校验：军队存在、枚举合法、`afterMinutes` 有限且非负、目标点有限且在界内、
     * `cityId` 指向已知城池；`MoveTo` 需要目标点，`Garrison` 需要城池。
     * @param order 指令。
     */
    issueOrder(order: IArmyOrder): void {
        if (!this.armies.has(order.armyId)) {
            return;
        }
        if (
            typeof order.kind !== 'number' ||
            !Number.isInteger(order.kind) ||
            ArmyOrderKind[order.kind] === undefined
        ) {
            return;
        }
        if (
            order.afterMinutes !== undefined &&
            (!Number.isFinite(order.afterMinutes) || order.afterMinutes < 0)
        ) {
            return;
        }
        if (order.targetX !== undefined && !this.insideMapX(order.targetX)) {
            return;
        }
        if (order.targetY !== undefined && !this.insideMapY(order.targetY)) {
            return;
        }
        if (order.cityId !== undefined && !this.cities.has(order.cityId)) {
            return;
        }
        if (
            order.kind === ArmyOrderKind.MoveTo &&
            (order.targetX === undefined || order.targetY === undefined)
        ) {
            return;
        }
        if (
            order.kind === ArmyOrderKind.Garrison &&
            order.cityId === undefined
        ) {
            return;
        }

        const army = this.armies.get(order.armyId);
        if (army === undefined) {
            return;
        }
        const garrisonedCityId = army.getGarrisonedCityId();
        if (garrisonedCityId !== undefined) {
            const keepsGarrison =
                order.kind === ArmyOrderKind.Garrison &&
                order.cityId === garrisonedCityId;
            if (!keepsGarrison) {
                this.cities.get(garrisonedCityId)?.setGarrisonArmyId(undefined);
                army.setGarrisonedCityId(undefined);
                army.setState(ArmyState.Marching);
            }
        }
        army.setOrder({ ...order });
        this.orderAcceptedAt.set(order.armyId, this.time.getGameMinutes());
    }

    /**
     * 在每个外层 tick 的最开始结算“已完成”的指令（先于任何指挥官决策）：
     * - `MoveTo` 抵达目标容差内 → 清空；
     * - `Hold` → 清空（因此下一 tick 会重新规划）；
     * - `Garrison` 永不清空——满足的驻扎由“保留指令 + 城池链接”表达；
     * - 非法枚举或缺失目标点 → 清空（防御数字枚举的运行时污染）。
     * `afterMinutes` 是相对接受时刻的游戏分钟，未到期时不结算。
     */
    private expireFulfilledOrders(): void {
        const now = this.time.getGameMinutes();
        for (const army of this.armies.values()) {
            const order = army.getOrder();
            if (order === null) {
                continue;
            }
            if (
                typeof order.kind !== 'number' ||
                !Number.isInteger(order.kind) ||
                ArmyOrderKind[order.kind] === undefined
            ) {
                army.setOrder(null);
                continue;
            }
            const accepted = this.orderAcceptedAt.get(army.getId()) ?? 0;
            const delay = order.afterMinutes ?? 0;
            if (now < accepted + delay) {
                continue;
            }

            if (order.kind === ArmyOrderKind.Hold) {
                army.setOrder(null);
                continue;
            }
            if (order.kind !== ArmyOrderKind.MoveTo) {
                continue;
            }
            if (order.targetX === undefined || order.targetY === undefined) {
                army.setOrder(null);
                continue;
            }
            const center = army.getCenter();
            const dx = order.targetX - center.x;
            const dy = order.targetY - center.y;
            if (
                dx * dx + dy * dy <=
                ARRIVAL_TOLERANCE_METERS * ARRIVAL_TOLERANCE_METERS
            ) {
                army.setOrder(null);
            }
        }
    }

    /**
     * 每个外层 tick 对每个势力调用一次指挥官（绝不进入子步循环）：
     * 用当前可见性构建受限上下文，隔离 `decide` 抛出的异常，并逐条校验/应用指令。
     * 指挥官缺失或工厂失败时静默跳过，世界继续推进（T-04-04）。
     */
    private runCommanders(): void {
        for (const faction of this.factions.values()) {
            const factionId = faction.getId();
            const commander = this.commanders.get(factionId);
            if (commander === undefined) {
                continue;
            }

            let orders: readonly IArmyOrder[];
            try {
                orders = commander.decide(
                    this.buildCommanderContext(factionId)
                );
            } catch {
                continue;
            }
            if (!Array.isArray(orders)) {
                continue;
            }
            // 不可信接缝（T-04-04）：限制每 tick 处理量，并逐条隔离读取/应用异常，
            // 使恶意 getter 或超长数组都不能中断 world.tick()。
            const limit = Math.min(orders.length, MAX_SCENARIO_ARMIES);
            for (let index = 0; index < limit; index += 1) {
                try {
                    this.applyCommanderOrder(orders[index], factionId);
                } catch {
                    // 单条指令畸形：丢弃它，继续处理其余指令。
                }
            }
        }
    }

    /**
     * 构建指挥官上下文：己方完整只读视图 + 当前可见的敌方简讯（无记忆，D-25/A21）。
     * 敌方单位只暴露 `IUnitBrief`，绝不泄漏名册、指令或城池内部状态。
     * @param factionId 势力 id。
     * @returns 指挥官上下文。
     */
    private buildCommanderContext(factionId: number): ICommanderContext {
        const armies: IArmy[] = [];
        const cities: ICity[] = [];
        const faction = this.factions.get(factionId);
        if (faction !== undefined) {
            for (const armyId of faction.getArmyIds()) {
                const army = this.armies.get(armyId);
                if (army !== undefined) {
                    armies.push(army);
                }
            }
            for (const cityId of faction.getCityIds()) {
                const city = this.cities.get(cityId);
                if (city !== undefined) {
                    cities.push(city);
                }
            }
        }

        const visibleEnemyArmies = this.getVisibleArmies(factionId).filter(
            brief => brief.factionId !== factionId
        );
        const visibleEnemyCities = this.getVisibleCities(factionId).filter(
            brief => brief.factionId !== factionId
        );

        const visibleEnemyUnits: IUnitBrief[] = [];
        for (const unitId of this.getVisibleUnitIds(factionId)) {
            const owner = this.unitArmy.get(unitId);
            if (owner !== undefined && owner.factionId === factionId) {
                continue;
            }
            const unit = this.units.get(unitId);
            const state = this.physics.getUnitState(unitId);
            if (unit === undefined || state === null) {
                continue;
            }
            visibleEnemyUnits.push({
                unitId,
                health: unit.getAttribute(AttributeKind.Health),
                level: unit.getAttribute(AttributeKind.Level),
                x: state.x,
                y: state.y,
                equipment: unit.getEquipment()
            });
        }

        return {
            factionId,
            gameMinutes: this.time.getGameMinutes(),
            armies,
            cities,
            visibleEnemyArmies,
            visibleEnemyCities,
            visibleEnemyUnits
        };
    }

    /**
     * 校验并应用一条指挥官指令：军队存在、名册非空、**属于下达决策的势力**、
     * 当前无未完成指令，其余字段交由 `issueOrder` 的同一套校验（T-04-04）。
     * 跨势力指令一律拒绝——`ICommander` 是不可信接缝，不能挪动他国军队。
     * @param order 指挥官返回的指令。
     * @param factionId 返回该指令的势力 id。
     */
    private applyCommanderOrder(order: IArmyOrder, factionId: number): void {
        if (order === null || typeof order !== 'object') {
            return;
        }
        const armyId = order.armyId;
        if (typeof armyId !== 'number' || !Number.isInteger(armyId)) {
            return;
        }
        const army = this.armies.get(armyId);
        if (
            army === undefined ||
            army.getUnitIds().length === 0 ||
            army.getFactionId() !== factionId
        ) {
            return;
        }
        if (
            typeof order.kind !== 'number' ||
            !Number.isInteger(order.kind) ||
            ArmyOrderKind[order.kind] === undefined
        ) {
            return;
        }
        if (army.getOrder() !== null) {
            return;
        }
        this.issueOrder(order);
    }

    /**
     * 释放内部引用；幂等。**不**释放外部持有的物理/控制实例。
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const obstacleId of this.terrainObstacleIds) {
            this.physics.removeStaticObstacle(obstacleId);
        }
        for (const obstacleId of this.wallObstacleIds) {
            this.physics.removeStaticObstacle(obstacleId);
        }
        this.terrainObstacleIds.length = 0;
        this.wallObstacleIds.length = 0;
        this.factions.clear();
        this.armies.clear();
        this.cities.clear();
        this.units.clear();
        this.unitArmy.clear();
        this.modes.clear();
        this.slots.clear();
        this.armyBattle.clear();
        this.lastBattleOfUnit.clear();
        this.brakeUntilMinutes.clear();
        this.reorganizingArmies.clear();
        this.orderAcceptedAt.clear();
        this.battleParticipants.clear();
        this.commanders.clear();
    }

    /**
     * 推进一个一游戏分钟子步：时钟 → 指令结算 → 军队中心 → 槽位 → 战斗判定 →
     * 状态 → 刹车 → AI → 控制 → 回血 → 训练 → 名册剪枝。
     */
    private stepSubstep(): void {
        this.time.advance(1);
        this.resolveOrders();
        this.advanceArmies();
        this.rebuildSlots();
        this.battles.tick();
        this.recordBattleParticipants();
        this.rebuildArmyStates();
        this.updateBrakeWindows();
        this.updateUnitModes();
        this.control.tick();
        this.applyHealing();
        this.applyTraining();
        this.pruneDeadUnits();
    }

    /**
     * 结算抵达目标的指令（D-21/D-29）：
     * - `Garrison` 抵达城池点时按「一城一驻军」规则建立或拒绝链接；
     * - `MoveTo` 抵达目标点时清空指令，交由 Phase 7 指挥官重新规划；
     * - `Hold` 保持到 plan 04-05 的完成判定。
     */
    private resolveOrders(): void {
        for (const army of this.armies.values()) {
            if (army.getUnitIds().length === 0) {
                army.setOrder(null);
                continue;
            }
            const order = army.getOrder();
            if (order === null) {
                continue;
            }
            const accepted = this.orderAcceptedAt.get(army.getId()) ?? 0;
            const delay = order.afterMinutes ?? 0;
            if (this.time.getGameMinutes() < accepted + delay) {
                continue;
            }

            if (order.kind === ArmyOrderKind.Garrison) {
                this.resolveGarrisonOrder(army, order);
                continue;
            }
            if (order.kind !== ArmyOrderKind.MoveTo) {
                continue;
            }
            if (order.targetX === undefined || order.targetY === undefined) {
                continue;
            }
            const center = army.getCenter();
            const dx = order.targetX - center.x;
            const dy = order.targetY - center.y;
            if (
                dx * dx + dy * dy <=
                ARRIVAL_TOLERANCE_METERS * ARRIVAL_TOLERANCE_METERS
            ) {
                army.setOrder(null);
            }
        }
    }

    /**
     * 结算一条抵达城池点的 `Garrison` 指令（D-21/D-26/KING-05）：
     * 已由本军驻扎时幂等返回；城池已有**另一支仍真实驻扎**的军队时拒绝抵达方
     * （清空其指令、保持 `Marching`、不触碰城池链接）；抵达敌方城池且该城没有
     * 真实驻军（无驻军军队或名册为空）时**直接接管**（无战斗、无入驻拆分），
     * 随后由抵达军队整体驻扎；其余情况清掉陈旧链接并双向建立链接，同时保留指令
     * （驻扎是持续状态）。
     * @param army 抵达的军队。
     * @param order 其 `Garrison` 指令。
     */
    private resolveGarrisonOrder(army: IMutableArmy, order: IArmyOrder): void {
        if (order.cityId === undefined) {
            return;
        }
        const city = this.cities.get(order.cityId);
        if (city === undefined) {
            army.setOrder(null);
            return;
        }
        const center = army.getCenter();
        const target = city.getPosition();
        const dx = target.x - center.x;
        const dy = target.y - center.y;
        if (
            dx * dx + dy * dy >
            ARRIVAL_TOLERANCE_METERS * ARRIVAL_TOLERANCE_METERS
        ) {
            return;
        }

        const holderId = city.getGarrisonArmyId();
        const holder =
            holderId === undefined ? undefined : this.armies.get(holderId);
        if (holder === army) {
            return;
        }
        const liveHolder =
            holder !== undefined &&
            holder.getGarrisonedCityId() === city.getId() &&
            holder.getUnitIds().length > 0;
        const ownerFactionId = city.getFactionId();
        if (ownerFactionId !== army.getFactionId() && !liveHolder) {
            this.transferCityOwnership(city, army.getFactionId());
        }
        if (liveHolder) {
            army.setOrder(null);
            army.setGarrisonedCityId(undefined);
            return;
        }

        if (holderId !== undefined) {
            city.setGarrisonArmyId(undefined);
        }
        const previousCityId = army.getGarrisonedCityId();
        if (previousCityId !== undefined && previousCityId !== city.getId()) {
            this.cities.get(previousCityId)?.setGarrisonArmyId(undefined);
        }
        army.setGarrisonedCityId(city.getId());
        army.setState(ArmyState.Garrisoned);
        city.setGarrisonArmyId(army.getId());
    }

    /**
     * 每个子步按游戏时间回血（D-06/D-13，经 G-1 的 `IHealableUnit.heal`）：
     * 驻扎时 `GARRISON_HEAL_PER_HOUR`，行军/交战增援/重组时 `MARCH_HEAL_PER_HOUR`，
     * 每子步 heal `rate / MINUTES_PER_HOUR`。
     * 战斗排除按**单位**判定（`getBattleForUnit`）；`ArmyState.InBattle` 是保留值，
     * 04-02 起从不赋值，这里也绝不分支读取。
     */
    private applyHealing(): void {
        for (const [unitId, unit] of this.units) {
            if (!unit.isAlive()) {
                continue;
            }
            if (this.battles.getBattleForUnit(unitId) !== null) {
                continue;
            }
            const owner = this.unitArmy.get(unitId);
            if (owner === undefined) {
                continue;
            }
            const army = this.armies.get(owner.armyId);
            const rate =
                army !== undefined && army.getState() === ArmyState.Garrisoned
                    ? GARRISON_HEAL_PER_HOUR
                    : MARCH_HEAL_PER_HOUR;
            unit.heal(rate / MINUTES_PER_HOUR);
        }
    }

    /**
     * 每个子步按游戏时间推进驻扎城池的训练（D-23/KING-05）：
     * 有主、有真实驻军、驻军不在战斗（`Engaging` 是唯一战斗状态）时，
     * 名册未达 `getGarrisonCap()` 才累计 1 游戏分钟；达到普通城 96 h / 主城 72 h
     * 阈值后**每子步最多产出一个单位**，并保留超出阈值的余量。
     * 驻军满编或全局 `MAX_SCENARIO_UNITS` 上限时进度暂停，绝不累积。
     */
    private applyTraining(): void {
        for (const city of this.cities.values()) {
            const factionId = city.getFactionId();
            if (factionId === undefined) {
                continue;
            }
            const garrisonArmyId = city.getGarrisonArmyId();
            if (garrisonArmyId === undefined) {
                continue;
            }
            const army = this.armies.get(garrisonArmyId);
            if (army === undefined) {
                continue;
            }
            if (army.getState() === ArmyState.Engaging) {
                continue;
            }
            const roster = army.getUnitIds();
            if (roster.length >= city.getGarrisonCap()) {
                continue;
            }
            if (this.units.size >= MAX_SCENARIO_UNITS) {
                continue;
            }

            const progress = city.getTrainingProgressMinutes() + 1;
            city.setTrainingProgressMinutes(progress);

            const hours =
                city.getKind() === CityKind.Capital
                    ? TRAINING_HOURS_CAPITAL
                    : TRAINING_HOURS_NORMAL;
            const threshold = hours * MINUTES_PER_HOUR;
            if (progress < threshold) {
                continue;
            }

            this.produceGarrisonUnit(city, army, factionId);
            city.setTrainingProgressMinutes(progress - threshold);
        }
    }

    /**
     * 训练产出一个单位：按场景训练职业生成、取下一个单调 id、经控制系统注册
     * （`teamId = factionId`）、写入单位/军队/势力索引，最后追加到驻军名册。
     * 注册抛错时在名册变更前直接向上抛出（不留下半登记单位）。
     * @param city 产出的城池。
     * @param army 该城的驻军军队。
     * @param factionId 城池归属势力 id（同时是注册 `teamId`）。
     */
    private produceGarrisonUnit(
        city: IMutableCity,
        army: IMutableArmy,
        factionId: number
    ): void {
        const unit = spawnUnit(city.getTrainingClass(), this.rng);
        const unitId = this.nextUnitId;
        this.nextUnitId += 1;
        rememberUnitIdentity(unit, unitId);

        const position = city.getPosition();
        const angle = (unitId % 8) * (Math.PI / 4);
        this.control.registerUnit({
            unitId,
            unit,
            teamId: factionId,
            x: position.x + Math.cos(angle) * SPAWN_RING_RADIUS,
            y: position.y + Math.sin(angle) * SPAWN_RING_RADIUS
        });

        this.units.set(unitId, unit);
        this.unitArmy.set(unitId, { armyId: army.getId(), factionId });
        army.setUnitIds([...army.getUnitIds(), unitId]);
    }

    /**
     * 推进每支有单位的军队中心：优先朝正在增援的战场中心，其次朝指令目标，
     * 无目标则原地不动。空名册军队保留身份但保持惰性（D-05）。
     */
    private advanceArmies(): void {
        for (const army of this.armies.values()) {
            if (army.getUnitIds().length === 0) {
                continue;
            }
            const engaged = this.findEngagedBattle(army.getId());
            const target =
                engaged !== null
                    ? engaged.getCenter()
                    : this.resolveOrderTarget(army);
            const center = army.getCenter();
            const next = advanceArmyCenter(
                center.x,
                center.y,
                army.getHeading(),
                target === null ? null : target.x,
                target === null ? null : target.y,
                1,
                this.bounds.width,
                this.bounds.height
            );
            army.setCenter(next.x, next.y);
            army.setHeading(next.heading);
        }
    }

    /**
     * 重算全部阵型槽位（新映射；`MarchAI` 经闭包读取最新值）。
     */
    private rebuildSlots(): void {
        const slots = new Map<number, IVec2>();
        for (const army of this.armies.values()) {
            const center = army.getCenter();
            const armySlots = computeFormationSlots(
                center.x,
                center.y,
                army.getHeading(),
                army.getUnitIds(),
                ARMY_FORMATION_RADIUS
            );
            for (const [unitId, slot] of armySlots) {
                slots.set(unitId, slot);
            }
        }
        this.slots = slots;
    }

    /**
     * 重算每支军队的宏观状态：任一单位在战斗 → `Engaging`；否则刚结束 →
     * `Reorganizing` 一个子步；有驻扎城 → `Garrisoned`；否则 `Marching`。
     * `ArmyState.InBattle` 是**保留值**：本计划从不赋值，也不做任何分支（04-04 同样不得添加）。
     */
    private rebuildArmyStates(): void {
        this.armyBattle.clear();
        for (const army of this.armies.values()) {
            if (army.getUnitIds().length === 0) {
                // 空名册军队保留身份但必须惰性：清掉临时的 Reorganizing 标记与陈旧指令，
                // 否则驻扎选择器抽空一支军队后它会永远卡在过渡状态。
                this.reorganizingArmies.delete(army.getId());
                army.setOrder(null);
                army.setState(
                    army.getGarrisonedCityId() !== undefined
                        ? ArmyState.Garrisoned
                        : ArmyState.Marching
                );
                continue;
            }

            let engagedBattleId: number | undefined;
            for (const unitId of army.getUnitIds()) {
                const battle = this.battles.getBattleForUnit(unitId);
                if (battle !== null) {
                    engagedBattleId = battle.getId();
                    break;
                }
            }

            if (engagedBattleId !== undefined) {
                this.armyBattle.set(army.getId(), engagedBattleId);
                army.setState(ArmyState.Engaging);
                continue;
            }

            if (this.reorganizingArmies.delete(army.getId())) {
                army.setState(ArmyState.Reorganizing);
                continue;
            }

            army.setState(
                army.getGarrisonedCityId() !== undefined
                    ? ArmyState.Garrisoned
                    : ArmyState.Marching
            );
        }
    }

    /**
     * 离区刹车记账（D-14）：在战斗中 → 记录战斗并清除窗口；刚离区且战斗仍活跃 →
     * 开启至少 `BRAKE_MIN_MINUTES` 的窗口；战斗已结束 → 立即清除，不刹车。
     */
    private updateBrakeWindows(): void {
        const activeIds = new Set(
            this.battles.listActiveBattles().map(battle => battle.getId())
        );
        const now = this.time.getGameMinutes();

        for (const unitId of this.units.keys()) {
            const battle = this.battles.getBattleForUnit(unitId);
            if (battle !== null) {
                this.lastBattleOfUnit.set(unitId, battle.getId());
                this.brakeUntilMinutes.delete(unitId);
                continue;
            }

            const recorded = this.lastBattleOfUnit.get(unitId);
            if (recorded === undefined) {
                continue;
            }
            if (activeIds.has(recorded)) {
                if (!this.brakeUntilMinutes.has(unitId)) {
                    this.brakeUntilMinutes.set(unitId, now + BRAKE_MIN_MINUTES);
                }
                continue;
            }
            this.lastBattleOfUnit.delete(unitId);
            this.brakeUntilMinutes.delete(unitId);
        }
    }

    /**
     * 计算每单位的目标模式；仅当模式变化时创建并安装新的 AI 实例（D-11/D-14）。
     */
    private updateUnitModes(): void {
        for (const unitId of this.units.keys()) {
            const desired = this.desiredMode(unitId);
            if (this.modes.get(unitId) === desired) {
                continue;
            }
            this.modes.set(unitId, desired);
            this.control.setUnitAI(unitId, this.createAi(desired, unitId));
        }
    }

    /**
     * 目标模式：在战斗中 → `Battle`；刚离区且战斗仍活跃或刹车窗口未过期 → `Brake`；
     * 驻扎 → `Idle`；否则 `March`。窗口过期时清理两处记录。
     * @param unitId 单位 id。
     * @returns 目标模式。
     */
    private desiredMode(unitId: number): UnitControlMode {
        if (this.battles.getBattleForUnit(unitId) !== null) {
            return UnitControlMode.Battle;
        }

        const recorded = this.lastBattleOfUnit.get(unitId);
        if (recorded !== undefined) {
            const stillActive = this.battles
                .listActiveBattles()
                .some(battle => battle.getId() === recorded);
            if (stillActive) {
                const until = this.brakeUntilMinutes.get(unitId);
                if (until !== undefined && this.time.getGameMinutes() < until) {
                    return UnitControlMode.Brake;
                }
            }
            // 窗口已过期（或战斗已结束）：删除两处记录并落入正常 March/Idle 判定。
            this.lastBattleOfUnit.delete(unitId);
            this.brakeUntilMinutes.delete(unitId);
        }

        const until = this.brakeUntilMinutes.get(unitId);
        if (until !== undefined) {
            if (this.time.getGameMinutes() < until) {
                return UnitControlMode.Brake;
            }
            this.brakeUntilMinutes.delete(unitId);
        }

        const owner = this.unitArmy.get(unitId);
        if (owner !== undefined) {
            const army = this.armies.get(owner.armyId);
            if (
                army !== undefined &&
                army.getState() === ArmyState.Garrisoned
            ) {
                return UnitControlMode.Idle;
            }
        }
        return UnitControlMode.March;
    }

    /**
     * 按模式创建 AI 实例；非法运行期值回退 `IdleAI`（数字枚举可被任意数污染）。
     * @param mode 目标模式。
     * @param unitId 单位 id。
     * @returns 新的 AI 实例。
     */
    private createAi(mode: UnitControlMode, unitId: number): IUnitAI {
        switch (mode) {
            case UnitControlMode.March:
                return new MarchAI(unitId, id => this.slots.get(id) ?? null);
            case UnitControlMode.Battle:
                return new BattleAI(unitId, id =>
                    this.battles.getBattleForUnit(id)
                );
            case UnitControlMode.Brake:
                return new BrakeAI();
            default:
                return new IdleAI();
        }
    }

    /**
     * 解析当前应朝哪个点前进：指令尚未到期、`Hold` 或缺目标时返回 `null`。
     * `MoveTo` 取显式目标点，`Garrison` 取城池点（相对 `afterMinutes` 计时）。
     * @param army 军队。
     * @returns 目标点或 `null`。
     */
    private resolveOrderTarget(army: IMutableArmy): IVec2 | null {
        if (army.getGarrisonedCityId() !== undefined) {
            return null;
        }
        const order = army.getOrder();
        if (order === null) {
            return null;
        }
        const accepted = this.orderAcceptedAt.get(army.getId()) ?? 0;
        const delay = order.afterMinutes ?? 0;
        if (this.time.getGameMinutes() < accepted + delay) {
            return null;
        }

        switch (order.kind) {
            case ArmyOrderKind.MoveTo:
                if (
                    order.targetX === undefined ||
                    order.targetY === undefined
                ) {
                    return null;
                }
                return { x: order.targetX, y: order.targetY };
            case ArmyOrderKind.Garrison:
                if (order.cityId === undefined) {
                    return null;
                }
                return this.cities.get(order.cityId)?.getPosition() ?? null;
            default:
                return null;
        }
    }

    /**
     * 读取军队当前增援的活跃战场；无记录或战斗已结束时返回 `null`。
     * @param armyId 军队 id。
     * @returns 活跃战斗或 `null`。
     */
    private findEngagedBattle(armyId: number): IBattle | null {
        const battleId = this.armyBattle.get(armyId);
        if (battleId === undefined) {
            return null;
        }
        for (const battle of this.battles.listActiveBattles()) {
            if (battle.getId() === battleId) {
                return battle;
            }
        }
        return null;
    }

    /**
     * 记录每场活跃战斗曾加入过的单位 id：`BattleSystem` 的成员集合会在单位离区时
     * 立即删除该 id，但城池战结算仍需知道败方哪些军队参战过，才能让离区幸存者
     * 一起重组。每个子步在战斗判定后刷新；战斗结束时与当前成员取并集后消费。
     */
    private recordBattleParticipants(): void {
        for (const army of this.armies.values()) {
            for (const unitId of army.getUnitIds()) {
                const battle = this.battles.getBattleForUnit(unitId);
                if (battle === null) {
                    continue;
                }
                const battleId = battle.getId();
                let participants = this.battleParticipants.get(battleId);
                if (participants === undefined) {
                    participants = new Set<number>();
                    this.battleParticipants.set(battleId, participants);
                }
                participants.add(unitId);
            }
        }
    }

    /**
     * 一组单位的平均物理位置；没有任何可读位置时返回 `null`。
     * @param unitIds 单位 id 列表。
     * @returns 平均位置或 `null`。
     */
    private meanPosition(unitIds: readonly number[]): IVec2 | null {
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (const unitId of unitIds) {
            const state = this.physics.getUnitState(unitId);
            if (state === null) {
                continue;
            }
            sumX += state.x;
            sumY += state.y;
            count += 1;
        }
        if (count === 0) {
            return null;
        }
        return { x: sumX / count, y: sumY / count };
    }

    /**
     * 战斗结束结算（D-05/D-20/D-21/D-22/KING-07）：
     * 1) 先对**所有**受影响军队做通用清理：删除指向该战斗的增援记录，
     *    用幸存成员重算中心并给出确定状态（仍驻守 → `Garrisoned`，否则 `Reorganizing`）。
     * 2) 军队战到此结束。
     * 3) 城池战且真实接触（`contested`）：存活方若为攻方则接管城池（共享转移 helper
     *    清空败方驻军链接、更新双方城池列表，从不调用 `updateTeam`），按净化后的
     *    `GarrisonSelector` 结果新建驻军军队并清空获胜野战军的 `Garrison` 指令。
     *    无论攻守谁胜，败方幸存军队都重组并向后方行军，从而离开触发半径、释放重战锁。
     *    未真实接触（单边参与/无幸存者）不做任何城池结算。
     * @param battle 已结束的战斗。
     * @param contested 是否发生过双方参与的接触。
     */
    private handleBattleEnded(battle: IBattle, contested: boolean): void {
        const battleId = battle.getId();
        for (const [armyId, engagedBattleId] of [...this.armyBattle]) {
            if (engagedBattleId === battleId) {
                this.armyBattle.delete(armyId);
            }
        }

        const participants =
            this.battleParticipants.get(battleId) ?? new Set<number>();
        for (const unitId of battle.getMemberUnitIds()) {
            participants.add(unitId);
        }
        this.battleParticipants.delete(battleId);

        const survivorsByArmy = new Map<number, number[]>();
        const survivingIds: number[] = [];
        for (const unitId of battle.getMemberUnitIds()) {
            const unit = this.units.get(unitId);
            if (unit === undefined || !unit.isAlive()) {
                continue;
            }
            const owner = this.unitArmy.get(unitId);
            if (owner === undefined) {
                continue;
            }
            survivingIds.push(unitId);
            const list = survivorsByArmy.get(owner.armyId) ?? [];
            list.push(unitId);
            survivorsByArmy.set(owner.armyId, list);
        }

        for (const [armyId, unitIds] of survivorsByArmy) {
            const army = this.armies.get(armyId);
            if (army === undefined) {
                continue;
            }
            const center = this.meanPosition(unitIds);
            if (center !== null) {
                army.setCenter(center.x, center.y);
            }
            if (army.getGarrisonedCityId() !== undefined) {
                army.setState(ArmyState.Garrisoned);
            } else {
                army.setState(ArmyState.Reorganizing);
                this.reorganizingArmies.add(armyId);
            }
        }

        const cityId = battle.getCityId();
        const city = cityId === undefined ? undefined : this.cities.get(cityId);
        if (city !== undefined && survivingIds.length > 0) {
            survivingIds.sort((first, second) => first - second);
            const winnerOwner = this.unitArmy.get(survivingIds[0]);
            if (winnerOwner !== undefined) {
                const winnerFactionId = winnerOwner.factionId;
                const capturesCity =
                    contested && city.getFactionId() !== winnerFactionId;

                if (capturesCity) {
                    this.resolveCityCapture(
                        city,
                        cityId as number,
                        winnerFactionId,
                        survivingIds,
                        survivorsByArmy
                    );
                }

                if (contested) {
                    // 进攻方被击退（城市未被攻占）与攻占成功都要重组败方：
                    // 只做通用清理会让败方保留 Garrison 指令并停在触发半径内，
                    // 使同一 army/city pair 因重战锁而永久无法再次交战（WR-03）。
                    const regrouped = new Set<number>();
                    for (const unitId of participants) {
                        const owner = this.unitArmy.get(unitId);
                        if (
                            owner === undefined ||
                            owner.factionId === winnerFactionId
                        ) {
                            continue;
                        }
                        if (regrouped.has(owner.armyId)) {
                            continue;
                        }
                        regrouped.add(owner.armyId);
                        this.regroupLosingArmy(owner.armyId);
                    }
                }
            }
        }

        for (const army of this.armies.values()) {
            if (army.getUnitIds().length === 0) {
                army.setOrder(null);
            }
        }
    }

    /**
     * 结算一次城池攻占：转移归属、清空获胜野战军对该城的 `Garrison` 指令与链接，
     * 再按净化后的 `GarrisonSelector` 新建驻军军队。仅由 `handleBattleEnded` 在
     * 双方真实接触且获胜方不是原主时调用。
     * @param city 被攻占城池。
     * @param cityId 城池 id。
     * @param winnerFactionId 获胜势力 id。
     * @param survivingIds 存活获胜单位 id（升序）。
     * @param survivorsByArmy 军队 id → 存活单位 id。
     */
    private resolveCityCapture(
        city: IMutableCity,
        cityId: number,
        winnerFactionId: number,
        survivingIds: readonly number[],
        survivorsByArmy: ReadonlyMap<number, number[]>
    ): void {
        const garrisonHeading = this.garrisonHeading(city);
        this.transferCityOwnership(city, winnerFactionId);

        for (const armyId of survivorsByArmy.keys()) {
            const army = this.armies.get(armyId);
            if (army === undefined || army.getFactionId() !== winnerFactionId) {
                continue;
            }
            const order = army.getOrder();
            if (
                order !== null &&
                order.kind === ArmyOrderKind.Garrison &&
                order.cityId === cityId
            ) {
                army.setOrder(null);
            }
            if (army.getGarrisonedCityId() === cityId) {
                army.setGarrisonedCityId(undefined);
            }
        }

        const selected = this.selectGarrison(city, survivingIds);
        if (selected.length > 0) {
            this.createGarrisonArmy(
                city,
                winnerFactionId,
                selected,
                garrisonHeading
            );
        }
    }

    /**
     * 合并通知：把被吸收战斗的参与者集合折叠进存活战斗的账本，避免每次合并泄漏
     * 一个集合并让只在被吸收战斗中参战的单位逃过败方重组（WR-05）。
     * @param absorbed 被吸收战斗。
     * @param survivor 存活战斗。
     */
    private handleBattlesMerged(absorbed: IBattle, survivor: IBattle): void {
        const absorbedParticipants = this.battleParticipants.get(
            absorbed.getId()
        );
        if (absorbedParticipants === undefined) {
            return;
        }
        let survivorParticipants = this.battleParticipants.get(
            survivor.getId()
        );
        if (survivorParticipants === undefined) {
            survivorParticipants = new Set<number>();
            this.battleParticipants.set(survivor.getId(), survivorParticipants);
        }
        for (const unitId of absorbedParticipants) {
            survivorParticipants.add(unitId);
        }
        this.battleParticipants.delete(absorbed.getId());
    }

    /**
     * 读取城池当前驻军的朝向（新驻军继承它）；无驻军时为 0。
     * @param city 城池。
     * @returns 朝向角（弧度）。
     */
    private garrisonHeading(city: ICity): number {
        const garrisonArmyId = city.getGarrisonArmyId();
        if (garrisonArmyId === undefined) {
            return 0;
        }
        return this.armies.get(garrisonArmyId)?.getHeading() ?? 0;
    }

    /**
     * 调用注入的 `GarrisonSelector` 并净化结果：只保留候选人中的有限整数 id，
     * 去重并截断到 `city.getGarrisonCap()`；抛出、非数组或非法值一律按空选择处理
     * （T-04-02：绝不信任注入代码）。
     * @param city 被攻占的城池。
     * @param survivingIds 存活获胜单位 id（升序）。
     * @returns 净化后的入驻单位 id。
     */
    private selectGarrison(
        city: ICity,
        survivingIds: readonly number[]
    ): readonly number[] {
        const cap = city.getGarrisonCap();
        if (!Number.isFinite(cap) || cap <= 0) {
            return [];
        }

        const candidates: IHealableUnit[] = [];
        const candidateIds = new Set<number>();
        for (const unitId of survivingIds) {
            const unit = this.units.get(unitId);
            if (unit === undefined || !unit.isAlive()) {
                continue;
            }
            candidates.push(unit);
            candidateIds.add(unitId);
        }
        if (candidates.length === 0) {
            return [];
        }

        let returned: unknown;
        try {
            returned = this.config.garrisonSelector(city, candidates);
        } catch {
            returned = [];
        }
        const values = Array.isArray(returned) ? returned : [];
        const selected: number[] = [];
        const seen = new Set<number>();
        for (const value of values) {
            if (
                typeof value !== 'number' ||
                !Number.isFinite(value) ||
                !Number.isInteger(value) ||
                !candidateIds.has(value) ||
                seen.has(value)
            ) {
                continue;
            }
            seen.add(value);
            selected.push(value);
            if (selected.length >= cap) {
                break;
            }
        }
        return selected;
    }

    /**
     * 新建一支 World 分配的驻军军队：id 来自单调计数器（永不重用），中心为城池点，
     * 名册恰为选中的单位 id，状态 `Garrisoned`，并保留一条针对该城的 `Garrison` 指令
     * （满足的驻扎由“指令 + 城池链接”共同表达，因此指挥官与到期清理都不会动它）。
     * 选中的单位从原军队名册移除，原军队 id/指令保持不变；链接双向建立。
     * @param city 被攻占的城池。
     * @param factionId 获胜势力 id。
     * @param unitIds 入驻单位 id。
     * @param heading 初始朝向（继承旧驻军或 0）。
     */
    private createGarrisonArmy(
        city: IMutableCity,
        factionId: number,
        unitIds: readonly number[],
        heading: number
    ): void {
        const cityId = city.getId();
        const position = city.getPosition();
        const armyId = this.nextArmyId;
        this.nextArmyId += 1;

        const army = new Army(
            armyId,
            factionId,
            position.x,
            position.y,
            heading,
            () => this.armyBattle.get(armyId)
        );
        army.setUnitIds(unitIds);
        army.setState(ArmyState.Garrisoned);
        army.setGarrisonedCityId(cityId);
        army.setOrder({ armyId, kind: ArmyOrderKind.Garrison, cityId });
        this.armies.set(armyId, army);

        const faction = this.factions.get(factionId);
        if (faction !== undefined && !faction.getArmyIds().includes(armyId)) {
            faction.setArmyIds([...faction.getArmyIds(), armyId]);
        }

        const selected = new Set(unitIds);
        for (const other of this.armies.values()) {
            if (other.getId() === armyId) {
                continue;
            }
            const roster = other.getUnitIds();
            if (!roster.some(unitId => selected.has(unitId))) {
                continue;
            }
            other.setUnitIds(roster.filter(unitId => !selected.has(unitId)));
        }
        for (const unitId of unitIds) {
            this.unitArmy.set(unitId, { armyId, factionId });
        }

        city.setGarrisonArmyId(armyId);
        army.setGarrisonedCityId(cityId);
    }

    /**
     * 共享城池所有权转移 helper（结算与空城抵达共用）：先读取并清空败方驻军军队的
     * `garrisonedCityId`（被打败的驻军不得继续挂在已失去的城池上），再改写归属、
     * 同步双方势力的城池 id 列表，最后清空驻军链接。它**从不**调用
     * `control.updateTeam`，也从不改动任何单位的阵营或 team id（D-05/D-21）。
     * @param city 易手城池。
     * @param winnerFactionId 新归属势力 id。
     */
    private transferCityOwnership(
        city: IMutableCity,
        winnerFactionId: number
    ): void {
        const previousFactionId = city.getFactionId();
        const outgoingGarrisonArmyId = city.getGarrisonArmyId();
        if (outgoingGarrisonArmyId !== undefined) {
            const outgoing = this.armies.get(outgoingGarrisonArmyId);
            if (outgoing !== undefined) {
                outgoing.setGarrisonedCityId(undefined);
                outgoing.setState(ArmyState.Reorganizing);
                this.reorganizingArmies.add(outgoingGarrisonArmyId);
            }
        }

        city.setFactionId(winnerFactionId);
        if (previousFactionId !== undefined) {
            const previous = this.factions.get(previousFactionId);
            if (previous !== undefined) {
                previous.setCityIds(
                    previous.getCityIds().filter(id => id !== city.getId())
                );
            }
        }
        const winner = this.factions.get(winnerFactionId);
        if (
            winner !== undefined &&
            !winner.getCityIds().includes(city.getId())
        ) {
            winner.setCityIds([...winner.getCityIds(), city.getId()]);
        }
        city.setGarrisonArmyId(undefined);
    }

    /**
     * 败方军队重组：中心重算为存活名册的均值、状态 `Reorganizing`，并向该势力仍拥有的
     * 最近城池行军；一座城都没有时按军队 id 的确定性角度（黄金角）取 400 m 外的点，
     * 再钳制进地图。被打败的驻军链接已由转移 helper 清空，这里绝不重新链接。
     * @param armyId 败方军队 id。
     */
    private regroupLosingArmy(armyId: number): void {
        const army = this.armies.get(armyId);
        if (army === undefined) {
            return;
        }
        const livingIds = army
            .getUnitIds()
            .filter(unitId => this.units.get(unitId)?.isAlive() === true);
        if (livingIds.length === 0) {
            army.setOrder(null);
            return;
        }

        const center = this.meanPosition(livingIds);
        if (center !== null) {
            army.setCenter(center.x, center.y);
        }
        army.setGarrisonedCityId(undefined);
        army.setState(ArmyState.Reorganizing);
        this.reorganizingArmies.add(armyId);

        const target = this.regroupTarget(army);
        this.issueOrder({
            armyId,
            kind: ArmyOrderKind.MoveTo,
            targetX: target.x,
            targetY: target.y
        });
    }

    /**
     * 败方军队的重组目标：最近的自有城池点；没有自有城池时用
     * `heading = (armyId * 2.399963229728653) % (2π)` 从当前中心推进 400 m 并钳制进地图。
     * @param army 败方军队。
     * @returns 目标点（新对象）。
     */
    private regroupTarget(army: IMutableArmy): IVec2 {
        const center = army.getCenter();
        const factionId = army.getFactionId();
        let nearest: IVec2 | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const city of this.cities.values()) {
            if (city.getFactionId() !== factionId) {
                continue;
            }
            const point = city.getPosition();
            const dx = point.x - center.x;
            const dy = point.y - center.y;
            const distance = dx * dx + dy * dy;
            if (distance < bestDistance) {
                bestDistance = distance;
                nearest = point;
            }
        }
        if (nearest !== null) {
            return nearest;
        }

        const angle = (army.getId() * 2.399963229728653) % (Math.PI * 2);
        return {
            x: Math.min(
                Math.max(center.x + Math.cos(angle) * 400, 0),
                this.bounds.width
            ),
            y: Math.min(
                Math.max(center.y + Math.sin(angle) * 400, 0),
                this.bounds.height
            )
        };
    }

    /**
     * 剪枝死亡单位：从单位表、单位→军队表、模式表、槽位表与两处刹车表移除，
     * 并从军队名册删除其 id（Pitfall 8）。
     */
    private pruneDeadUnits(): void {
        const dead: number[] = [];
        for (const [unitId, unit] of this.units) {
            if (!unit.isAlive()) {
                dead.push(unitId);
            }
        }
        if (dead.length === 0) {
            return;
        }

        const deadSet = new Set(dead);
        for (const unitId of dead) {
            const owner = this.unitArmy.get(unitId);
            this.units.delete(unitId);
            this.unitArmy.delete(unitId);
            this.modes.delete(unitId);
            this.slots.delete(unitId);
            this.lastBattleOfUnit.delete(unitId);
            this.brakeUntilMinutes.delete(unitId);

            if (owner !== undefined) {
                const army = this.armies.get(owner.armyId);
                if (army !== undefined) {
                    army.setUnitIds(
                        army
                            .getUnitIds()
                            .filter(memberId => !deadSet.has(memberId))
                    );
                }
            }
        }
    }

    /**
     * 把场景地形与四面地图边界墙加入注入的物理世界（D-27/G-2）：
     * 地形逐字段映射为静态障碍；边界墙位于地图外侧、厚度
     * `BOUNDARY_WALL_THICKNESS`，半尺寸覆盖整条边与四角。两组 id 分开保存，
     * 使 `dispose()` 只移除本世界创建的障碍，且边界墙绝不进入 `getTerrain()`。
     */
    private addStaticGeometry(): void {
        for (const rect of this.terrain) {
            this.terrainObstacleIds.push(
                this.physics.addStaticObstacle({
                    x: rect.x,
                    y: rect.y,
                    halfWidth: rect.halfWidth,
                    halfHeight: rect.halfHeight
                })
            );
        }

        const halfThickness = BOUNDARY_WALL_THICKNESS / 2;
        const halfWidth = this.bounds.width / 2;
        const halfHeight = this.bounds.height / 2;
        this.wallObstacleIds.push(
            this.physics.addStaticObstacle({
                x: -halfThickness,
                y: halfHeight,
                halfWidth: halfThickness,
                halfHeight: halfHeight + BOUNDARY_WALL_THICKNESS
            }),
            this.physics.addStaticObstacle({
                x: this.bounds.width + halfThickness,
                y: halfHeight,
                halfWidth: halfThickness,
                halfHeight: halfHeight + BOUNDARY_WALL_THICKNESS
            }),
            this.physics.addStaticObstacle({
                x: halfWidth,
                y: -halfThickness,
                halfWidth: halfWidth + BOUNDARY_WALL_THICKNESS,
                halfHeight: halfThickness
            }),
            this.physics.addStaticObstacle({
                x: halfWidth,
                y: this.bounds.height + halfThickness,
                halfWidth: halfWidth + BOUNDARY_WALL_THICKNESS,
                halfHeight: halfThickness
            })
        );
    }

    /**
     * 把每个势力在场景中拥有的军队/城池 id 填入势力模型（防御性副本）。
     */
    private fillFactionRosters(): void {
        for (const faction of this.factions.values()) {
            const armyIds: number[] = [];
            for (const army of this.armies.values()) {
                if (army.getFactionId() === faction.getId()) {
                    armyIds.push(army.getId());
                }
            }
            const cityIds: number[] = [];
            for (const city of this.cities.values()) {
                if (city.getFactionId() === faction.getId()) {
                    cityIds.push(city.getId());
                }
            }
            faction.setArmyIds(armyIds);
            faction.setCityIds(cityIds);
        }
    }

    /**
     * 物化一支场景军队：以 `spawnUnit` 生成单位、分配单调 id、注册进控制系统，
     * 再写入名册。注册失败会直接抛出（名册在全部成功后才最终确定）。
     * @param spec 军队场景配置。
     */
    private spawnArmyUnits(spec: IArmySpawnSpec): void {
        const army = this.armies.get(spec.id);
        if (army === undefined) {
            return;
        }

        const total = spec.units.reduce((sum, entry) => sum + entry.count, 0);
        const roster: number[] = [];
        let index = 0;

        for (const entry of spec.units) {
            for (let count = 0; count < entry.count; count += 1) {
                const unit = spawnUnit(entry.classKind, this.rng);
                const unitId = this.nextUnitId;
                this.nextUnitId += 1;
                rememberUnitIdentity(unit, unitId);

                const angle = total > 0 ? (Math.PI * 2 * index) / total : 0;
                this.control.registerUnit({
                    unitId,
                    unit,
                    teamId: army.getFactionId(),
                    x: spec.x + Math.cos(angle) * SPAWN_RING_RADIUS,
                    y: spec.y + Math.sin(angle) * SPAWN_RING_RADIUS
                });

                this.units.set(unitId, unit);
                this.unitArmy.set(unitId, {
                    armyId: army.getId(),
                    factionId: army.getFactionId()
                });
                roster.push(unitId);
                index += 1;
            }
        }

        army.setUnitIds(roster);
    }

    /**
     * 判断 x 是否位于地图水平范围内。
     * @param x 坐标。
     * @returns 是否在界内。
     */
    private insideMapX(x: number): boolean {
        return Number.isFinite(x) && x >= 0 && x <= this.bounds.width;
    }

    /**
     * 判断 y 是否位于地图垂直范围内。
     * @param y 坐标。
     * @returns 是否在界内。
     */
    private insideMapY(y: number): boolean {
        return Number.isFinite(y) && y >= 0 && y <= this.bounds.height;
    }
}
