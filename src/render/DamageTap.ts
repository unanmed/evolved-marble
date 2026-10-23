/**
 * 伤害/死亡旁路（D-06/G-3）：`class RenderDamageTap implements IDamageSink, IDamageFeed`。
 * 它**组合**既有接收方而不是替换它：先调用内层 sink（保留全部战斗规则与过滤），
 * 再以守方生命值**实际下降**或**活着→死亡**作为唯一可观测证据，
 * 记录一条 `IRenderDamageEvent` 供渲染层排空。
 * 死亡位置在调用**当刻**读取——`ControlSystem` 在路由伤害之后才注销死亡单位，
 * 这是刚体仍然存在的唯一窗口（Pitfall 10）。
 * 不修改任何冻结契约（`IDamageSink`/`IDamageContext`/`IControlSystem`），也不引入 Pixi。
 */

import type { IDamageContext, IDamageSink } from '@/control/types';
import { MAX_BUFFERED_DAMAGE_EVENTS } from '@/render/constants';
import type {
    IDamageFeed,
    IRenderDamageEvent,
    UnitStateLookup
} from '@/render/types';
import { AttributeKind } from '@/units/types';

/**
 * 伤害/死亡装饰器：把内层接收方真正结算的命中转成有界的事件缓冲。
 */
export class RenderDamageTap implements IDamageSink, IDamageFeed {
    /** 被装饰的真实接收方：拥有全部战斗规则与过滤。 */
    private readonly inner: IDamageSink;
    /** 窄运动读数查询：只为在命中当刻取到守方位置。 */
    private readonly getUnitState: UnitStateLookup;
    /** 尚未排空的渲染伤害事件（新的在后）。 */
    private buffered: IRenderDamageEvent[] = [];

    /**
     * 构造伤害旁路。
     * @param inner 内层伤害接收方（生产环境为 `BattleDamageSink`）。
     * @param getUnitState 按单位 id 读取运动读数；未知/已移除时返回 `null`。
     */
    constructor(inner: IDamageSink, getUnitState: UnitStateLookup) {
        this.inner = inner;
        this.getUnitState = getUnitState;
    }

    /**
     * 应用一条已解析伤害：先交给内层结算，再仅按观测到的生命损失/死亡记录事件。
     * 内层抛出的异常先向上传播，此时缓冲保持不变（不会半记录一次命中）。
     * @param context 已解析的伤害上下文（只读，绝不修改）。
     */
    applyDamage(context: IDamageContext): void {
        const defender = context.defender;
        const wasAlive = defender.isAlive();
        const healthBefore = defender.getAttribute(AttributeKind.Health);

        this.inner.applyDamage(context);

        const healthAfter = defender.getAttribute(AttributeKind.Health);
        const killed = wasAlive && !defender.isAlive();
        const lostHealth = healthBefore - healthAfter;
        const appliedDamage = Number.isFinite(lostHealth)
            ? Math.max(0, lostHealth)
            : 0;

        // 内层会静默拒绝同队 / 不同战斗 / 已死亡 / 物理读数缺失的命中；
        // 生命下降或死亡是“确实结算了”的唯一证据（Pitfall 9）。
        if (appliedDamage <= 0 && !killed) {
            return;
        }

        const state = this.getUnitState(context.event.defenderId);
        if (state === null) {
            return;
        }

        this.buffered.push({
            attackerId: context.event.attackerId,
            defenderId: context.event.defenderId,
            attackerTeamId: context.attackerTeamId,
            defenderTeamId: context.defenderTeamId,
            damage: appliedDamage,
            defenderPart: context.event.defenderPart,
            weaponKind: context.event.weaponKind,
            armorKind: context.event.armorKind,
            x: state.x,
            y: state.y,
            level: defender.getAttribute(AttributeKind.Level),
            killed
        });

        while (this.buffered.length > MAX_BUFFERED_DAMAGE_EVENTS) {
            this.buffered.shift();
        }
    }

    /**
     * 返回新数组并清空缓冲：每个输出帧调用一次，调用方持有的事件永不被后续写入篡改。
     * @returns 本帧排空的伤害事件（可能为空数组）。
     */
    drain(): readonly IRenderDamageEvent[] {
        const drained = this.buffered;
        this.buffered = [];
        return drained;
    }

    /** 丢弃未读事件（reset / 切回全景时）。 */
    clear(): void {
        this.buffered = [];
    }
}
