import { defineConfig } from 'vite';
import { join } from 'path';

export default defineConfig({
    base: './',
    server: {
        port: 8074
    },
    resolve: {
        alias: {
            '@': join(process.cwd(), 'src')
        }
    }
});
