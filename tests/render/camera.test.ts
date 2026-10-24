import { describe, expect, it } from 'vitest';

import type { IMapBounds, IVec2 } from '@/kingdom/types';
import { Camera } from '@/render/Camera';
import {
    fitBox,
    fitTransform,
    strategicTransform,
    trackTransform
} from '@/render/cameraMath';
import { DEFAULT_RENDER_CONFIG } from '@/render/constants';
import { CameraMode } from '@/render/types';
import type {
    ICameraConfig,
    ICameraTransform,
    ICameraUpdateInput,
    IViewport
} from '@/render/types';

/** 豬玖ｯ戊ｧ・哨・夐ｻ倩ｮ､ 1920ﾃ・080・・-13・峨・*/
const VIEWPORT: IViewport = { width: 1920, height: 1080 };

/** 豬玖ｯ募慍蝗ｾ・・000ﾃ・000 邀ｳ縲・*/
const BOUNDS: IMapBounds = { width: 1000, height: 1000 };

/** 荳蝨ｺ 40m 隗∵婿縲∽ｽ堺ｺ・(300, 300) 逧・・譁暦ｼ夂岼譬・桷蝗ｾ荳主・譎ｯ譏取仞荳榊酔縲・*/
const BATTLE_POINTS: readonly IVec2[] = [
    { x: 280, y: 280 },
    { x: 320, y: 280 },
    { x: 320, y: 320 },
    { x: 280, y: 320 }
];

/**
 * 霑・ｸ｡/蟷ｳ貊・髴・勘逧・崋螳壽ｵ玖ｯ募ｼ・啻zoomFrames: 6` 隶ｩ蜊墓ｮｵ謗ｨ霑鯛憺ｦ門ｸｧ蜊ｳ蜉ｨ縲∫ｬｬ 6 蟶ｧ關ｽ蝨ｰ窶晏庄譁ｭ險・・ * `panFrames: 10` 隶ｩ蜊墓ｮｵ諡牙屓蜿ｯ譁ｭ險縲・ */
const TEST_OVERRIDES = {
    panFrames: 10,
    zoomFrames: 6,
    smoothingFrames: 4,
    shakeAmplitudePx: 8,
    shakeDecayPerFrame: 0.5
};

/** 霑帛・霑・ｸ｡逧・峩譁ｰ谺｡謨ｰ・壼黒谿ｵ謗ｨ霑大頃 `zoomFrames`縲・*/
const ENTRY_FRAMES = TEST_OVERRIDES.zoomFrames;

/**
 * 譫・豬玖ｯ慕畑髟懷､ｴ蜿よ焚・壼惠蜃ｺ蜴るｻ倩ｮ､蛟ｼ荳企忠豁ｻ霑・ｸ｡縲∝ｹｳ貊台ｸ朱怫蜉ｨ縲・ * @returns 髟懷､ｴ蜿よ焚縲・ */
function makeConfig(): ICameraConfig {
    return { ...DEFAULT_RENDER_CONFIG.camera, ...TEST_OVERRIDES };
}

/**
 * 譫・荳谺｡譖ｴ譁ｰ霎灘・縲・ * @param points 諡溷粋轤ｹ・育ｩｺ謨ｰ扈・= 蜈ｨ譎ｯ・峨・ * @param shakeImpulsePx 譛ｬ蟶ｧ髴・勘蜀ｲ驥擾ｼ亥ワ邏・峨・ * @param battleWeight 譛ｬ蟶ｧ謌俶沫譚・㍾・亥ｭ俶ｴｻ謌仙遭遲臥ｺｧ蜥鯉ｼ会ｼ碁ｻ倩ｮ､ 0縲・ * @returns 髟懷､ｴ霎灘・縲・ */
function makeInput(
    points: readonly IVec2[],
    shakeImpulsePx = 0,
    battleWeight = 0
): ICameraUpdateInput {
    return {
        viewport: VIEWPORT,
        bounds: BOUNDS,
        points,
        shakeImpulsePx,
        battleWeight
    };
}

/**
 * 逕ｨ荳・`Camera` 逶ｸ蜷檎噪譛画譜譛蟆冗ｼｩ謾ｾ蜿｣蠕・ｮ｡邂玲悄譛帷噪謌俶沫譫・崟・・itfall 22・峨・ * @param config 髟懷､ｴ蜿よ焚縲・ * @param points 蜿よ・轤ｹ縲・ * @returns 逶ｮ譬・序謐｢縲・ */
function expectedBattleTransform(
    config: ICameraConfig,
    points: readonly IVec2[]
): ICameraTransform {
    const box = fitBox(points, config.coverage, config.minSpanMeters);
    if (box === null) {
        throw new Error('expected a fit box for the battle point set');
    }
    const panoramic = strategicTransform(BOUNDS, VIEWPORT, config).scale;
    return fitTransform(box, VIEWPORT, {
        ...config,
        minScale: Math.min(config.minScale, panoramic)
    });
}

/**
 * 譁ｭ險蜿俶困逧・ｺ比ｸｪ蛻・㍼驛ｽ譏ｯ譛蛾剞謨ｰ縲・ * @param transform 蠕・｣譟･逧・序謐｢縲・ */
function expectFiniteTransform(transform: ICameraTransform): void {
    for (const value of [
        transform.centerX,
        transform.centerY,
        transform.scale,
        transform.shakeX,
        transform.shakeY
    ]) {
        expect(Number.isFinite(value)).toBe(true);
    }
}

describe('render/Camera 窶・reset is the only instant jump', () => {
    it('returns the panoramic composition and reports Strategic', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        const transform = camera.reset(BOUNDS, VIEWPORT);

        expect(camera.getMode()).toBe(CameraMode.Strategic);
        expect(camera.getBattleTarget()).toBeUndefined();
        expect(transform).toEqual(strategicTransform(BOUNDS, VIEWPORT, config));
        expect(camera.getTransform()).toEqual(transform);
    });

    it('starts from a defined finite transform before the first update', () => {
        const camera = new Camera(makeConfig());

        expectFiniteTransform(camera.getTransform());
        expect(camera.getMode()).toBe(CameraMode.Strategic);
        expect(camera.getBattleTarget()).toBeUndefined();
    });
});

describe('render/Camera 窶・target changes never teleport', () => {
    it('leaves the current transform untouched when a target is set', () => {
        const camera = new Camera(makeConfig());
        const before = camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(7);

        expect(camera.getTransform()).toEqual(before);
        expect(camera.getBattleTarget()).toBe(7);
        expect(camera.getMode()).toBe(CameraMode.BattleFocus);
    });

    it('lands exactly on the target on the zoomFrames-th update', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        const start = camera.reset(BOUNDS, VIEWPORT);
        const target = expectedBattleTransform(config, BATTLE_POINTS);
        camera.setBattleTarget(7);

        const first = camera.update(makeInput(BATTLE_POINTS));
        // 鬥門ｸｧ蜊ｳ蜷梧慮蜷醍岼譬・耳霑幢ｼ壻ｸ崎ｷｳ蜿伜芦逶ｮ譬・ｼ御ｹ滉ｸ咲ｩｺ霓ｬ蝨ｨ襍ｷ轤ｹ縲・        expect(first.centerX).toBeLessThan(start.centerX);
        expect(first.centerX).toBeGreaterThan(target.centerX);
        expect(first.scale).toBeGreaterThan(start.scale);
        expect(first.scale).toBeLessThan(target.scale);

        const frames: ICameraTransform[] = [first];
        for (let frame = 2; frame <= ENTRY_FRAMES; frame += 1) {
            frames.push(camera.update(makeInput(BATTLE_POINTS)));
        }
        expect(frames).toHaveLength(ENTRY_FRAMES);

        const penultimate = frames[ENTRY_FRAMES - 2];
        expect(Math.abs(penultimate.scale - target.scale)).toBeGreaterThan(
            1e-6
        );

        const last = frames[ENTRY_FRAMES - 1];
        expect(last.centerX).toBeCloseTo(target.centerX, 6);
        expect(last.centerY).toBeCloseTo(target.centerY, 6);
        expect(last.scale).toBeCloseTo(target.scale, 6);
        expect(camera.getMode()).toBe(CameraMode.BattleFocus);
    });

    it('moves centre and scale in the same frame, never in two phases', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        const start = camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(7);

        const frames: ICameraTransform[] = [];
        for (let frame = 0; frame < ENTRY_FRAMES; frame += 1) {
            frames.push(camera.update(makeInput(BATTLE_POINTS)));
        }

        // 鬥門ｸｧ蟆ｱ蟾ｲ遖ｻ蠑蜈ｨ譎ｯ蠢ｫ辣ｧ・壻ｸｭ蠢・ｸ守ｼｩ謾ｾ蜷梧慮蠑蟋区耳霑幢ｼ梧ｲ｡譛我ｸ荳ｪ窶懷宵蟷ｳ遘ｻ窶晉噪谿ｵ縲・        expect(frames[0].centerX).toBeLessThan(start.centerX);
        expect(frames[0].scale).toBeGreaterThan(start.scale);

        for (let index = 1; index < ENTRY_FRAMES - 1; index += 1) {
            expect(frames[index].centerX).toBeLessThan(
                frames[index - 1].centerX
            );
            expect(frames[index].scale).toBeGreaterThan(
                frames[index - 1].scale
            );
        }
    });

    it('never moves further in one frame than the remaining distance', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        let previous = camera.reset(BOUNDS, VIEWPORT);
        const target = expectedBattleTransform(config, BATTLE_POINTS);
        camera.setBattleTarget(7);

        for (let frame = 0; frame < ENTRY_FRAMES; frame += 1) {
            const next = camera.update(makeInput(BATTLE_POINTS));
            const remaining = Math.hypot(
                target.centerX - previous.centerX,
                target.centerY - previous.centerY
            );
            const moved = Math.hypot(
                next.centerX - previous.centerX,
                next.centerY - previous.centerY
            );

            expectFiniteTransform(next);
            expect(moved).toBeLessThanOrEqual(remaining + 1e-9);
            previous = next;
        }
    });

    it('does not restart the transition for an unchanged target', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);
        const target = expectedBattleTransform(config, BATTLE_POINTS);
        camera.setBattleTarget(7);

        const first = camera.update(makeInput(BATTLE_POINTS));
        const second = camera.update(makeInput(BATTLE_POINTS));
        camera.setBattleTarget(7);
        const third = camera.update(makeInput(BATTLE_POINTS));

        expect(first.centerX).toBeGreaterThan(target.centerX);
        expect(third.centerX).toBeLessThan(second.centerX);
        expect(third.centerX).toBeGreaterThan(target.centerX);
    });
});

describe('render/Camera 窶・mode follows the target, one frame late on pull-back', () => {
    it('stays BattleFocus until the single-phase pull-back lands', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(7);
        for (let frame = 0; frame < ENTRY_FRAMES; frame += 1) {
            camera.update(makeInput(BATTLE_POINTS));
        }
        expect(camera.getMode()).toBe(CameraMode.BattleFocus);

        camera.setBattleTarget(undefined);
        expect(camera.getBattleTarget()).toBeUndefined();
        expect(camera.getMode()).toBe(CameraMode.BattleFocus);

        for (let frame = 1; frame < config.panFrames; frame += 1) {
            camera.update(makeInput([]));
            expect(camera.getMode()).toBe(CameraMode.BattleFocus);
        }

        camera.update(makeInput([]));
        expect(camera.getMode()).toBe(CameraMode.Strategic);
    });

    it('fits the panorama for empty points without flipping the mode', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);

        const transform = camera.update(makeInput([]));

        expect(transform.scale).toBeCloseTo(
            strategicTransform(BOUNDS, VIEWPORT, config).scale,
            9
        );
        expect(camera.getMode()).toBe(CameraMode.Strategic);
    });
});

describe('render/Camera 窶・the pull-back is one simultaneous interpolation', () => {
    /**
     * 謗ｨ霑帛芦荳蝨ｺ謌俶沫逧・ｨｳ諤∵桷蝗ｾ・郁ｿ帛・霑・ｸ｡蟾ｲ關ｽ蝨ｰ・峨・     * @param config 髟懷､ｴ蜿よ焚縲・     * @returns 蟾ｲ霍滓牛謌俶沫 7 逧・復螟ｴ縲・     */
    function focusBattle(config: ICameraConfig): Camera {
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(7);
        for (let frame = 0; frame < ENTRY_FRAMES; frame += 1) {
            camera.update(makeInput(BATTLE_POINTS));
        }
        return camera;
    }

    it('shrinks from the first exit frame and lands on the panorama in panFrames frames', () => {
        const config = makeConfig();
        const camera = focusBattle(config);
        const battle = camera.getTransform();
        const panoramic = strategicTransform(BOUNDS, VIEWPORT, config);
        camera.setBattleTarget(undefined);

        const frames: ICameraTransform[] = [];
        for (let frame = 0; frame < config.panFrames; frame += 1) {
            frames.push(camera.update(makeInput([])));
        }

        // 郛ｩ謾ｾ閾ｪ隨ｬ荳蟶ｧ襍ｷ蟆ｱ謾ｶ郛ｩ・壽立逧・懷・莉･謌俶沫郛ｩ謾ｾ蟷ｳ遘ｻ窶晉ｭｾ蜷堺ｸ榊・蜃ｺ邇ｰ縲・        expect(frames[0].scale).toBeLessThan(battle.scale);
        for (let index = 1; index < frames.length; index += 1) {
            expect(frames[index].scale).toBeLessThan(frames[index - 1].scale);
        }

        const landing = frames[config.panFrames - 1];
        expect(landing.centerX).toBeCloseTo(panoramic.centerX, 6);
        expect(landing.centerY).toBeCloseTo(panoramic.centerY, 6);
        expect(landing.scale).toBeCloseTo(panoramic.scale, 6);
        expect(camera.getTransform()).toEqual(landing);
        expect(camera.getMode()).toBe(CameraMode.Strategic);
    });

    it('moves centre and scale in the same frame, never in two phases', () => {
        const config = makeConfig();
        const camera = focusBattle(config);
        const battle = camera.getTransform();
        const panoramic = strategicTransform(BOUNDS, VIEWPORT, config);
        camera.setBattleTarget(undefined);

        const halfway = Math.ceil(config.panFrames / 2);
        let frame = battle;
        for (let index = 0; index < halfway; index += 1) {
            frame = camera.update(makeInput([]));
        }

        // 荳ｭ轤ｹ螟・ｸｭ蠢・ｷｲ蜷大・譎ｯ謗ｨ霑幢ｼ御ｽ・ｼｩ謾ｾ荵溷ｷｲ遖ｻ蠑謌俶沫郛ｩ謾ｾ窶披比ｸ､閠・酔豁･蜿醍函縲・        expect(frame.centerX).toBeGreaterThan(battle.centerX);
        expect(frame.centerX).toBeLessThan(panoramic.centerX);
        expect(frame.scale).toBeLessThan(battle.scale);
        expect(frame.scale).toBeGreaterThan(panoramic.scale);
    });

    it('ignores battle weight during the exit transition', () => {
        const config = makeConfig();
        const light = focusBattle(config);
        const heavy = focusBattle(config);
        light.setBattleTarget(undefined);
        heavy.setBattleTarget(undefined);

        for (let frame = 0; frame < config.panFrames; frame += 1) {
            const a = light.update(makeInput([], 0, 0));
            const b = heavy.update(makeInput([], 0, 5000));

            expect(a).toEqual(b);
        }
        expect(light.getMode()).toBe(heavy.getMode());
    });
});

describe('render/Camera 窶・battle weight only shortens in-battle tracking', () => {
    /**
     * 霑帛・謌俶沫蜷取滑蜿よ・轤ｹ謨ｴ菴灘ｹｳ遘ｻ 40 邀ｳ・悟・霍滄囂闍･蟷ｲ蟶ｧ・瑚ｿ泌屓譛扈亥序謐｢縲・     * @param config 髟懷､ｴ蜿よ焚縲・     * @param battleWeight 豈丞ｸｧ莨蜈･逧・・譁玲揀驥阪・     * @param frames 遞ｳ諤∬ｷ滄囂譌ｶ髟ｿ・郁ｾ灘・蟶ｧ・峨・     * @returns 霍滄囂譌ｶ髟ｿ扈捺據譌ｶ逧・序謐｢縲・     */
    function followMovingBattle(
        config: ICameraConfig,
        battleWeight: number,
        frames: number
    ): ICameraTransform {
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(7);
        for (let frame = 0; frame < ENTRY_FRAMES; frame += 1) {
            camera.update(makeInput(BATTLE_POINTS, 0, battleWeight));
        }
        const moved = BATTLE_POINTS.map(point => ({
            x: point.x + 40,
            y: point.y
        }));
        let transform = camera.getTransform();
        for (let frame = 0; frame < frames; frame += 1) {
            transform = camera.update(makeInput(moved, 0, battleWeight));
        }
        return transform;
    }

    it('converges to a moving battle centre faster with a larger weight', () => {
        const config = makeConfig();
        const target = expectedBattleTransform(
            config,
            BATTLE_POINTS.map(point => ({ x: point.x + 40, y: point.y }))
        );
        const light = followMovingBattle(config, 0, 3);
        const heavy = followMovingBattle(config, 200, 3);

        expect(Math.abs(heavy.centerX - target.centerX)).toBeLessThan(
            Math.abs(light.centerX - target.centerX)
        );
    });

    it('keeps the configured smoothing at weight 0', () => {
        const config = makeConfig();
        const steady = followMovingBattle(config, 0, 0);
        const configTarget = expectedBattleTransform(
            config,
            BATTLE_POINTS.map(point => ({ x: point.x + 40, y: point.y }))
        );
        const expected = trackTransform(steady, configTarget, config);

        const actual = followMovingBattle(config, 0, 1);

        expect(actual.centerX).toBeCloseTo(expected.centerX, 9);
        expect(actual.centerY).toBeCloseTo(expected.centerY, 9);
        expect(actual.scale).toBeCloseTo(expected.scale, 9);
    });

    it('leaves the entry timeline untouched by battle weight', () => {
        const config = makeConfig();
        const light = new Camera(config);
        const heavy = new Camera(config);
        light.reset(BOUNDS, VIEWPORT);
        heavy.reset(BOUNDS, VIEWPORT);
        light.setBattleTarget(7);
        heavy.setBattleTarget(7);

        for (let frame = 0; frame < ENTRY_FRAMES; frame += 1) {
            const a = light.update(makeInput(BATTLE_POINTS, 0, 0));
            const b = heavy.update(makeInput(BATTLE_POINTS, 0, 5000));

            expect(a).toEqual(b);
        }
        expect(light.getMode()).toBe(CameraMode.BattleFocus);
        expect(light.getTransform()).toEqual(heavy.getTransform());
    });
});

describe('render/Camera 窶・shake is capped, decayed and deterministic', () => {
    it('emits no offset at all under the shipped default config', () => {
        const camera = new Camera(DEFAULT_RENDER_CONFIG.camera);
        camera.reset(BOUNDS, VIEWPORT);

        const frame = camera.update(makeInput([], 1000));

        expect(DEFAULT_RENDER_CONFIG.camera.shakeAmplitudePx).toBe(0);
        expect(Math.abs(frame.shakeX)).toBe(0);
        expect(Math.abs(frame.shakeY)).toBe(0);
    });

    it('clamps an oversized impulse to the configured amplitude', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);

        const frame = camera.update(makeInput([], 1000));
        const magnitude = Math.hypot(frame.shakeX, frame.shakeY);

        expect(Math.abs(frame.shakeX)).toBeLessThanOrEqual(
            config.shakeAmplitudePx + 1e-9
        );
        expect(Math.abs(frame.shakeY)).toBeLessThanOrEqual(
            config.shakeAmplitudePx + 1e-9
        );
        expect(magnitude).toBeLessThanOrEqual(config.shakeAmplitudePx + 1e-9);
        expect(magnitude).toBeGreaterThan(0);
    });

    it('decays monotonically once impulses stop', () => {
        const camera = new Camera(makeConfig());
        camera.reset(BOUNDS, VIEWPORT);

        const first = camera.update(makeInput([], 1000));
        let previous = Math.hypot(first.shakeX, first.shakeY);
        for (let frame = 0; frame < 5; frame += 1) {
            const next = camera.update(makeInput([]));
            const magnitude = Math.hypot(next.shakeX, next.shakeY);

            expect(magnitude).toBeLessThanOrEqual(previous + 1e-12);
            previous = magnitude;
        }
        expect(previous).toBeLessThan(Math.hypot(first.shakeX, first.shakeY));
    });

    it('returns identical transforms for identical frame sequences', () => {
        const config = makeConfig();
        const left = new Camera(config);
        const right = new Camera(config);
        left.reset(BOUNDS, VIEWPORT);
        right.reset(BOUNDS, VIEWPORT);
        left.setBattleTarget(3);
        right.setBattleTarget(3);

        for (const impulse of [1000, 0, 500, 0, 0, 0]) {
            const a = left.update(makeInput(BATTLE_POINTS, impulse));
            const b = right.update(makeInput(BATTLE_POINTS, impulse));

            expect(a).toEqual(b);
        }
    });
});

describe('render/Camera 窶・degenerate input stays finite', () => {
    it('emits finite transforms for NaN points, zero viewport and empty points', () => {
        const camera = new Camera(makeConfig());
        camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(1);

        const inputs: readonly ICameraUpdateInput[] = [
            {
                viewport: VIEWPORT,
                bounds: BOUNDS,
                points: [{ x: Number.NaN, y: Number.NaN }],
                shakeImpulsePx: Number.NaN,
                battleWeight: Number.NaN
            },
            {
                viewport: { width: 0, height: 0 },
                bounds: BOUNDS,
                points: [],
                shakeImpulsePx: 0,
                battleWeight: -5
            },
            {
                viewport: VIEWPORT,
                bounds: { width: 0, height: 0 },
                points: [{ x: 1, y: 1 }],
                shakeImpulsePx: Number.POSITIVE_INFINITY,
                battleWeight: Number.POSITIVE_INFINITY
            }
        ];

        for (const input of inputs) {
            const transform = camera.update(input);

            expectFiniteTransform(transform);
            expect(transform).toEqual(camera.getTransform());
            expect(transform.scale).toBeGreaterThan(0);
        }
    });
});
