import { SpecifiedFrameExcitation } from './utils/excite';

//#region 场景相关

/** 初始场景 */
export const SCENE = 'sword1v1';

/** 模型每隔多少帧执行一次操作 */
export const MODEL_INTERVAL = 6;

//#region 录制相关

/** 录制帧数 */
export const FRAME = 60;
export const FRAME_INTERVAL = 1000 / FRAME;

/** 激励源 */
export const excitation = new SpecifiedFrameExcitation(FRAME_INTERVAL);
