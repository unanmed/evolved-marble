/**
 * 战斗容器：`class BattleSystem implements IBattleSystem`（D-02/D-03/D-04/D-05/D-17）。
 * 战斗是**单位级**的：成员是单位 id 集合，战斗层没有“军队”概念（D-02）。
 * 本类只判定成员、中心、合并与结束；战后结算（接管城池、重组、驻军）由 `IWorld` 在
 * 注入的 `onEnded` 回调里完成（D-21）。
 *
 * 每个子步的固定顺序（research Pitfall 6）：
 * 剪枝 → 离区 → 加入 → 释放已分离的 pair 锁 → 城池触发 → 军队触发 → 合并 →
 * 重算加权中心 → 结束。城池触发先于军队触发，且被驻军守卫的军队对不再触发军队战，
 * 因此被守城池只会产生一场携带 `cityId` 的城池战。「释放锁」先于「触发」，
 * 使真正分离的一对能在同一 tick 重新触发。
 */

import type {
    IArmy,
    IBattle,
    IBattleLifecycleEvent,
    IBattleSystem,
    ICity,
    IMutableBattle,
    UnitWeight
} from '@/kingdom/types';
import {
    BattleLifecycleKind,
    BattleState,
    BattleTriggerKind
} from '@/kingdom/types';
import type { IPhysicsWorld } from '@/physics/types';
import type { IUnit } from '@/units/types';

/**
 * 一场战斗：`class Battle implements IMutableBattle`。
 * 成员是单位 id 的只读快照；触发键与 pair 锁保存在 `BattleSystem` 的映射里，
 * 不放到战斗对象上（战斗没有接口外的公共成员）。
 */
class Battle implements IMutableBattle {
    /** 战斗 id。 */
    private readonly id: number;
    /** 生命周期状态。 */
    private state = BattleState.Active;
    /** 触发来源。 */
    private readonly triggerKind: BattleTriggerKind;
    /** 城池战对应的城池 id；军队对军队为 `undefined`。 */
    private readonly cityId: number | undefined;
    /** 战斗区中心 x 坐标（米）。 */
    private centerX: number;
    /** 战斗区中心 y 坐标（米）。 */
    private centerY: number;
    /** 战斗区半边长（米）。 */
    private readonly halfExtent: number;
    /** 当前成员单位 id。 */
    private memberUnitIds: number[] = [];
    /** 开始时的游戏分钟。 */
    private readonly startedAtMinutes: number;
    /** 结束时的游戏分钟；未结束为 `undefined`。 */
    private endedAtMinutes: number | undefined;

    /**
     * 构造一场战斗。
     * @param id 战斗 id。
     * @param triggerKind 触发来源。
     * @param cityId 城池战的城池 id（军队战为 `undefined`）。
     * @param centerX 初始中心 x 坐标（米）。
     * @param centerY 初始中心 y 坐标（米）。
     * @param halfExtent 战斗区半边长（米）。
     * @param startedAtMinutes 开始时的游戏分钟。
     */
    constructor(
        id: number,
        triggerKind: BattleTriggerKind,
        cityId: number | undefined,
        centerX: number,
        centerY: number,
        halfExtent: number,
        startedAtMinutes: number
    ) {
        this.id = id;
        this.triggerKind = triggerKind;
        this.cityId = cityId;
        this.centerX = centerX;
        this.centerY = centerY;
        this.halfExtent = halfExtent;
        this.startedAtMinutes = startedAtMinutes;
    }

    /**
     * 战斗 id。
     * @returns 战斗 id。
     */
    getId(): number {
        return this.id;
    }

    /**
     * 生命周期状态。
     * @returns 状态枚举。
     */
    getState(): BattleState {
        return this.state;
    }

    /**
     * 触发来源。
     * @returns 触发来源枚举。
     */
    getTriggerKind(): BattleTriggerKind {
        return this.triggerKind;
    }

    /**
     * 城池战对应的城池 id；军队战为 `undefined`。
     * @returns 城池 id 或 `undefined`。
     */
    getCityId(): number | undefined {
        return this.cityId;
    }

    /**
     * 战斗区中心（新对象）。
     * @returns 中心坐标。
     */
    getCenter(): { x: number; y: number } {
        return { x: this.centerX, y: this.centerY };
    }

    /**
     * 战斗区半边长（米）。
     * @returns 半边长。
     */
    getHalfExtent(): number {
        return this.halfExtent;
    }

    /**
     * 当前成员单位 id 的只读快照（新数组）。
     * @returns 成员 id 列表。
     */
    getMemberUnitIds(): readonly number[] {
        return [...this.memberUnitIds];
    }

    /**
     * 开始时的游戏分钟。
     * @returns 开始分钟。
     */
    getStartedAtMinutes(): number {
        return this.startedAtMinutes;
    }

    /**
     * 结束时的游戏分钟；未结束为 `undefined`。
     * @returns 结束分钟或 `undefined`。
     */
    getEndedAtMinutes(): number | undefined {
        return this.endedAtMinutes;
    }

    /**
     * 覆盖生命周期状态。
     * @param state 新状态。
     */
    setState(state: BattleState): void {
        this.state = state;
    }

    /**
     * 覆盖战斗区中心。
     * @param x 中心 x 坐标（米）。
     * @param y 中心 y 坐标（米）。
     */
    setCenter(x: number, y: number): void {
        this.centerX = x;
        this.centerY = y;
    }

    /**
     * 覆盖成员单位 id（保存副本）。
     * @param unitIds 新成员 id 列表。
     */
    setMemberUnitIds(unitIds: readonly number[]): void {
        this.memberUnitIds = [...unitIds];
    }

    /**
     * 覆盖结束时间；`undefined` 表示仍在进行。
     * @param minutes 结束分钟或 `undefined`。
     */
    setEndedAtMinutes(minutes: number | undefined): void {
        this.endedAtMinutes = minutes;
    }
}

/**
 * 战斗容器：单位级成员判定、加权中心、合并、结束、播放队列与生命周期事件。
 */
export class BattleSystem implements IBattleSystem {
    /** 物理世界：读取单位实时位置。 */
    private readonly physics: IPhysicsWorld;
    /** unitId → teamId（缺省表示未知，按不可见处理）。 */
    private readonly teamOf: (unitId: number) => number | undefined;
    /** unitId → IUnit（存活与权重读取）。 */
    private readonly unitOf: (unitId: number) => IUnit | null;
    /** 全部军队（成员枚举与触发候选）。 */
    private readonly armiesOf: () => readonly IArmy[];
    /** 当前游戏分钟（闭包避免 BattleSystem ↔ TimeSystem 模块循环，C-12）。 */
    private readonly gameMinutes: () => number;
    /** 加权中心权重函数（默认返回等级，失败钳制为 1）。 */
    private readonly unitWeight: UnitWeight;
    /** 战斗区半边长（米）。 */
    private readonly halfExtent: number;
    /** 军队对触发距离（米）。 */
    private readonly triggerDistance: number;
    /** 离区迟滞（米）。 */
    private readonly hysteresis: number;
    /** 战斗结束回调（World 负责重组/结算）。 */
    private readonly onEnded: (battle: IBattle) => void;
    /** 全部城池（城池触发与军队对抑制）；默认空表。 */
    private readonly citiesOf: () => readonly ICity[];
    /** armyId → 军队（解析城池驻军）；默认恒为 `null`。 */
    private readonly armyOf: (armyId: number) => IArmy | null;

    /** 活跃战斗，按开始顺序。 */
    private active: Battle[] = [];
    /** 已完成战斗，按结束顺序。 */
    private completed: Battle[] = [];
    /** unitId → battleId，一对一成员映射（Pitfall 9）。 */
    private membership = new Map<number, number>();
    /** 本子步刚离区的单位 → 战斗 id（阻止同一 tick 立刻回区）。 */
    private exited = new Map<number, number>();
    /** battleId → 创建它的 pair 键（活跃战斗的重复守卫）。 */
    private battleTriggerKeys = new Map<number, string>();
    /**
     * pair 键 → 该对的身份。锁在**创建时**取得、只在距离严格大于
     * `triggerDistance` 时释放（D-05），因此一场战斗结束后原地不会重复触发。
     */
    private pairLocks = new Map<
        string,
        {
            armyId: number;
            otherArmyId: number | undefined;
            cityId: number | undefined;
        }
    >();
    /** 生命周期事件缓冲。 */
    private events: IBattleLifecycleEvent[] = [];
    /** 下一个战斗 id（单调递增，永不重用）。 */
    private nextBattleId = 1;

    /**
     * 构造战斗容器。
     * @param physics 物理世界。
     * @param teamOf unitId → teamId 的只读查找。
     * @param unitOf unitId → `IUnit` 的只读查找。
     * @param armiesOf 全部军队的只读快照来源。
     * @param gameMinutes 当前游戏分钟（闭包，无模块循环）。
     * @param unitWeight 加权中心权重函数。
     * @param halfExtent 战斗区半边长（米）。
     * @param triggerDistance 军队对触发距离（米）。
     * @param hysteresis 离区迟滞（米）。
     * @param onEnded 战斗结束回调（合并时不调用）。
     * @param citiesOf 全部城池的只读快照来源（城池触发与军队对抑制）；省略时无城池。
     * @param armyOf 按 id 读取军队（解析城池驻军）；省略时恒为 `null`。
     */
    constructor(
        physics: IPhysicsWorld,
        teamOf: (unitId: number) => number | undefined,
        unitOf: (unitId: number) => IUnit | null,
        armiesOf: () => readonly IArmy[],
        gameMinutes: () => number,
        unitWeight: UnitWeight,
        halfExtent: number,
        triggerDistance: number,
        hysteresis: number,
        onEnded: (battle: IBattle) => void,
        citiesOf: () => readonly ICity[] = () => [],
        armyOf: (armyId: number) => IArmy | null = () => null
    ) {
        this.physics = physics;
        this.teamOf = teamOf;
        this.unitOf = unitOf;
        this.armiesOf = armiesOf;
        this.gameMinutes = gameMinutes;
        this.unitWeight = unitWeight;
        this.halfExtent = halfExtent;
        this.triggerDistance = triggerDistance;
        this.hysteresis = hysteresis;
        this.onEnded = onEnded;
        this.citiesOf = citiesOf;
        this.armyOf = armyOf;
    }

    /**
     * 推进一个子步的判定（顺序见文件头）。每个子步最多调用一次。
     */
    tick(): void {
        this.pruneMembers();
        this.removeUnitsOutside();
        this.addUnitsInside();
        this.releaseSeparatedPairs();
        this.triggerCityBattles();
        this.triggerArmyBattles();
        this.mergeOverlapping();
        this.recomputeWeightedCenters();
        this.endBattles();
        this.exited.clear();
    }

    /**
     * 当前是否有任一活跃战斗；驱动全局 1×/24×（D-09）。
     * @returns 是否存在活跃战斗。
     */
    hasActiveBattle(): boolean {
        return this.active.length > 0;
    }

    /**
     * 单位当前所在的活跃战斗；不在战场时为 `null`。
     * @param unitId 单位 id。
     * @returns 战斗或 `null`。
     */
    getBattleForUnit(unitId: number): IBattle | null {
        const battleId = this.membership.get(unitId);
        if (battleId === undefined) {
            return null;
        }
        return this.findActive(battleId);
    }

    /**
     * 活跃战斗列表（新数组，按开始顺序）。
     * @returns 活跃战斗。
     */
    listActiveBattles(): readonly IBattle[] {
        return [...this.active];
    }

    /**
     * 已完成战斗列表（新数组，按结束顺序）。
     * @returns 已完成战斗。
     */
    listCompletedBattles(): readonly IBattle[] {
        return [...this.completed];
    }

    /**
     * 取走自上次调用以来的生命周期事件（新数组并清空缓冲）。
     * @returns 事件列表。
     */
    drainEvents(): readonly IBattleLifecycleEvent[] {
        const drained = this.events;
        this.events = [];
        return drained;
    }

    /**
     * 剪枝：移除已死亡、已注销或战斗已不活跃的成员映射（Pitfall 8）。
     */
    private pruneMembers(): void {
        for (const [unitId, battleId] of [...this.membership]) {
            const unit = this.unitOf(unitId);
            const battle = this.findActive(battleId);
            if (battle === null || unit === null || !unit.isAlive()) {
                this.membership.delete(unitId);
                if (battle !== null) {
                    battle.setMemberUnitIds(
                        battle
                            .getMemberUnitIds()
                            .filter(memberId => memberId !== unitId)
                    );
                }
            }
        }
    }

    /**
     * 离区：成员越出 `halfExtent + hysteresis` 或物理读数消失时退出战斗，
     * 并记录到本子步的 exited 表（D-14/Pitfall 6）。
     */
    private removeUnitsOutside(): void {
        const limit = this.halfExtent + this.hysteresis;
        for (const battle of this.active) {
            const keep: number[] = [];
            let changed = false;
            for (const unitId of battle.getMemberUnitIds()) {
                const state = this.physics.getUnitState(unitId);
                const center = battle.getCenter();
                if (
                    state === null ||
                    !BattleSystem.inside(
                        center.x,
                        center.y,
                        limit,
                        state.x,
                        state.y
                    )
                ) {
                    this.membership.delete(unitId);
                    this.exited.set(unitId, battle.getId());
                    changed = true;
                    continue;
                }
                keep.push(unitId);
            }
            if (changed) {
                battle.setMemberUnitIds(keep);
            }
        }
    }

    /**
     * 加入：任何已注册单位位于某活跃战斗的正方形内、且不属于任何战斗时加入它
     * （按活跃战斗顺序，保证一对一）。本子步刚离区的单位不立即回区。
     */
    private addUnitsInside(): void {
        for (const battle of this.active) {
            const center = battle.getCenter();
            const halfExtent = battle.getHalfExtent();
            const members = [...battle.getMemberUnitIds()];
            let changed = false;

            for (const army of this.armiesOf()) {
                for (const unitId of army.getUnitIds()) {
                    if (
                        this.membership.has(unitId) ||
                        this.exited.has(unitId)
                    ) {
                        continue;
                    }
                    const unit = this.unitOf(unitId);
                    if (unit === null || !unit.isAlive()) {
                        continue;
                    }
                    const state = this.physics.getUnitState(unitId);
                    if (state === null) {
                        continue;
                    }
                    if (
                        !BattleSystem.inside(
                            center.x,
                            center.y,
                            halfExtent,
                            state.x,
                            state.y
                        )
                    ) {
                        continue;
                    }
                    this.membership.set(unitId, battle.getId());
                    members.push(unitId);
                    changed = true;
                }
            }

            if (changed) {
                battle.setMemberUnitIds(members);
            }
        }
    }

    /**
     * 释放已分离的 pair 锁：**唯一**的解锁路径，距离严格大于 `triggerDistance`。
     * 军队对通过两个中心测量，军队—城池对通过军队中心到城池点测量；
     * 实体已不存在时作为清理删除锁。活跃战斗守卫会阻止解锁后立刻重复创建战斗。
     */
    private releaseSeparatedPairs(): void {
        const armies = new Map<number, IArmy>();
        for (const army of this.armiesOf()) {
            armies.set(army.getId(), army);
        }
        const cities = new Map<number, ICity>();
        for (const city of this.citiesOf()) {
            cities.set(city.getId(), city);
        }

        for (const [key, identity] of [...this.pairLocks]) {
            const first = armies.get(identity.armyId);
            if (first === undefined) {
                this.pairLocks.delete(key);
                continue;
            }

            if (identity.otherArmyId !== undefined) {
                const second = armies.get(identity.otherArmyId);
                if (second === undefined) {
                    this.pairLocks.delete(key);
                    continue;
                }
                const firstCenter = first.getCenter();
                const secondCenter = second.getCenter();
                const distance = Math.hypot(
                    firstCenter.x - secondCenter.x,
                    firstCenter.y - secondCenter.y
                );
                if (
                    Number.isFinite(distance) &&
                    distance > this.triggerDistance
                ) {
                    this.pairLocks.delete(key);
                }
                continue;
            }

            if (identity.cityId !== undefined) {
                const city = cities.get(identity.cityId);
                if (city === undefined) {
                    this.pairLocks.delete(key);
                    continue;
                }
                const center = first.getCenter();
                const point = city.getPosition();
                const distance = Math.hypot(
                    center.x - point.x,
                    center.y - point.y
                );
                if (
                    Number.isFinite(distance) &&
                    distance > this.triggerDistance
                ) {
                    this.pairLocks.delete(key);
                }
                continue;
            }

            this.pairLocks.delete(key);
        }
    }

    /**
     * 城池触发（D-16/D-21）：一支军队的中心进入敌方城池点的 `triggerDistance` 内，
     * 且该城存在真实的驻军军队（军队存在且名册非空）时，经共享 gate 创建一场
     * `BattleTriggerKind.City` 战斗并携带 `cityId`。空城或名册为空的“幽灵驻军”
     * 不触发战斗——无防守城池由 `Garrison` 抵达直接接管。
     * 键格式 `army:<armyId>:city:<cityId>`；初始中心取军队中心与城池点的中点。
     */
    private triggerCityBattles(): void {
        const cities = this.citiesOf();
        for (const army of this.armiesOf()) {
            if (army.getUnitIds().length === 0) {
                continue;
            }
            const factionId = army.getFactionId();
            const center = army.getCenter();

            for (const city of cities) {
                const ownerFactionId = city.getFactionId();
                if (
                    ownerFactionId === undefined ||
                    ownerFactionId === factionId
                ) {
                    continue;
                }
                const point = city.getPosition();
                const distance = Math.hypot(
                    center.x - point.x,
                    center.y - point.y
                );
                if (
                    !Number.isFinite(distance) ||
                    distance >= this.triggerDistance
                ) {
                    continue;
                }

                const garrisonArmyId = city.getGarrisonArmyId();
                if (garrisonArmyId === undefined) {
                    continue;
                }
                const garrison = this.armyOf(garrisonArmyId);
                if (garrison === null || garrison.getUnitIds().length === 0) {
                    continue;
                }

                const key = `army:${army.getId()}:city:${city.getId()}`;
                const centerX = (center.x + point.x) / 2;
                const centerY = (center.y + point.y) / 2;
                const cityId = city.getId();

                this.createBattle(
                    key,
                    {
                        armyId: army.getId(),
                        otherArmyId: undefined,
                        cityId
                    },
                    () =>
                        new Battle(
                            this.nextBattleId++,
                            BattleTriggerKind.City,
                            cityId,
                            centerX,
                            centerY,
                            this.halfExtent,
                            this.gameMinutes()
                        )
                );
            }
        }
    }

    /**
     * 判断一支军队是否是“敌方城池的驻军”：其 `getGarrisonedCityId()` 能解析到一座
     * 归属势力不等于 `otherFactionId` 的城池。这样的驻军中心就是城池点，
     * 军队—军队触发必须让位给城池触发，保证被守城池只产生一场携带 `cityId` 的战斗。
     * @param army 候选军队。
     * @param otherFactionId 与之配对的另一支军队的势力 id。
     * @returns 是否应抑制该军队对。
     */
    private isGarrisonOfEnemyCity(
        army: IArmy,
        otherFactionId: number
    ): boolean {
        const cityId = army.getGarrisonedCityId();
        if (cityId === undefined) {
            return false;
        }
        for (const city of this.citiesOf()) {
            if (city.getId() !== cityId) {
                continue;
            }
            const ownerFactionId = city.getFactionId();
            return (
                ownerFactionId !== undefined &&
                ownerFactionId !== otherFactionId
            );
        }
        return false;
    }

    /**
     * 军队对触发：不同势力且中心距离小于 `triggerDistance` 的一对，经共享 gate 创建战斗。
     * 若其中一方是敌方城池的驻军，则该军队对让位给城池触发（其中心即城池点）。
     * 键格式 `army:<lowId>:<highId>`；重复创建在源头被阻止。
     */
    private triggerArmyBattles(): void {
        const armies = this.armiesOf();
        for (let firstIndex = 0; firstIndex < armies.length; firstIndex += 1) {
            for (
                let secondIndex = firstIndex + 1;
                secondIndex < armies.length;
                secondIndex += 1
            ) {
                const first = armies[firstIndex];
                const second = armies[secondIndex];
                if (
                    first.getUnitIds().length === 0 ||
                    second.getUnitIds().length === 0
                ) {
                    continue;
                }
                if (first.getFactionId() === second.getFactionId()) {
                    continue;
                }
                if (
                    this.isGarrisonOfEnemyCity(first, second.getFactionId()) ||
                    this.isGarrisonOfEnemyCity(second, first.getFactionId())
                ) {
                    continue;
                }
                const firstCenter = first.getCenter();
                const secondCenter = second.getCenter();
                const distance = Math.hypot(
                    firstCenter.x - secondCenter.x,
                    firstCenter.y - secondCenter.y
                );
                if (
                    !Number.isFinite(distance) ||
                    distance >= this.triggerDistance
                ) {
                    continue;
                }

                const lowId =
                    first.getId() <= second.getId()
                        ? first.getId()
                        : second.getId();
                const highId =
                    first.getId() <= second.getId()
                        ? second.getId()
                        : first.getId();
                const key = `army:${lowId}:${highId}`;
                const centerX = (firstCenter.x + secondCenter.x) / 2;
                const centerY = (firstCenter.y + secondCenter.y) / 2;

                this.createBattle(
                    key,
                    { armyId: lowId, otherArmyId: highId, cityId: undefined },
                    () =>
                        new Battle(
                            this.nextBattleId++,
                            BattleTriggerKind.Army,
                            undefined,
                            centerX,
                            centerY,
                            this.halfExtent,
                            this.gameMinutes()
                        )
                );
            }
        }
    }

    /**
     * 共享触发 gate（plan 04-05 的城池触发复用同一入口）：
     * 已有锁或已有活跃战斗携带该键时直接返回；否则创建战斗、记录触发键、**在创建时**
     * 取得 pair 锁（早于 `Started` 事件），再发出 `Started`。
     * @param key pair 键。
     * @param identity 该对的身份（军队/城池）。
     * @param create 创建战斗的工厂。
     */
    private createBattle(
        key: string,
        identity: {
            armyId: number;
            otherArmyId: number | undefined;
            cityId: number | undefined;
        },
        create: () => Battle
    ): void {
        if (this.pairLocks.has(key)) {
            return;
        }
        for (const battle of this.active) {
            if (this.battleTriggerKeys.get(battle.getId()) === key) {
                return;
            }
        }

        const battle = create();
        this.active.push(battle);
        this.battleTriggerKeys.set(battle.getId(), key);
        this.pairLocks.set(key, identity);
        this.events.push({
            kind: BattleLifecycleKind.Started,
            battleId: battle.getId(),
            gameMinutes: this.gameMinutes()
        });
    }

    /**
     * 合并重叠的活跃战斗：正方形在两轴上的间距都小于两者半边长之和即重叠。
     * 存活者取较小 id，除非恰好一方携带 `cityId`（则城池战存活，D-04）；
     * 两个不同 cityId 的城池战永不合并。被吸收者以 `mergedIntoBattleId` 结束，
     * 不调用结束回调。
     */
    private mergeOverlapping(): void {
        let merged = true;
        while (merged) {
            merged = false;
            for (
                let firstIndex = 0;
                firstIndex < this.active.length;
                firstIndex += 1
            ) {
                for (
                    let secondIndex = firstIndex + 1;
                    secondIndex < this.active.length;
                    secondIndex += 1
                ) {
                    const first = this.active[firstIndex];
                    const second = this.active[secondIndex];
                    if (!this.canMerge(first, second)) {
                        continue;
                    }
                    const survivor = this.pickSurvivor(first, second);
                    const absorbed = survivor === first ? second : first;
                    this.absorb(survivor, absorbed);
                    merged = true;
                    break;
                }
                if (merged) {
                    break;
                }
            }
        }
    }

    /**
     * 判断两场战斗是否可合并。
     * @param first 第一场。
     * @param second 第二场。
     * @returns 是否可合并。
     */
    private canMerge(first: Battle, second: Battle): boolean {
        const firstCenter = first.getCenter();
        const secondCenter = second.getCenter();
        const limit = first.getHalfExtent() + second.getHalfExtent();
        if (
            Math.abs(firstCenter.x - secondCenter.x) >= limit ||
            Math.abs(firstCenter.y - secondCenter.y) >= limit
        ) {
            return false;
        }
        const firstCity = first.getCityId();
        const secondCity = second.getCityId();
        if (
            firstCity !== undefined &&
            secondCity !== undefined &&
            firstCity !== secondCity
        ) {
            return false;
        }
        return true;
    }

    /**
     * 选择合并存活者：恰好一场城池战则城池战存活，否则较小 id 存活。
     * @param first 第一场。
     * @param second 第二场。
     * @returns 存活战斗。
     */
    private pickSurvivor(first: Battle, second: Battle): Battle {
        const firstCity = first.getCityId();
        const secondCity = second.getCityId();
        if (firstCity !== undefined && secondCity === undefined) {
            return first;
        }
        if (secondCity !== undefined && firstCity === undefined) {
            return second;
        }
        return first.getId() <= second.getId() ? first : second;
    }

    /**
     * 吸收：存活者接管被吸收者的全部成员，被吸收者结束并发 `Ended`（带 `mergedIntoBattleId`）。
     * 不触发结束回调——成员已属于存活战斗，结算会错误重组/占领。
     * @param survivor 存活战斗。
     * @param absorbed 被吸收战斗。
     */
    private absorb(survivor: Battle, absorbed: Battle): void {
        const absorbedMembers = absorbed.getMemberUnitIds();
        survivor.setMemberUnitIds([
            ...survivor.getMemberUnitIds(),
            ...absorbedMembers
        ]);
        for (const unitId of absorbedMembers) {
            this.membership.set(unitId, survivor.getId());
        }

        const now = this.gameMinutes();
        absorbed.setState(BattleState.Ended);
        absorbed.setEndedAtMinutes(now);
        this.events.push({
            kind: BattleLifecycleKind.Ended,
            battleId: absorbed.getId(),
            gameMinutes: now,
            mergedIntoBattleId: survivor.getId()
        });

        this.active = this.active.filter(battle => battle !== absorbed);
        this.completed.push(absorbed);
        this.battleTriggerKeys.delete(absorbed.getId());
    }

    /**
     * 重算每场活跃战斗的加权中心：权重经注入函数、try/catch + 有限/正数钳制为 1
     * （T-04-02）；成员位置全部缺失时保留上一中心（Pitfall 6）。
     */
    private recomputeWeightedCenters(): void {
        for (const battle of this.active) {
            let totalWeight = 0;
            let sumX = 0;
            let sumY = 0;
            let hasPosition = false;

            for (const unitId of battle.getMemberUnitIds()) {
                const state = this.physics.getUnitState(unitId);
                if (state === null) {
                    continue;
                }
                const unit = this.unitOf(unitId);
                if (unit === null) {
                    continue;
                }

                let weight = 1;
                try {
                    const raw = this.unitWeight(unit);
                    if (Number.isFinite(raw) && raw > 0) {
                        weight = raw;
                    }
                } catch {
                    weight = 1;
                }

                sumX += state.x * weight;
                sumY += state.y * weight;
                totalWeight += weight;
                hasPosition = true;
            }

            if (
                hasPosition &&
                totalWeight > 0 &&
                Number.isFinite(sumX) &&
                Number.isFinite(sumY)
            ) {
                battle.setCenter(sumX / totalWeight, sumY / totalWeight);
            }
        }
    }

    /**
     * 结束：区内只剩至多一个势力时结束战斗、发 `Ended`、调用回调并移入完成队列。
     * 零成员战斗（本子步刚触发）与全部成员已不可见的战斗都保留到下一子步。
     * 结束**不**写重战锁：锁在创建时已取得，只由分离流程释放（D-05）。
     */
    private endBattles(): void {
        const now = this.gameMinutes();
        for (const battle of [...this.active]) {
            const members = battle.getMemberUnitIds();
            if (members.length === 0) {
                continue;
            }

            const teams = new Set<number>();
            let living = 0;
            for (const unitId of members) {
                const unit = this.unitOf(unitId);
                if (unit === null || !unit.isAlive()) {
                    continue;
                }
                const team = this.teamOf(unitId);
                if (team === undefined) {
                    continue;
                }
                teams.add(team);
                living += 1;
            }

            if (living === 0 || teams.size > 1) {
                continue;
            }

            battle.setState(BattleState.Ended);
            battle.setEndedAtMinutes(now);
            this.events.push({
                kind: BattleLifecycleKind.Ended,
                battleId: battle.getId(),
                gameMinutes: now
            });
            this.active = this.active.filter(item => item !== battle);
            this.completed.push(battle);
            this.battleTriggerKeys.delete(battle.getId());
            this.onEnded(battle);
        }
    }

    /**
     * 按 id 查找活跃战斗。
     * @param battleId 战斗 id。
     * @returns 活跃战斗或 `null`。
     */
    private findActive(battleId: number): Battle | null {
        for (const battle of this.active) {
            if (battle.getId() === battleId) {
                return battle;
            }
        }
        return null;
    }

    /**
     * 判断点是否位于以 `(centerX, centerY)` 为中心、半边长为 `halfExtent` 的正方形内。
     * @param centerX 中心 x。
     * @param centerY 中心 y。
     * @param halfExtent 半边长。
     * @param x 点 x。
     * @param y 点 y。
     * @returns 是否在区内（含边界）。
     */
    private static inside(
        centerX: number,
        centerY: number,
        halfExtent: number,
        x: number,
        y: number
    ): boolean {
        return (
            Math.abs(x - centerX) <= halfExtent &&
            Math.abs(y - centerY) <= halfExtent
        );
    }
}
