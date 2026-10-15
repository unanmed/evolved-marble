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
    eslintPluginPrettierRecommended
);
