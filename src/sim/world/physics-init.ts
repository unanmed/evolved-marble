import RAPIER from '@dimforge/rapier2d-deterministic-compat';

/**
 * Rapier WASM 初始化闩锁（D-21）。
 *
 * 这是本模块**唯一**的模块级可变状态——一个刻意的例外（D-36 克制原则下仍必要）：
 * WASM 只能初始化一次，而初始化契约需贯穿组合根与测试 setup。闩锁置位后，
 * `initPhysics()` 立即 resolve，故可安全地重复调用。
 */
let ready = false;

/**
 * 幂等地初始化 Rapier WASM；必须在构造任何 `World` 之前调用一次（D-21）。
 *
 * 组合根（Phase 5 的 `src/main.tsx`）与测试 setup 各自调一次；闩锁保证实际初始化
 * 只发生一次。`BattleSim.step()` 保持**纯同步**——异步仅存在于构造之前。
 *
 * @returns 初始化完成后 resolve 的 Promise（重复调用立即 resolve）。
 */
export async function initPhysics(): Promise<void> {
    if (ready) return;
    await RAPIER.init();
    ready = true;
}

/**
 * 返回当前 Rapier WASM 构建的版本号（D-19 版本冒烟测试用）。
 *
 * 用于把"精确钉版"变成**可断言的硬失败**：版本一变，冒烟测试立即报错，
 * 防止快照格式跨版本静默漂移（PITFALLS 第 1 条）。
 *
 * @returns Rapier 版本字符串；钉版应为 `'0.21.0'`。
 */
export function rapierVersion(): string {
    return RAPIER.version();
}
