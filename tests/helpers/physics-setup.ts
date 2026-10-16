import { initPhysics } from '../../src/sim/world/physics-init';

/**
 * 共享物理测试 setup（D-21 / D-22）。
 *
 * Vitest 在**每个测试文件**执行前加载本文件；顶层的 `await initPhysics()` 保证 Rapier
 * WASM 在任何物理测试构造 `World` 之前完成初始化。`initPhysics()` 幂等，故每个测试
 * 文件重复触发是安全且廉价的——WASM 只在首次实际初始化一次。
 */
await initPhysics();
