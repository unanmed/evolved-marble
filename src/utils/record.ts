import EventEmitter from 'eventemitter3';

export interface IRecorderDestination {
    /**
     * 接收帧图片
     * @param frame 当前帧图片
     * @returns 是否接收并处理成功
     */
    receive(frame: Blob): Promise<boolean>;

    /**
     * 结束录制
     */
    finish(): void;
}

interface RecorderEvent {
    frame: [blob: Blob | null];
    finish: [];
}

export class Recorder extends EventEmitter<RecorderEvent> {
    private destination?: IRecorderDestination;

    constructor(public readonly target: HTMLCanvasElement) {
        super();
    }

    /**
     * 捕获一帧图像
     */
    async capture() {
        const data = await new Promise<Blob | null>(res => {
            this.target.toBlob(blob => {
                res(blob);
            }, 'image/jpeg');
        });
        if (this.destination && data) {
            const success = await this.destination.receive(data);
            if (!success) {
                // eslint-disable-next-line no-console
                console.warn(`Frame transfer failed!`);
            }
        }
        this.emit('frame', data);
        return data;
    }

    /**
     * 结束录制
     */
    finish() {
        if (this.destination) {
            this.destination.finish();
        }
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
