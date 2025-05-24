import './styles.css';
import { BattleScene } from './scene/battle/scene';
import { OffscreenCanvas2D } from './scene/canvas2d';
import { SceneController } from './scene/controller';
import { InputType } from './scene/common';
import { TrainManager } from './train/manager';
import { BattleTrain } from './train/battle/train';

class Main {
    readonly canvas: OffscreenCanvas2D;
    readonly scene: SceneController;
    readonly train: TrainManager;

    constructor() {
        const canvas = document.getElementById('scene') as HTMLCanvasElement;
        this.canvas = new OffscreenCanvas2D(true, canvas);
        this.scene = new SceneController(this.canvas);
        this.train = new TrainManager(this.scene);

        window.addEventListener('resize', () => this.resetCanvas());
    }

    initialize() {
        this.resetCanvas();
        this.initializeScene();
        this.initializetrain();
    }

    resetCanvas() {
        this.canvas.setHD(true);
        const width = window.innerWidth;
        const height = window.innerHeight;
        const ratio = width / height;
        if (ratio > 4 / 3) {
            const w = Math.floor((height * 4) / 3);
            this.canvas.size(w, height);
            this.canvas.canvas.style.width = `${w}px`;
            this.canvas.canvas.style.height = `${height}px`;
        } else {
            const h = Math.floor((width * 3) / 4);
            this.canvas.size(width, (width * 3) / 4);
            this.canvas.canvas.style.width = `${width}px`;
            this.canvas.canvas.style.height = `${h}px`;
        }
    }

    async initializeScene() {
        this.scene.add(new BattleScene());
        await this.scene.ready();
        this.scene.changeTo('battle');
    }

    initializetrain() {
        this.train.add(new BattleTrain(this.train));
        this.train.changeTo('battle');
    }
}

const main = new Main();
main.initialize();

window.addEventListener('keydown', ev => {
    main.scene.input(InputType.KeyDown, ev);
});
window.addEventListener('keyup', ev => {
    main.scene.input(InputType.KeyUp, ev);
});
