/**
 * 操控系统：`class ControlSystem implements IControlSystem`（D-06/D-07/D-09/D-10/D-12/D-13）。
 * 负责注册单位、按 6-tick 节奏驱动决策、每物理 tick 重新施加保持中的动作、
 * 步进物理、把伤害路由给注入的 `IDamageSink`，并在路由后批量注销死亡单位。
 *
 * 设计边界：
 * - 战斗规则（同队免伤、`takeDamage`、经验）**不在**本类，全部由 `IDamageSink` 拥有（D-10）。
 * - 只有一个 AI 构造接缝：注入的 `IUnitAIProvider`；本类不认识任何具体 AI 类（D-11）。
 * - 注册快照保持冻结（WR-01 / D-19）；升级后不重新注册物理刚体。
 */

import { ARMOR_DEFS, WEAPON_DEFS } from '@/units/data';
import {
    AttributeKind,
    EquipmentKind,
    SkillKind,
    WeaponKind
} from '@/units/types';
import type { IArmorDef, IUnit, IWeaponDef } from '@/units/types';
import type {
    IDamageEvent,
    IPhysicsWorld,
    IUnitPhysicsSpec
} from '@/physics/types';
import {
    DECISION_INTERVAL_TICKS,
    FORCE_EPSILON,
    MAX_FORCE_MAGNITUDE,
    MAX_TORQUE_MAGNITUDE
} from '@/control/constants';
import { Sensor } from '@/control/Sensor';
import { SkillIntentKind } from '@/control/types';
import type {
    IControlSystem,
    IControlTickResult,
    IControlUnitRegistration,
    IDamageContext,
    IDamageSink,
    ISensor,
    ISensingWorld,
    IUnitAction,
    IUnitAI,
    IUnitAIProvider,
    SkillIntent
} from '@/control/types';

/**
 * 操控系统：注册/移除单位、驱动决策并执行动作、路由伤害、清理死亡单位。
 */
export class ControlSystem implements IControlSystem {
    /** 物理世界：力/力矩的唯一执行器与运动读数来源。 */
    private readonly physics: IPhysicsWorld;
    /** 唯一的 AI 构造接缝（D-11）。 */
    private readonly provider: IUnitAIProvider;
    /** 注入的战斗规则边界（D-10）。 */
    private readonly damageSink: IDamageSink;
    /** 感知器：每次决策拼装纯数据快照。 */
    private readonly sensor: ISensor;

    /** unitId → 单位实例。 */
    private units = new Map<number, IUnit>();
    /** unitId → 阵营 id。 */
    private teams = new Map<number, number>();
    /** unitId → AI 实例。 */
    private ais = new Map<number, IUnitAI>();
    /** unitId → 保持中的动作（物理每 tick 清空力/力矩，故需留存）。 */
    private actions = new Map<number, IUnitAction>();
    /** 下一个控制 tick 的绝对序号：决策节奏的唯一依据。 */
    private tickIndex = 0;
    /** 是否已释放：`dispose()` 幂等性的唯一标记。 */
    private disposed = false;

    /**
     * 构造操控系统。
     * @param physics 物理世界。
     * @param sensingWorld 感知世界（边界/障碍几何与射弹）。
     * @param provider AI 提供者（唯一的 AI 构造接缝）。
     * @param damageSink 伤害接收方（拥有战斗规则）。
     */
    constructor(
        physics: IPhysicsWorld,
        sensingWorld: ISensingWorld,
        provider: IUnitAIProvider,
        damageSink: IDamageSink
    ) {
        this.physics = physics;
        this.provider = provider;
        this.damageSink = damageSink;
        this.sensor = new Sensor(
            physics,
            this,
            sensingWorld,
            () => this.tickIndex
        );
    }

    /**
     * 注册一个单位：绑定阵营、由 `IUnit` 与数据表构造物理规格、创建 AI 实例。
     * 顺序：AI 先创建（工厂抛错则不留半成品）→ 物理注册（失败则销毁 AI 并重新抛出）
     * → 目录/阵营/动作插入。重复 id 在**任何状态变更之前**抛错（T-03-09）。
     *
     * 已知局限（A3 / WR-01 / D-19）：
     * - 物理规格只支持**单件武器**，故取装备列表中第一件武器；
     * - 规格是注册时的冻结快照，升级/换装不会刷新物理伤害输入。
     * @param request 注册请求。
     * @throws {Error} 当控制系统已释放、unitId 已注册，或物理注册失败时。
     */
    registerUnit(request: IControlUnitRegistration): void {
        if (this.disposed) {
            throw new Error(
                'ControlSystem.registerUnit: control system is disposed'
            );
        }
        if (this.units.has(request.unitId)) {
            throw new Error(
                `ControlSystem.registerUnit: unit ${request.unitId} is already registered`
            );
        }

        const spec = this.buildSpec(request);
        const ai = this.provider.create(request.unitId, request.unit);
        try {
            this.physics.registerUnit(spec);
        } catch (error) {
            try {
                this.provider.destroy(request.unitId);
            } catch {
                // 清理失败不掩盖原始的物理注册错误。
            }
            throw error;
        }

        this.units.set(request.unitId, request.unit);
        this.teams.set(request.unitId, request.teamId);
        this.ais.set(request.unitId, ai);
        this.actions.set(request.unitId, this.zeroAction());
    }

    /**
     * 移除一个单位：销毁 AI、从目录移除并删除物理刚体。未知 id 为安全空操作。
     * @param unitId 单位 id。
     */
    unregisterUnit(unitId: number): void {
        if (!this.units.has(unitId)) {
            return;
        }
        this.removeRegisteredUnit(unitId);
    }

    /**
     * 运行时更新阵营（Phase 4 城池易手/转阵营预留）；未注册的 id 为空操作（D-07）。
     * @param unitId 单位 id。
     * @param teamId 新阵营 id。
     */
    updateTeam(unitId: number, teamId: number): void {
        if (!this.units.has(unitId)) {
            return;
        }
        this.teams.set(unitId, teamId);
    }

    /**
     * 推进一个控制 tick。
     *
     * 顺序（A5 决策先于执行）：
     * 1. 决策 tick（`tickIndex % 6 === 0`）：感知 → `ai.decide` → 校验/钳制 → 保存动作；
     * 2. **每个**物理 tick：合成净力/力矩并重新施加（物理层每 tick 后清空）；
     * 3. `physics.tick()`；
     * 4. 路由全部伤害给 `IDamageSink`；
     * 5. 批量注销本 tick 死亡的单位；
     * 6. `tickIndex++`，返回本 tick 产生的技能意图。
     * @returns 本次 tick 收集到的技能意图（非决策 tick 为空数组）。
     */
    tick(): IControlTickResult {
        if (this.disposed) {
            return { skillIntents: [] };
        }

        const skillIntents: SkillIntent[] = [];
        if (this.tickIndex % DECISION_INTERVAL_TICKS === 0) {
            for (const unitId of this.listUnitIds()) {
                const observation = this.sensor.sense(unitId);
                if (observation === null) {
                    continue;
                }
                const ai = this.ais.get(unitId);
                if (ai === undefined) {
                    continue;
                }

                let action: IUnitAction;
                try {
                    // 插件调用与形状校验必须在同一守卫内：抛错或畸形返回都回退零动作。
                    action = this.sanitizeAction(
                        ai.decide(observation),
                        unitId
                    );
                } catch {
                    action = this.zeroAction();
                }

                this.actions.set(unitId, action);
                if (action.skillIntent !== null) {
                    skillIntents.push(action.skillIntent);
                }
            }
        }

        for (const [unitId, action] of this.actions) {
            const { fx, fy, torque } = this.composeAction(action);
            if (Math.abs(fx) > FORCE_EPSILON || Math.abs(fy) > FORCE_EPSILON) {
                this.physics.applyForce(unitId, fx, fy);
            }
            if (Math.abs(torque) > FORCE_EPSILON) {
                this.physics.applyTorque(unitId, torque);
            }
        }

        const result = this.physics.tick();
        for (const damage of result.damages) {
            this.routeDamage(damage);
        }

        const deadUnitIds: number[] = [];
        for (const [unitId, unit] of this.units) {
            if (!unit.isAlive()) {
                deadUnitIds.push(unitId);
            }
        }
        for (const unitId of deadUnitIds) {
            this.removeRegisteredUnit(unitId);
        }

        this.tickIndex += 1;
        return { skillIntents };
    }

    /**
     * 释放全部 AI 实例与内部状态。幂等；**不**释放物理世界（不拥有它）。
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const unitId of [...this.ais.keys()]) {
            try {
                this.provider.destroy(unitId);
            } catch {
                // 单个 AI 的清理失败不应阻断其余清理。
            }
        }
        this.ais.clear();
        this.actions.clear();
        this.units.clear();
        this.teams.clear();
    }

    /**
     * 按 id 读取单位；不存在时返回 `null`。
     * @param unitId 单位 id。
     * @returns 单位或 `null`。
     */
    getUnit(unitId: number): IUnit | null {
        return this.units.get(unitId) ?? null;
    }

    /**
     * 按 id 读取阵营；不存在时返回 `undefined`。
     * @param unitId 单位 id。
     * @returns 阵营 id 或 `undefined`。
     */
    getTeam(unitId: number): number | undefined {
        return this.teams.get(unitId);
    }

    /**
     * 列出当前全部已注册单位 id（新数组）。
     * @returns 单位 id 列表。
     */
    listUnitIds(): readonly number[] {
        return [...this.units.keys()];
    }

    /**
     * 由注册请求构造物理规格：属性取自 `getAttribute`，第一件武器与全部防具取自数据表。
     * 单武器是第一件装备武器的已接受局限（A3）；不做注册后刷新（WR-01 / D-19）。
     * @param request 注册请求。
     * @returns 物理注册规格。
     */
    private buildSpec(request: IControlUnitRegistration): IUnitPhysicsSpec {
        const unit = request.unit;
        let weapon: IWeaponDef | null = null;
        const armors: IArmorDef[] = [];

        for (const item of unit.getEquipment()) {
            if (
                item.kind === EquipmentKind.Weapon &&
                weapon === null &&
                item.weapon !== undefined
            ) {
                weapon = WEAPON_DEFS[item.weapon];
            } else if (
                item.kind === EquipmentKind.Armor &&
                item.armor !== undefined
            ) {
                armors.push(ARMOR_DEFS[item.armor]);
            }
        }

        return {
            unitId: request.unitId,
            x: request.x,
            y: request.y,
            mass: unit.getAttribute(AttributeKind.Mass),
            attack: unit.getAttribute(AttributeKind.Attack),
            weaponRatio: unit.getAttribute(AttributeKind.WeaponRatio),
            defense: unit.getAttribute(AttributeKind.Defense),
            armorRatio: unit.getAttribute(AttributeKind.ArmorRatio),
            weapon,
            armors
        };
    }

    /**
     * 把插件返回的动作校验/钳制为可信动作（T-03-04/T-03-06）。
     * 非对象/缺失 → 零动作；每个幅值非数值/非有限/负数 → 0，并截到上限；
     * 技能意图仅在判别式、单位 id 与对应载荷成员都合法时保留（T-03-13）。
     * @param action 插件返回的动作（可能是任意畸形值）。
     * @param unitId 决策单位 id。
     * @returns 可信、已钳制的动作。
     */
    private sanitizeAction(
        action: IUnitAction | null | undefined,
        unitId: number
    ): IUnitAction {
        if (
            action === null ||
            action === undefined ||
            typeof action !== 'object'
        ) {
            return this.zeroAction();
        }

        const record = action as unknown as Record<string, unknown>;
        const forceUp = this.readMagnitude(record.forceUp, MAX_FORCE_MAGNITUDE);
        const forceDown = this.readMagnitude(
            record.forceDown,
            MAX_FORCE_MAGNITUDE
        );
        const forceLeft = this.readMagnitude(
            record.forceLeft,
            MAX_FORCE_MAGNITUDE
        );
        const forceRight = this.readMagnitude(
            record.forceRight,
            MAX_FORCE_MAGNITUDE
        );
        const torqueClockwise = this.readMagnitude(
            record.torqueClockwise,
            MAX_TORQUE_MAGNITUDE
        );
        const torqueCounterClockwise = this.readMagnitude(
            record.torqueCounterClockwise,
            MAX_TORQUE_MAGNITUDE
        );

        const skillIntent = this.readSkillIntent(record.skillIntent, unitId);

        return {
            forceUp,
            forceDown,
            forceLeft,
            forceRight,
            torqueClockwise,
            torqueCounterClockwise,
            skillIntent
        };
    }

    /**
     * 读取并重建一个可信的技能意图：校验判别式、单位 id 与该分支的载荷成员，
     * 并返回**深拷贝**的新对象，绝不转发插件引用（T-03-13）。
     * 载荷非法（如 `weapon: 999`、缺失 `skill`）时整条意图丢弃。
     * @param rawIntent 插件返回的未信任值。
     * @param unitId 决策单位 id。
     * @returns 可信的技能意图，或 `null`。
     */
    private readSkillIntent(
        rawIntent: unknown,
        unitId: number
    ): SkillIntent | null {
        if (rawIntent === null || typeof rawIntent !== 'object') {
            return null;
        }
        const intent = rawIntent as Record<string, unknown>;
        if (intent.unitId !== unitId) {
            return null;
        }
        if (intent.kind === SkillIntentKind.Unit) {
            const skill = intent.skill;
            if (typeof skill === 'number' && SkillKind[skill] !== undefined) {
                return {
                    kind: SkillIntentKind.Unit,
                    unitId,
                    skill: skill as SkillKind
                };
            }
            return null;
        }
        if (intent.kind === SkillIntentKind.Weapon) {
            const weapon = intent.weapon;
            if (
                typeof weapon === 'number' &&
                WeaponKind[weapon] !== undefined
            ) {
                return {
                    kind: SkillIntentKind.Weapon,
                    unitId,
                    weapon: weapon as WeaponKind
                };
            }
        }
        return null;
    }

    /**
     * 读取一个攻击者/环境提供的幅值：非数值、非有限、负数 → 0；超过上限 → 上限。
     * @param value 未信任的输入。
     * @param cap 该分量的上限。
     * @returns 位于 `[0, cap]` 的有限值。
     */
    private readMagnitude(value: unknown, cap: number): number {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
            return 0;
        }
        return Math.min(value, cap);
    }

    /**
     * 合成净力/力矩并再次钳制：
     * `fx = forceRight − forceLeft`、`fy = forceUp − forceDown`、
     * `torque = torqueCounterClockwise − torqueClockwise`；
     * 净力向量按**整体**缩放至上限，力矩标量截到 `[−cap, cap]`（T-03-04）。
     * @param action 已校验的动作。
     * @returns 待施加的净力与力矩。
     */
    private composeAction(action: IUnitAction): {
        fx: number;
        fy: number;
        torque: number;
    } {
        let fx = action.forceRight - action.forceLeft;
        let fy = action.forceUp - action.forceDown;
        const magnitude = Math.hypot(fx, fy);
        if (magnitude > MAX_FORCE_MAGNITUDE) {
            const scale = MAX_FORCE_MAGNITUDE / magnitude;
            fx *= scale;
            fy *= scale;
        }

        const rawTorque =
            action.torqueCounterClockwise - action.torqueClockwise;
        const torque = Math.max(
            -MAX_TORQUE_MAGNITUDE,
            Math.min(MAX_TORQUE_MAGNITUDE, rawTorque)
        );

        return { fx, fy, torque };
    }

    /**
     * 把一条物理伤害事件解析为 `IDamageContext` 并交给注入的 sink（D-09/D-10）。
     * 未知 id 跳过；sink 抛错被隔离，绝不终止 tick 循环（T-03-08）。
     * @param event 物理层发出的伤害事件。
     */
    private routeDamage(event: IDamageEvent): void {
        const attacker = this.units.get(event.attackerId);
        const defender = this.units.get(event.defenderId);
        if (attacker === undefined || defender === undefined) {
            return;
        }
        const attackerTeamId = this.teams.get(event.attackerId);
        const defenderTeamId = this.teams.get(event.defenderId);
        if (attackerTeamId === undefined || defenderTeamId === undefined) {
            return;
        }

        const context: IDamageContext = {
            event,
            attacker,
            defender,
            attackerTeamId,
            defenderTeamId
        };
        try {
            this.damageSink.applyDamage(context);
        } catch {
            // 单个 sink 失败不终结循环；下一条伤害继续路由。
        }
    }

    /**
     * 单点注销路径（A8）：先销毁 AI（守卫），再删除目录/阵营/动作，最后删除物理刚体。
     * `physics.removeUnit` 是最后一步，使 sink/回调期间目录仍可读取到删除前的状态；
     * 目录删除发生在物理删除之前，因此 `removeUnit` 时 `getUnit` 已为 `null`。
     * @param unitId 单位 id。
     */
    private removeRegisteredUnit(unitId: number): void {
        if (this.ais.has(unitId)) {
            try {
                this.provider.destroy(unitId);
            } catch {
                // 清理失败不阻断目录与物理的去注册。
            }
        }
        this.ais.delete(unitId);
        this.actions.delete(unitId);
        this.units.delete(unitId);
        this.teams.delete(unitId);
        this.physics.removeUnit(unitId);
    }

    /**
     * 全零动作：无输入/畸形输入/无敌人时的安全回退。
     * @returns 六个幅值全为 0、无技能意图的动作。
     */
    private zeroAction(): IUnitAction {
        return {
            forceUp: 0,
            forceDown: 0,
            forceLeft: 0,
            forceRight: 0,
            torqueClockwise: 0,
            torqueCounterClockwise: 0,
            skillIntent: null
        };
    }
}
