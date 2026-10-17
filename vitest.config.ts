import { defineConfig } from 'vitest/config';
import { join } from 'path';

export default defineConfig({
    test: {
        /* Phase 1 是无头的：Node 环境恰好对应；本阶段无物理 setup。 */
        environment: 'node',
        include: ['tests/**/*.test.ts']
        /* 本期刻意不配置覆盖率：既未声明对应的覆盖率插件依赖，也没有 test:coverage
           脚本（D-08 只要求 Vitest 本身）——此前遗留的覆盖率条目会引用一个未安装的
           依赖，属悬空配置。日后若确需覆盖率，须先补齐插件依赖与脚本，二者齐备后
           再一并启用，避免再次出现引用缺失依赖的配置。 */
    },
    /* 独立的 vitest.config.ts 不会继承 vite.config.ts 的别名，
       故此处显式为 `@` 映射到 src/（与 vite.config.ts 一致），
       否则 `@/units/...` 导入在 Vitest 下无法解析。 */
    resolve: {
        alias: {
            '@': join(process.cwd(), 'src')
        }
    }
});
