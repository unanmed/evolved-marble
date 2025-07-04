import { FRAME_INTERVAL } from '@/setup';
import EventEmitter from 'eventemitter3';

export interface IRecorderDestination {
    /**
     * 接收录制的数据
     * @param chunk 当前这一段的数据
     */
    receive(chunk: ArrayBuffer): void;

    /**
     * 结束录制
     */
    finish(): void;
}

interface RecorderEvent {
    chunk: [blob: ArrayBuffer];
    finish: [];
}

export class Recorder extends EventEmitter<RecorderEvent> {
    private destination?: IRecorderDestination;

    private frames: number = 0;

    private encoder: VideoEncoder;

    constructor(public readonly target: HTMLCanvasElement) {
        super();
        this.encoder = new VideoEncoder({
            output: chunk => {
                const buffer = new ArrayBuffer(chunk.byteLength);
                chunk.copyTo(buffer);
                this.destination?.receive(buffer);
            },
            error: error => {
                // eslint-disable-next-line no-console
                console.error(error);
            }
        });

        this.encoder.configure({
            codec: 'avc1.640032',
            width: target.width,
            height: target.height,
            bitrate: 8_000_000, // 4 Mbps
            framerate: 60
        });
    }

    /**
     * 捕获一帧图像
     */
    async capture() {
        const frame = new VideoFrame(this.target, {
            timestamp: this.frames * FRAME_INTERVAL
        });
        this.encoder.encode(frame);
        frame.close();
        this.frames++;
        if (this.frames % 1800 === 0) {
            await this.encoder.flush();
        }
    }

    /**
     * 结束录制
     */
    async finish() {
        await this.encoder.flush();
        this.destination?.finish();
        this.emit('finish');
    }

    /**
     * 将录制的画布内容输出至目的地
     * @param dest 录制目的地
     */
    to(dest?: IRecorderDestination) {
        this.destination = dest;
    }
}
