import { ITickExcitable, ITickExcitation } from '@/common';
import EventEmitter from 'eventemitter3';
import { Ticker } from 'mutate-animate';

interface TickExcitationEvent {
    tick: [time: number];
}

export abstract class TickExcitationBase
    extends EventEmitter<TickExcitationEvent>
    implements ITickExcitation
{
    /** 所有的可激励对象 */
    protected readonly targets: Set<ITickExcitable> = new Set();

    excite(target: ITickExcitable): void {
        this.targets.add(target);
    }

    unexcite(target: ITickExcitable): void {
        this.targets.delete(target);
    }
}

export class AnimationFrameExcitation extends TickExcitationBase {
    private readonly ticker: Ticker = new Ticker();

    constructor() {
        super();
        this.ticker.add(time => {
            this.targets.forEach(v => v.tick(time));
            this.emit('tick', time);
        });
    }
}

export class SpecifiedFrameExcitation extends TickExcitationBase {
    private nowTime: number = 0;

    constructor(private readonly interval: number) {
        super();
    }

    /**
     * 执行下一帧激励
     */
    tick() {
        this.targets.forEach(v => v.tick(this.nowTime));
        this.emit('tick', this.nowTime);
        this.nowTime += this.interval;
    }
}
