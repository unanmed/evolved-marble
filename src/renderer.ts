import { MotaRenderer, UIController } from '@motajs/client';

export const renderer = new MotaRenderer({
    canvas: '#main',
    width: 1920,
    height: 1080
});
renderer.setHD(true);

function resizeRenderer() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const widthRatio = width / 1920;
    const heightRatio = height / 1080;
    renderer.setScale(Math.min(widthRatio, heightRatio));
}

export function initializeRenderer() {
    window.addEventListener('resize', resizeRenderer);
    resizeRenderer();
}

// 只保留一个场景
export const scene = new UIController('scene');
scene.lastOnly(true);
