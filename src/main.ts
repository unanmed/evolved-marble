/**
 * demo 引导入口（D-16/D-18/D-19/Pitfall 23）。
 * 顺序：Rapier 初始化 → 场景选择 → 真实世界组合根 → Pixi 渲染器 → canvas 挂载 →
 * runner → 操作台 → 启动循环；没有任何顶层 `await`，因此 `vite build` 不会遇到
 * 顶层 await 的打包问题。`main().catch(...)` 保证启动失败会被记录而不是留下白屏。
 * 这里只接线已声明的接缝，不伪造单位/战斗/伤害（D-19）。
 */

import './style.css';

import { createDemoSetup, initDemoRuntime } from '@/demo/composition';
import { OperatorPanel } from '@/demo/panel';
import { ManualRunner } from '@/demo/runner';
import { selectDemoScenario } from '@/demo/scenario';
import type { IManualRunner } from '@/demo/types';
import { DEFAULT_RENDER_CONFIG } from '@/render/constants';
import { createRenderer } from '@/render/Renderer';

/** 舞台宿主 id：canvas 的唯一容器（`index.html`）。 */
const STAGE_HOST_ID = 'stage-host';

/** 操作台宿主 id：canvas 之外的兄弟节点（`index.html`/D-12）。 */
const PANEL_HOST_ID = 'operator-panel';

/** 视觉验证变体的查询串字面量（D-22）：只有它会把场景换成全职业变体。 */
const ALL_CLASSES_QUERY = 'classes=all';

/** 全职业变体的面板文案（D-22）。 */
const ALL_CLASSES_NAME = 'all classes';

/** 默认场景的面板文案（D-16）。 */
const DEFAULT_SCENE_NAME = 'default';

/**
 * 启动 demo：初始化 Rapier、构建真实世界与渲染器、挂载操作台并启动帧驱动器。
 * 任何一步失败都会抛给调用方，由 `main().catch(...)` 记录。
 * @returns 启动完成的 Promise（运行期不结束）。
 */
async function main(): Promise<void> {
    await initDemoRuntime();

    const scenario = selectDemoScenario(window.location.search);
    let setup = createDemoSetup(scenario);

    const renderer = await createRenderer(
        () => setup.services,
        DEFAULT_RENDER_CONFIG
    );

    const stageHost = document.getElementById(STAGE_HOST_ID);
    if (stageHost === null) {
        throw new Error(`demo: #${STAGE_HOST_ID} is missing from index.html`);
    }
    stageHost.append(renderer.getCanvas());

    /**
     * 会话重置（D-18/Pitfall 18）：先建新世界，再释放旧世界，最后复位渲染器——
     * provider 因此立刻看到新 services，镜头回到全景构图，而 Pixi 应用不重建。
     */
    const resetSession = (): void => {
        const previous = setup;
        setup = createDemoSetup(scenario);
        previous.dispose();
        renderer.reset();
    };

    const runner: IManualRunner = new ManualRunner(
        {
            getWorld: () => setup.world,
            camera: renderer.getCamera(),
            renderer,
            resetSession,
            onError: error => console.error(error)
        },
        DEFAULT_RENDER_CONFIG.frameDelayMs
    );

    const panelHost = document.getElementById(PANEL_HOST_ID);
    if (panelHost === null) {
        throw new Error(`demo: #${PANEL_HOST_ID} is missing from index.html`);
    }
    const panel = new OperatorPanel({
        getWorld: () => setup.world,
        camera: renderer.getCamera(),
        runner,
        canvas: renderer.getCanvas(),
        viewport: {
            width: DEFAULT_RENDER_CONFIG.width,
            height: DEFAULT_RENDER_CONFIG.height
        },
        scenarioName: window.location.search.includes(ALL_CLASSES_QUERY)
            ? ALL_CLASSES_NAME
            : DEFAULT_SCENE_NAME
    });
    panel.mount(panelHost);

    runner.start();

    window.addEventListener('beforeunload', () => {
        runner.dispose();
        panel.dispose();
        renderer.dispose();
        setup.dispose();
    });
}

main().catch(error => console.error(error));
