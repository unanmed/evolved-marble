import { defineConfig } from 'vite';
import jsx from '@vitejs/plugin-vue-jsx';
import { join } from 'path';

const custom = [
    'container',
    'image',
    'sprite',
    'shader',
    'text',
    'comment',
    'custom',
    'container-custom'
];

export default defineConfig({
    plugins: [
        jsx({
            isCustomElement: tag => {
                return custom.includes(tag) || tag.startsWith('g-');
            }
        })
    ],
    base: './',
    server: {
        port: 8074,
        proxy: {
            '/upload-chunk': 'http://localhost:8076',
            '/end-chunk': 'http://localhost:8076',
            '/ping-chunk': 'http://localhost:8076'
        }
    },
    resolve: {
        alias: {
            '@': join(process.cwd(), 'src')
        }
    }
});
