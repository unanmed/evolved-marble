/**
 * 渲染层测试夹具：窄接口的合规工厂（`IUnitState` / `IBattle` / `UnitStateLookup` / `IDamageSink`）。
 * 每个夹具都只实现其所声明接口的成员（AGENTS §5），
 * 不引入 Rapier、不引入 Pixi、不保存模块级可变全局，
 * 因而可被 `frame-model.test.ts` 与 05-05 的伤害旁路测试共用。
 */

import type { IDamageContext, IDamageSink } from '@/control/types';
import { BattleState, BattleTriggerKind } from '@/kingdom/types';
import type { IBattle, IVec2 } from '@/kingdom/types';
import type { IUnitState } from '@/physics/types';
import type { UnitStateLookup } from '@/render/types';
import { AttributeKind } from '@/units/types';

/**
 * 构造一个静止的运动读数：速度与角速度归零，朝向可指定。
 * @param x 世界 x 坐标（米）。
 * @param y 世界 y 坐标（米）。
 * @param angle 朝向角（弧度），默认 0。
 * @returns 六项字段全部有限的 `IUnitState`。
 */
export function makeUnitState(x: number, y: number, angle = 0): IUnitState {
    return { x, y, angle, vx: 0, vy: 0, angularVelocity: 0 };
}

/**
 * 测试战斗：`class FakeBattle implements IBattle`。
 * 只保存成员 id、中心与 id，其余九项读数返回稳定的常量，
 * 使相机拟合与点位提取的测试无需真实战斗系统。
 */
export class FakeBattle implements IBattle {
    /** 当前区内成员单位 id（保持构造时顺序）。 */
    private readonly unitIds: readonly number[];
    /** 战斗区中心（米）。 */
    private readonly center: IVec2;
    /** 战斗 id。 */
    private readonly id: number;

    /**
     * 构造测试战斗。
     * @param unitIds 成员单位 id（顺序即 `getMemberUnitIds` 的顺序）。
     * @param center 战斗区中心（米）。
     * @param id 战斗 id。
     */
    constructor(unitIds: readonly number[], center: IVec2, id: number) {
        this.unitIds = [...unitIds];
        this.center = { x: center.x, y: center.y };
        this.id = id;
    }

    getId(): number {
        return this.id;
    }

    getState(): BattleState {
        return BattleState.Active;
    }

    getTriggerKind(): BattleTriggerKind {
        return BattleTriggerKind.Army;
    }

    getCityId(): number | undefined {
        return undefined;
    }

    getCenter(): IVec2 {
        return { x: this.center.x, y: this.center.y };
    }

    getHalfExtent(): number {
        return 40;
    }

    getMemberUnitIds(): readonly number[] {
        return [...this.unitIds];
    }

    getStartedAtMinutes(): number {
        return 0;
    }

    getEndedAtMinutes(): number | undefined {
        return undefined;
    }
}

/**
 * 构造一个测试战斗。
 * @param unitIds 成员单位 id。
 * @param center 战斗区中心（米），默认原点。
 * @param id 战斗 id，默认 1。
 * @returns 新的 `FakeBattle`。
 */
export function makeBattle(
    unitIds: readonly number[],
    center: IVec2 = { x: 0, y: 0 },
    id = 1
): IBattle {
    return new FakeBattle(unitIds, center, id);
}

/**
 * 以只读映射构造窄运动读数查询；未知 id 返回 `null`（缺失对象 → `null`）。
 * 映射中已有的 NaN 坐标保持原样，由被测函数负责守卫。
 * @param states unitId → 运动读数。
 * @returns 符合 `UnitStateLookup` 的闭包。
 */
export function makeLookup(
    states: ReadonlyMap<number, IUnitState>
): UnitStateLookup {
    return (unitId: number): IUnitState | null => states.get(unitId) ?? null;
}

/**
 * 构造一个固定数值的伤害接收方：只调用 `takeDamage`（由单位自身钳制）。
 * @param amount 每条伤害施加的正数。
 * @returns 固定数值的 `IDamageSink`。
 */
export function makeApplyingSink(amount: number): IDamageSink {
    return {
        applyDamage(context: IDamageContext): void {
            context.defender.takeDamage(amount);
        }
    };
}

/**
 * 构造一个致命伤害接收方：按守方当前生命上限施加伤害。
 * @returns 必定击杀的 `IDamageSink`。
 */
export function makeLethalSink(): IDamageSink {
    return {
        applyDamage(context: IDamageContext): void {
            context.defender.takeDamage(
                context.defender.getAttribute(AttributeKind.MaxHealth)
            );
        }
    };
}

/**
 * 构造一个过滤型伤害接收方：不做任何状态改变（模拟被规则挡下的命中）。
 * @returns 拒绝全部伤害的 `IDamageSink`。
 */
export function makeRejectingSink(): IDamageSink {
    return {
        applyDamage(_context: IDamageContext): void {
            // 有意不改变守方状态：用于验证旁路不记录被过滤的命中。
        }
    };
}
