/**
 * Phase 1 数值常量（数据模块，D-06）。
 *
 * **纯数据**：本文件不导入任何模块（A7）。数值以 **TS 类型安全常量**表达，
 * 依赖 Vite HMR 改完即时生效；本期**不**引入外部 JSON + schema 校验层。
 *
 * 后续阶段在此目录扩展（同目录、同约定）：
 *   - Phase 3 新增 `classes.ts` / `weapons.ts` / `armor.ts`（职业/武器/防具与成长表）。
 *
 * 数值来源：`.planning/reference/ai-marble-kingdom.md`（标注"需实测校准"）。
 */

/**
 * 种子化移动微扰尺度（Phase-1 占位系统 `movementSystem` 使用）。
 *
 * 取 `0.05` 而非更小的值：快照把浮点量化到 1/256（≈0.0039）栅格，单 tick 的
 * `vx` 变化必须稳定跨越该栅格，否则每 tick 的量化状态不变、确定性门禁退化为空
 * （Pitfall 8；见 01-02 SUMMARY 偏差记录）。Phase 2 将以真实物理替换。
 */
export const MOVEMENT_NUDGE_SCALE = 0.05;
