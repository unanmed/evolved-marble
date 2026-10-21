/**
 * 战斗伤害接收方：`class BattleDamageSink implements IDamageSink`（D-15/D-19/KING-06）。
 * 拥有**全部**战斗伤害规则，控制层与物理层只路由事件（D-10 / research Pitfall 7）。
 *
 * 过滤顺序（每一条都必须先于任何状态修改）：
 * 1. 同队免伤；
 * 2. 守方已在同一 tick 死亡；
 * 3. 世界尚未装配（晚绑定 accessor 返回 `null`）；
 * 4. 攻方不在任何活跃战斗；
 * 5. 守方不在**同一**战斗；
 * 6. 任一方的物理读数缺失。
 *
 * 成员资格由 `BattleSystem` 在**本子步物理推进之前**判定；这里不再用推进后的位置
 * 重新比对战斗区（中心也是推进前的快照），否则被同一次碰撞推出 40 m 的合法命中会被
 * 静默丢弃（WR-02）。通过后才照搬 Phase 3 测试胶合层：`takeDamage` + 攻击/防御/击杀
 * 经验 + 存活守卫。
 * 绝不调用 `physics.removeUnit`——死亡注销由 `ControlSystem` 统一负责。
 */

import type { IDamageContext, IDamageSink } from '@/control/types';
import type { IPhysicsWorld } from '@/physics/types';
import type { IBattleSystem } from '@/kingdom/types';
import { AttributeKind } from '@/units/types';

/**
 * 战斗伤害接收方：同场 + 双方在区 + 异队才结算。
 */
export class BattleDamageSink implements IDamageSink {
    /** 物理世界：读取双方实时位置以校验战斗区。 */
    private readonly physics: IPhysicsWorld;
    /** 晚绑定的战斗系统访问器（组合根先建 sink、后建 World，故不能直接注入实例）。 */
    private readonly battlesOf: () => IBattleSystem | null;

    /**
     * 构造战斗伤害接收方。
     * @param physics 物理世界。
     * @param battlesOf 返回当前战斗系统的闭包；世界尚未装配时返回 `null`（丢弃伤害）。
     */
    constructor(physics: IPhysicsWorld, battlesOf: () => IBattleSystem | null) {
        this.physics = physics;
        this.battlesOf = battlesOf;
    }

    /**
     * 应用一条已解析伤害：先做同队/存活/同场/在区过滤，再结算伤害与经验。
     * @param context 已解析的伤害上下文。
     */
    applyDamage(context: IDamageContext): void {
        if (context.attackerTeamId === context.defenderTeamId) {
            return;
        }
        if (!context.defender.isAlive()) {
            return;
        }

        const battles = this.battlesOf();
        if (battles === null) {
            return;
        }

        const attackerBattle = battles.getBattleForUnit(
            context.event.attackerId
        );
        if (attackerBattle === null) {
            return;
        }
        const defenderBattle = battles.getBattleForUnit(
            context.event.defenderId
        );
        if (
            defenderBattle === null ||
            defenderBattle.getId() !== attackerBattle.getId()
        ) {
            return;
        }

        if (
            this.physics.getUnitState(context.event.attackerId) === null ||
            this.physics.getUnitState(context.event.defenderId) === null
        ) {
            return;
        }

        const wasAlive = context.defender.isAlive();
        context.defender.takeDamage(context.event.damage);
        const survivedHit = context.defender.isAlive();

        // 经验会触发升级回血：绝不给已被该击杀死/死亡的单位授予经验，否则会复活。
        if (context.attacker.isAlive()) {
            context.attacker.gainAttackExperience(context.event.damage);
        }
        if (survivedHit) {
            context.defender.gainDefenseExperience(context.event.damageReduced);
        }
        if (wasAlive && !survivedHit && context.attacker.isAlive()) {
            context.attacker.gainKillExperience(
                context.defender.getAttribute(AttributeKind.Level)
            );
        }
    }
}
