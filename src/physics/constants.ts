/**
 * 物理模拟系统的数值常量：固定步长与可校准几何尺寸（D-06/D-10）。
 * 本文件是物理数值的唯一调参入口——改动一行即改动一个尺寸；
 * 全部为类型化顶层 `const` + JSDoc（AGENTS §6），不使用 JSON 数据文件，不使用工厂函数。
 */

import type { IPhysicsGeometry } from '@/physics/types';

/**
 * 固定仿真步长（秒），值为 `1 / 60`（D-10）：一次 `tick()` 恰好推进一步，与渲染解耦。
 * 与几何尺寸同属可校准数值（本阶段锁定 1/60，后续实测可调整）。
 * 该值在 Rapier 内部经 f32 往返，故测试以近似相等断言（`toBeCloseTo`），绝不用精确相等（research Pitfall 5）。
 */
export const DT = 1 / 60;

/**
 * 默认几何尺寸（D-06），全部字段为**可校准**的起始值，待实测校准（OQ-5）：
 * 本体=圆、武器=细长 capsule（Rapier 2D 主轴为局部 y）、防具=环绕本体的圆。
 * 注意 `armorRadius` 与本体同心且完全包住本体圆，因此一次打击可能在同一步
 * 同时接触防具与本体碰撞体——这是预期行为：由 02-06 的「每 tick 每
 * `(attackerId, defenderId)` 唯一伤害」守卫抑制本体伤害事件，而不是在此改动几何。
 */
export const DEFAULT_GEOMETRY: IPhysicsGeometry = {
    /** 本体圆半径（米）：单位自身的圆形碰撞体。 */
    bodyRadius: 0.5,
    /** 武器 capsule 半长（米）：细长武器主体长度之半（主轴为局部 y）。 */
    weaponHalfLength: 0.4,
    /** 武器 capsule 半径（米）：武器粗细。 */
    weaponRadius: 0.05,
    /** 武器局部原点相对本体中心的 x 偏移（米）：武器架在身位前方。 */
    weaponOffsetX: 0.7,
    /** 防具圆半径（米）：略大于本体、与本体同心，使武器先触防具再触本体。 */
    armorRadius: 0.55
};
