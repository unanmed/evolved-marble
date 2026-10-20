/**
 * 测试伤害接收方：`class TestDamageSink implements IDamageSink`（D-09/D-10）。
 * 实现 Phase 3 的测试胶合规则：同队免伤、存活守卫、`takeDamage`、攻击/防御/击杀经验。
 * **绝不**调用 `physics.removeUnit`——死亡注销由 `ControlSystem` 统一负责（A8）。
 */

import { AttributeKind } from '@/units/types';
import type { IDamageContext, IDamageSink } from '@/control/types';

/**
 * 测试伤害接收方：拥有战斗规则，但不拥有物理生命周期。
 *
 * 注意：同队免伤是**接收方规则**（D-09/D-10），`ControlSystem` 仍会把同队伤害事件
 * 路由给任一 `IDamageSink`。因此每个生产 sink（Phase 4 战斗模块）都必须自行实现
 * 同队过滤；本类只是 Phase 3 的测试胶合实现，不能作为生产行为的保证。
 */
export class TestDamageSink implements IDamageSink {
    /** 成功应用一条伤害后的观察回调（可选）。 */
    private readonly onApplied?: (context: IDamageContext) => void;

    /**
     * 构造接收方。
     * @param onApplied 成功应用一条伤害后的回调。
     */
    constructor(onApplied?: (context: IDamageContext) => void) {
        this.onApplied = onApplied;
    }

    /**
     * 应用一条已解析伤害：同队或已死亡时直接返回；否则结算伤害与经验，
     * 并在存活→死亡的转变时授予击杀经验。
     * @param context 已解析的伤害上下文。
     */
    applyDamage(context: IDamageContext): void {
        if (context.attackerTeamId === context.defenderTeamId) {
            return;
        }
        if (!context.defender.isAlive()) {
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

        this.onApplied?.(context);
    }
}
