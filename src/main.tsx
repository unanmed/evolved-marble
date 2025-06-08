import './styles.css';
import { BattleScene } from './scene/battle/scene';
import { SceneController } from './scene/controller';
import { TrainManager } from './train/manager';
import { BattleTrain } from './train/battle/train';
import { initializeRenderer, renderer, scene } from './renderer';
import { defineComponent } from 'vue';
import { createApp } from '@motajs/client';
import { InputType } from './common';

const RootComponent = defineComponent(() => {
    return () => (
        <container loc={[0, 0, 1920, 1080]}>{scene.render()}</container>
    );
});

class Main {
    readonly scene: SceneController;
    readonly train: TrainManager;

    constructor() {
        this.scene = new SceneController(scene);
        this.train = new TrainManager(this.scene);
    }

    initialize() {
        initializeRenderer();
        this.initializeScene();
        this.initializetrain();
        this.bind();
        createApp(RootComponent).mount(renderer);
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

    bind() {
        ['battle'].forEach(v => {
            const scene = this.scene.get(v);
            const train = this.train.get(v);
            if (!scene || !train) return;
            scene.bindTrainer(train);
        });
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
