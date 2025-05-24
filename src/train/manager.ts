import EventEmitter from 'eventemitter3';
import type { SceneController } from '../scene/controller';

export interface ITrainDataBase {
    type: string;
}

export interface ITrainParallelResets<T, I> {
    observation: Record<string, T>;
    info: Record<string, I>;
}

export abstract class TrainProcess<
    T extends ITrainDataBase = ITrainDataBase,
    R extends ITrainParallelResets<any, any> = ITrainParallelResets<any, any>
> extends EventEmitter {
    abstract readonly id: string;
    /** 两次操作的间隔，单位毫秒 */
    abstract readonly interval: number;

    private lastTime: number = performance.now();

    protected pending: boolean = false;

    iteration: number = 0;

    constructor(public readonly manager: TrainManager) {
        super();
    }

    abstract initialize(): void;

    abstract onReset(): R;

    abstract onData(data: T): void;

    reset() {
        this.iteration++;
        this.resetTime();
        return this.onReset();
    }

    protected resetTime() {
        this.lastTime = performance.now();
    }

    protected waitPending(): Promise<void> {
        this.pending = true;
        return new Promise(res => {
            const wait = () => {
                const now = performance.now();
                if (now - this.lastTime < this.interval) {
                    requestAnimationFrame(wait);
                    return;
                }
                this.lastTime = now;
                this.pending = false;
                res();
            };
            wait();
        });
    }

    send(data: any) {
        this.manager.send(data);
    }
}

interface TrainManagerEvent {}

export class TrainManager extends EventEmitter<TrainManagerEvent> {
    readonly socket: WebSocket;
    readonly list: Map<string, TrainProcess> = new Map();

    private _process: TrainProcess | null = null;
    public get trainScene(): TrainProcess | null {
        return this._process;
    }
    public set trainScene(v: TrainProcess | string | null) {
        this.changeTo(v);
    }

    constructor(public readonly scene: SceneController) {
        super();
        this.socket = new WebSocket('ws://localhost:7725');
        this.socket.addEventListener('open', () => {
            console.log(`Train socket connect successfully.`);
            if (this._process) this._process.iteration = 0;
        });
        this.socket.addEventListener('message', ev => {
            this.onData(ev);
        });
    }

    add(process: TrainProcess) {
        this.list.set(process.id, process);
        process.initialize();
    }

    onData(ev: MessageEvent) {
        const data = JSON.parse(ev.data) as ITrainDataBase;
        if (data.type === 'reset') {
            const reset = this._process?.reset();
            if (reset) {
                this.send(reset);
            }
            return;
        }
        this._process?.onData(data);
    }

    changeTo(process: TrainProcess | string | null) {
        if (process === null) this._process = null;
        else if (typeof process === 'string') {
            const p = this.list.get(process);
            if (p) this._process = p;
        } else {
            if (this.list.has(process.id)) {
                this._process = process;
            }
        }
    }

    send(data: any) {
        this.socket.send(JSON.stringify(data));
    }
}
