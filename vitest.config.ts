import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        /* 模拟核心是无头的：Node 环境恰好对应（D-08 / SIM-03） */
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/sim/**']
        }
    }
});
