import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
    {
        ignores: ['node_modules', 'dist', 'public', 'coverage']
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{js,mjs,cjs}'],
        rules: {
            'no-console': 'warn'
        }
    },
    {
        /* 浏览器全局仅作用于宿主/渲染侧；src/sim 与 src/config 属无头边界（边界规则在 Plan 01-03） */
        files: ['**/*.{js,mjs,cjs,ts,tsx}'],
        ignores: ['src/sim/**', 'src/config/**'],
        languageOptions: {
            globals: {
                ...globals.browser
            }
        }
    },
    {
        files: ['**/*.{ts,tsx}'],
        rules: {
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true
                }
            ],
            '@typescript-eslint/no-namespace': 'off',
            '@typescript-eslint/no-this-alias': 'off',
            'no-console': 'warn',
            eqeqeq: ['error', 'always']
        }
    },
    {
        /* 无头边界（SIM-03 / D-03）：sim/** 不得越层导入，不得引用 DOM/时钟全局，
           不得使用未播种随机（D-02 允许 Math.sin/cos，故**不**禁用 Math 全局，
           只经 no-restricted-properties 禁 Math.random）。与 DOM-free 的
           tsconfig.sim.json 互补：lint 拦截"想得到的导入"，tsconfig 拦截"每一个 DOM 全局"。 */
        files: ['src/sim/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: [
                                '**/render/**',
                                '**/host/**',
                                '**/driver/**',
                                'pixi.js',
                                'pixi.js/*',
                                'node:*'
                            ],
                            message:
                                'sim/ 必须保持无头：禁止导入 render/host/driver/pixi/node。'
                        }
                    ]
                }
            ],
            'no-restricted-globals': [
                'error',
                { name: 'window', message: 'sim/ 无头。' },
                { name: 'document', message: 'sim/ 无头。' },
                {
                    name: 'requestAnimationFrame',
                    message: '节奏控制属于 host/。'
                },
                {
                    name: 'performance',
                    message: '时间即 TickClock，绝不读墙上时钟。'
                },
                { name: 'Date', message: 'sim/ 内禁止墙上时钟。' },
                { name: 'setTimeout', message: 'sim/ 内禁止定时器。' }
            ],
            'no-restricted-properties': [
                'error',
                {
                    object: 'Math',
                    property: 'random',
                    message: '改用 RandomStreams（带种子）。'
                },
                {
                    object: 'Date',
                    property: 'now',
                    message: '改用 TickClock.tick。'
                },
                {
                    object: 'performance',
                    property: 'now',
                    message: '改用 TickClock.tick。'
                }
            ],
            'no-restricted-syntax': [
                'error',
                {
                    selector: "NewExpression[callee.name='Date']",
                    message: 'sim/ 内禁止墙上时钟。'
                }
            ]
        }
    },
    eslintPluginPrettierRecommended
);
