import { ITrainWorkflow } from './common';
import { renderer } from './renderer';
import { TrainManager } from './train/manager';
import { SpecifiedFrameExcitation } from './utils/excite';
import { Recorder } from './utils/record';

export class TrainWorkflow implements ITrainWorkflow {
    private running: boolean = false;

    constructor(
        public readonly train: TrainManager,
        public readonly excitation: SpecifiedFrameExcitation,
        public readonly recorder: Recorder
    ) {}

    async start() {
        this.running = true;
        while (this.running) {
            await this.process();
            await this.waitRender();
            await this.recorder.capture();
        }
    }

    private async waitRender() {
        return new Promise<void>(res => {
            renderer.requestAfterFrame(() => res());
        });
    }

    private async process() {
        return new Promise<void>(res => {
            this.train.on('tickEnd', () => res());
            this.excitation.tick();
        });
    }

    end() {
        this.running = false;
    }
}
