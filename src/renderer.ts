import { MotaRenderer, UIController } from '@motajs/client';
import { Recorder } from './utils/record';
import { RecordWriter } from './utils/writer';

export const renderer = new MotaRenderer({
    canvas: '#main',
    width: 1920,
    height: 1080
});

function resizeRenderer() {
    // 固定 1080P
    renderer.setScale(1 / devicePixelRatio);
    // const width = window.innerWidth;
    // const height = window.innerHeight;
    // const widthRatio = width / 1920;
    // const heightRatio = height / 1080;
    // renderer.setScale(Math.min(widthRatio, heightRatio));
}
resizeRenderer();

export function initializeRenderer() {
    window.addEventListener('resize', resizeRenderer);
    resizeRenderer();
}

// 只保留一个场景
export const scene = new UIController('scene');
scene.lastOnly(true);

// 初始化录制
export const recorder = new Recorder(renderer.getCanvas());
export const writer = new RecordWriter();
recorder.to(writer);
