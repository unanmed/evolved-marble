import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { fingerprint } from '../../src/sim/snapshot';
import { initPhysics, rapierVersion } from '../../src/sim/world/physics-init';

/**
 * Rapier 版本冒烟测试（D-19 / PHYS-03）。
 *
 * 断言四件事：
 *   1. `rapierVersion()` 恰好为钉定版本（版本变更即硬失败——防快照格式跨版本漂移）。
 *   2. `initPhysics()` 幂等：二次 `await` 无错 resolve（D-21）。
 *   3. 初始化后可在 Node 下构造并步进 `World`（WASM 加载成功，D-22）。
 *   4. 固定场景的 `takeSnapshot()` 指纹（**golden**）稳定且等于记录值（D-19 同机哨兵）。
 */

/** 钉定的 Rapier 版本；不一致即测试失败（D-19）。 */
const PINNED_VERSION = '0.21.0';

/**
 * golden 指纹（D-19）：固定场景下 Rapier `takeSnapshot()` 字节的非加密哈希。
 *
 * 这是**同机版本漂移哨兵**——D-17 放宽了跨机一致性，故本值只需在**同一台机器**上稳定；
 * 唯一预期它变化的情况是**有意升级 Rapier 版本**（而版本字符串断言已先行捕获该情况）。
 * 绝不把墙上时钟/宿主信息读入该哈希（否则哨兵失去确定性）。
 */
const GOLDEN_RAPIER_FINGERPRINT = 'e1b1f66b73551';

/** 固定场景：步进次数（无 RNG、无重力，纯确定性积分）。 */
const SCENARIO_STEPS = 60;
/** 固定场景：球碰撞体半径（米）。 */
const SCENARIO_RADIUS = 0.5;
/** 固定场景：球碰撞体质量（kg）。 */
const SCENARIO_MASS = 1;
/** 固定场景：初始 x 线速度（m/s）。 */
const SCENARIO_VX = 3;
/** 固定场景：初始 y 线速度（m/s）。 */
const SCENARIO_VY = 4;

/**
 * 构造固定场景（单个动态刚体 + 球碰撞体），步进 `SCENARIO_STEPS` 次，
 * 返回其 `takeSnapshot()` 字节的指纹。
 *
 * @returns 固定场景 Rapier 快照字节的非加密指纹（确定性、无 RNG）。
 */
function fixedScenarioFingerprint(): string {
    const world = new RAPIER.World({ x: 0, y: 0 });
    const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(0, 0)
            .setLinvel(SCENARIO_VX, SCENARIO_VY)
            .setCanSleep(false)
    );
    world.createCollider(
        RAPIER.ColliderDesc.ball(SCENARIO_RADIUS).setMass(SCENARIO_MASS),
        body
    );
    for (let i = 0; i < SCENARIO_STEPS; i++) world.step();
    return fingerprint(world.takeSnapshot());
}

describe('Rapier 版本冒烟（D-19 / PHYS-03）', () => {
    beforeAll(async () => {
        await initPhysics();
    });

    it('版本被精确钉定（版本变更即硬失败）', () => {
        expect(rapierVersion()).toBe(PINNED_VERSION);
    });

    it('initPhysics() 幂等：二次调用无错 resolve（D-21）', async () => {
        await expect(initPhysics()).resolves.toBeUndefined();
    });

    it('初始化后可在 Node 下构造并步进 World（D-22）', () => {
        const world = new RAPIER.World({ x: 0, y: 0 });
        expect(() => world.step()).not.toThrow();
    });

    it('golden 指纹跨两次进程内构造稳定且等于记录值（D-19）', () => {
        const first = fixedScenarioFingerprint();
        const second = fixedScenarioFingerprint();
        expect(first).toBe(second);
        expect(first).toBe(GOLDEN_RAPIER_FINGERPRINT);
    });
});
