import { EventEmitter } from 'eventemitter3';
import { SceneController } from '../scene/controller';
import { IDisplayInfoBase, IScene, ITrainer } from '@/common';
import { Ticker } from 'mutate-animate';

export interface ITrainDataBase {
    type: string;
}

interface ResetData extends ITrainDataBase {
    episode: number;
    data: any;
}

export interface IWebSocketSend {
    type: string;
}

export interface ITrainParallelResets<T, I> {
    observation: Record<string, T>;
    info: Record<string, I>;
}

export abstract class TrainProcess<
        S,
        SL,
        T extends IDisplayInfoBase,
        D extends ITrainDataBase,
        R extends ITrainParallelResets<any, any>
    >
    extends EventEmitter
    implements ITrainer<S, SL, T>
{
    abstract readonly id: string;
    /** 两次操作的间隔，单位毫秒 */
    abstract readonly interval: number;

    private lastTime: number = performance.now();

    protected pending: boolean = false;

    episode: number = 0;

    constructor(public readonly manager: TrainManager) {
        super();
    }

    /**
     * 初始化此训练器
     */
    abstract initialize(): void;

    /**
     * 重置场景，并返回重置状态
     */
    abstract onReset(): R;

    /**
     * 接收到训练端发送的信息后执行
     * @param data 接收到的信息
     */
    abstract onData(data: D): void;

    /**
     * 每帧执行一次的函数
     * @param timestamp 时间戳
     */
    abstract onTick(timestamp: number): void;

    reset() {
        this.episode++;
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

    /**
     * 向训练端发送信息
     */
    send(data: any) {
        this.manager.send(data);
    }

    abstract save(): SL;

    abstract load(data: SL): void;

    abstract getDisplayInfo(): T;

    abstract onBind(scene: IScene<S, T>): void;
}

export type AnyTrainProcess = TrainProcess<any, any, any, any, any>;

interface TrainManagerEvent {}

export class TrainManager extends EventEmitter<TrainManagerEvent> {
    readonly socket: WebSocket;
    readonly list: Map<string, AnyTrainProcess> = new Map();
    readonly ticker = new Ticker();

    private _process: AnyTrainProcess | null = null;
    public get trainScene(): AnyTrainProcess | null {
        return this._process;
    }
    public set trainScene(v: AnyTrainProcess | string | null) {
        this.changeTo(v);
    }

    constructor(public readonly scene: SceneController) {
        super();
        this.socket = new WebSocket('ws://localhost:7725');
        this.socket.addEventListener('open', () => {
            // eslint-disable-next-line no-console
            console.log(`Train socket connect successfully.`);
        });
        this.socket.addEventListener('message', ev => {
            this.onData(ev);
        });
        this.ticker.add(time => this.tick(time));
    }

    add(process: AnyTrainProcess) {
        this.list.set(process.id, process);
        process.initialize();
    }

    get(id: string) {
        return this.list.get(id);
    }

    onData(ev: MessageEvent) {
        const data = JSON.parse(ev.data) as ResetData;
        switch (data.type) {
            case 'reset': {
                if (this._process) {
                    const reset = this._process.reset();
                    if (reset) {
                        this.send({ type: 'reset', data: reset });
                    } else {
                        this.send({ type: 'reset', data: null });
                    }
                }
                break;
            }
            case 'resetEpisode': {
                if (this._process) {
                    this._process.episode = 0;
                    this.send({ type: 'resetEpisode', status: 'success' });
                }
                break;
            }
            case 'save': {
                const saved = this._process?.save();
                this.send({ type: 'save', data: saved });
                break;
            }
            case 'load': {
                this._process?.load(data.data);
                this.send({ type: 'load', status: 'success' });
                break;
            }
            default: {
                this._process?.onData(data);
                break;
            }
        }
    }

    changeTo(process: AnyTrainProcess | string | null) {
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

    send<T extends IWebSocketSend>(data: T) {
        this.socket.send(JSON.stringify(data));
    }

    tick(time: number) {
        this._process?.onTick(time);
    }
}
