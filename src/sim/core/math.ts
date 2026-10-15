/**
 * 本工程认可的**确定性数学子集**（D-02：同机可复现）。
 *
 * 目标仅要求"同一种子在同一机器/浏览器内重跑结果一致"，因此**不**背负跨机位级
 * 一致的重纪律（D-02）。在此目标下：
 *
 * 允许（float64 在单一 JS 引擎内按位可复现）：
 *   - 四则运算 `+ - * /`
 *   - `Math.sqrt`
 *   - `Math.sin` / `Math.cos`（三角：D-02 明确允许，故**不**禁用 `Math` 全局）
 *   - `Math.round` / `Math.floor` / `Math.min` / `Math.max` / `Math.imul` 等纯函数
 *
 * 禁止（会破坏可复现性，Plan 01-03 由 lint 硬性拦截）：
 *   - 未播种的随机性：`Math.random`（改用 `RandomStreams`）
 *   - 墙上时钟读取：`Date.now` / `performance.now` / `new Date()`（时间即 `TickClock.tick`）
 *
 * 本模块刻意保持极小：只提供被实际使用的少量纯数值助手，**不**重实现 libm。
 * 日后若需收紧到跨机一致（D-03），应在此集中审计全部数学调用。
 */

/**
 * 将 `value` 夹紧到 `[min, max]` 区间（纯函数、确定性）。
 *
 * @param value 待夹紧的数值。
 * @param min 区间下界（含）。
 * @param max 区间上界（含）。
 * @returns 夹紧后的数值：原值（在其间）或最接近的边界值。
 */
export function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}
