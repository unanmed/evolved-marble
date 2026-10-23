/**
 * 渲染层的源码级边界守卫（Pitfall 17 / T-05-05 / T-05-06 / T-05-28 / V10）。
 * Vitest 跑在 `environment: 'node'` 下，没有 DOM/WebGL：任何一个纯模块在运行时
 * `import 'pixi.js'` 都会让整个 Node 测试套件崩溃，因此这条边界必须由测试永久守住，
 * 而不是靠约定。同时钉住 `src/render/types.ts` 仍在“只含声明”的状态：
 * 一旦有人在契约文件里写类/常量/函数体，类型门禁就名存实亡。
 * 本测试只读文件文本，自身**不导入 Pixi**。
 * 仅本文件需要 Node 的文件系统类型（`tsconfig` 未全局声明 `types: ["node"]`），
 * 故以三斜线指令局部引入，避免为一条测试改动整个项目的类型配置。
 */

/// <reference types="node" />

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/** 必须保持 Pixi-free 的纯模块（相对仓库根）：可在 Node/Vitest 直接测。 */
const PURE_MODULES: readonly string[] = [
    'src/render/constants.ts',
    'src/render/calendar.ts',
    'src/render/cameraMath.ts',
    'src/render/Camera.ts',
    'src/render/frameModel.ts',
    'src/render/hudModel.ts',
    'src/render/DamageTap.ts'
];

/** 允许在运行时引用 Pixi 的适配器文件名后缀；`types.ts` 另有 type-only 许可。 */
const ADAPTER_SUFFIXES: readonly string[] = [
    'View.ts',
    'ViewFactory.ts',
    'Hud.ts',
    'Renderer.ts'
];

/** Pixi 的模块说明符：静态 import/export、动态 import 与 require 都算。 */
const PIXI_IMPORT =
    /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]pixi\.js['"]/;

/** Pixi 的 eval 扩展说明符：引入即在运行时生成代码（T-05-28/V10）。 */
const EVAL_EXTENSION = /pixi\.js\/unsafe-eval/;

/** 由字符串构造/执行代码的调用：`eval(...)` 与 `new Function(...)`。 */
const DYNAMIC_CODE = /(?:\beval\s*\(|new\s+Function\s*\()/;

/** 契约文件必须保留的冻结锚点：类型门禁批准的签名与枚举值。 */
const CONTRACT_ANCHORS: readonly string[] = [
    'export enum CameraMode',
    'Strategic = 0',
    'BattleFocus = 1',
    'getRoot(): Container',
    'renderFrame(): void',
    'drain(): readonly IRenderDamageEvent[]'
];

/**
 * 以 UTF-8 读取仓库内某个源码文件。
 * @param relativePath 相对仓库根的路径（用 `/` 分隔）。
 * @returns 文件全文。
 */
function readSource(relativePath: string): string {
    return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

/**
 * 递归列出目录下全部 `.ts` 文件。
 * @param relativeDir 相对仓库根的目录路径（用 `/` 分隔）。
 * @returns 以 `/` 分隔的相对路径数组（已排序，便于断言稳定）。
 */
function listSourceFiles(relativeDir: string): string[] {
    const root = join(process.cwd(), relativeDir);
    const found: string[] = [];
    const walk = (absoluteDir: string, relative: string): void => {
        for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
            const absolutePath = join(absoluteDir, entry.name);
            const relativePath = `${relative}/${entry.name}`;
            if (entry.isDirectory()) {
                walk(absolutePath, relativePath);
            } else if (entry.name.endsWith('.ts')) {
                found.push(relativePath);
            }
        }
    };
    walk(root, relativeDir);
    return found.sort();
}

/**
 * 列出 `src/render` 下的直接 `.ts` 文件名（不含子目录）。
 * @returns 已排序的文件名数组。
 */
function listRenderFiles(): string[] {
    return readdirSync(join(process.cwd(), 'src/render'), {
        withFileTypes: true
    })
        .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
        .map(entry => entry.name)
        .sort();
}

describe('render/import-boundary — pure modules stay Pixi-free', () => {
    for (const relativePath of PURE_MODULES) {
        it(`keeps ${relativePath} free of any Pixi import`, () => {
            expect(
                PIXI_IMPORT.test(readSource(relativePath)),
                `${relativePath} 必须保持 Pixi-free，否则 Node 测试环境会直接崩溃（Pitfall 17）`
            ).toBe(false);
        });
    }
});

describe('render/import-boundary — only adapters may import Pixi', () => {
    it('restricts Pixi imports to types.ts and the declared adapters', () => {
        const importers = listRenderFiles().filter(fileName =>
            PIXI_IMPORT.test(readSource(`src/render/${fileName}`))
        );
        const unexpected = importers.filter(
            fileName =>
                fileName !== 'types.ts' &&
                !ADAPTER_SUFFIXES.some(suffix => fileName.endsWith(suffix))
        );
        expect(
            unexpected,
            `非适配器文件不得引用 Pixi：${unexpected.join(', ')}`
        ).toEqual([]);
        expect(importers).toContain('types.ts');
        expect(importers).toContain('GeometryUnitView.ts');
        expect(importers).toContain('UnitViewFactory.ts');
    });
});

describe('render/import-boundary — the contract stays declaration-only', () => {
    it('contains no class, no top-level constant and no function body', () => {
        const source = readSource('src/render/types.ts');
        expect(source).not.toContain('export class');
        expect(source).not.toContain('export const');
        expect(source).not.toContain('function ');
        expect(
            /\bnew\s+[A-Za-z_$]/.test(source),
            'types.ts 不得实例化任何对象（T-05-06）'
        ).toBe(false);
    });

    it('references Pixi exactly once, as a type-only Container import', () => {
        const source = readSource('src/render/types.ts');
        expect(
            (source.match(/pixi\.js/g) ?? []).length,
            'types.ts 只允许唯一一次 type-only 的 Pixi 引用（T-05-05）'
        ).toBe(1);
        expect(source).toContain("import type { Container } from 'pixi.js';");
    });

    it('keeps every frozen type-gate anchor', () => {
        const source = readSource('src/render/types.ts');
        const missing = CONTRACT_ANCHORS.filter(
            anchor => !source.includes(anchor)
        );
        expect(missing, `契约锚点缺失：${missing.join(' | ')}`).toEqual([]);
    });
});

describe('render/import-boundary — no runtime code generation', () => {
    it('never imports the Pixi eval extension anywhere under src', () => {
        const offenders = listSourceFiles('src').filter(relativePath =>
            EVAL_EXTENSION.test(readSource(relativePath))
        );
        expect(
            offenders,
            `不得引入 Pixi eval 扩展：${offenders.join(', ')}`
        ).toEqual([]);
    });

    it('never evaluates or constructs code from a string under src/render', () => {
        const offenders = listSourceFiles('src/render').filter(relativePath =>
            DYNAMIC_CODE.test(readSource(relativePath))
        );
        expect(
            offenders,
            `src/render 不得执行字符串代码：${offenders.join(', ')}`
        ).toEqual([]);
    });
});

describe('render/import-boundary — one types.ts per folder', () => {
    it('keeps exactly one types.ts in src/render', () => {
        const typeFiles = listRenderFiles().filter(fileName =>
            fileName.startsWith('types')
        );
        expect(typeFiles).toEqual(['types.ts']);
    });
});

describe('render/import-boundary — renderer initialisation', () => {
    it('initialises Pixi manually, preserves the drawing buffer and validates first', () => {
        const source = readSource('src/render/Renderer.ts');
        expect(
            source,
            '渲染器必须以手动渲染启动，否则隐藏的 ticker 会与 Phase 6 逐帧取图竞争（T-05-32）'
        ).toContain('autoStart: false');
        expect(
            source,
            '必须保留绘制缓冲，否则 Phase 6 取到的 canvas 可能是空帧（T-05-35）'
        ).toContain('preserveDrawingBuffer: true');
        expect(
            source,
            '应用必须经异步 init 创建（v8 起构造函数不再接受选项）'
        ).toContain('await app.init(');
        expect(
            source,
            '每帧恰好一次 app.render()：画一帧就返回（D-17/D-18）'
        ).toContain('app.render()');
        expect(
            source,
            '配置校验必须先于任何 Pixi 分配（T-05-01/T-05-09）'
        ).toContain('validateRenderConfig(');
    });

    it('owns no loop: the renderer schedules nothing', () => {
        const source = readSource('src/render/Renderer.ts');
        const scheduling: readonly string[] = [
            'requestAnimationFrame',
            'setInterval',
            'setTimeout'
        ];
        const found = scheduling.filter(token => source.includes(token));
        expect(
            found,
            `渲染器不得调度任何东西（D-17/D-18）：${found.join(' | ')}`
        ).toEqual([]);
    });
});
