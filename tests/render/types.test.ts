import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Container } from 'pixi.js';
import type { IUnitCatalog } from '@/control/types';
import { CityKind } from '@/kingdom/types';
import type { IMapBounds, IWorld } from '@/kingdom/types';
import { ColliderPart } from '@/physics/types';
import type {
    IPhysicsGeometry,
    IPhysicsWorld,
    IUnitState
} from '@/physics/types';
import { ArmorKind, ClassKind, WeaponKind } from '@/units/types';

// 从 `@/render/types` 导入枚举值：该导入本身就是别名解析的证明，
// 并会传递性解析 `@/kingdom/types`、`@/control/types`、`@/physics/types` 与 `@/units/types`。
import { CameraMode } from '@/render/types';
import type {
    ICamera,
    ICameraConfig,
    ICameraTransform,
    ICameraUpdateInput,
    ICullQuery,
    IDamageFeed,
    IEffectsConfig,
    IFitBox,
    IHud,
    IHudConfig,
    IHudFrame,
    IHudTimers,
    IHudUnitState,
    IRenderConfig,
    IRenderDamageEvent,
    IRenderPalette,
    IRenderServices,
    IRenderer,
    IScreenPoint,
    IStrategicArmyMarker,
    IStrategicCityMarker,
    IStrategicFrame,
    IUnitView,
    IUnitViewFactory,
    IUnitViewSpec,
    IUnitViewState,
    IUnitVisualSpec,
    IViewport,
    RenderServicesProvider,
    UnitStateLookup
} from '@/render/types';

/** 构造一帧镜头变换；震动偏移默认归零。 */
function makeCameraTransform(shakeX = 0, shakeY = 0): ICameraTransform {
    return { centerX: 500, centerY: 500, scale: 4, shakeX, shakeY };
}

/** 构造一个单位的 HUD 数据。 */
function makeHudUnit(unitId = 101): IHudUnitState {
    return {
        unitId,
        x: 120,
        y: 130,
        factionColor: 0xcc2222,
        healthRatio: 0.75,
        level: 3,
        healthVisible: true,
        hudScale: 1
    };
}

/** 构造一条命中的伤害事件（武器/防具均为缺失字面量）。 */
function makeDamageEvent(): IRenderDamageEvent {
    return {
        attackerId: 101,
        defenderId: 202,
        attackerTeamId: 1,
        defenderTeamId: 2,
        damage: 64,
        defenderPart: ColliderPart.Body,
        weaponKind: undefined,
        armorKind: undefined,
        x: 220,
        y: 240,
        level: 2,
        killed: false
    };
}

/** 构造调色板（暗底高饱和基调，D-05）。 */
function makePalette(): IRenderPalette {
    return {
        background: 0x11131a,
        mapFloor: 0x1b202b,
        grid: 0x242a36,
        terrain: 0x2c3340,
        text: 0xf2f5fa,
        healthBackground: 0x2a2f3a,
        healthBorder: 0x0b0d12,
        weapon: 0xd7dde8,
        armor: 0x9aa4b2,
        flash: 0xffffff,
        neutral: 0x8a8f98
    };
}

/** 构造镜头参数（coverage 为目标构图比例，D-21）。 */
function makeCameraConfig(): ICameraConfig {
    return {
        paddingPx: 24,
        coverage: 0.9,
        minSpanMeters: 20,
        minScale: 1,
        maxScale: 40,
        smoothingFrames: 12,
        switchFrames: 30,
        shakeAmplitudePx: 6,
        shakeDecayPerFrame: 0.85
    };
}

/** 构造 HUD 参数：15 秒血条、少于 6 单位常亮、混合缩放阈值（D-07/D-09）。 */
function makeHudConfig(): IHudConfig {
    return {
        healthBarSeconds: 15,
        alwaysVisibleBelowUnits: 6,
        barWorldWidth: 1.2,
        barWorldHeight: 0.16,
        barOffsetY: -0.8,
        screenBarWidthPx: 48,
        screenScaleAt: 8,
        worldScaleAt: 3,
        levelWorldHeight: 0.7,
        infoMarginPx: 24,
        infoFontSizePx: 28
    };
}

/** 构造反馈预算（D-06/D-10）。 */
function makeEffectsConfig(): IEffectsConfig {
    return {
        damageNumberThreshold: 50,
        damageNumberWorldHeight: 1.1,
        damageNumberLifetimeFrames: 45,
        damageNumberRiseMetersPerFrame: 0.02,
        maxDamageNumbers: 64,
        maxParticles: 256,
        particlesPerHit: 6,
        particleLifetimeFrames: 18,
        maxDeathEffects: 32,
        deathEffectLifetimeFrames: 30,
        flashFrames: 3,
        shakeDamageThreshold: 40
    };
}

/** 构造完整渲染配置；几何数值必须与物理默认值一致。 */
function makeRenderConfig(): IRenderConfig {
    const geometry: IPhysicsGeometry = {
        bodyRadius: 0.5,
        weaponHalfLength: 0.4,
        weaponRadius: 0.05,
        weaponOffsetX: 0.7,
        armorRadius: 0.55
    };
    return {
        width: 1920,
        height: 1080,
        outputFps: 30,
        frameDelayMs: 0,
        factionColors: { 1: 0xcc2222, 2: 0x2244cc },
        geometry,
        palette: makePalette(),
        camera: makeCameraConfig(),
        hud: makeHudConfig(),
        effects: makeEffectsConfig()
    };
}

describe('render types — numeric CameraMode enum', () => {
    it('pins Strategic = 0 and BattleFocus = 1', () => {
        expect(CameraMode.Strategic).toBe(0);
        expect(CameraMode.BattleFocus).toBe(1);
    });

    it('has exactly two integral, distinct members', () => {
        const members: readonly number[] = [
            CameraMode.Strategic,
            CameraMode.BattleFocus
        ];
        expect(members).toHaveLength(2);
        for (const member of members) {
            expect(Number.isInteger(member)).toBe(true);
        }
        expect(new Set<number>(members).size).toBe(2);
    });
});

describe('render types — IRenderer paints one frame on demand', () => {
    it('pins the five members and their signatures', () => {
        expectTypeOf<keyof IRenderer>().toEqualTypeOf<
            'renderFrame' | 'getCanvas' | 'getCamera' | 'reset' | 'dispose'
        >();
        expectTypeOf<IRenderer['renderFrame']>().parameters.toEqualTypeOf<[]>();
        expectTypeOf<IRenderer['renderFrame']>().returns.toEqualTypeOf<void>();
        expectTypeOf<
            IRenderer['getCanvas']
        >().returns.toEqualTypeOf<HTMLCanvasElement>();
        expectTypeOf<IRenderer['getCamera']>().returns.toEqualTypeOf<ICamera>();
        expectTypeOf<IRenderer['reset']>().returns.toEqualTypeOf<void>();
        expectTypeOf<IRenderer['dispose']>().returns.toEqualTypeOf<void>();
    });
});

describe('render types — ICamera derives its mode from the target', () => {
    it('pins exactly six methods and no independent mode setter', () => {
        expectTypeOf<keyof ICamera>().toEqualTypeOf<
            | 'setBattleTarget'
            | 'getBattleTarget'
            | 'getMode'
            | 'update'
            | 'getTransform'
            | 'reset'
        >();
        expectTypeOf<ICamera['setBattleTarget']>()
            .parameter(0)
            .toEqualTypeOf<number | undefined>();
        expectTypeOf<
            ICamera['setBattleTarget']
        >().returns.toEqualTypeOf<void>();
        expectTypeOf<ICamera['getBattleTarget']>().returns.toEqualTypeOf<
            number | undefined
        >();
        expectTypeOf<ICamera['getMode']>().returns.toEqualTypeOf<CameraMode>();
        expectTypeOf<ICamera['update']>()
            .parameter(0)
            .toEqualTypeOf<ICameraUpdateInput>();
        expectTypeOf<
            ICamera['update']
        >().returns.toEqualTypeOf<ICameraTransform>();
        expectTypeOf<
            ICamera['getTransform']
        >().returns.toEqualTypeOf<ICameraTransform>();
        expectTypeOf<ICamera['reset']>().parameters.toEqualTypeOf<
            [IMapBounds, IViewport]
        >();
        expectTypeOf<
            ICamera['reset']
        >().returns.toEqualTypeOf<ICameraTransform>();
    });

    it('pins the update input and the declared shake writer', () => {
        expectTypeOf<keyof ICameraUpdateInput>().toEqualTypeOf<
            'viewport' | 'bounds' | 'points' | 'shakeImpulsePx'
        >();
        expectTypeOf<
            ICameraUpdateInput['shakeImpulsePx']
        >().toEqualTypeOf<number>();
        expectTypeOf<ICameraTransform['shakeX']>().toEqualTypeOf<number>();
        expectTypeOf<ICameraTransform['shakeY']>().toEqualTypeOf<number>();
    });
});

describe('render types — replaceable unit visual seam', () => {
    it('pins IUnitView and IUnitViewFactory signatures', () => {
        expectTypeOf<keyof IUnitView>().toEqualTypeOf<
            'getRoot' | 'apply' | 'destroy'
        >();
        expectTypeOf<IUnitView['getRoot']>().returns.toEqualTypeOf<Container>();
        expectTypeOf<IUnitView['apply']>()
            .parameter(0)
            .toEqualTypeOf<IUnitViewState>();
        expectTypeOf<IUnitView['apply']>().returns.toEqualTypeOf<void>();
        expectTypeOf<IUnitView['destroy']>().returns.toEqualTypeOf<void>();
        expectTypeOf<keyof IUnitViewFactory>().toEqualTypeOf<
            'create' | 'dispose'
        >();
        expectTypeOf<IUnitViewFactory['create']>()
            .parameter(0)
            .toEqualTypeOf<IUnitViewSpec>();
        expectTypeOf<
            IUnitViewFactory['create']
        >().returns.toEqualTypeOf<IUnitView>();
        expectTypeOf<
            IUnitViewFactory['dispose']
        >().returns.toEqualTypeOf<void>();
    });
});

describe('render types — IHud draws one frame', () => {
    it('pins the HUD signatures and the frame-keyed timers map', () => {
        expectTypeOf<keyof IHud>().toEqualTypeOf<
            'update' | 'reset' | 'dispose'
        >();
        expectTypeOf<IHud['update']>().parameter(0).toEqualTypeOf<IHudFrame>();
        expectTypeOf<IHud['update']>().returns.toEqualTypeOf<void>();
        expectTypeOf<IHud['reset']>().returns.toEqualTypeOf<void>();
        expectTypeOf<IHud['dispose']>().returns.toEqualTypeOf<void>();
        expectTypeOf<IHudTimers['visibleUntil']>().toEqualTypeOf<
            Map<number, number>
        >();
    });
});

describe('render types — damage feed and type aliases', () => {
    it('pins IDamageFeed, UnitStateLookup and RenderServicesProvider', () => {
        expectTypeOf<keyof IDamageFeed>().toEqualTypeOf<'drain' | 'clear'>();
        expectTypeOf<IDamageFeed['drain']>().parameters.toEqualTypeOf<[]>();
        expectTypeOf<IDamageFeed['drain']>().returns.toEqualTypeOf<
            readonly IRenderDamageEvent[]
        >();
        expectTypeOf<IDamageFeed['clear']>().returns.toEqualTypeOf<void>();
        expectTypeOf<UnitStateLookup>().toEqualTypeOf<
            (unitId: number) => IUnitState | null
        >();
        expectTypeOf<UnitStateLookup>().parameter(0).toEqualTypeOf<number>();
        expectTypeOf<UnitStateLookup>().returns.toEqualTypeOf<IUnitState | null>();
        expectTypeOf<RenderServicesProvider>().toEqualTypeOf<
            () => IRenderServices
        >();
    });
});

describe('render types — IRenderServices consumes the frozen upstreams', () => {
    it('pins the four read-only dependencies to their upstream types', () => {
        expectTypeOf<keyof IRenderServices>().toEqualTypeOf<
            'world' | 'catalog' | 'physics' | 'damageFeed'
        >();
        expectTypeOf<IRenderServices['world']>().toEqualTypeOf<IWorld>();
        expectTypeOf<
            IRenderServices['catalog']
        >().toEqualTypeOf<IUnitCatalog>();
        expectTypeOf<
            IRenderServices['physics']
        >().toEqualTypeOf<IPhysicsWorld>();
        expectTypeOf<
            IRenderServices['damageFeed']
        >().toEqualTypeOf<IDamageFeed>();
    });
});

describe('render types — IRenderDamageEvent carries the death seam', () => {
    it('pins the exact key set and the absent-literal fields', () => {
        expectTypeOf<keyof IRenderDamageEvent>().toEqualTypeOf<
            | 'attackerId'
            | 'defenderId'
            | 'attackerTeamId'
            | 'defenderTeamId'
            | 'damage'
            | 'defenderPart'
            | 'weaponKind'
            | 'armorKind'
            | 'x'
            | 'y'
            | 'level'
            | 'killed'
        >();
        expectTypeOf<IRenderDamageEvent['weaponKind']>().toEqualTypeOf<
            WeaponKind | undefined
        >();
        expectTypeOf<IRenderDamageEvent['armorKind']>().toEqualTypeOf<
            ArmorKind | undefined
        >();
        expectTypeOf<IRenderDamageEvent['damage']>().toEqualTypeOf<number>();
        expectTypeOf<IRenderDamageEvent['x']>().toEqualTypeOf<number>();
        expectTypeOf<IRenderDamageEvent['y']>().toEqualTypeOf<number>();
        expectTypeOf<IRenderDamageEvent['level']>().toEqualTypeOf<number>();
        expectTypeOf<
            IRenderDamageEvent['defenderPart']
        >().toEqualTypeOf<ColliderPart>();
        expectTypeOf<IRenderDamageEvent['killed']>().toEqualTypeOf<boolean>();
    });

    it('accepts a complete damage literal with the pre-removal position', () => {
        const event = makeDamageEvent();
        expect(event.damage).toBe(64);
        expect(event.weaponKind).toBeUndefined();
        expect(event.armorKind).toBeUndefined();
        expect(event.killed).toBe(false);
        expect(event.x).toBe(220);
        expectTypeOf(event).toEqualTypeOf<IRenderDamageEvent>();
    });
});

describe('render types — IRenderConfig is the single tuning entry', () => {
    it('pins the exact key set and the nested config types', () => {
        expectTypeOf<keyof IRenderConfig>().toEqualTypeOf<
            | 'width'
            | 'height'
            | 'outputFps'
            | 'frameDelayMs'
            | 'factionColors'
            | 'geometry'
            | 'palette'
            | 'camera'
            | 'hud'
            | 'effects'
        >();
        expectTypeOf<IRenderConfig['factionColors']>().toEqualTypeOf<
            Readonly<Record<number, number>>
        >();
        expectTypeOf<
            IRenderConfig['geometry']
        >().toEqualTypeOf<IPhysicsGeometry>();
        expectTypeOf<
            IRenderConfig['palette']
        >().toEqualTypeOf<IRenderPalette>();
        expectTypeOf<IRenderConfig['camera']>().toEqualTypeOf<ICameraConfig>();
        expectTypeOf<IRenderConfig['hud']>().toEqualTypeOf<IHudConfig>();
        expectTypeOf<
            IRenderConfig['effects']
        >().toEqualTypeOf<IEffectsConfig>();
        expectTypeOf<IRenderConfig['outputFps']>().toEqualTypeOf<number>();
        expectTypeOf<IRenderConfig['frameDelayMs']>().toEqualTypeOf<number>();
    });

    it('accepts a complete config literal using the physics footprint', () => {
        const config = makeRenderConfig();
        expect(config.width).toBe(1920);
        expect(config.height).toBe(1080);
        expect(config.geometry.bodyRadius).toBe(0.5);
        expect(config.geometry.weaponHalfLength).toBe(0.4);
        expect(config.geometry.weaponRadius).toBe(0.05);
        expect(config.geometry.weaponOffsetX).toBe(0.7);
        expect(config.geometry.armorRadius).toBe(0.55);
        expect(config.factionColors[1]).toBe(0xcc2222);
        expectTypeOf(config).toEqualTypeOf<IRenderConfig>();
    });
});

describe('render types — sub-configs and palette', () => {
    it('pins the decision-critical threshold fields', () => {
        expectTypeOf<ICameraConfig['coverage']>().toEqualTypeOf<number>();
        expectTypeOf<IHudConfig['healthBarSeconds']>().toEqualTypeOf<number>();
        expectTypeOf<
            IHudConfig['alwaysVisibleBelowUnits']
        >().toEqualTypeOf<number>();
        expectTypeOf<
            IEffectsConfig['damageNumberThreshold']
        >().toEqualTypeOf<number>();

        expect(makeCameraConfig().coverage).toBe(0.9);
        expect(makeHudConfig().healthBarSeconds).toBe(15);
        expect(makeHudConfig().alwaysVisibleBelowUnits).toBe(6);
        expect(makeEffectsConfig().damageNumberThreshold).toBe(50);
    });

    it('types every palette field as 0xRRGGBB number', () => {
        expectTypeOf<IRenderPalette['background']>().toEqualTypeOf<number>();
        expectTypeOf<IRenderPalette['mapFloor']>().toEqualTypeOf<number>();
        expectTypeOf<IRenderPalette['grid']>().toEqualTypeOf<number>();
        expectTypeOf<IRenderPalette['terrain']>().toEqualTypeOf<number>();
        expectTypeOf<IRenderPalette['text']>().toEqualTypeOf<number>();
        expectTypeOf<
            IRenderPalette['healthBackground']
        >().toEqualTypeOf<number>();
        expectTypeOf<IRenderPalette['healthBorder']>().toEqualTypeOf<number>();
        expectTypeOf<IRenderPalette['weapon']>().toEqualTypeOf<number>();
        expectTypeOf<IRenderPalette['armor']>().toEqualTypeOf<number>();
        expectTypeOf<IRenderPalette['flash']>().toEqualTypeOf<number>();
        expectTypeOf<IRenderPalette['neutral']>().toEqualTypeOf<number>();

        expect(makePalette().flash).toBe(0xffffff);
    });
});

describe('render types — pure camera and HUD data shapes', () => {
    it('accepts complete literals for every per-frame shape', () => {
        const viewport: IViewport = { width: 1920, height: 1080 };
        const screenPoint: IScreenPoint = { x: 10, y: 20 };
        const fitBox: IFitBox = { minX: 400, maxX: 600, minY: 400, maxY: 600 };
        const transform = makeCameraTransform();
        const noShake: ICameraUpdateInput = {
            viewport,
            bounds: { width: 1000, height: 1000 },
            points: [{ x: 450, y: 460 }],
            shakeImpulsePx: 0
        };
        const shaking: ICameraUpdateInput = {
            ...noShake,
            shakeImpulsePx: 4
        };
        const cull: ICullQuery = {
            x: 500,
            y: 500,
            transform,
            viewport,
            marginMeters: 8
        };
        const hudFrame: IHudFrame = {
            frameIndex: 12,
            viewport,
            camera: transform,
            units: [makeHudUnit()],
            totalUnits: 16,
            damage: [makeDamageEvent()],
            gameMinutes: 1439,
            minutesPerTick: 24
        };

        expect(screenPoint.y).toBe(20);
        expect(fitBox.maxX).toBe(600);
        expect(noShake.shakeImpulsePx).toBe(0);
        expect(shaking.shakeImpulsePx).toBe(4);
        expect(cull.marginMeters).toBe(8);
        expect(hudFrame.units).toHaveLength(1);
        expect(hudFrame.damage).toHaveLength(1);
        expect(hudFrame.totalUnits).toBe(16);
        expectTypeOf<ICullQuery['marginMeters']>().toEqualTypeOf<number>();
    });

    it('accepts one unit entry and one damage event in IHudFrame', () => {
        const frame: IHudFrame = {
            frameIndex: 0,
            viewport: { width: 1920, height: 1080 },
            camera: makeCameraTransform(),
            units: [makeHudUnit(7)],
            totalUnits: 1,
            damage: [makeDamageEvent()],
            gameMinutes: 0,
            minutesPerTick: 24
        };
        expect(frame.frameIndex).toBe(0);
        expect(frame.gameMinutes).toBe(0);
        expect(frame.minutesPerTick).toBe(24);
    });
});

describe('render types — visual spec covers all weapon and armour kinds', () => {
    it('pins the visual spec key set and accepts Hammer + Helmet', () => {
        const armed: IUnitVisualSpec = {
            factionColor: 0xcc2222,
            classKind: ClassKind.Hammer,
            weapon: WeaponKind.Hammer,
            armors: []
        };
        const armoured: IUnitVisualSpec = {
            factionColor: 0x2244cc,
            classKind: ClassKind.Knight,
            weapon: WeaponKind.Longsword,
            armors: [ArmorKind.Helmet, ArmorKind.Shield]
        };

        expectTypeOf<keyof IUnitVisualSpec>().toEqualTypeOf<
            'factionColor' | 'classKind' | 'weapon' | 'armors'
        >();
        expectTypeOf<IUnitVisualSpec['weapon']>().toEqualTypeOf<
            WeaponKind | undefined
        >();
        expectTypeOf<IUnitVisualSpec['armors']>().toEqualTypeOf<
            readonly ArmorKind[]
        >();
        expect(armed.weapon).toBe(WeaponKind.Hammer);
        expect(armoured.armors).toEqual([ArmorKind.Helmet, ArmorKind.Shield]);
    });

    it('pins the view spec and per-frame state key sets', () => {
        const spec: IUnitViewSpec = {
            unitId: 101,
            visual: {
                factionColor: 0xcc2222,
                classKind: ClassKind.Swordsman,
                weapon: WeaponKind.Longsword,
                armors: []
            }
        };
        const state: IUnitViewState = {
            x: 12,
            y: 34,
            angle: 0.5,
            flash: true,
            visible: true
        };

        expectTypeOf<keyof IUnitViewSpec>().toEqualTypeOf<
            'unitId' | 'visual'
        >();
        expectTypeOf<keyof IUnitViewState>().toEqualTypeOf<
            'x' | 'y' | 'angle' | 'flash' | 'visible'
        >();
        expect(spec.unitId).toBe(101);
        expect(state.flash).toBe(true);
    });
});

describe('render types — strategic markers carry no unit ids', () => {
    it('pins both marker key sets and accepts an ownerless-city frame', () => {
        const armyMarker: IStrategicArmyMarker = {
            armyId: 1,
            factionId: 1,
            screen: { x: 210, y: 220 },
            heading: Math.PI / 4,
            strength: 8
        };
        const cityMarker: IStrategicCityMarker = {
            cityId: 10,
            factionId: undefined,
            screen: { x: 150, y: 150 },
            kind: CityKind.Capital
        };
        const frame: IStrategicFrame = {
            armies: [armyMarker],
            cities: [cityMarker]
        };

        expectTypeOf<keyof IStrategicArmyMarker>().toEqualTypeOf<
            'armyId' | 'factionId' | 'screen' | 'heading' | 'strength'
        >();
        expectTypeOf<keyof IStrategicCityMarker>().toEqualTypeOf<
            'cityId' | 'factionId' | 'screen' | 'kind'
        >();
        expectTypeOf<IStrategicCityMarker['factionId']>().toEqualTypeOf<
            number | undefined
        >();

        expect(frame.armies).toHaveLength(1);
        expect(frame.cities[0].factionId).toBeUndefined();
        expect(frame.cities[0].kind).toBe(CityKind.Capital);
    });
});
