/**
 * D-12 代码风格门禁：JSDoc 覆盖的自动化检查。
 *
 * 逐行扫描 `SCAN_ROOTS` 下的每个 `.ts` 文件，对每个顶层 `export` 声明断言其
 * **紧邻前置**的注释块以 `/**` 开头（普通块注释不合格）；对每个导出的 `function`
 * 进一步断言其 JSDoc 含 `@returns`，且当签名带参数时含至少一个 `@param`。
 *
 * 检查是**结构性**的（注释块存在性 + `/**` 开启符 + 标签存在性），因此确定、不抖动；
 * 只依赖 `node:fs` 与 Vitest，不引第三方依赖。
 *
 * 后续计划（01-09 → 01-12）在同步补齐各自目录文档时，逐步扩大 `SCAN_ROOTS`——门禁
 * 绝不在未文档化的文件上变绿。
 */
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 本门禁扫描的根目录集合（相对仓库根）。
 *
 * 最初仅覆盖 Plan 01-07 已补齐文档的最小叶目录；后续 D-12 文档计划
 * （01-09/01-10/01-11/01-12）在补齐各自目录时**同步**追加到此列表，使门禁在任意
 * 时刻都恰好覆盖"已文档化"的集合。
 */
export const SCAN_ROOTS: readonly string[] = [
    'src/sim/core',
    'src/sim/content'
];

/**
 * 匹配顶层 `export` 声明行的正则。
 *
 * 覆盖 `abstract class` 及 `class`/`interface`/`enum`/`function`/`type`/`const`
 * 六类顶层导出声明。
 */
const EXPORT_DECL =
    /^export\s+(abstract\s+)?(class|interface|enum|function|type|const)\b/;

/**
 * 匹配顶层导出 `function` 声明行的正则。
 *
 * 仅函数需要额外的 `@param`/`@returns` 标签检查。
 */
const EXPORT_FUNCTION = /^export\s+function\b/;

/**
 * 单个顶层声明的前置文档块检查结果。
 */
interface IDeclarationCheck {
    /** 最近的前置非空行是否为以 `/**` 开头的合法 JSDoc 块。 */
    readonly hasDocBlock: boolean;
    /** 该 JSDoc 块的全文（含首尾标记行）；无合法块时为空串。 */
    readonly docText: string;
    /** 函数签名首个括号内的参数文本（去首尾空白）；非函数或解析失败时为空串。 */
    readonly paramsText: string;
}

/**
 * 递归列出 `dir` 下所有 `.ts` 文件（确定性排序）。
 *
 * @param dir 目录路径（相对仓库根或绝对）。
 * @returns 该目录（含子目录）下所有 `.ts` 文件的完整路径，按字典序排列。
 */
function listTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listTsFiles(full));
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            out.push(full);
        }
    }
    return out.sort();
}

/**
 * 找到并校验 `declIndex` 前紧邻的注释块是否是以 `/**` 开头的 JSDoc。
 *
 * 规则：从声明向上一行行跳过空行；最近的非空行必须以 `*` 加 `/` 结尾；再向上找到
 * 第一条以 `/*` 开头的行（注释开启行），该行必须以 `/**` 开头。普通块注释与无注释
 * 均返回 `null`。
 *
 * @param lines 文件的全部行（已按行拆分）。
 * @param declIndex 顶层声明的行下标（0 起）。
 * @returns 合法 JSDoc 块的全文（跨行拼接）；否则为 `null`。
 */
function findPrecedingDocBlock(
    lines: readonly string[],
    declIndex: number
): string | null {
    let end = declIndex - 1;
    while (end >= 0 && lines[end].trim() === '') end--;
    if (end < 0) return null;
    if (!lines[end].trim().endsWith('*/')) return null;
    let start = end;
    while (start >= 0 && !lines[start].trim().startsWith('/*')) start--;
    if (start < 0) return null;
    if (!lines[start].trim().startsWith('/**')) return null;
    return lines.slice(start, end + 1).join('\n');
}

/**
 * 提取函数声明首个括号内的参数文本。
 *
 * 从声明行起向下累加文本，找到首个 `(` 与其配对的 `)`，返回二者之间的文本（去首尾
 * 空白）。跨行签名（多行参数列表）同样支持。
 *
 * @param lines 文件的全部行。
 * @param declIndex 函数声明的行下标（0 起）。
 * @returns 参数表文本；无括号或未闭合时返回空串。
 */
function extractParamsText(
    lines: readonly string[],
    declIndex: number
): string {
    let text = '';
    for (let i = declIndex; i < lines.length; i++) {
        text += lines[i];
        const open = text.indexOf('(');
        if (open < 0) continue;
        const close = text.indexOf(')', open);
        if (close < 0) {
            text += ' ';
            continue;
        }
        return text.slice(open + 1, close).trim();
    }
    return '';
}

/**
 * 分析单个顶层导出声明：定位前置文档块、判定合法性，并按需抽取参数表。
 *
 * @param lines 文件的全部行。
 * @param isFunction 该声明是否为导出 `function`（决定是否抽取参数表）。
 * @param declIndex 声明的行下标（0 起）。
 * @returns 该声明的前置文档块检查结果。
 */
function analyzeExport(
    lines: readonly string[],
    isFunction: boolean,
    declIndex: number
): IDeclarationCheck {
    const docText = findPrecedingDocBlock(lines, declIndex);
    return {
        hasDocBlock: docText !== null,
        docText: docText ?? '',
        paramsText: isFunction ? extractParamsText(lines, declIndex) : ''
    };
}

/**
 * 检查单个文件，自上而下收集全部 D-12 违规（确定性顺序）。
 *
 * @param filePath `.ts` 文件的路径。
 * @returns 可读的违规描述数组（含文件、行号与违规声明）；无违规时为空数组。
 */
function checkFile(filePath: string): string[] {
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    const name = relative(process.cwd(), filePath).replace(/\\/g, '/');
    const violations: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (!EXPORT_DECL.test(lines[i])) continue;
        const isFunction = EXPORT_FUNCTION.test(lines[i]);
        const check = analyzeExport(lines, isFunction, i);
        const decl = lines[i].trim();
        if (!check.hasDocBlock) {
            violations.push(
                `${name}:${i + 1}: 顶层导出声明缺少以 /** 开头的 JSDoc —— ${decl}`
            );
            continue;
        }
        if (!isFunction) continue;
        if (!check.docText.includes('@returns')) {
            violations.push(
                `${name}:${i + 1}: 导出函数缺少 @returns —— ${decl}`
            );
        }
        if (check.paramsText !== '' && !check.docText.includes('@param')) {
            violations.push(
                `${name}:${i + 1}: 导出函数有参数但缺少 @param —— ${decl}`
            );
        }
    }
    return violations;
}

/**
 * 扫描全部根目录，收集所有 D-12 违规。
 *
 * @returns 全部违规描述（按根顺序、文件字典序、行号确定性排列）。
 */
function collectViolations(): string[] {
    const violations: string[] = [];
    for (const root of SCAN_ROOTS) {
        for (const file of listTsFiles(root)) {
            violations.push(...checkFile(file));
        }
    }
    return violations;
}

describe('D-12 JSDoc 约定门禁', () => {
    it('扫描根内的每个顶层导出声明都有合法 JSDoc 覆盖', () => {
        const violations = collectViolations();
        expect(violations).toEqual([]);
    });
});

describe('门禁规则自检（红/绿行为）', () => {
    it('接受以 /** 开头的 JSDoc 块', () => {
        const lines = ['/** 文档。 */', 'export function f(): void {}'];
        expect(analyzeExport(lines, true, 1).hasDocBlock).toBe(true);
    });

    it('拒绝仅有普通块注释的声明', () => {
        const lines = ['/* 普通注释。 */', 'export function f(): void {}'];
        expect(analyzeExport(lines, true, 1).hasDocBlock).toBe(false);
    });

    it('拒绝无前置注释的声明', () => {
        const lines = ['export function f(): void {}'];
        expect(analyzeExport(lines, true, 0).hasDocBlock).toBe(false);
    });

    it('识别空参数表与多行参数表', () => {
        const empty = ['export function f(): void {}'];
        expect(analyzeExport(empty, true, 0).paramsText).toBe('');
        const multi = [
            'export function g(',
            '    a: number,',
            '    b: number',
            '): void {}'
        ];
        expect(analyzeExport(multi, true, 0).paramsText).not.toBe('');
    });
});
